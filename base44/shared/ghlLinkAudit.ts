// Auditoria dos vínculos entre clientes do ERP e contatos do Atlas (GoHighLevel).
//
// Regra de confirmação: um vínculo salvo (client.ghl_contact_id) só é considerado
// CONFIRMADO quando algum telefone do contato bate com algum telefone do cadastro
// do cliente (comparação normalizada por DDD + número, tolerando o nono dígito) e
// nenhum outro cliente do ERP também é dono daquele telefone.
//
// Tudo aqui é somente leitura: classifica e devolve a evidência. Quem desfaz o
// vínculo é a função fixGhlLinks, e apenas para os casos classificados como
// suspeitos — contatos e telefones no Atlas nunca são alterados.

import { normalizeEmail, normalizeName } from "./ghlClient.ts";
import { clientPhones, contactPhones, phoneKey, samePhone } from "./phoneMatch.ts";

const CLIENT_PAGE = 500;

export const LINK_REASONS = {
  confirmado: "Confirmado pelo telefone",
  sem_contato: "Contato não existe mais no Atlas",
  telefone_de_outro_cliente: "Telefone do contato pertence a outro cliente",
  telefone_divergente: "Nenhum telefone do contato confere com o cadastro",
};

function push(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

export function compactClient(client) {
  return {
    id: client.id,
    name: client.name || client.fantasy_name || "",
    code: client.new_code || client.old_code || "",
    phones: clientPhones(client),
    email: normalizeEmail(client.email),
    document: String(client.document || "").replace(/\D/g, ""),
    normname: normalizeName(client.name || client.fantasy_name || ""),
    contact_id: client.ghl_contact_id || "",
    deal_id: client.ghl_deal_id || "",
  };
}

// Mesma pessoa cadastrada duas vezes no ERP (mesmo CPF/CNPJ ou mesmo nome):
// compartilhar telefone com ela não é conflito.
function samePerson(a, b) {
  if (!a || !b) return false;
  if (a.document && b.document && a.document === b.document) return true;
  return Boolean(a.normname && b.normname && a.normname === b.normname);
}

// O nome do contato confirma de quem é o cadastro no Atlas quando contém o nome do cliente.
function nameMatches(client, contactName) {
  const nome = normalizeName(contactName);
  if (!nome || !client.normname) return false;
  return nome === client.normname || nome.includes(client.normname) || client.normname.includes(nome);
}

// Índices do ERP: por cliente, por contato vinculado, por telefone e por e-mail.
export async function buildClientIndex(svc) {
  const byId = new Map();
  const byContact = new Map();
  const byPhone = new Map();
  const byEmail = new Map();
  let skip = 0;
  while (true) {
    const page = await svc.Client.list("-created_date", CLIENT_PAGE, skip);
    if (!page || page.length === 0) break;
    for (const raw of page) {
      const client = compactClient(raw);
      if (byId.has(client.id)) continue;
      byId.set(client.id, client);
      push(byContact, client.contact_id, client);
      for (const phone of client.phones) push(byPhone, phoneKey(phone), client);
      push(byEmail, client.email, client);
    }
    skip += page.length;
    if (page.length < CLIENT_PAGE) break;
  }
  return { byId, byContact, byPhone, byEmail };
}

function otherClients(contact, client, index) {
  const outros = new Map();
  for (const phone of contactPhones(contact)) {
    for (const other of index.byPhone.get(phoneKey(phone)) || []) {
      if (other.id === client.id) continue;
      if (samePerson(other, client)) continue;
      outros.set(other.id, other);
    }
  }
  return [...outros.values()];
}

function resume(clients) {
  return clients.slice(0, 3).map((c) => ({ id: c.id, name: c.name, code: c.code }));
}

export function classifyLink(client, contact, index) {
  const contactName = contact
    ? contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(" ")
    : "";
  const base = {
    client_id: client.id,
    client_name: client.name,
    client_code: client.code,
    contact_id: client.contact_id || (contact ? contact.id : ""),
    contact_name: contactName,
    client_phones: client.phones.slice(0, 3),
    contact_phones: contact ? contactPhones(contact).slice(0, 4) : [],
  };

  if (!contact) {
    return { ...base, status: "suspeito", reason: "sem_contato", outros: [] };
  }

  const phones = contactPhones(contact);
  const outros = otherClients(contact, client, index);
  const nomeBate = nameMatches(client, contactName);

  // Telefone que pertence a outro cliente do ERP: só fica confirmado quando o nome
  // do contato é o deste cliente (o vínculo errado está do outro lado).
  if (outros.length > 0 && !nomeBate) {
    return { ...base, status: "suspeito", reason: "telefone_de_outro_cliente", outros: resume(outros) };
  }

  const confirmados = phones.filter((phone) => client.phones.some((own) => samePhone(own, phone)));
  if (confirmados.length === 0) {
    return { ...base, status: "suspeito", reason: "telefone_divergente", outros: [] };
  }

  const compartilhado = (index.byContact.get(client.contact_id) || []).filter((c) => c.id !== client.id);
  return { ...base, status: "confirmado", reason: "confirmado", outros: resume(compartilhado) };
}