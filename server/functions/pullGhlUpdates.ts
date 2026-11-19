// Gerado de base44/functions/pullGhlUpdates/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { secrets } from "../runtime.ts";
import { fetchAllGhlContacts, normalizeEmail } from '../shared/ghlClient.ts';
import { clientPhones, contactPhones, phoneKey, samePhone } from '../shared/phoneMatch.ts';

// Enriquecimento (pull) dos clientes do ERP com dados do CRM (Atlas/GHL).
//
// Política de vínculo (correção dos vínculos errados):
//  • o TELEFONE CONFIRMADO manda: o contato precisa ter, literalmente, um telefone
//    do cadastro do cliente (comparação por DDD + número, tolerando o nono dígito);
//  • só vincula quando UM único contato casa por telefone com UM único cliente;
//  • e-mail compartilhado nunca decide: e-mail só é usado quando é único no CRM,
//    não é compartilhado por outro contato e nenhum outro cliente do ERP usa o mesmo;
//  • nome não vincula e o "primeiro resultado" nunca é usado;
//  • clientes que já têm vínculo salvo não são sobrescritos — a auditoria
//    (auditGhlLinks) é quem confirma ou aponta esses vínculos.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  // dry_run = true → mesma varredura, SEM gravar nada: não atualiza clientes, não
  // altera os ajustes do sistema e não escreve na auditoria.
  let dryRun = false;
  let summaryOnly = false;
  let logConflicts = false;
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    dryRun = !!(body && body.dry_run);
    summaryOnly = !!(body && body.summary_only);
    // log_conflicts = true → registra TODOS os vínculos ambíguos na auditoria
    // (revisão manual), mantendo clientes e CRM intactos.
    logConflicts = !!(body && body.log_conflicts);

    const svc = base44.asServiceRole.entities;
    const logErro = async (mensagem, status_http, payload) => {
      if (dryRun) return;
      await svc.IntegracaoLog.create({
        origem: 'pull', mensagem, status_http, payload_resumido: payload || {},
      }).catch(() => {});
    };

    const settings = await svc.SystemSetting.list('-created_date', 1);
    const cfg = settings[0] || {};
    const ghlLocationId = secrets.get("ghl_location_id") || cfg.ghl_location_id || "";
    if (!ghlLocationId) {
      await logErro('ghl_location_id não configurado (secret/SystemSetting). Defina o Location ID do GHL.', 400, { etapa: 'validacao_config' });
      return Response.json({ error: 'ghl_location_id não configurado. Defina o Location ID do GHL.' }, { status: 400 });
    }

    // 1. Contatos do CRM
    const ghlContacts = await fetchAllGhlContacts(ghlLocationId, secrets);

    // 2. Índices do CRM por telefone e por e-mail
    const contactsByPhone = new Map();
    const contactsByEmail = new Map();
    const contactsById = new Map();
    for (const contact of ghlContacts) {
      if (contact && contact.id) contactsById.set(contact.id, contact);
      const email = normalizeEmail(contact.email);
      if (email) {
        if (!contactsByEmail.has(email)) contactsByEmail.set(email, []);
        contactsByEmail.get(email).push(contact);
      }
      for (const phone of contactPhones(contact)) {
        const key = phoneKey(phone);
        if (!key) continue;
        if (!contactsByPhone.has(key)) contactsByPhone.set(key, []);
        contactsByPhone.get(key).push(contact);
      }
    }

    // Contatos por telefone de UM cliente (confirmação em código, sem "primeiro resultado").
    const phoneHits = (client) => {
      const hits = new Map();
      for (const phone of clientPhones(client)) {
        for (const contact of contactsByPhone.get(phoneKey(phone)) || []) {
          if (!contactPhones(contact).some((stored) => samePhone(stored, phone))) continue;
          hits.set(contact.id, contact);
        }
      }
      return [...hits.values()];
    };
    const emailHits = (client) => {
      const email = normalizeEmail(client.email);
      return (email && contactsByEmail.get(email)) || [];
    };

    // 3. Clientes do ERP: escolhe candidato por telefone confirmado
    let skip = 0;
    const pageSize = 200;
    let hasMore = true;
    let matched = 0, updated = 0, byPhoneCount = 0, byEmailCount = 0, ambiguous = 0;
    let alreadyLinked = 0, emailOnly = 0, sharedEmail = 0, contested = 0;
    const claims = [];
    const conflicts = [];
    const conflictTypes = { mesmo_telefone: 0, contatos_distintos: 0, email_compartilhado: 0 };
    const now = new Date().toISOString();
    const conflictCap = logConflicts ? 5000 : dryRun ? 300 : 100;

    const addConflict = (tipo, client, candidatos) => {
      conflictTypes[tipo] = (conflictTypes[tipo] || 0) + 1;
      if (conflicts.length < conflictCap) {
        conflicts.push({
          tipo,
          client_id: client.id,
          client_name: client.name || '',
          client_code: client.new_code || client.old_code || '',
          contatos: candidatos.slice(0, 5).map((c) => ({ id: c.id, name: c.name || '', phone: c.phone || '', email: c.email || '' })),
        });
      }
    };

    while (hasMore) {
      const clients = await svc.Client.list('-created_date', pageSize, skip);
      if (!clients || clients.length === 0) { hasMore = false; break; }

      for (const client of clients) {
        // Vínculo já existente: preservado (não é sobrescrito por uma nova busca).
        if (client.ghl_contact_id) {
          alreadyLinked++;
          const dono = contactsById.get(client.ghl_contact_id);
          if (dono) {
            claims.push({ client, ghl: dono, match: 'vínculo existente', keep: true });
          }
          continue;
        }

        const porTelefone = phoneHits(client);
        if (porTelefone.length > 1) {
          ambiguous++;
          const chaves = new Set();
          for (const c of porTelefone) for (const p of contactPhones(c)) chaves.add(phoneKey(p));
          addConflict(chaves.size <= 1 ? 'mesmo_telefone' : 'contatos_distintos', client, porTelefone);
          continue;
        }
        if (porTelefone.length === 1) {
          claims.push({ client, ghl: porTelefone[0], match: 'telefone', keep: false });
          continue;
        }

        // Sem confirmação por telefone: e-mail só entra quando é único no CRM.
        const porEmail = emailHits(client);
        if (porEmail.length > 1) {
          sharedEmail++;
          addConflict('email_compartilhado', client, porEmail);
          continue;
        }
        if (porEmail.length === 1) emailOnly++;
      }

      skip += clients.length;
      hasMore = clients.length === pageSize;
    }

    // 4. Um mesmo contato não pode atender dois clientes do ERP
    const byContact = new Map();
    for (const claim of claims) {
      if (!byContact.has(claim.ghl.id)) byContact.set(claim.ghl.id, []);
      byContact.get(claim.ghl.id).push(claim);
    }
    const toUpdate = [];
    for (const [, group] of byContact.entries()) {
      const owners = new Set(group.map((item) => item.client.id));
      if (owners.size > 1) {
        // Contato reutilizado por mais de um cliente: nada é vinculado, revisão manual.
        contested += group.filter((item) => !item.keep).length;
        addConflict('contato_reutilizado', group[0].client, [group[0].ghl]);
        continue;
      }
      for (const item of group) {
        matched++;
        if (item.match === 'telefone') byPhoneCount++;
        else if (item.match === 'e-mail') byEmailCount++;
        if (item.keep) continue;
        toUpdate.push({
          id: item.client.id,
          ghl_contact_id: item.ghl.id,
          ghl_tags: Array.isArray(item.ghl.tags) ? item.ghl.tags : [],
          ghl_last_activity_date: item.ghl.dateAdded || item.ghl.dateUpdatedAt || null,
          ghl_last_sync_date: now,
        });
      }
    }

    if (toUpdate.length > 0 && !dryRun) {
      for (let i = 0; i < toUpdate.length; i += 200) {
        await svc.Client.bulkUpdate(toUpdate.slice(i, i + 200));
      }
      updated += toUpdate.length;
    }

    // 5. Conflitos vão para a auditoria (revisão manual)
    let conflictsLogged = 0;
    if (logConflicts) {
      for (let i = 0; i < conflicts.length; i += 100) {
        const chunk = conflicts.slice(i, i + 100).map((conflict) => ({
          origem: 'vinculo',
          mensagem: conflict.tipo === 'email_compartilhado'
            ? `E-mail compartilhado: o cliente ${conflict.client_name || conflict.client_code} usa um e-mail que aparece em ${conflict.contatos.length} contatos do CRM. Nada foi vinculado.`
            : `Vínculo ambíguo: ${conflict.contatos.length} contatos do CRM casam com o cliente ${conflict.client_name || conflict.client_code} (${conflict.client_code}). Nada foi vinculado.`,
          status_http: 0,
          revisado: false,
          payload_resumido: { etapa: 'vinculo_ambiguo', ...conflict },
        }));
        await svc.IntegracaoLog.bulkCreate(chunk);
        conflictsLogged += chunk.length;
      }
    } else {
      for (const conflict of conflicts.slice(0, 30)) {
        await logErro(
          `Vínculo ambíguo: ${conflict.contatos.length} contatos do CRM casam com o cliente ${conflict.client_name} (telefone/e-mail). Nada foi vinculado.`,
          0,
          { etapa: 'vinculo_ambiguo', ...conflict },
        );
      }
    }

    const summary = {
      contacts_fetched: ghlContacts.length,
      matched,
      updated,
      by_email: byEmailCount,
      by_phone: byPhoneCount,
      ambiguous,
      already_linked: alreadyLinked,
      email_only: emailOnly,
      shared_email: sharedEmail,
      contested: Math.round(contested),
    };
    if (cfg.id && !dryRun) {
      await svc.SystemSetting.update(cfg.id, {
        ghl_last_pull_date: now,
        ghl_last_pull_summary: summary,
      });
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      ...summary,
      conflict_types: conflictTypes,
      conflicts_logged: conflictsLogged,
      conflicts: summaryOnly ? [] : conflicts.slice(0, dryRun ? 300 : 50),
    });
  } catch (error) {
    if (!dryRun) {
      await base44.asServiceRole.entities.IntegracaoLog.create({
        origem: 'pull', mensagem: error.message, status_http: 500, payload_resumido: { etapa: 'execucao' },
      }).catch(() => {});
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
}