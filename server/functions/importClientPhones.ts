// Gerado de base44/functions/importClientPhones/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

const SHEET_ID = '1_Nk27k6G6Md-Ss1HactX2OGO-ZBgwL_VyZCDyPX7-eU';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

// ─── CSV parser (handles quoted fields) ───
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else { current += char; }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

// Returns digits-only (strips 55 country code) for comparison
function normalizePhoneDigits(raw) {
  if (!raw) return null;
  let d = raw.replace(/\D/g, '');
  if (!d || d === '0') return null;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length < 8) return null;
  return d;
}

// Formats digits: (31) 98811-7012
function formatPhone(digits) {
  if (!digits) return null;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 9) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return digits;
}

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Apenas administradores' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;
    const sheetUrl = body.sheet_url || SHEET_URL;
    const ALLOWED_HOSTS = ['docs.google.com', 'sheets.googleapis.com'];
    let parsedUrl;
    try { parsedUrl = new URL(sheetUrl); } catch { return Response.json({ error: 'URL inválida' }, { status: 400 }); }
    if (!ALLOWED_HOSTS.includes(parsedUrl.hostname)) {
      return Response.json({ error: 'Domínio da planilha não permitido' }, { status: 400 });
    }

    // 1. Fetch the spreadsheet CSV
    const res = await fetch(sheetUrl);
    if (!res.ok) {
      return Response.json({ error: `Falha ao buscar planilha: HTTP ${res.status}` }, { status: 500 });
    }
    const csvText = await res.text();
    const rows = parseCSV(csvText);

    // 2. Group by old_code, collect unique phones with their contact names
    const byOldCode = new Map();
    for (const row of rows) {
      const oldCode = (row['Código Antigo'] || row['codigo_antigo'] || '').toString().trim();
      if (!oldCode) continue;

      const phoneDigits = normalizePhoneDigits(row['contato'] || '');
      if (!phoneDigits) continue;

      const contactName = (row['Nome do contato'] || '').toString().trim();

      if (!byOldCode.has(oldCode)) byOldCode.set(oldCode, new Map());
      const phoneMap = byOldCode.get(oldCode);
      // Keep first non-empty name per phone
      if (!phoneMap.has(phoneDigits) || (!phoneMap.get(phoneDigits) && contactName)) {
        phoneMap.set(phoneDigits, contactName);
      }
    }

    const sheetData = [];
    for (const [oldCode, phoneMap] of byOldCode) {
      const contacts = [...phoneMap.entries()].map(([digits, name]) => ({
        digits,
        name,
        formatted: formatPhone(digits),
      }));
      sheetData.push({ old_code: oldCode, contacts });
    }

    // 3. Paginate through ALL clients and index by old_code
    const PAGE_SIZE = 500;
    const MAX_CLIENTS = 15000;
    const clientsByOldCode = new Map();
    let offset = 0;
    let totalClientsLoaded = 0;

    while (totalClientsLoaded < MAX_CLIENTS) {
      const batch = await base44.asServiceRole.entities.Client.list('-created_date', PAGE_SIZE, offset);
      if (!batch || batch.length === 0) break;

      for (const c of batch) {
        if (c.old_code) {
          const code = c.old_code.toString().trim();
          if (!clientsByOldCode.has(code)) clientsByOldCode.set(code, []);
          clientsByOldCode.get(code).push(c);
        }
      }

      totalClientsLoaded += batch.length;
      offset += batch.length;
      if (batch.length < PAGE_SIZE) break;
    }

    // 4. Match and build update plan — KEEP existing phones, ADD new ones to empty slots
    //    Fill phone1-5 first (with contact names), overflow into zoox_phone1-7
    const PHONE_FIELDS = ['phone1', 'phone2', 'phone3', 'phone4', 'phone5'];
    const ZOOX_FIELDS = ['zoox_phone1', 'zoox_phone2', 'zoox_phone3', 'zoox_phone4', 'zoox_phone5', 'zoox_phone6', 'zoox_phone7'];
    const ALL_SLOTS = [...PHONE_FIELDS, ...ZOOX_FIELDS];

    const toUpdate = [];
    const noChange = [];
    const notFound = [];

    for (const entry of sheetData) {
      const clients = clientsByOldCode.get(entry.old_code);
      if (!clients || clients.length === 0) {
        notFound.push({ old_code: entry.old_code, phones: entry.contacts.map(c => c.formatted) });
        continue;
      }

      for (const client of clients) {
        // Index existing phone digits across all slots for dedup
        const existingDigits = new Set();
        const slotDigits = {};
        for (const f of ALL_SLOTS) {
          const d = normalizePhoneDigits(client[f]);
          slotDigits[f] = d;
          if (d) existingDigits.add(d);
        }

        // Index sheet contacts by digits for name backfill
        const sheetByDigits = new Map();
        for (const c of entry.contacts) sheetByDigits.set(c.digits, c);

        const updateData = {};
        const added = [];
        let hasChange = false;

        // 1. Backfill contact names for existing phones with empty names
        for (const f of PHONE_FIELDS) {
          const d = slotDigits[f];
          if (!d || !sheetByDigits.has(d)) continue;
          const sheetName = (sheetByDigits.get(d).name || '').trim();
          const existingName = (client[`${f}_name`] || '').toString().trim();
          if (sheetName && !existingName) {
            updateData[`${f}_name`] = sheetName;
            hasChange = true;
          }
        }

        // 2. Add new phones to empty slots (keep existing phones untouched)
        const newContacts = entry.contacts.filter(c => !existingDigits.has(c.digits));
        let idx = 0;
        for (const f of ALL_SLOTS) {
          if (idx >= newContacts.length) break;
          if (!slotDigits[f]) {
            updateData[f] = newContacts[idx].formatted;
            // phone1-5 have a corresponding _name field; zoox slots do not
            if (PHONE_FIELDS.includes(f)) {
              updateData[`${f}_name`] = newContacts[idx].name || '';
            }
            added.push(newContacts[idx].formatted);
            idx++;
            hasChange = true;
          }
        }

        if (!hasChange) {
          noChange.push({ old_code: entry.old_code, client_id: client.id, client_name: client.name });
          continue;
        }

        toUpdate.push({
          old_code: entry.old_code,
          client_id: client.id,
          client_name: client.name,
          old_phones: ALL_SLOTS.map(f => client[f]).filter(Boolean),
          added_phones: added,
          update_data: updateData,
        });
      }
    }

    // 5. Apply updates (unless dry run) using bulkUpdate in batches
    let updated = 0, errors = 0;
    const updateResults = [];

    if (!dryRun && toUpdate.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < toUpdate.length; i += BATCH) {
        const chunk = toUpdate.slice(i, i + BATCH);
        const bulkPayload = chunk.map(m => ({ id: m.client_id, ...m.update_data }));
        try {
          await base44.asServiceRole.entities.Client.bulkUpdate(bulkPayload);
          updated += chunk.length;
          for (const m of chunk) {
            updateResults.push({ old_code: m.old_code, client_id: m.client_id, client_name: m.client_name, added_phones: m.added_phones, status: 'updated' });
          }
        } catch (e) {
          for (const m of chunk) {
            try {
              await base44.asServiceRole.entities.Client.update(m.client_id, m.update_data);
              updated++;
              updateResults.push({ old_code: m.old_code, client_id: m.client_id, client_name: m.client_name, added_phones: m.added_phones, status: 'updated' });
            } catch (e2) {
              errors++;
              updateResults.push({ old_code: m.old_code, client_id: m.client_id, client_name: m.client_name, status: 'error', error: e2.message });
            }
          }
        }
      }
    }

    return Response.json({
      summary: {
        total_rows: rows.length,
        unique_codes: sheetData.length,
        matched_clients: toUpdate.length + noChange.filter(n => n.client_id).length,
        to_update: toUpdate.length,
        updated: dryRun ? 0 : updated,
        no_change: noChange.length,
        not_found: notFound.length,
        errors,
        dry_run: dryRun,
        total_clients_scanned: totalClientsLoaded,
      },
      results: dryRun
        ? toUpdate.map(m => ({
            old_code: m.old_code, client_id: m.client_id, client_name: m.client_name,
            old_phones: m.old_phones, added_phones: m.added_phones, status: 'would_update',
          }))
        : updateResults,
      not_found: notFound.slice(0, 100),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});