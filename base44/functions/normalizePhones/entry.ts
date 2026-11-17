import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — apenas administradores' }, { status: 403 });

    const phoneFields = ['phone1', 'phone2', 'phone3', 'phone4', 'phone5'];
    const zooxFields = ['zoox_phone1', 'zoox_phone2', 'zoox_phone3', 'zoox_phone4', 'zoox_phone5', 'zoox_phone6', 'zoox_phone7'];
    const allPhoneFields = [...phoneFields, ...zooxFields];

    const normalizePhone = (raw) => {
      if (!raw || typeof raw !== 'string') return null;
      let digits = raw.replace(/\D/g, '');
      if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
      if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
      if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
      return raw.trim();
    };

    const classifyWhatsapp = (formatted) => {
      if (!formatted) return null;
      let digits = formatted.replace(/\D/g, '');
      if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
      if (digits.length === 11) return true;
      if (digits.length === 10) {
        const third = parseInt(digits[2], 10);
        if (third >= 6) return true;
        if (third >= 2 && third <= 5) return false;
      }
      return null;
    };

    // Paginate: fetch in both sort directions and deduplicate by ID
    // list() caps at ~5000 records, so two passes cover up to ~10,000
    const fetchAll = async (entityName) => {
      const map = new Map();
      const batch1 = await base44.asServiceRole.entities[entityName].list("-created_date", 5000);
      for (const r of batch1) map.set(r.id, r);
      const batch2 = await base44.asServiceRole.entities[entityName].list("created_date", 5000);
      for (const r of batch2) map.set(r.id, r);
      return [...map.values()];
    };

    const clients = await fetchAll('Client');
    const contacts = await fetchAll('Contact');

    // Build client updates
    const clientUpdates = [];
    let phonesNormalized = 0;
    let whatsappSet = 0;
    for (const c of clients) {
      const update = { id: c.id };
      let changed = false;
      for (const f of allPhoneFields) {
        const raw = c[f];
        if (raw) {
          const norm = normalizePhone(raw);
          if (norm && norm !== raw) { update[f] = norm; changed = true; phonesNormalized++; }
        }
      }
      for (let i = 1; i <= 5; i++) {
        const f = `phone${i}`;
        const raw = c[f];
        if (raw) {
          const norm = normalizePhone(raw) || raw;
          const isCel = classifyWhatsapp(norm);
          const currentFlag = c[`${f}_whatsapp`];
          if (isCel !== null && isCel !== currentFlag) {
            update[`${f}_whatsapp`] = isCel;
            changed = true;
            whatsappSet++;
          }
        }
      }
      if (changed) clientUpdates.push(update);
    }

    // Build contact updates
    const contactUpdates = [];
    for (const c of contacts) {
      const update = { id: c.id };
      let changed = false;
      if (c.phone) {
        const norm = normalizePhone(c.phone);
        if (norm && norm !== c.phone) { update.phone = norm; changed = true; phonesNormalized++; }
        const isCel = classifyWhatsapp(norm || c.phone);
        if (isCel !== null && isCel !== c.whatsapp) {
          update.whatsapp = isCel;
          changed = true;
          whatsappSet++;
        }
      }
      if (changed) contactUpdates.push(update);
    }

    // Apply updates in batches of 100
    for (let i = 0; i < clientUpdates.length; i += 100) {
      await base44.asServiceRole.entities.Client.bulkUpdate(clientUpdates.slice(i, i + 100));
    }
    for (let i = 0; i < contactUpdates.length; i += 100) {
      await base44.asServiceRole.entities.Contact.bulkUpdate(contactUpdates.slice(i, i + 100));
    }

    // Verification: re-fetch 3 sample clients that were updated and report their actual stored values
    const sampleIds = clientUpdates.slice(0, 3).map(u => u.id);
    const verification = [];
    for (const id of sampleIds) {
      const refetched = await base44.asServiceRole.entities.Client.get(id);
      verification.push({
        id,
        phone1: refetched.phone1,
        phone1_whatsapp: refetched.phone1_whatsapp,
        phone2: refetched.phone2,
        phone2_whatsapp: refetched.phone2_whatsapp,
      });
    }

    return Response.json({
      success: true,
      clientsProcessed: clients.length,
      contactsProcessed: contacts.length,
      clientsUpdated: clientUpdates.length,
      contactsUpdated: contactUpdates.length,
      phonesNormalized,
      whatsappFlagsSet: whatsappSet,
      verification,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});