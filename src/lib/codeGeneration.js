import { base44 } from "@/api/base44Client";

/**
 * Configuração central das entidades com geração automática de código.
 * Para incluir um cadastro futuro com código automático, basta adicionar uma entrada aqui
 * (e usar createWithCode no formulário "novo"). O código é gerado no backend ao salvar,
 * garantindo unicidade mesmo com várias abas abertas simultaneamente.
 */
export const codeEntities = {
  client: { entity_name: "Client", prefix: "B", code_field: "new_code", pad_length: 6 },
  sale: { entity_name: "Sale", prefix: "P", code_field: "order_number", pad_length: 3 },
  equipment: { entity_name: "Equipment", prefix: "EQ", code_field: "code", pad_length: 6 },
  route: { entity_name: "TechnicianRoute", prefix: "R", code_field: "code", pad_length: 6 },
  purchase: { entity_name: "PurchaseOrder", prefix: "PC", code_field: "code", pad_length: 6 },
  technician_os: { entity_name: "TechnicianServiceOrder", prefix: "TOS", code_field: "code", pad_length: 6 },
};

/**
 * Cria um registro de uma entidade com código gerado no backend (atomicamente ao salvar).
 * @param {string} key  chave em codeEntities
 * @param {object} data dados do registro (sem o código)
 * @param {object} opts { filter } filtro opcional para a busca do código máximo
 * @returns {Promise<{ record, code }>}
 */
export async function createWithCode(key, data, opts = {}) {
  const cfg = codeEntities[key];
  if (!cfg) throw new Error(`Entidade de geração de código desconhecida: ${key}`);
  const res = await base44.functions.invoke("createWithCode", {
    ...cfg,
    data,
    filter: opts.filter || {},
  });
  return res.data; // { record, code }
}

/**
 * Produto tem prefixo dinâmico (definido pelo grupo), então é tratado à parte:
 * o prefixo e o filtro por grupo_id são passados explicitamente.
 */
export async function createProductWithCode(data, group) {
  if (!group || !group.prefix) throw new Error("Grupo do produto não definido para gerar o código.");
  const res = await base44.functions.invoke("createWithCode", {
    entity_name: "Product",
    prefix: group.prefix,
    code_field: "code",
    pad_length: 3,
    data,
    filter: { group_id: data.group_id },
  });
  return res.data; // { record, code }
}