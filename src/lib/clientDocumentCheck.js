import { base44 } from "@/api/base44Client";

/**
 * Verifica se já existe um cliente cadastrado com o mesmo CPF/CNPJ (apenas dígitos).
 * @param {string} document - CPF ou CNPJ (com ou sem formatação)
 * @param {string|null} excludeId - ID do cliente atual (para ignorar ao editar)
 * @returns {Promise<{duplicate: boolean, client?: object}>}
 */
export async function checkDuplicateDocument(document, excludeId = null) {
  const doc = String(document || "").replace(/\D/g, "");
  if (!doc) return { duplicate: false };

  const results = await base44.entities.Client.filter({ document: doc }, "-created_date", 10);
  const match = results.find((c) => c.id !== excludeId);
  return { duplicate: !!match, client: match };
}