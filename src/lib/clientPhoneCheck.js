/**
 * Validação de telefone obrigatório para cadastro de cliente e criação de pedido.
 * Regra: nenhum cliente pode ser cadastrado/prosseguir sem pelo menos 1 telefone válido.
 */

const PHONE_FIELDS = [
  "phone1", "phone2", "phone3", "phone4", "phone5",
  "zoox_phone1", "zoox_phone2", "zoox_phone3", "zoox_phone4",
  "zoox_phone5", "zoox_phone6", "zoox_phone7",
];

export const PHONE_REQUIRED_MESSAGE =
  "É obrigatório informar pelo menos um número de telefone para cadastrar o cliente e prosseguir com o pedido.";

/**
 * Retorna true se o telefone for válido (10 ou 11 dígitos numéricos — fixo/ móvel BR com DDD).
 */
export function isValidPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
}

/**
 * Verifica se o objeto (form de cadastro ou cliente salvo) possui ao menos 1 telefone válido.
 */
export function hasValidPhone(record) {
  if (!record) return false;
  return PHONE_FIELDS.some((f) => isValidPhone(record[f]));
}