// Cópia de base44/shared/ghlContactMatch.ts gerada por tools/port_function.py.
// Contato do CRM (Atlas/GHL) correspondente a um cliente do ERP.
//
// Política (correção dos vínculos errados):
//  1. Vínculo já salvo só é usado depois de CONFIRMADO pelo telefone do cliente;
//     se não confirmar, é descartado e a busca recomeça do zero.
//  2. Telefone confirmado tem prioridade: só vincula quando UM único contato do
//     CRM tem aquele telefone (comparação por DDD + número, tolerando o nono dígito).
//  3. E-mail só decide quando é único e nenhum outro contato o compartilha.
//  4. Resultado truncado (a busca do CRM devolve no máximo 20) é tratado como
//     inconclusivo: nada é vinculado.
// Nunca devolve o "primeiro resultado" da busca.

import { fetchGhlContact, normalizeEmail, searchGhlContacts } from "./ghlClient.ts";
import { clientPhones, contactPhones, phoneE164, samePhone } from "./phoneMatch.ts";

const SEARCH_LIMIT = 20;

export function contactSummary(contact) {
  return {
    id: contact.id,
    name: contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(" "),
    email: contact.email || "",
    phones: contactPhones(contact),
  };
}

function phoneConfirmed(contact, client) {
  const own = clientPhones(client);
  return contactPhones(contact).some((stored) => own.some((phone) => samePhone(stored, phone)));
}

// Busca no CRM e confirma o critério em código. "inconclusive" quando a busca
// devolveu o limite de 20 resultados — pode haver mais candidatos fora da página.
async function searchAndConfirm({ locationId, term, secrets, phone, email }) {
  const found = await searchGhlContacts({ locationId, query: term, secrets }).catch(() => []);
  const list = (found || []).filter((contact) => {
    if (!contact || !contact.id) return false;
    if (phone) return contactPhones(contact).some((stored) => samePhone(stored, phone));
    return normalizeEmail(contact.email) === normalizeEmail(email);
  });
  return { list, inconclusive: (found || []).length >= SEARCH_LIMIT };
}

export async function findContactsByPhones({ locationId, phones, secrets }) {
  const byId = new Map();
  let inconclusive = false;
  for (const phone of phones || []) {
    const query = phoneE164(phone);
    if (!query) continue;
    const res = await searchAndConfirm({ locationId, term: query, secrets, phone });
    if (res.inconclusive) inconclusive = true;
    for (const contact of res.list) byId.set(contact.id, contact);
  }
  return { contacts: [...byId.values()], inconclusive };
}

export async function findContactsByEmail({ locationId, email, secrets }) {
  const term = String(email || "").trim();
  if (!term) return { contacts: [], inconclusive: false };
  const res = await searchAndConfirm({ locationId, term, secrets, email: term });
  return { contacts: res.list, inconclusive: res.inconclusive };
}

export async function resolveUniqueGhlContact({ locationId, client, secrets }) {
  const saved = (client && client.ghl_contact_id) || "";

  // 1) Vínculo salvo: revalidado pelo telefone antes de qualquer uso.
  if (saved) {
    const contact = await fetchGhlContact(saved, locationId, secrets).catch(() => null);
    if (contact && phoneConfirmed(contact, client)) {
      return { contactId: saved, match: "vínculo confirmado", candidates: [] };
    }
  }

  // 2) Telefone confirmado (prioridade): precisa identificar um único contato.
  const byPhone = await findContactsByPhones({ locationId, phones: clientPhones(client), secrets });
  if (byPhone.inconclusive) return { contactId: "", match: "ambíguo", candidates: [] };
  if (byPhone.contacts.length > 1) {
    return { contactId: "", match: "ambíguo", candidates: byPhone.contacts.map(contactSummary) };
  }
  if (byPhone.contacts.length === 1) {
    return { contactId: byPhone.contacts[0].id, match: "telefone", candidates: [] };
  }

  // 3) E-mail: só quando é único (e-mail compartilhado nunca decide sozinho).
  const byEmail = await findContactsByEmail({ locationId, email: client && client.email, secrets });
  if (byEmail.inconclusive) return { contactId: "", match: "ambíguo", candidates: [] };
  if (byEmail.contacts.length > 1) {
    return { contactId: "", match: "ambíguo", candidates: byEmail.contacts.map(contactSummary) };
  }
  if (byEmail.contacts.length === 1) {
    return { contactId: byEmail.contacts[0].id, match: "e-mail", candidates: [] };
  }

  return { contactId: "", match: "não encontrado", candidates: [] };
}