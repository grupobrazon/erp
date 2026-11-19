// Gerado de base44/functions/cancelNFe/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

/**
 * Cancela uma NF-e autorizada via Focus NFe.
 * Body: { ref, justificativa, source: 'os' | 'remessa', entity_id }
 * Focus endpoint: DELETE /nfe/{ref} com body { justificativa }
 */
const FOCUS_BASE = 'https://api.focusnfe.com.br/v2';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { ref, justificativa, source, entity_id } = await req.json();
    if (!ref) return Response.json({ error: 'ref da NF-e é obrigatório' }, { status: 400 });
    if (!justificativa || justificativa.length < 15) {
      return Response.json({ error: 'Justificativa deve ter no mínimo 15 caracteres' }, { status: 400 });
    }
    if (!source || !entity_id) {
      return Response.json({ error: 'source (os|remessa) e entity_id são obrigatórios' }, { status: 400 });
    }

    const token = Deno.env.get('FOCUSNFE_TOKEN');
    if (!token) return Response.json({ error: 'FOCUSNFE_TOKEN não configurado' }, { status: 500 });
    const auth = btoa(`${token}:`);

    const resp = await fetch(`${FOCUS_BASE}/nfe/${encodeURIComponent(ref)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ justificativa }),
    });
    const data = await resp.json();

    // 200/202 = processado ou em processamento
    if (resp.status === 200 || resp.status === 202) {
      const now = new Date().toISOString();
      const update = {
        nfe_cancelled: true,
        nfe_cancel_date: now,
        nfe_cancel_reason: justificativa,
        nfe_status: data.status === 'cancelado' ? 'cancelado' : 'processando_cancelamento',
        nfe_mensagem_sefaz: data.mensagem_sefaz || data.mensagem || '',
      };

      if (source === 'os') {
        await base44.entities.ServiceOrder.update(entity_id, update);
      } else {
        await base44.entities.Remessa.update(entity_id, update);
      }

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
});