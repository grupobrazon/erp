// Gerado de base44/functions/downloadDanfe/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

/**
 * Baixa o DANFE (PDF) de uma NF-e autorizada na Focus NFe.
 * Body: { os_id? } ou { remessa_id? }
 * Retorna: { pdf_base64, filename }
 */
const FOCUS_BASE = 'https://api.focusnfe.com.br';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { os_id, remessa_id } = await req.json();
    if (!os_id && !remessa_id) {
      return Response.json({ error: 'os_id ou remessa_id é obrigatório' }, { status: 400 });
    }

    let entity, label;
    if (remessa_id) {
      entity = await base44.entities.Remessa.get(remessa_id);
      label = 'Remessa';
    } else {
      entity = await base44.entities.ServiceOrder.get(os_id);
      label = 'OS';
    }
    if (!entity) return Response.json({ error: `${label} não encontrada` }, { status: 404 });
    if (!entity.nfe_danfe_url) {
      return Response.json({ error: 'DANFE não disponível' }, { status: 400 });
    }

    const token = Deno.env.get('FOCUSNFE_TOKEN');
    if (!token) return Response.json({ error: 'FOCUSNFE_TOKEN não configurado' }, { status: 500 });
    const auth = btoa(`${token}:`);

    const resp = await fetch(`${FOCUS_BASE}${entity.nfe_danfe_url}`, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return Response.json({ error: `Erro ao baixar DANFE (${resp.status})`, details: text }, { status: 502 });
    }

    const pdfBuffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(pdfBuffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const pdfBase64 = btoa(binary);

    const filename = `DANFE_${entity.nfe_chave || entity.invoice_number || entity.code || remessa_id || os_id}.pdf`;
    return Response.json({ pdf_base64: pdfBase64, filename });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});