import { base44 } from "@/api/base44Client";

/**
 * Telefones preenchidos no formulário do cliente (phone1-5 + zoox_phone1-7).
 */
export function formPhones(form) {
  const phones = [];
  for (let i = 1; i <= 5; i++) phones.push(form?.[`phone${i}`]);
  for (let i = 1; i <= 7; i++) phones.push(form?.[`zoox_phone${i}`]);
  return phones.map((p) => String(p || "").trim()).filter(Boolean);
}

/**
 * Procura outros cadastros com o mesmo CPF/CNPJ, e-mail ou telefone.
 * Devolve a lista de conflitos (vazia quando não há nada parecido).
 * @param {object} form - formulário do cliente
 * @param {string|null} clientId - ID do cliente em edição (ignorado na comparação)
 */
export async function checkClientDuplicates(form, clientId = null) {
  const res = await base44.functions.invoke("checkClientDuplicates", {
    client_id: clientId || null,
    document: form?.document || "",
    email: form?.email || "",
    phones: formPhones(form),
  });
  const data = res?.data || res;
  return data?.conflicts || [];
}