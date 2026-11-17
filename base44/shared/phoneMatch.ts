// Normalização e comparação de telefones — base única usada pela validação de
// cadastro e por todos os vínculos com o CRM (Atlas/GHL).
//
// O ERP grava o telefone com máscara e, em muitos cadastros antigos, o celular
// está sem o nono dígito. Por isso a comparação é sempre por DDD + número:
//  • primeiro compara os dígitos exatos (sem DDI e sem máscara);
//  • se não bater, compara DDD + últimos 8 dígitos (tolera o nono dígito).
// Nunca compare pedaços do número sem o DDD: isso juntava pessoas diferentes.

export const PHONE_FIELDS = [
  "phone1", "phone2", "phone3", "phone4", "phone5",
  "zoox_phone1", "zoox_phone2", "zoox_phone3", "zoox_phone4",
  "zoox_phone5", "zoox_phone6", "zoox_phone7",
];

export function onlyDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

// Dígitos sem máscara e sem o DDI do Brasil (55).
export function phoneDigits(value) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits.slice(2);
  return digits;
}

// Chave de comparação: DDD + últimos 8 dígitos (tolera o nono dígito do celular).
export function phoneKey(value) {
  const digits = phoneDigits(value);
  if (digits.length < 10) return digits;
  return `${digits.slice(0, 2)}${digits.slice(-8)}`;
}

export function samePhone(a, b) {
  const x = phoneDigits(a);
  const y = phoneDigits(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 10 && y.length >= 10) return phoneKey(x) === phoneKey(y);
  return false;
}

// Telefone no formato do CRM (com DDI 55).
export function phoneE164(value) {
  const digits = phoneDigits(value);
  return digits ? `+55${digits}` : "";
}

// Telefones preenchidos no cadastro do cliente.
export function clientPhones(client) {
  if (!client) return [];
  return PHONE_FIELDS.map((field) => client[field]).filter((value) => onlyDigits(value).length >= 8);
}

export function clientMatchesPhone(client, value) {
  return clientPhones(client).some((phone) => samePhone(phone, value));
}

// Telefones de um contato do CRM (principal + adicionais).
export function contactPhones(contact) {
  if (!contact) return [];
  const list = [contact.phone, contact.phoneNumber];
  for (const extra of contact.additionalPhones || []) {
    list.push(typeof extra === "string" ? extra : extra && extra.phone);
  }
  return list.filter((value) => onlyDigits(value).length >= 8);
}

// Padrão para consultar no banco (o ERP grava com máscara): os últimos 8 dígitos
// tolerando até dois caracteres entre eles. A confirmação é sempre feita depois
// em código com samePhone(), então a busca pode ser generosa sem vincular errado.
export function phonePattern(value) {
  const digits = phoneDigits(value);
  if (digits.length < 8) return "";
  return digits.slice(-8).split("").join(".{0,2}");
}

// Padrão de texto sem diferenciar maiúsculas de minúsculas (o banco compara
// exatamente como está gravado, então cada letra vira [aA]).
export function caseInsensitivePattern(value) {
  return String(value ?? "")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/[a-zA-Z]/g, (char) => `[${char.toLowerCase()}${char.toUpperCase()}]`);
}