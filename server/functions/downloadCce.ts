// Gerado de base44/functions/downloadCce/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

/**
 * Baixa o PDF da Carta de Correção Eletrônica (CC-e) de uma NF-e autorizada na Focus NFe.
 * Body: { source: 'os' | 'remessa', entity_id, cce_index }
 * Retorna: { pdf_base64, filename }
 */
const FOCUS_BASE = 'https://api.focusnfe.com.br';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { source, entity_id, cce_index } = await req.json();
    if (!source || !entity_id) {
      return Response.json({ error: 'source (os|remessa) e entity_id são obrigatórios' }, { status: 400 });
    }

    const entity = source === 'os'
      ? await base44.entities.ServiceOrder.get(entity_id)
      : await base44.entities.Remessa.get(entity_id);
    if (!entity) return Response.json({ error: 'Registro não encontrado' }, { status: 404 });

    const history = entity.nfe_cce_history || [];
    const index = Number.isInteger(Number(cce_index)) ? Number(cce_index) : history.length - 1;
    if (!history[index]) {
      return Response.json({ error: 'Carta de correção não encontrada para esta NF-e' }, { status: 400 });
    }
    // A SEFAZ numera as cartas em sequência (1 a 20) — a ordem do histórico acompanha essa numeração.
    const numero = history[index].number || index + 1;

    if (!entity.nfe_ref) {
      return Response.json({ error: 'Referência da NF-e não disponível para consulta' }, { status: 400 });
    }

    const token = Deno.env.get('FOCUSNFE_TOKEN');
    if (!token) return Response.json({ error: 'FOCUSNFE_TOKEN não configurado' }, { status: 500 });
    const auth = btoa(`${token}:`);

    // A Focus NFe informa o caminho do PDF da carta de correção na consulta da NF-e.
    const consulta = await fetch(`${FOCUS_BASE}/v2/nfe/${encodeURIComponent(entity.nfe_ref)}`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    const dados = await consulta.json().catch(() => ({}));
    let caminho = dados.caminho_pdf_carta_correcao || '';
    if (!caminho) {
      return Response.json({ error: 'O PDF desta carta de correção ainda não está disponível na Focus NFe.' }, { status: 404 });
    }
    if (numero && !caminho.endsWith(`/${numero}.pdf`)) {
      caminho = caminho.replace(/\/[^/]+\.pdf$/, `/${numero}.pdf`);
    }

    const resp = await fetch(`${FOCUS_BASE}${caminho}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return Response.json({ error: `Erro ao baixar a carta de correção (${resp.status})`, details: text }, { status: 502 });
    }

    const pdfBuffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(pdfBuffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }

    return Response.json({
      pdf_base64: btoa(binary),
      filename: `CartaCorrecao_${entity.nfe_chave || entity.code || entity_id}_${numero}.pdf`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}