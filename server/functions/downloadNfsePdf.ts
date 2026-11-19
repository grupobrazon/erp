// Gerado de base44/functions/downloadNfsePdf/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

/**
 * Baixa o PDF de uma NFS-e Nacional autorizada via Focus NFe.
 * Retorna o PDF como base64 para download direto no frontend.
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
    if (!os.nfse_ref) return Response.json({ error: 'NFS-e sem referência para download' }, { status: 400 });

    const token = Deno.env.get('FOCUSNFE_TOKEN');
    if (!token) return Response.json({ error: 'FOCUSNFE_TOKEN não configurado' }, { status: 500 });
    const auth = btoa(`${token}:`);

    // FocusNFe NFS-e Nacional: o endpoint .pdf retorna JSON com metadados,
    // incluindo url_danfse (PDF direto no S3). Buscamos os metadados primeiro.
    const metaResp = await fetch(`${FOCUS_BASE}/nfsen/${encodeURIComponent(os.nfse_ref)}.pdf`, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });

    if (metaResp.status !== 200) {
      const errText = await metaResp.text();
      return Response.json({
        error: `Falha ao obter PDF (HTTP ${metaResp.status})`,
        details: errText,
      }, { status: 400 });
    }

    const meta = await metaResp.json();
    // url_danfse = PDF hospedado no S3 da FocusNFe
    const pdfUrl = meta.url_danfse || meta.caminho_danfse;
    if (!pdfUrl) {
      return Response.json({
        error: 'PDF da NFS-e não disponível',
        details: 'A prefeitura ainda não gerou o DANFSE. Tente novamente em instantes.',
      }, { status: 400 });
    }

    // Buscar o PDF binário do S3
    const pdfResp = await fetch(pdfUrl, { method: 'GET' });
    if (pdfResp.status !== 200) {
      return Response.json({
        error: `Falha ao baixar PDF do storage (HTTP ${pdfResp.status})`,
      }, { status: 400 });
    }

    const arrayBuffer = await pdfResp.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    const filename = `NFS-e_${os.code || os.id}.pdf`;
    return Response.json({
      base64,
      filename,
      mime_type: 'application/pdf',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}