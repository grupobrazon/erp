// Gerado de base44/functions/checkMelhorEnvioReport/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

const ME_BASE = 'https://melhorenvio.com.br';

function normalizeDoc(doc) {
  if (!doc) return '';
  return String(doc).replace(/\D/g, '');
}

function normalizeZip(zip) {
  if (!zip) return '';
  return String(zip).replace(/\D/g, '');
}

function normalizeName(name) {
  if (!name) return '';
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fetch all ME orders for the current year with pagination
async function fetchAllMeOrders(token, userAgent) {
  const all = [];
  let page = 1;
  const maxPages = 100; // safety limit (100 * ~100 = 10000 orders)
  const yearStart = `${new Date().getFullYear()}-01-01`;
  while (page <= maxPages) {
    const url = `${ME_BASE}/api/v2/me/orders?page=${page}`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': userAgent,
      },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Melhor Envio GET /orders falhou (${res.status}): ${txt}`);
    }
    const data = await res.json();
    const items = data.data || [];
    // Filter to current year by created_at
    const yearItems = items.filter(o => {
      const created = o.created_at || o.paid_at || o.generated_at;
      return created && created >= yearStart;
    });
    all.push(...yearItems);
    // If all items on this page are older than year start, we can stop
    const anyNewer = items.some(o => (o.created_at || '') >= yearStart);
    if (!data.next_page_url || items.length === 0 || (!anyNewer && page > 1 && items.length < (data.per_page || 10))) {
      break;
    }
    page++;
  }
  return all;
}

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = Deno.env.get('MELHOR_ENVIO_TOKEN');
    const userAgent = Deno.env.get('MELHOR_ENVIO_USER_AGENT') || 'ERP Brazon (contato@brazon.com.br)';
    if (!token) return Response.json({ error: 'Token do Melhor Envio não configurado (MELHOR_ENVIO_TOKEN).' }, { status: 500 });

    // 1. Fetch all ME orders for current year
    const meOrders = await fetchAllMeOrders(token, userAgent);

    // Build match indexes
    const meByZip = new Map();
    const meByDoc = new Map();
    const meByName = new Map();
    for (const o of meOrders) {
      const zip = normalizeZip(o.to?.postal_code);
      const doc = normalizeDoc(o.to?.document);
      const name = normalizeName(o.to?.name);
      const summary = {
        protocol: o.protocol,
        status: o.status,
        tracking: o.tracking,
        company: o.service?.company?.name || o.service?.name || '',
        created_at: o.created_at,
        posted_at: o.posted_at,
        delivered_at: o.delivered_at,
        price: o.price,
        to_name: o.to?.name,
        to_doc: doc,
        to_zip: zip,
        to_city: o.to?.city,
        to_state: o.to?.state_abbr,
      };
      if (zip) { if (!meByZip.has(zip)) meByZip.set(zip, []); meByZip.get(zip).push(summary); }
      if (doc) { if (!meByDoc.has(doc)) meByDoc.set(doc, []); meByDoc.get(doc).push(summary); }
      if (name) { if (!meByName.has(name)) meByName.set(name, []); meByName.get(name).push(summary); }
    }

    // 2. Fetch all sales (batch)
    const allSales = [];
    let skip = 0;
    const batchSize = 500;
    let hasMore = true;
    while (hasMore) {
      const batch = await base44.asServiceRole.entities.Sale.list('-created_date', batchSize, skip);
      if (!batch || batch.length === 0) break;
      allSales.push(...batch);
      skip += batch.length;
      hasMore = batch.length === batchSize;
    }

    // 3. Fetch all service orders (batch)
    const allOS = [];
    skip = 0; hasMore = true;
    while (hasMore) {
      const batch = await base44.asServiceRole.entities.ServiceOrder.list('-created_date', batchSize, skip);
      if (!batch || batch.length === 0) break;
      allOS.push(...batch);
      skip += batch.length;
      hasMore = batch.length === batchSize;
    }
    const osBySaleId = new Map();
    for (const os of allOS) {
      if (os.sale_id) {
        if (!osBySaleId.has(os.sale_id)) osBySaleId.set(os.sale_id, []);
        osBySaleId.get(os.sale_id).push(os);
      }
    }

    // 4. Fetch clients for documents (batch) — only those referenced by sales
    const clientIdSet = new Set();
    for (const s of allSales) { if (s.client_id) clientIdSet.add(s.client_id); }
    const clientDocs = new Map();
    const clientIds = [...clientIdSet];
    for (let i = 0; i < clientIds.length; i += batchSize) {
      const chunk = clientIds.slice(i, i + batchSize);
      for (const cid of chunk) {
        try {
          const c = await base44.asServiceRole.entities.Client.get(cid);
          if (c) clientDocs.set(cid, normalizeDoc(c.document));
        } catch {}
      }
    }

    // 5. Build report rows
    const rows = [];
    let matchedCount = 0;
    for (const sale of allSales) {
      const deliveryZip = normalizeZip(sale.delivery_address?.zip_code || sale.billing_address?.zip_code);
      const clientDoc = clientDocs.get(sale.client_id) || '';
      const clientName = normalizeName(sale.client_name || sale.client_id);
      const osList = osBySaleId.get(sale.id) || [];
      const osPrimary = osList[0];

      // Match against ME
      // Guarda de data: só casa envios do ME criados em ou após a data da venda,
      // evitando casar envios antigos do mesmo cliente com uma venda nova.
      const saleDate = sale.date ? String(sale.date).slice(0, 10) : '';
      const matched = new Set(); // dedupe by protocol
      const meMatches = [];
      const tryAdd = (list, type) => {
        for (const m of list) {
          if (matched.has(m.protocol)) continue;
          if (saleDate && m.created_at) {
            const meDate = String(m.created_at).slice(0, 10);
            if (meDate < saleDate) continue;
          }
          matched.add(m.protocol);
          meMatches.push({ ...m, match_type: type });
        }
      };
      if (clientDoc && meByDoc.has(clientDoc)) tryAdd(meByDoc.get(clientDoc), 'cpf/cnpj');
      if (deliveryZip && meByZip.has(deliveryZip)) tryAdd(meByZip.get(deliveryZip), 'cep');
      if (clientName && meByName.has(clientName)) tryAdd(meByName.get(clientName), 'nome');

      if (meMatches.length > 0) matchedCount++;

      rows.push({
        sale_id: sale.id,
        order_number: sale.order_number,
        client_name: sale.client_name,
        client_doc: clientDoc,
        delivery_zip: deliveryZip,
        sale_stage: sale.stage,
        sale_status: sale.status,
        sale_date: sale.date,
        is_counter_sale: sale.is_counter_sale,
        os_code: osPrimary?.code || '',
        os_status: osPrimary?.status || '',
        os_id: osPrimary?.id || '',
        os_count: osList.length,
        has_system_label: Boolean(osPrimary?.melhor_envio_shipment_id || osPrimary?.melhor_envio_labels?.length),
        me_matches: meMatches,
        me_match_count: meMatches.length,
      });
    }

    return Response.json({
      me_total: meOrders.length,
      sales_total: allSales.length,
      matched_sales: matchedCount,
      rows,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});