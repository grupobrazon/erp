// Gerado de base44/functions/importLegacyMaintenance/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

const CSV_URL = 'https://docs.google.com/spreadsheets/d/1bXrUqc0KF8OX2cC5KPYpg6tB11kKi9UNW9nDvQXjAlE/export?format=csv&gid=887242926';

// Simple CSV parser that handles quoted fields with embedded commas/newlines
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { inQuotes = false; }
      } else { cell += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === ',') { row.push(cell); cell = ''; }
      else if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (char === '\r') { /* skip */ }
      else { cell += char; }
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const normalize = (s) => {
  if (!s) return '';
  return s.replace(/^\uFEFF/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
};

function parseMonthYear(val) {
  if (!val) return null;
  const parts = val.trim().split('/');
  if (parts.length !== 2) return null;
  const month = parseInt(parts[0]);
  const year = parseInt(parts[1]);
  if (!month || !year) return null;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function parseDate(val) {
  if (!val) return null;
  const parts = val.trim().split('/');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  if (!day || !month || !year || year.length !== 4) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// Two-pass fetch: list() caps at ~5000, so ascending + descending covers ~10,000
async function fetchAll(base44, entityName) {
  const map = new Map();
  const b1 = await base44.asServiceRole.entities[entityName].list("-created_date", 5000);
  for (const r of b1) map.set(r.id, r);
  const b2 = await base44.asServiceRole.entities[entityName].list("created_date", 5000);
  for (const r of b2) map.set(r.id, r);
  return [...map.values()];
}

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — apenas administradores' }, { status: 403 });

    // 1. Fetch and parse CSV
    const csvRes = await fetch(CSV_URL);
    if (!csvRes.ok) throw new Error('Falha ao buscar planilha: ' + csvRes.status);
    const csvText = await csvRes.text();
    const allRows = parseCSV(csvText);

    // 2. Map column indices from header
    const header = (allRows[0] || []).map(h => (h || '').trim());
    const findCol = (name) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
    const col = {
      base: findCol('Base'),
      code: findCol('Código cliente'),
      name: findCol('Nome cliente'),
      cpf: header.indexOf('CPF'),
      phone1: findCol('Telefone 1'),
      phone2: findCol('Telefone 2'),
      phone3: findCol('Telefone 3'),
      phone4: findCol('Telefone 4'),
      phone5: findCol('Telefone 5'),
      zoox1: findCol('Telefone Zoox 1'),
      zoox2: findCol('Telefone Zoox 2'),
      zoox3: findCol('Telefone Zoox 3'),
      zoox4: findCol('Telefone Zoox 4'),
      zoox5: findCol('Telefone Zoox 5'),
      zoox6: findCol('Telefone Zoox 6'),
      zoox7: findCol('Telefone Zoox 7'),
      city: findCol('Cidade'),
      cep: findCol('CEP'),
      bairro: findCol('Bairro'),
      uf: findCol('UF'),
      dataCad: findCol('Data Cadastro'),
      produto: findCol('Produto'),
      codProduto: findCol('Cód. Produto'),
      lastProduct: findCol('Produto ou última compra'),
      lista: findCol('Lista'),
      lastPurchase: findCol('Última compra'),
      nextExchange: findCol('Próxima troca'),
    };

    // 3. Fetch all existing data in bulk
    const clients = await fetchAll(base44, 'Client');
    const products = await base44.asServiceRole.entities.Product.list("-created_date", 5000);
    const existingEquip = await fetchAll(base44, 'Equipment');

    // Build lookup maps
    const clientByCpf = new Map();
    for (const c of clients) {
      if (c.document) clientByCpf.set(c.document.replace(/\D/g, ''), c);
    }

    // Track max new_code to generate codes for imported clients
    let maxCodeNum = clients.reduce((max, c) => {
      const num = parseInt(c.new_code?.replace("B", "")) || 0;
      return num > max ? num : max;
    }, 0);

    const normProducts = products.map(p => ({ id: p.id, normName: normalize(p.name) }));

    const importedClientIds = new Set(
      existingEquip.filter(e => e.imported && e.record_type === 'equipamento').map(e => e.client_id)
    );

    // 4. Process all rows — split into existing-client and new-client
    const dataRows = allRows.slice(1).filter(r => r.length > 2 && (r[col.name] || '').trim());

    const mkGet = (row) => (idx) => (idx >= 0 ? (row[idx] || '').trim() : '');

    const buildEquip = (row, clientId, clientName, cpf) => {
      const get = mkGet(row);
      const lastProductRaw = get(col.lastProduct);
      let matchedProduct = null;
      if (lastProductRaw && !lastProductRaw.toLowerCase().includes('conferir')) {
        const normLast = normalize(lastProductRaw);
        matchedProduct = normProducts.find(p =>
          p.normName && (p.normName === normLast || p.normName.includes(normLast) || normLast.includes(p.normName))
        );
      }
      const lastPurchaseDate = parseMonthYear(get(col.lastPurchase));
      const nextExchangeDate = parseDate(get(col.nextExchange));
      let intervalMonths = 6;
      if (lastPurchaseDate && nextExchangeDate) {
        const last = new Date(lastPurchaseDate + 'T00:00:00');
        const next = new Date(nextExchangeDate + 'T00:00:00');
        const diff = (next.getFullYear() - last.getFullYear()) * 12 + (next.getMonth() - last.getMonth());
        if (diff > 0 && diff <= 24) intervalMonths = diff;
      }
      const oldCode = get(col.code);
      const produtoNome = get(col.produto);
      return {
        matched: !!matchedProduct,
        data: {
          patrimony_code: oldCode ? `${oldCode}-01` : `IMP-${cpf.slice(-6)}-01`,
          client_id: clientId,
          client_name: clientName,
          product_name: produtoNome,
          brand: produtoNome,
          sale_date: parseDate(get(col.dataCad)),
          status: 'Ativo',
          record_type: 'equipamento',
          imported: true,
          last_maintenance_date: lastPurchaseDate,
          next_maintenance_date: nextExchangeDate,
          last_maintenance_part_id: matchedProduct ? matchedProduct.id : '',
          last_maintenance_part_name: lastProductRaw && !lastProductRaw.toLowerCase().includes('conferir') ? lastProductRaw : '',
          maintenance_interval_months: intervalMonths,
        },
      };
    };

    const equipmentToCreate = [];
    const newClientRows = [];
    let skipped = 0;
    let matched = 0;

    for (const row of dataRows) {
      const get = mkGet(row);
      const cpf = get(col.cpf).replace(/\D/g, '');
      const clientName = get(col.name);
      if (!cpf || cpf.length < 11 || !clientName) { skipped++; continue; }

      if (clientByCpf.has(cpf)) {
        const c = clientByCpf.get(cpf);
        if (importedClientIds.has(c.id)) { skipped++; continue; }
        const eq = buildEquip(row, c.id, c.name, cpf);
        if (eq.matched) matched++;
        equipmentToCreate.push(eq.data);
        importedClientIds.add(c.id);
      } else {
        newClientRows.push({ row, cpf, clientName });
      }
    }

    // 5. bulkCreate new clients (in batches of 500)
    let clientsCreated = 0;
    if (newClientRows.length > 0) {
      const statusMap = {
        'Base Inativa LSOFT': 'Base Inativa LSOFT',
        'Ótimo Recorrente (mais de 1 compra)': 'Ótimo Recorrente',
        'Ótimo (tem reg. de qualquer compra)': 'Ótimo',
      };

      const clientsData = newClientRows.map(({ row, cpf, clientName }) => {
        const get = mkGet(row);
        maxCodeNum++;
        return {
          name: clientName,
          person_type: 'Física',
          document: cpf,
          new_code: `B${String(maxCodeNum).padStart(6, "0")}`,
          old_code: get(col.code),
          base_type: get(col.base).includes('LSOFT') ? 'Lsoft' : 'Ótimo',
          phone1: get(col.phone1),
          phone2: get(col.phone2),
          phone3: get(col.phone3),
          phone4: get(col.phone4),
          phone5: get(col.phone5),
          zoox_phone1: get(col.zoox1),
          zoox_phone2: get(col.zoox2),
          zoox_phone3: get(col.zoox3),
          zoox_phone4: get(col.zoox4),
          zoox_phone5: get(col.zoox5),
          zoox_phone6: get(col.zoox6),
          zoox_phone7: get(col.zoox7),
          zip_code: get(col.cep),
          neighborhood: get(col.bairro),
          city: get(col.city),
          state: get(col.uf),
          registration_date: parseDate(get(col.dataCad)),
          status: statusMap[get(col.lista)] || 'Novo',
          last_purchase_date: get(col.lastPurchase),
          last_product: get(col.lastProduct),
        };
      });

      for (let i = 0; i < clientsData.length; i += 500) {
        const batch = clientsData.slice(i, i + 500);
        const created = await base44.asServiceRole.entities.Client.bulkCreate(batch);
        for (const c of created) {
          const cpfKey = c.document ? c.document.replace(/\D/g, '') : '';
          if (cpfKey) clientByCpf.set(cpfKey, c);
        }
        clientsCreated += created.length;
      }

      // 6. Now prepare equipment for new-client rows
      for (const { row, cpf } of newClientRows) {
        const c = clientByCpf.get(cpf);
        if (!c) { skipped++; continue; }
        if (importedClientIds.has(c.id)) { skipped++; continue; }
        const eq = buildEquip(row, c.id, c.name, cpf);
        if (eq.matched) matched++;
        equipmentToCreate.push(eq.data);
        importedClientIds.add(c.id);
      }
    }

    // 7. bulkCreate equipment (in batches of 500)
    let equipmentCreated = 0;
    for (let i = 0; i < equipmentToCreate.length; i += 500) {
      const batch = equipmentToCreate.slice(i, i + 500);
      const created = await base44.asServiceRole.entities.Equipment.bulkCreate(batch);
      equipmentCreated += created.length;
    }

    return Response.json({
      success: true,
      total_rows: dataRows.length,
      equipment_created: equipmentCreated,
      clients_created: clientsCreated,
      matched,
      skipped,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});