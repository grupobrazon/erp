import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

/**
 * Importa a distribuição de clientes a partir de uma planilha (Excel/CSV).
 *
 * Body: { file_url, dry_run }
 *
 * A planilha precisa ter duas colunas: o Código novo do cliente (ex: B000123) e a
 * vendedora responsável. O sistema casa o cliente pelo Código novo e aplica a
 * vendedora da planilha (substituindo a atual). Ao aplicar, gera um lote de
 * distribuição (DIST-xxxxxx) para que a lista possa ser usada nas campanhas 3C.
 */

const normText = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normCode = (s) => {
  const raw = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return `B${raw.padStart(6, '0')}`;
  return raw;
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const fileUrl = body.file_url;
    const dryRun = body.dry_run !== false;
    if (!fileUrl) {
      return Response.json({ error: 'Planilha não recebida. Anexe o arquivo novamente.' }, { status: 400 });
    }

    // 1. Extrair as linhas da planilha
    const extraction = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
      file_url: fileUrl,
      json_schema: {
        type: 'object',
        properties: {
          codigo: { type: 'string', description: 'Código novo do cliente, formato B000001' },
          vendedora: { type: 'string', description: 'Nome da vendedora responsável pelo cliente' },
        },
      },
    });

    if (extraction?.status !== 'success') {
      return Response.json({ error: extraction?.details || 'Não foi possível ler a planilha.' }, { status: 400 });
    }
    const output = extraction.output;
    const rawRows = Array.isArray(output) ? output : output?.rows || [];
    if (!rawRows.length) {
      return Response.json({ error: 'Nenhuma linha encontrada na planilha.' }, { status: 400 });
    }

    // 2. Consolidar código -> vendedora (o código manda)
    const sellerByCode = new Map();
    for (const r of rawRows) {
      const code = normCode(r.codigo ?? r.code ?? r['Código novo'] ?? r.codigo_novo);
      const sellerName = String(r.vendedora ?? r.seller ?? r.Vendedora ?? '').trim();
      if (!code || !sellerName) continue;
      sellerByCode.set(code, sellerName);
    }
    if (!sellerByCode.size) {
      return Response.json({
        error: 'Não encontrei as colunas de Código novo e Vendedora na planilha. Confira os cabeçalhos.',
      }, { status: 400 });
    }

    // 3. Vendedoras cadastradas
    const sellers = await base44.asServiceRole.entities.Seller.list('-created_date', 500);
    const sellerByName = new Map();
    for (const s of sellers) {
      if (s?.name) sellerByName.set(normText(s.name), s);
    }

    // 4. Localizar os clientes pelo Código novo
    const codes = [...sellerByCode.keys()];
    const clientByCode = new Map();
    const chunkSize = 200;
    for (let i = 0; i < codes.length; i += chunkSize) {
      const chunk = codes.slice(i, i + chunkSize);
      const page = await base44.asServiceRole.entities.Client.filter(
        { new_code: { $in: chunk } },
        { limit: 500, fields: ['id', 'new_code', 'name', 'seller_name'] }
      );
      for (const c of page.items || []) clientByCode.set(normCode(c.new_code), c);
    }

    // 5. Montar a lista final
    const notFoundCodes = [];
    const sellersNotFound = new Set();
    const bySeller = new Map();
    const updates = [];

    for (const [code, sellerName] of sellerByCode) {
      const client = clientByCode.get(code);
      if (!client) {
        notFoundCodes.push(code);
        continue;
      }
      const seller = sellerByName.get(normText(sellerName));
      if (!seller) {
        sellersNotFound.add(sellerName);
        continue;
      }
      updates.push({ id: client.id, seller_id: seller.id, seller_name: seller.name });
      bySeller.set(seller.name, (bySeller.get(seller.name) || 0) + 1);
    }

    const summary = {
      total_rows: rawRows.length,
      unique_codes: sellerByCode.size,
      to_update: updates.length,
      not_found: notFoundCodes.length,
      sellers_not_found: sellersNotFound.size,
      by_seller: [...bySeller.entries()]
        .map(([seller, count]) => ({ seller, count }))
        .sort((a, b) => b.count - a.count),
    };

    if (dryRun) {
      return Response.json({
        success: true,
        dry_run: true,
        summary,
        not_found_codes: notFoundCodes.slice(0, 50),
        sellers_not_found: [...sellersNotFound],
      });
    }

    if (!updates.length) {
      return Response.json({ error: 'Nenhum cliente pôde ser atualizado.', summary }, { status: 400 });
    }

    // 6. Gerar o lote de distribuição
    const batches = await base44.asServiceRole.entities.DistributionBatch.list('-date', 500);
    const nums = batches
      .map((b) => parseInt(String(b.protocol || '').replace(/\D/g, ''), 10))
      .filter((n) => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    const protocol = `DIST-${String(next).padStart(6, '0')}`;

    const sellerIds = [...new Set(updates.map((u) => u.seller_id))];
    const sellerNames = [...new Set(updates.map((u) => u.seller_name))];

    const batch = await base44.asServiceRole.entities.DistributionBatch.create({
      protocol,
      date: new Date().toISOString(),
      mode: 'planilha',
      seller_ids: sellerIds,
      seller_names: sellerNames,
      client_count: updates.length,
      client_ids: updates.map((u) => u.id),
      reversed: false,
      notes: `Importado da planilha por ${user.full_name || 'usuário'}`,
    });

    // 7. Aplicar a vendedora em cada cliente
    const withBatch = updates.map((u) => ({ ...u, distribution_batch_id: batch.id }));
    for (let i = 0; i < withBatch.length; i += 500) {
      await base44.asServiceRole.entities.Client.bulkUpdate(withBatch.slice(i, i + 500));
    }

    return Response.json({
      success: true,
      dry_run: false,
      summary: { ...summary, updated: withBatch.length },
      protocol,
      batch_id: batch.id,
      not_found_codes: notFoundCodes.slice(0, 50),
      sellers_not_found: [...sellersNotFound],
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}