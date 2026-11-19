// Cópia de base44/shared/clientMatch.ts gerada por tools/port_function.py.
// Cliente do ERP correspondente a um contato do CRM (Atlas/GHL).
// Regra única para webhook, sincronização e respostas automáticas:
// vínculo salvo → e-mail único → telefone único. Se dois cadastros casarem,
// nada é vinculado (o caso fica registrado na auditoria da integração).

import { normalizeEmail } from "./ghlClient.ts";
import {
  PHONE_FIELDS,
  caseInsensitivePattern,
  clientPhones,
  contactPhones,
  phonePattern,
  samePhone,
} from "./phoneMatch.ts";

function summarize(client) {
  return {
    id: client.id,
    name: client.name || "",
    new_code: client.new_code || "",
    old_code: client.old_code || "",
    city: client.city || "",
    state: client.state || "",
  };
}

export async function resolveClientByContact(svc, contact) {
  if (!contact) return { client: null, match: "sem contato", candidates: [] };

  // 1. Vínculo já salvo no cadastro
  if (contact.id) {
    const byLink = await svc.Client.filter({ ghl_contact_id: contact.id }).catch(() => []);
    const links = byLink || [];
    if (links.length === 1) return { client: links[0], match: "vínculo do ERP", candidates: [] };
    if (links.length > 1) return { client: null, match: "ambíguo", candidates: links.map(summarize) };
  }

  const hits = new Map();
  let byPhone = false;

  // 2. E-mail do contato
  const email = String(contact.email || "").trim();
  if (email.includes("@")) {
    const found = await svc.Client.filter({ email: { $regex: caseInsensitivePattern(email) } }).catch(() => []);
    for (const client of found || []) {
      if (normalizeEmail(client.email) === normalizeEmail(email)) hits.set(client.id, client);
    }
  }

  // 3. Telefones do contato (principal + adicionais)
  for (const phone of contactPhones(contact)) {
    const pattern = phonePattern(phone);
    if (!pattern) continue;
    const found = await svc.Client.filter({
      $or: PHONE_FIELDS.map((field) => ({ [field]: { $regex: pattern } })),
    }).catch(() => []);
    for (const client of found || []) {
      if (clientPhones(client).some((stored) => samePhone(stored, phone))) {
        hits.set(client.id, client);
        byPhone = true;
      }
    }
  }

  const list = [...hits.values()];
  if (list.length === 0) return { client: null, match: "não encontrado", candidates: [] };
  if (list.length > 1) return { client: null, match: "ambíguo", candidates: list.map(summarize) };
  return { client: list[0], match: byPhone ? "telefone" : "e-mail", candidates: [] };
}