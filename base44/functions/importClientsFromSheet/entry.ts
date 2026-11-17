import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1bXrUqc0KF8OX2cC5KPYpg6tB11kKi9UNW9nDvQXjAlE/export?format=tsv&gid=887242926';

function parseDate(d) {
  if (!d) return '';
  const m = String(d).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return '';
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function mapBaseType(base) {
  const b = String(base || '').toUpperCase().trim();
  if (b === 'LSOFT') return 'Lsoft';
  if (b.includes('ÓTIMO') || b.includes('OTIMO')) return 'Ótimo';
  return 'Novo';
}

function mapStatus(lista) {
  const l = String(lista || '').toLowerCase().trim();
  if (l.includes('base inativa')) return 'Base Inativa LSOFT';
  if (l.includes('recorrente')) return 'Ótimo Recorrente';
  if (l.includes('brazon')) return 'Ótimo - Cliente Brazon';
  if (l.includes('ótimo') || l.includes('otimo')) return 'Ótimo';
  return 'Ótimo';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const targetCodes = Array.isArray(body.target_codes) ? body.target_codes.map(String) : null;

    // Fetch existing clients (most recent first) to find max new_code and already-imported old_codes
    const existing = await base44.asServiceRole.entities.Client.list('-created_date', 5000);
    let maxCode = 0;
    const importedCodes = new Set();
    for (const c of existing) {
      if (c.old_code) importedCodes.add(String(c.old_code));
      const num = parseInt(String(c.new_code || '').replace('B', '')) || 0;
      if (num > maxCode) maxCode = num;
    }

    // Fetch the "lista geral" sheet as TSV
    const resp = await fetch(SHEET_URL);
    if (!resp.ok) return Response.json({ error: 'Falha ao buscar planilha: ' + resp.status }, { status: 502 });
    const text = await resp.text();
    const lines = text.split(/\r?\n/).filter(l => l.length > 0);
    if (lines.length < 2) return Response.json({ error: 'Planilha vazia' }, { status: 400 });

    const header = lines[0].split('\t').map(h => h.trim());
    const col = (name) => header.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));

    const iBase = col('base');
    const iCode = col('código cliente') >= 0 ? col('código cliente') : 1;
    const iName = col('nome cliente') >= 0 ? col('nome cliente') : 2;
    let iCpf = col('cpf');
    const iPhoneStart = col('telefone 1');
    const iCity = col('cidade');
    const iCep = col('cep');
    const iBairro = col('bairro');
    const iUf = col('uf') >= 0 ? col('uf') : col('estado');
    const iDataCad = col('data cadastro');
    const iLastProd = col('produto ou última compra') >= 0 ? col('produto ou última compra') : col('última compra');
    const iLista = col('lista');
    const iUltCompra = col('última compra');
    const iZooxStart = col('telefone zoox 1');

    // Build a map of code -> row for all rows
    const rowsByCode = {};
    for (let r = 1; r < lines.length; r++) {
      const cells = lines[r].split('\t');
      const code = String((cells[iCode] || '').trim());
      if (!code) continue;
      if (!rowsByCode[code]) rowsByCode[code] = cells;
    }

    const codesToProcess = targetCodes || Object.keys(rowsByCode);
    const created = [];
    const skipped = [];
    let notFound = [];

    for (const code of codesToProcess) {
      if (importedCodes.has(code)) { skipped.push({ code, reason: 'já importado' }); continue; }
      const cells = rowsByCode[code];
      if (!cells) { notFound.push(code); continue; }
      const get = (idx) => idx >= 0 ? String(cells[idx] || '').trim() : '';

      const name = get(iName).replace(/^[:\s]+/, '').replace(/^NOME:\s*/i, '').trim();
      if (!name) { skipped.push({ code, reason: 'sem nome' }); continue; }

      const phones = [];
      for (let p = 0; p < 5; p++) phones.push(get(iPhoneStart + p));
      const zoox = [];
      for (let p = 0; p < 7; p++) zoox.push(get(iZooxStart + p));

      let document = get(iCpf);
      // fallback to digits-only CPF column (second occurrence)
      if (!document) {
        const iCpf2 = header.findIndex((h, idx) => idx > iCpf && h.toLowerCase().includes('cpf'));
        if (iCpf2 >= 0) document = get(iCpf2);
      }

      maxCode++;
      const client = {
        old_code: code,
        base_type: mapBaseType(get(iBase)),
        person_type: 'Física',
        name,
        document: document || '',
        phone1: phones[0] || '',
        phone2: phones[1] || '',
        phone3: phones[2] || '',
        phone4: phones[3] || '',
        phone5: phones[4] || '',
        zoox_phone1: zoox[0] || '',
        zoox_phone2: zoox[1] || '',
        zoox_phone3: zoox[2] || '',
        zoox_phone4: zoox[3] || '',
        zoox_phone5: zoox[4] || '',
        zoox_phone6: zoox[5] || '',
        zoox_phone7: zoox[6] || '',
        zip_code: get(iCep),
        neighborhood: get(iBairro),
        city: get(iCity),
        state: get(iUf),
        registration_date: parseDate(get(iDataCad)),
        last_product: get(iLastProd),
        last_purchase_date: get(iUltCompra),
        status: mapStatus(get(iLista)),
        new_code: `B${String(maxCode).padStart(6, '0')}`,
        is_active: true,
      };
      try {
        await base44.asServiceRole.entities.Client.create(client);
        created.push({ code, name, new_code: client.new_code });
      } catch (e) {
        skipped.push({ code, name, reason: e.message });
      }
    }

    return Response.json({
      success: true,
      max_new_code_start: `B${String(maxCode - created.length + 1).padStart(6, '0')}`,
      target_count: codesToProcess.length,
      created: created.length,
      skipped: skipped.length,
      not_found: notFound,
      created_list: created,
      skipped_list: skipped,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});