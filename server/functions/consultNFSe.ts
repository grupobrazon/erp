// Gerado de base44/functions/consultNFSe/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

/**
 * Consulta o status de uma NFS-e Nacional transmitida via Focus NFe.
 * Atualiza a OS com o status retornado (autorizado, processando, erro, cancelado).
 * Body: { os_id }
 */
const FOCUS_BASE = 'https://api.focusnfe.com.br/v2';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { os_id } = await req.json();
    if (!os_id) return Response.json({ error: 'os_id é obrigatório' }, { status: 400 });

    const os = await base44.entities.ServiceOrder.get(os_id);
    if (!os) return Response.json({ error: 'OS não encontrada' }, { status: 404 });
    if (!os.nfse_ref) return Response.json({ error: 'NFS-e sem referência (ref) para consulta' }, { status: 400 });

    const token = Deno.env.get('FOCUSNFE_TOKEN');
    if (!token) return Response.json({ error: 'FOCUSNFE_TOKEN não configurado' }, { status: 500 });
    const auth = btoa(`${token}:`);

    const resp = await fetch(`${FOCUS_BASE}/nfsen/${encodeURIComponent(os.nfse_ref)}`, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    const data = await resp.json();

    // FocusNFe pode retornar erros como array de objetos {mensagem, campo} — garantir string
    const strMsg = (v) => {
      if (!v) return '';
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) return v.map((e) => e?.mensagem || e?.campo || JSON.stringify(e)).join('; ');
      if (typeof v === 'object') return v.mensagem || JSON.stringify(v);
      return String(v);
    };

    if (resp.status === 200 || resp.status === 201 || resp.status === 202) {
      const status = data.status || '';
      const update = {
        nfse_status: status === 'autorizado' ? 'autorizado'
          : status === 'cancelado' ? 'cancelado'
          : status === 'erro' || status === 'rejeitado' ? 'erro'
          : 'processando',
        nfse_numero: data.numero ? String(data.numero) : (os.nfse_numero || ''),
        nfse_codigo_verificacao: data.codigo_verificacao || os.nfse_codigo_verificacao || '',
        nfse_url: data.url || data.caminho_nfse || os.nfse_url || '',
        nfse_mensagem_sefaz: strMsg(data.mensagem_sefaz),
      };

      if (status === 'cancelado') {
        update.nfse_cancelada = true;
      }

      await base44.entities.ServiceOrder.update(os_id, update);
      return Response.json({ status: update.nfse_status, ...update });
    }

    return Response.json({
      status: 'erro',
      error: data.erros || data.error || `HTTP ${resp.status}`,
    }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}