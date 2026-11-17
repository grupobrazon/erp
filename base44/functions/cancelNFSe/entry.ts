import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Cancela uma NFS-e autorizada via Focus NFe.
 * Body: { ref, justificativa, entity_id }
 * Focus endpoint: DELETE /nfsen/{ref} com body { justificativa } (NFS-e Nacional)
 */
const FOCUS_BASE = 'https://api.focusnfe.com.br/v2';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { ref, justificativa, entity_id } = await req.json();
    if (!ref) return Response.json({ error: 'ref da NFS-e é obrigatório' }, { status: 400 });
    if (!justificativa || justificativa.length < 15) {
      return Response.json({ error: 'Justificativa deve ter no mínimo 15 caracteres' }, { status: 400 });
    }
    if (!entity_id) {
      return Response.json({ error: 'entity_id é obrigatório' }, { status: 400 });
    }

    const token = Deno.env.get('FOCUSNFE_TOKEN');
    if (!token) return Response.json({ error: 'FOCUSNFE_TOKEN não configurado' }, { status: 500 });
    const auth = btoa(`${token}:`);

    const resp = await fetch(`${FOCUS_BASE}/nfsen/${encodeURIComponent(ref)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ justificativa }),
    });
    const data = await resp.json();

    if (resp.status === 200 || resp.status === 202) {
      const now = new Date().toISOString();
      const update = {
        nfse_cancelada: true,
        nfse_cancel_data: now,
        nfse_cancel_reason: justificativa,
        nfse_status: data.status === 'cancelado' ? 'cancelado' : 'processando_cancelamento',
        nfse_mensagem_sefaz: data.mensagem_sefaz || data.mensagem || '',
      };
      await base44.entities.ServiceOrder.update(entity_id, update);

      return Response.json({
        status: data.status === 'cancelado' ? 'cancelado' : 'processando',
        ...update,
      });
    }

    return Response.json({
      status: 'erro',
      error: data.erros || data.error || `HTTP ${resp.status}`,
      data,
    }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}