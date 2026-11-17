// Cálculo de precificação — margem e custos de venda incidem sobre o preço final.
// Fórmula: preço = custo / (1 - (soma_dos_percentuais + margem) / 100)
// Se o produto tem sale_price (preço direto), usa esse valor como base e acrescenta apenas a taxa financeira por parcela.
// Os impostos variam por cenário: "mg" (Dentro de MG) ou "fora_mg" (Fora de MG / TTS).

export const SCENARIOS = [
  { key: "mg", label: "Dentro de MG" },
  { key: "fora_mg", label: "Fora de MG (TTS)" },
];

// Retorna a taxa financeira (%) para um número de parcelas a partir da tabela.
export function getFinancialFee(feeTable = [], installments = 1) {
  if (!Array.isArray(feeTable) || feeTable.length === 0) return 0;
  const exact = feeTable.find(f => Number(f.installments) === Number(installments));
  if (exact) return Number(exact.fee_percent) || 0;
  // Se não houver entrada exata, usa a maior parcela <= installments
  const lower = feeTable
    .filter(f => Number(f.installments) <= Number(installments))
    .sort((a, b) => Number(b.installments) - Number(a.installments))[0];
  return lower ? (Number(lower.fee_percent) || 0) : 0;
}

// Soma dos impostos (%) para um cenário (mg ou fora_mg).
export function salesTaxForScenario(config, scenario = "mg") {
  const icms = scenario === "fora_mg"
    ? Number(config?.icms_fora_mg_percent) || 0
    : Number(config?.icms_mg_percent) || 0;
  const pis = Number(config?.pis_percent) || 0;
  const cofins = Number(config?.cofins_percent) || 0;
  const irpj = Number(config?.irpj_percent) || 0;
  const csll = Number(config?.csll_percent) || 0;
  return icms + pis + cofins + irpj + csll;
}

// Soma dos percentuais de custo de venda (sem margem) para uma parcela e cenário.
export function sumSellingCosts(config, installments = 1, scenario = "mg") {
  const salesTax = salesTaxForScenario(config, scenario);
  const commission = Number(config?.commission_percent) || 0;
  const marketing = Number(config?.marketing_percent) || 0;
  const adminFee = Number(config?.admin_fee_percent) || 0;
  const finFee = getFinancialFee(config?.financial_fee_table, installments);
  return salesTax + commission + marketing + adminFee + finFee;
}

// Margem efetiva do produto: produto > subgrupo > grupo > config global
export function getEffectiveMargin(product, subgroups = [], groups = [], config = {}) {
  if (Number(product?.target_margin_percent) > 0) return Number(product.target_margin_percent);
  if (product?.subgroup_id) {
    const sg = subgroups.find(s => s.id === product.subgroup_id);
    if (sg && Number(sg.target_margin_percent) > 0) return Number(sg.target_margin_percent);
  }
  if (product?.group_id) {
    const g = groups.find(gg => gg.id === product.group_id);
    if (g && Number(g.target_margin_percent) > 0) return Number(g.target_margin_percent);
  }
  return Number(config?.target_margin_percent) || 0;
}

// Calcula o preço de venda dado o custo, a config, o número de parcelas e o cenário.
// salePrice (opcional): se > 0, usa o preço direto cadastrado no produto como base (apenas taxa financeira por parcela).
// marginOverride (opcional) sobrescreve a margem da config (usar getEffectiveMargin para herança por grupo).
export function computePrice(cost, config, installments = 1, scenario = "mg", marginOverride = null, salePrice = null) {
  // Preço direto: produto com sale_price cadastrado — usa esse valor e acrescenta apenas a taxa financeira
  if (Number(salePrice) > 0) {
    const finFee = getFinancialFee(config?.financial_fee_table, installments);
    if (finFee >= 100) return 0;
    return Number(salePrice) / (1 - finFee / 100);
  }
  // Margem sobre preço: preço = custo / (1 - (custos de venda + margem) / 100)
  const c = Number(cost) || 0;
  const margin = marginOverride !== null && marginOverride !== undefined
    ? (Number(marginOverride) || 0)
    : (Number(config?.target_margin_percent) || 0);
  const sumPct = sumSellingCosts(config, installments, scenario) + margin;
  if (sumPct >= 100) return 0; // inválido — percentuais somam 100% ou mais
  return c / (1 - sumPct / 100);
}

// Custo efetivo do produto: produto > subgrupo > grupo > 0
export function getEffectiveCost(product, subgroups = [], groups = []) {
  if (Number(product?.cost) > 0) return Number(product.cost);
  if (product?.subgroup_id) {
    const sg = subgroups.find(s => s.id === product.subgroup_id);
    if (sg && Number(sg.cost) > 0) return Number(sg.cost);
  }
  if (product?.group_id) {
    const g = groups.find(gg => gg.id === product.group_id);
    if (g && Number(g.cost) > 0) return Number(g.cost);
  }
  return 0;
}

export const fmtBRL = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtPct = (v) =>
  `${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;