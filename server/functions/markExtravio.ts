// Gerado de base44/functions/markExtravio/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { resolveMeBaseUrl, meHeaders } from '../shared/melhorEnvioCart.ts';

// Marca as etiquetas ativas de uma OS como "extraviadas" (mercadoria perdida pela transportadora).
// Arquiva as etiquetas no histórico (melhor_envio_canceled_labels com reason "Extravio de mercadoria"),
// limpa os campos de rastreio da OS e tenta cancelar as etiquetas no Melhor Envio (best-effort).
//
// Após esta função, a OS está liberada para gerar uma nova etiqueta (generateMelhorEnvioLabel),
// reenviando o mesmo produto dentro da mesma OS e mesma NF-e.
export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { os_id, reason } = await req.json();
    if (!os_id) return Response.json({ error: 'os_id é obrigatório' }, { status: 400 });
    if (!reason || !reason.trim()) return Response.json({ error: 'Motivo do extravio é obrigatório' }, { status: 400 });

    const os = await base44.entities.ServiceOrder.get(os_id);
    if (!os) return Response.json({ error: 'OS não encontrada' }, { status: 404 });

    const labels = Array.isArray(os.melhor_envio_labels) ? os.melhor_envio_labels : [];
    if (labels.length === 0) {
      return Response.json({ error: 'Esta OS não possui etiquetas ativas para marcar como extraviadas' }, { status: 400 });
    }

    const token = Deno.env.get('MELHOR_ENVIO_TOKEN');
    const userAgent = Deno.env.get('MELHOR_ENVIO_USER_AGENT') || 'ERP Brazon (contato@brazon.com.br)';
    const { baseUrl } = resolveMeBaseUrl();

    // Tenta cancelar cada etiqueta no Melhor Envio (best-effort — pode falhar para etiquetas postadas).
    // O cancelamento no ME não é obrigatório: o objetivo é apenas liberar a OS para reemissão.
    const cancelResults = [];
    if (token) {
      const headers = meHeaders(token, userAgent);
      for (const lbl of labels) {
        if (!lbl.shipment_id) continue;
        try {
          const res = await fetch(`${baseUrl}/api/v2/me/shipment/cancel`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              order: {
                id: lbl.shipment_id,
                reason_id: '2',
                description: `Extravio/recotação: ${reason.trim()}`,
              },
            }),
          });
          cancelResults.push({ shipment_id: lbl.shipment_id, ok: res.ok, status: res.status });
        } catch (e) {
          cancelResults.push({ shipment_id: lbl.shipment_id, ok: false, error: String(e?.message || e) });
        }
      }
    }

    // Arquiva as etiquetas atuais no histórico de canceladas com reason "Extravio de mercadoria"
    const now = new Date().toISOString();
    const existingHistory = Array.isArray(os.melhor_envio_canceled_labels) ? os.melhor_envio_canceled_labels : [];
    const extraviadoLabels = labels.map(lbl => ({
      volume_index: lbl.volume_index,
      product_name: lbl.product_name,
      label_tag: lbl.label_tag,
      shipment_id: lbl.shipment_id,
      tracking_code: lbl.tracking_code,
      carrier: lbl.carrier,
      label_url: lbl.label_url,
      generated_at: lbl.generated_at,
      canceled_status: 'extraviado',
      canceled_at_me: null,
      detected_at: now,
      reason: `Extravio de mercadoria: ${reason.trim()}`,
    }));

    // Limpa os campos de rastreio para liberar a reemissão
    const updatePayload: any = {
      melhor_envio_canceled_labels: [...existingHistory, ...extraviadoLabels],
      melhor_envio_labels: [],
      expedition_label_url: '',
      tracking_code: '',
      melhor_envio_shipment_id: '',
      melhor_envio_status: '',
      carrier: '',
    };

    // Registra o evento de extravio no status_history (sem alterar o status operacional —
    // a OS permanece na etapa atual para que a logística gere a nova etiqueta)
    const statusHistory = Array.isArray(os.status_history) ? [...os.status_history] : [];
    statusHistory.push({
      date: now,
      actor: user?.full_name || user?.email || '',
      source: 'Expedição — extravio de mercadoria',
      previous_status: os.status,
      new_status: os.status,
    });
    updatePayload.status_history = statusHistory;

    await base44.entities.ServiceOrder.update(os_id, updatePayload);

    return Response.json({
      success: true,
      message: `${labels.length} etiqueta(s) marcada(s) como extraviada(s). A OS está liberada para gerar uma nova etiqueta.`,
      extraviado_count: labels.length,
      cancel_results: cancelResults,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});