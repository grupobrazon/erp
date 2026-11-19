// Gerado de base44/functions/auditGhlLinks/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { secrets } from "../runtime.ts";
import { fetchGhlContactPage } from '../shared/ghlClient.ts';
import { buildClientIndex, classifyLink } from '../shared/ghlLinkAudit.ts';

// Auditoria (SOMENTE LEITURA) dos vínculos entre clientes do ERP e contatos do Atlas.
// Varre a lista de contatos do CRM por partes (cursor) e classifica cada vínculo
// salvo: confirmado pelo telefone ou suspeito (contato inexistente, telefone de
// outro cliente, telefone que não confere). Nada é gravado: nem clientes, nem CRM.
//
// Chamada em loop pela tela de Configurações até devolver done: true.

const PAGE = 100;
const MAX_SUSPECTS = 800;
const DEFAULT_BUDGET = 90000;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const locationId = secrets.get('ghl_location_id');
    if (!locationId) return Response.json({ error: 'ghl_location_id não configurado.' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const cursor = body && typeof body.cursor === 'object' && body.cursor ? body.cursor : null;
    const budget = Math.min(Math.max(Number(body.time_budget_ms) || DEFAULT_BUDGET, 20000), 200000);

    const svc = base44.asServiceRole.entities;
    const index = await buildClientIndex(svc);

    let startAfterId = cursor ? cursor.startAfterId : undefined;
    let startAfter = cursor ? cursor.startAfter : undefined;

    const counts = { confirmado: 0, sem_contato: 0, telefone_de_outro_cliente: 0, telefone_divergente: 0 };
    const suspects = [];
    const seen = new Set();
    let scanned = 0;
    let checked = 0;
    let totalContacts = 0;
    let done = false;
    const started = Date.now();

    while (true) {
      if (Date.now() - started > budget) break;
      const page = await fetchGhlContactPage(locationId, secrets, { limit: PAGE, startAfterId, startAfter });
      if (page.total) totalContacts = page.total;
      if (page.contacts.length === 0) { done = true; break; }

      scanned += page.contacts.length;
      for (const contact of page.contacts) {
        if (!contact || !contact.id) continue;
        seen.add(contact.id);
        const linked = index.byContact.get(contact.id);
        if (!linked || linked.length === 0) continue;
        for (const client of linked) {
          checked += 1;
          const result = classifyLink(client, contact, index);
          counts[result.reason] = (counts[result.reason] || 0) + 1;
          if (result.status === 'suspeito' && suspects.length < MAX_SUSPECTS) suspects.push(result);
        }
      }

      if (page.contacts.length < PAGE) { done = true; break; }
      const last = page.contacts[page.contacts.length - 1];
      if (!last || !last.id || last.id === startAfterId) { done = true; break; }
      startAfterId = last.id;
      startAfter = last.dateAdded ? new Date(last.dateAdded).getTime() : undefined;
    }

    // Vínculos apontando para contatos que não existem mais no Atlas: só dá para
    // afirmar isso depois de varrer a lista inteira.
    if (done) {
      for (const [contactId, clients] of index.byContact.entries()) {
        if (seen.has(contactId)) continue;
        for (const client of clients) {
          checked += 1;
          counts.sem_contato = (counts.sem_contato || 0) + 1;
          if (suspects.length < MAX_SUSPECTS) suspects.push(classifyLink(client, null, index));
        }
      }
    }

    let linkedClients = 0;
    for (const list of index.byContact.values()) linkedClients += list.length;
    const totalSuspects = checked - counts.confirmado;

    return Response.json({
      ok: true,
      done,
      cursor: done ? null : { startAfterId, startAfter },
      scanned,
      checked,
      total_contacts: totalContacts,
      linked_clients: linkedClients,
      counts,
      suspects,
      suspects_truncated: suspects.length < totalSuspects,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}