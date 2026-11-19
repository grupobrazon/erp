// Cópia de base44/shared/clientDuplicates.ts gerada por tools/port_function.py.
// Validação de duplicidade no cadastro de clientes.
// Compara CPF/CNPJ, e-mail e todos os telefones contra os outros cadastros e
// devolve os candidatos. Não bloqueia nada: quem cadastra decide o que fazer.

import {
  PHONE_FIELDS,
  caseInsensitivePattern,
  clientMatchesPhone,
  onlyDigits,
  phoneKey,
  phonePattern,
} from "./phoneMatch.ts";

export function documentPattern(document) {
  const digits = onlyDigits(document);
  if (digits.length < 11) return "";
  return digits.split("").join(".{0,2}");
}

// Dados mínimos do candidato — nada além do necessário para reconhecer o cadastro.
function summarize(client) {
  return {
    id: client.id,
    name: client.name || "",
    new_code: client.new_code || "",
    old_code: client.old_code || "",
    city: client.city || "",
    state: client.state || "",
    is_active: client.is_active !== false,
  };
}

export async function findClientConflicts(svc, { clientId, document, email, phones }) {
  const exclude = clientId || null;
  const conflicts = [];

  const docDigits = onlyDigits(document);
  const docPattern = documentPattern(document);
  if (docPattern) {
    const found = await svc.Client.filter({ document: { $regex: docPattern } }).catch(() => []);
    const hits = (found || []).filter((c) => c.id !== exclude && onlyDigits(c.document) === docDigits);
    if (hits.length) {
      conflicts.push({ field: "document", label: "CPF/CNPJ", value: String(document), clients: hits.map(summarize) });
    }
  }

  const mail = String(email || "").trim();
  if (mail.includes("@")) {
    const found = await svc.Client.filter({ email: { $regex: caseInsensitivePattern(mail) } }).catch(() => []);
    const hits = (found || []).filter(
      (c) => c.id !== exclude && String(c.email || "").trim().toLowerCase() === mail.toLowerCase(),
    );
    if (hits.length) {
      conflicts.push({ field: "email", label: "E-mail", value: mail, clients: hits.map(summarize) });
    }
  }

  const vistos = new Set();
  for (const phone of phones || []) {
    const pattern = phonePattern(phone);
    const key = phoneKey(phone);
    if (!pattern || !key || vistos.has(key)) continue;
    vistos.add(key);

    const found = await svc.Client.filter({
      $or: PHONE_FIELDS.map((field) => ({ [field]: { $regex: pattern } })),
    }).catch(() => []);
    const hits = (found || []).filter((c) => c.id !== exclude && clientMatchesPhone(c, phone));
    if (hits.length) {
      conflicts.push({ field: "phone", label: "Telefone", value: String(phone), clients: hits.map(summarize) });
    }
  }

  return { conflicts };
}