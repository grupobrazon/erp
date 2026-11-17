import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { mapLimit } from '../../shared/parallel.ts';

/**
 * Extrai o CFOP efetivamente utilizado em cada NF-e de venda emitida —
 * lê o XML autorizado direto da Focus NFe (fonte: caminho_xml_nota_fiscal).
 *
 * Body: { os_ids: [id, ...] }
 * Retorna: { cfops: { [os_id]: "5102" | "5102 / 6102" }, errors: [] }
 *
 * O CFOP extraído é cacheado no campo nfe_cfop da OS (consulta apenas —
 * nenhum dado fiscal da NF-e é alterado).
 */
const FOCUS_BASE = 'https://api.focusnfe.com.br';

// O runtime do worker mantém ~6 conexões simultâneas por vez.
const CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 30000;
const RETRY_DELAY_MS = 2500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { os_ids } = await req.json();
    if (!Array.isArray(os_ids) || os_ids.length === 0) {
      return Response.json({ error: 'os_ids é obrigatório (lista de IDs de OS com NF-e)' }, { status: 400 });
    }

    const token = Deno.env.get('FOCUSNFE_TOKEN');
    if (!token) return Response.json({ error: 'FOCUSNFE_TOKEN não configurado' }, { status: 500 });
    const authHeaders = { Authorization: `Basic ${btoa(`${token}:`)}` };

    // Fetch com retry único em caso de rate-limit (429) da FocusNFe
    const focusGet = async (url, headers) => {
      let r = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (r.status === 429) {
        await sleep(RETRY_DELAY_MS);
        r = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      }
      return r;
    };

    const results = await mapLimit(os_ids.slice(0, 200), CONCURRENCY, async (osId) => {
      try {
        const os = await base44.entities.ServiceOrder.get(osId);
        if (!os) return { error: `OS ${osId}: não encontrada` };

        // Já extraído anteriormente (cache) — não refaz a chamada
        if (os.nfe_cfop) return { osId, cfop: os.nfe_cfop };

        let path = os.nfe_xml_url;
        if (!path && os.nfe_ref) {
          const consult = await focusGet(`${FOCUS_BASE}/v2/nfe/${os.nfe_ref}`, { ...authHeaders, Accept: 'application/json' });
          if (consult.ok) {
            const data = await consult.json();
            path = data.caminho_xml_nota_fiscal || '';
          }
        }
        if (!path) return { error: `OS ${os.code}: XML da NF-e não disponível` };

        const resp = await focusGet(`${FOCUS_BASE}${path}`, authHeaders);
        if (!resp.ok) return { error: `OS ${os.code}: erro HTTP ${resp.status} ao baixar o XML da NF-e` };
        const xml = await resp.text();

        // CFOP de cada item da NF-e (tag <CFOP> dentro de <prod>) — CFOP efetivamente utilizado na emissão
        const matches = [...xml.matchAll(/<CFOP[^>]*>(\d{4})<\/CFOP[^>]*>/gi)].map((m) => m[1]);
        const unique = [...new Set(matches)];
        if (unique.length === 0) return { error: `OS ${os.code}: CFOP não encontrado no XML da NF-e` };
        const cfop = unique.join(' / ');

        // Cacheia na OS para evitar novas chamadas à Focus N Fe (não altera nenhum dado fiscal da NF-e)
        await base44.entities.ServiceOrder.update(osId, { nfe_cfop: cfop });

        return { osId, cfop };
      } catch (e) {
        return { error: `Erro inesperado (${osId}): ${e.message}` };
      }
    });

    const cfops = {};
    const errors = [];
    for (const r of results) {
      if (!r) continue;
      if (r.error) errors.push(r.error);
      if (r.osId && r.cfop) cfops[r.osId] = r.cfop;
    }

    return Response.json({ cfops, errors });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}