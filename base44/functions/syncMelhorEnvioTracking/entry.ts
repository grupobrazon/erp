import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { fetchMeTrackingBatch, fetchMeTrackingByCode, ME_TRACKING_STATUS_TO_OS, resolveMeStatus } from '../../shared/melhorEnvio.js';
import { appendStatusHistory } from '../../shared/osStatusHistory.ts';
import { cascadeSaleStageFromOs } from '../../shared/saleStageCascade.ts';

// Progressão do ciclo de expedição — usado para nunca regredir o status da OS
const EXPEDITION_RANK = {
  'Etiqueta Gerada': 1,
  'Separação': 2,
  'Saída do Estoque': 3,
  'Em Transporte': 4,
  'Entregue': 5,
};
// Peso do macro-status do Melhor Envio (para escolher o mais avançado entre os volumes)
const ME_RANK = { generated: 1, posted: 4, delivered: 5 };

// Consulta em lote o rastreio de todas as OS com etiqueta do Melhor Envio que ainda
// estão no ciclo de expedição e atualiza o status quando o Melhor Envio avançou:
//   generated → Etiqueta Gerada | posted → Em Transporte | delivered → Entregue
// Responsabilidade EXCLUSIVA da rotina: consulta e atualização de status. O código de
// rastreio é salvo na geração da etiqueta (novas) ou pela rotina de recuperação (antigas).
// Sem mudança de status → nenhum campo da OS é alterado. Mudanças entram no status_history.
export default async function (req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const token = Deno.env.get('MELHOR_ENVIO_TOKEN');
    const userAgent = Deno.env.get('MELHOR_ENVIO_USER_AGENT') || 'ERP Brazon (contato@brazon.com.br)';
    if (!token) return Response.json({ error: 'Token do Melhor Envio não configurado (MELHOR_ENVIO_TOKEN).' }, { status: 500 });

    // OS elegíveis: no ciclo de expedição (antes de Entregue) e com pelo menos 1 etiqueta
    const trackedStatuses = Object.keys(EXPEDITION_RANK).filter(s => s !== 'Entregue');
    const orders = await base44.asServiceRole.entities.ServiceOrder.filter(
      { status: { $in: trackedStatuses } }, '-updated_date', 500
    );
    const eligible = (orders || []).filter(o =>
      Array.isArray(o.melhor_envio_labels) && o.melhor_envio_labels.some(l => l.shipment_id)
    );
    const shipmentIds = eligible.flatMap(o => o.melhor_envio_labels.map(l => l.shipment_id));

    // --- Códigos de rastreio em massa ---
    // A varredura de status abaixo só olha o ciclo de expedição. Os códigos, porém,
    // precisam ser preenchidos em TODAS as OS com etiqueta (inclusive as já entregues,
    // concluídas ou canceladas), que ficam fora daquele filtro. Esta passagem nunca
    // altera status, histórico ou qualquer outro campo — apenas o código de rastreio.
    const allOrders = [];
    let listSkip = 0;
    for (;;) {
      const batch = await base44.asServiceRole.entities.ServiceOrder.list('-updated_date', 500, listSkip);
      allOrders.push(...batch);
      if (batch.length < 500) break;
      listSkip += 500;
    }
    const labeled = (allOrders || []).filter(o =>
      Array.isArray(o.melhor_envio_labels) && o.melhor_envio_labels.some(l => l.shipment_id)
    );
    // Só consulta no Melhor Envio os volumes que ainda não têm código salvo
    const missingCodeIds = labeled
      .filter(o => !o.tracking_code || o.melhor_envio_labels.some(l => !l.tracking_code))
      .flatMap(o => o.melhor_envio_labels.filter(l => !l.tracking_code).map(l => l.shipment_id));

    const tracking = await fetchMeTrackingBatch(
      [...new Set([...shipmentIds, ...missingCodeIds])], token, userAgent, false
    );

    // Preenche o código em cada volume (etiqueta) e na OS. Nunca sobrescreve código já salvo.
    let codesFilled = 0;
    for (const o of labeled) {
      const labels = o.melhor_envio_labels || [];
      const newLabels = labels.map(l => {
        if (l.tracking_code) return l;
        const code = tracking[l.shipment_id]?.tracking;
        return code ? { ...l, tracking_code: code } : l;
      });
      const labelsChanged = newLabels.some((l, i) => l.tracking_code !== labels[i].tracking_code);
      const osCode = o.tracking_code || newLabels.find(l => l.tracking_code)?.tracking_code || null;
      const osChanged = !!osCode && osCode !== o.tracking_code;
      if (!labelsChanged && !osChanged) continue;
      const codeUpdates: any = {};
      if (labelsChanged) codeUpdates.melhor_envio_labels = newLabels;
      if (osChanged) codeUpdates.tracking_code = osCode;
      await base44.asServiceRole.entities.ServiceOrder.update(o.id, codeUpdates);
      codesFilled++;
    }

    const statusChanges = [];
    let unchanged = 0;

    const skippedUnavailable = [];

    for (const os of eligible) {
      // Algum volume sem resposta válida (rate limit / falha temporária da API) →
      // a OS fica exatamente como está nesta execução; nenhum campo é alterado por causa do erro
      const hasFailedLookup = (os.melhor_envio_labels || []).some(l => {
        const t = tracking[l.shipment_id];
        return !t || t.error;
      });
      if (hasFailedLookup) { skippedUnavailable.push(os.code); continue; }

      const updates = {};

      // Macro-status mais avançado entre os volumes do pedido (usa resolveMeStatus para
      // considerar delivered_at/posted_at como indicadores confiáveis quando o status
      // bruto da API vem inconsistente — ex: "paused" com delivered_at preenchido).
      let bestMe = null;
      for (const l of os.melhor_envio_labels) {
        const t = tracking[l.shipment_id];
        if (!t || t.error) continue;
        const effective = resolveMeStatus(t);
        if (!bestMe || (ME_RANK[effective] || 0) > (ME_RANK[bestMe] || 0)) bestMe = effective;
      }

      // Fallback: quando o ME não registrou postagem/entrega (status "released", etc.),
      // consulta o rastreio da transportadora pelo código de rastreio para verificar se o
      // pacote foi efetivamente postado/entregue. O ME às vezes não atualiza o macro-status
      // mesmo quando a transportadora já processou o envio.
      if (!bestMe || (bestMe !== 'posted' && bestMe !== 'delivered')) {
        const checkedCodes = new Set();
        for (const l of os.melhor_envio_labels) {
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

      // Sempre sincroniza o status do Melhor Envio na OS (mesmo sem mudança de status operacional),
      // para que o painel mostre o status atual do pedido no Melhor Envio a cada execução.
      if (bestMe) {
        updates.melhor_envio_status = bestMe;
        updates.melhor_envio_status_date = new Date().toISOString();
      }

      // Preenche o código de rastreio da OS quando ele ainda não foi salvo (a geração da etiqueta
      // nem sempre retorna o rastreio imediatamente — o Melhor Envio pode liberá-lo depois do checkout).
      if (!os.tracking_code) {
        for (const l of os.melhor_envio_labels) {
          const t = tracking[l.shipment_id];
          if (t && t.tracking) {
            updates.tracking_code = t.tracking;
            break;
          }
        }
      }

      const target = bestMe ? ME_TRACKING_STATUS_TO_OS[bestMe] : null;
      const currentRank = EXPEDITION_RANK[os.status] || 0;
      if (target && (EXPEDITION_RANK[target] || 0) > currentRank) {
        updates.status = target;
        updates.status_history = appendStatusHistory(os, updates, {
          actor: 'Integração Melhor Envio',
          source: 'Rastreio automático Melhor Envio (a cada 10 min)',
        });
        statusChanges.push({ os_code: os.code, os_id: os.id, from: os.status, to: target, me_status: bestMe });
      }

      if (Object.keys(updates).length > 0) {
        await base44.asServiceRole.entities.ServiceOrder.update(os.id, updates);
        // Cascata: se a OS avançou para Entregue/Concluída, atualiza a etapa da venda
        if (updates.status === 'Entregue' || updates.status === 'Concluída') {
          try { await cascadeSaleStageFromOs(base44, { ...os, ...updates }); } catch {}
        }
      } else {
        unchanged++;
      }
    }

    // --- Sincronização de OS Reversas (etiquetas reversas no Melhor Envio) ---
    // Consulta o status dos envios reversos (coleta/devolução) e atualiza:
    //   generated → Aguardando Coleta Reversa (mantém)
    //   posted → Em Retorno
    //   delivered → Recebida na Empresa (auto-recebimento, pois o pacote chegou)
    const reverseStatuses = ['Aguardando Coleta Reversa', 'Em Retorno'];
    const reverseOrders = await base44.asServiceRole.entities.ServiceOrder.filter(
      { is_reverse: true, status: { $in: reverseStatuses } }, '-updated_date', 500
    );
    const reverseEligible = (reverseOrders || []).filter(o =>
      Array.isArray(o.reverse_shipments) && o.reverse_shipments.some(s => s.shipment_id)
    );

    const reverseStatusChanges = [];
    let reverseUnchanged = 0;

    for (const ros of reverseEligible) {
      const rShipments = ros.reverse_shipments || [];
      const rShipmentIds = rShipments.map(s => s.shipment_id).filter(Boolean);
      if (rShipmentIds.length === 0) { reverseUnchanged++; continue; }

      const rTracking = await fetchMeTrackingBatch(rShipmentIds, token, userAgent, false);

      // Verifica se algum volume teve falha de consulta — se sim, não altera a OS nesta execução
      const rHasFailed = rShipments.some(s => {
        const t = rTracking[s.shipment_id];
        return !t || t.error;
      });
      if (rHasFailed) { reverseUnchanged++; continue; }

      // Determina o macro-status mais avançado entre os volumes reversos
      let rBestMe = null;
      const updatedRShipments = rShipments.map(s => {
        const t = rTracking[s.shipment_id];
        if (!t || t.error) return s;
        const effective = resolveMeStatus(t);
        if (effective && (!rBestMe || (ME_RANK[effective] || 0) > (ME_RANK[rBestMe] || 0))) {
          rBestMe = effective;
        }
        return { ...s, status: effective || s.status };
      });

      // Fallback: se o ME não registrou postagem, consulta pelo código de rastreio
      if (!rBestMe || (rBestMe !== 'posted' && rBestMe !== 'delivered')) {
        const checkedCodes = new Set();
        for (const s of rShipments) {
          const code = s.tracking_code;
          if (!code || checkedCodes.has(code)) continue;
          checkedCodes.add(code);
          const carrierTracking = await fetchMeTrackingByCode(code, token, userAgent, false);
          if (carrierTracking.error) continue;
          if (carrierTracking.delivered_at) {
            rBestMe = 'delivered';
            // Atualiza o status do volume correspondente
            const idx = updatedRShipments.findIndex(rs => rs.tracking_code === code);
            if (idx >= 0) updatedRShipments[idx].status = 'delivered';
            break;
          }
          if (carrierTracking.posted_at && (!rBestMe || rBestMe !== 'delivered')) {
            rBestMe = 'posted';
            const idx = updatedRShipments.findIndex(rs => rs.tracking_code === code);
            if (idx >= 0) updatedRShipments[idx].status = 'posted';
          }
        }
      }

      const rUpdates: any = { reverse_shipments: updatedRShipments };

      // Transições de status da OS Reversa baseadas no rastreio
      if (rBestMe === 'posted' && ros.status === 'Aguardando Coleta Reversa') {
        rUpdates.status = 'Em Retorno';
        rUpdates.status_history = appendStatusHistory(ros, rUpdates, {
          actor: 'Integração Melhor Envio',
          source: 'Rastreio automático Melhor Envio — envio reverso postado',
        });
        reverseStatusChanges.push({ os_code: ros.code, os_id: ros.id, from: ros.status, to: 'Em Retorno', me_status: rBestMe });
      } else if (rBestMe === 'delivered' && ros.status !== 'Recebida na Empresa') {
        // Auto-recebimento: o pacote foi entregue no endereço da empresa (confirmado pela transportadora)
        rUpdates.status = 'Recebida na Empresa';
        rUpdates.reverse_received = true;
        rUpdates.reverse_received_date = new Date().toISOString();
        rUpdates.reverse_received_by = 'Integração Melhor Envio (auto)';
        rUpdates.status_history = appendStatusHistory(ros, rUpdates, {
          actor: 'Integração Melhor Envio',
          source: 'Rastreio automático Melhor Envio — envio reverso entregue na empresa',
        });
        reverseStatusChanges.push({ os_code: ros.code, os_id: ros.id, from: ros.status, to: 'Recebida na Empresa', me_status: rBestMe });
      }

      if (Object.keys(rUpdates).length > 1 || JSON.stringify(rUpdates.reverse_shipments) !== JSON.stringify(rShipments)) {
        await base44.asServiceRole.entities.ServiceOrder.update(ros.id, rUpdates);
      } else {
        reverseUnchanged++;
      }
    }

    return Response.json({
      ok: true,
      checked_orders: eligible.length,
      shipments: shipmentIds.length,
      codes_filled: codesFilled,
      status_changes: statusChanges,
      unchanged_orders: unchanged,
      unavailable_shipments: Object.values(tracking).filter(t => t.error).length,
      skipped_unavailable_orders: skippedUnavailable,
      reverse_checked: reverseEligible.length,
      reverse_status_changes: reverseStatusChanges,
      reverse_unchanged: reverseUnchanged,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}