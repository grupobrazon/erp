import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import JSZip from 'npm:jszip@3.10.1';
import { mapLimit } from '../../shared/parallel.ts';

/**
 * Baixa XMLs ou DANFEs (PDF) de NF-es autorizadas na Focus NFe.
 * Body: { kind: "xml" | "pdf", items: [{ os_id?, remessa_id? }] }
 * Retorna: { filename, base64 | url, mime, errors: [] }
 *  - 1 arquivo: devolve o arquivo direto (base64)
 *  - Vários arquivos: devolve um .ZIP por link direto do armazenamento
 */
const FOCUS_BASE = 'https://api.focusnfe.com.br';

// O runtime do worker mantém ~6 conexões simultâneas por vez.
const CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 30000;
const RETRY_DELAY_MS = 700;

const toB64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { kind, items } = await req.json();
    if (kind !== 'xml' && kind !== 'pdf') {
      return Response.json({ error: 'kind deve ser "xml" ou "pdf"' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return Response.json({ error: 'items é obrigatório (lista de os_id/remessa_id)' }, { status: 400 });
    }

    const token = Deno.env.get('FOCUSNFE_TOKEN');
    if (!token) return Response.json({ error: 'FOCUSNFE_TOKEN não configurado' }, { status: 500 });
    const authHeaders = { Authorization: `Basic ${btoa(`${token}:`)}` };

    const downloadFile = async (path) => {
      const attempt = async () => {
        try {
          const resp = await fetch(`${FOCUS_BASE}${path}`, {
            headers: authHeaders,
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          if (resp.ok) return new Uint8Array(await resp.arrayBuffer());
          return { error: resp.status };
        } catch {
          return { error: 0 };
        }
      };
      let result = await attempt();
      // Repete uma vez quando o provedor limita o ritmo (429/5xx) ou a conexão falha
      if (result?.error === 0 || result?.error === 429 || result?.error >= 500) {
        await sleep(RETRY_DELAY_MS);
        result = await attempt();
      }
      return result;
    };

    const results = await mapLimit(items, CONCURRENCY, async (item) => {
      try {
        let entity, label, entityId;
        if (item.remessa_id) {
          entityId = item.remessa_id;
          entity = await base44.entities.Remessa.get(item.remessa_id);
          label = `Remessa ${entity?.code || item.remessa_id}`;
        } else if (item.os_id) {
          entityId = item.os_id;
          entity = await base44.entities.ServiceOrder.get(item.os_id);
          label = `OS ${entity?.code || item.os_id}`;
        } else {
          return { error: 'Item sem os_id/remessa_id' };
        }
        if (!entity) return { error: `${label}: não encontrada` };

        let path = kind === 'pdf' ? entity.nfe_danfe_url : entity.nfe_xml_url;
        if (!path && kind === 'xml' && entity.nfe_ref) {
          const consult = await fetch(`${FOCUS_BASE}/v2/nfe/${entity.nfe_ref}`, {
            headers: { ...authHeaders, Accept: 'application/json' },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          if (consult.ok) {
            const data = await consult.json();
            path = data.caminho_xml_nota_fiscal || '';
          }
        }
        if (!path) {
          return { error: `${label}: ${kind === 'pdf' ? 'DANFE' : 'XML'} não disponível` };
        }

        const buf = await downloadFile(path);
        if (buf?.error !== undefined) {
          return { error: `${label}: erro HTTP ${buf.error} ao baixar ${kind.toUpperCase()}` };
        }

        const base = entity.nfe_chave || entity.invoice_number || entity.code || entityId;
        return { file: { filename: `${kind === 'pdf' ? 'DANFE' : 'XML'}_${base}.${kind}`, buf } };
      } catch (e) {
        return { error: `Erro inesperado: ${e.message}` };
      }
    });

    const files = [];
    const errors = [];
    for (const r of results) {
      if (!r) continue;
      if (r.error) errors.push(r.error);
      if (r.file) files.push(r.file);
    }

    if (files.length === 0) {
      return Response.json({ error: 'Nenhum arquivo pôde ser baixado', errors }, { status: 400 });
    }

    if (files.length === 1) {
      return Response.json({
        filename: files[0].filename,
        base64: toB64(files[0].buf),
        mime: kind === 'pdf' ? 'application/pdf' : 'application/xml',
        errors,
      });
    }

    const zip = new JSZip();
    for (const f of files) zip.file(f.filename, f.buf);
    const zipBuf = await zip.generateAsync({ type: 'uint8array' });
    const today = new Date().toISOString().slice(0, 10);
    const filename = `${kind === 'pdf' ? 'DANFEs' : 'XMLs'}_NF-e_${today}.zip`;

    // O ZIP vai para o armazenamento e o navegador baixa pelo link direto:
    // devolver o lote inteiro em base64 dentro do JSON deixava o download lento.
    const { file_uri } = await base44.asServiceRole.integrations.Core.UploadPrivateFile({
      file: new File([zipBuf], filename, { type: 'application/zip' }),
    });
    const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
      file_uri,
      expires_in: 900,
    });

    return Response.json({ filename, url: signed_url, mime: 'application/zip', errors });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}