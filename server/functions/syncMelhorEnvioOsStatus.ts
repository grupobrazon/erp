// Gerado de base44/functions/syncMelhorEnvioOsStatus/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { fetchMeTrackingBatch, fetchMeTrackingByCode, ME_TRACKING_STATUS_TO_OS, resolveMeStatus } from '../shared/melhorEnvio.js';
import { appendStatusHistory } from '../shared/osStatusHistory.ts';
import { cascadeSaleStageFromOs } from '../shared/saleStageCascade.ts';

// Progressão do ciclo de expedição — usado para nunca regredir o status da OS
const EXPEDITION_RANK = {
  'Etiqueta Gerada': 1,
  'Separação': 2,
  'Saída do Estoque': 3,
  'Em Transporte': 4,
  'Entregue': 5,
};
const ME_RANK = { generated: 1, posted: 4, delivered: 5 };

// Sincroniza o status de UMA única OS no Melhor Envio (consulta pelo shipment_id dos volumes),
// atualizando o status bruto (melhor_envio_status), o código de rastreio (se ainda vazio) e o
// status operacional da OS (generated → Etiqueta Gerada, posted → Em Transporte, delivered → Entregue).
// Disponível para qualquer usuário logado (atualiza apenas a OS informada).
export default async function (req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { os_id } = await req.json();
    if (!os_id) return Response.json({ error: 'os_id é obrigatório' }, { status: 400 });

    const token = Deno.env.get('MELHOR_ENVIO_TOKEN');
    const userAgent = Deno.env.get('MELHOR_ENVIO_USER_AGENT') || 'ERP Brazon (contato@brazon.com.br)';
    if (!token) return Response.json({ error: 'Token do Melhor Envio não configurado (MELHOR_ENVIO_TOKEN).' }, { status: 500 });

    const os = await base44.entities.ServiceOrder.get(os_id);
    if (!os) return Response.json({ error: 'OS não encontrada' }, { status: 404 });

    const labels = Array.isArray(os.melhor_envio_labels) ? os.melhor_envio_labels : [];
    const shipmentIds = labels.map(l => l.shipment_id).filter(Boolean);
    if (shipmentIds.length === 0) {
      return Response.json({ error: 'Esta OS não possui etiquetas do Melhor Envio vinculadas.' }, { status: 400 });
    }

    const tracking = await fetchMeTrackingBatch(shipmentIds, token, userAgent, false);

    // Se algum volume falhou na consulta (rate limit / falha temporária), não altera nada.
    const hasFailedLookup = shipmentIds.some(id => !tracking[id] || tracking[id].error);
    if (hasFailedLookup) {
      return Response.json({
        error: 'Não foi possível consultar o status no Melhor Envio agora (API temporariamente indisponível). Tente novamente em instantes.',
      }, { status: 503 });
    }

    const updates = {};

    // Macro-status mais avançado entre os volumes (usa resolveMeStatus para
    // considerar delivered_at/posted_at como indicadores confiáveis quando o status
    // bruto da API vem inconsistente — ex: "paused" com delivered_at preenchido).
    let bestMe = null;
    for (const l of labels) {
      const t = tracking[l.shipment_id];
      if (!t || t.error) continue;
      const effective = resolveMeStatus(t);
      if (!bestMe || (ME_RANK[effective] || 0) > (ME_RANK[bestMe] || 0)) bestMe = effective;
    }

    // Fallback: quando o ME não registrou postagem/entrega (status "released", "generated", etc.),
    // consulta o rastreio da transportadora pelo código de rastreio para verificar se o pacote
    // foi efetivamente postado/entregue. O ME às vezes não atualiza o macro-status mesmo quando
    // a transportadora já processou o envio (ex: Jadlog mostra "Entregue" mas ME mostra "Liberado").
    if (!bestMe || (bestMe !== 'posted' && bestMe !== 'delivered')) {
      const checkedCodes = new Set();
      for (const l of labels) {
        const code = l.tracking_code || (tracking[l.shipment_id]?.tracking) || os.tracking_code;
        if (!code || checkedCodes.has(code)) continue;
        checkedCodes.add(code);
        const carrierTracking = await fetchMeTrackingByCode(code, token, userAgent, false);
        if (carrierTracking.error) continue;
        if (carrierTracking.delivered_at) {
          bestMe = 'delivered';
          break;
        }
        if (carrierTracking.posted_at && (!bestMe || bestMe !== 'delivered')) {
          bestMe = 'posted';
        }
      }
    }

    if (bestMe) {
      updates.melhor_envio_status = bestMe;
      updates.melhor_envio_status_date = new Date().toISOString();
    }

    // Preenche o rastreio da OS se ainda estiver vazio
    if (!os.tracking_code) {
      for (const l of labels) {
        const t = tracking[l.shipment_id];
        if (t && t.tracking) {
          updates.tracking_code = t.tracking;
          break;
        }
      }
    }

    // Preenche o rastreio de cada volume no array melhor_envio_labels (quando ainda vazio).
    // A geração da etiqueta nem sempre recebe o tracking_code do checkout — ele vem após a
    // postagem. O sync consulta cada shipment_id e preenche o rastreio individual por volume.
    let labelsUpdated = false;
    const updatedLabels = labels.map(l => {
      if (l.tracking_code) return l;
      const t = tracking[l.shipment_id];
      if (t && t.tracking) {
        labelsUpdated = true;
        return { ...l, tracking_code: t.tracking };
      }
      return l;
    });
    if (labelsUpdated) {
      updates.melhor_envio_labels = updatedLabels;
    }

    // Avança o status operacional da OS quando o Melhor Envio progrediu (sem regredir)
    const target = bestMe ? ME_TRACKING_STATUS_TO_OS[bestMe] : null;
    const currentRank = EXPEDITION_RANK[os.status] || 0;
    if (target && (EXPEDITION_RANK[target] || 0) > currentRank) {
      updates.status = target;
      updates.status_history = appendStatusHistory(os, updates, {
        actor: 'Integração Melhor Envio',
        source: 'Atualização manual do rastreio',
      });
    }

    if (Object.keys(updates).length > 0) {
      await base44.entities.ServiceOrder.update(os_id, updates);
      // Cascata: se a OS avançou para Entregue/Concluída, atualiza a etapa da venda
      if (updates.status === 'Entregue' || updates.status === 'Concluída') {
        try { await cascadeSaleStageFromOs(base44, { ...os, ...updates }); } catch {}
      }
    }

    return Response.json({
      ok: true,
      os_id,
      melhor_envio_status: updates.melhor_envio_status || os.melhor_envio_status || null,
      tracking_code: updates.tracking_code || os.tracking_code || null,
      status_changed: !!updates.status,
      previous_status: os.status,
      new_status: updates.status || null,
      updates,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}