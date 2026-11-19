// Gerado de base44/functions/checkMelhorEnvioLabelStatus/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { syncMeLabelsStatus } from '../shared/melhorEnvio.js';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = Deno.env.get('MELHOR_ENVIO_TOKEN');
    const userAgent = Deno.env.get('MELHOR_ENVIO_USER_AGENT') || 'ERP Brazon (contato@brazon.com.br)';
    if (!token) return Response.json({ error: 'Token do Melhor Envio não configurado (MELHOR_ENVIO_TOKEN).' }, { status: 500 });

    const { os_id, environment } = await req.json();
    if (!os_id) return Response.json({ error: 'os_id é obrigatório' }, { status: 400 });

    const os = await base44.entities.ServiceOrder.get(os_id);
    if (!os) return Response.json({ error: 'OS não encontrada' }, { status: 404 });

    const useSandbox = (environment || 'production') !== 'production';
    const result = await syncMeLabelsStatus(base44, os, token, userAgent, useSandbox);

    return Response.json({
      success: true,
      checked: result.checked.map(c => ({
        shipment_id: c.shipment_id,
        status: c.status,
        canceled: c.canceled,
        canceled_at: c.canceled_at,
        label_tag: c.label?.label_tag,
        tracking_code: c.label?.tracking_code,
      })),
      anyCanceled: result.anyCanceled,
      allCanceled: result.allCanceled,
      cleared: result.cleared,
      remaining: result.remaining.map(l => ({ shipment_id: l.shipment_id, tracking_code: l.tracking_code, label_tag: l.label_tag })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});