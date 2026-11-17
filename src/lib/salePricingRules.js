// Regras de parcelamento, desconto e isenção de frete para vendas.
// Baseado no valor total da venda e na modalidade de entrega.

import { getFinancialFee, computePrice, getEffectiveCost, getEffectiveMargin } from "./pricingCalc";

// Faixas de parcelamento por valor total da venda
// - Abaixo de R$ 300: máx 4x, desconto limite = tabela 6x
// - R$ 300–500: máx 6x, desconto limite = tabela 6x
// - R$ 501–999: máx 8x, desconto limite = tabela 12x
// - Acima de R$ 1.000: máx 12x, desconto limite = tabela 12x
export function getInstallmentBracket(total) {
  const t = Number(total) || 0;
  if (t < 300) return { maxInstallments: 4, floorTable: "6x", label: "Até 4x (tabela 6x)" };
  if (t <= 500) return { maxInstallments: 6, floorTable: "6x", label: "Até 6x (tabela 6x)" };
  if (t <= 999) return { maxInstallments: 8, floorTable: "12x", label: "Até 8x (tabela 12x)" };
  return { maxInstallments: 12, floorTable: "12x", label: "Até 12x (tabela 12x)" };
}

// Verifica se uma condição de pagamento é permitida pelo valor total da venda
export function isPaymentConditionAllowed(condition, total) {
  if (!condition) return true;
  if (condition.payment_type !== "Parcelado") return true;
  const bracket = getInstallmentBracket(total);
  return (condition.installments || 1) <= bracket.maxInstallments;
}

// Determina se a taxa de deslocamento deve ser cobrada
// Vendas abaixo de R$ 150,00 nas modalidades Entrega Própria ou Entrega + Instalação
export function shouldChargeDisplacementFee(total, deliveryModality) {
  const t = Number(total) || 0;
  if (t >= 150) return false;
  if (deliveryModality === "Envio") return false;
  return true; // Entrega Própria ou Entrega + Instalação
}

// Calcula a margem financeira disponível para absorver o frete.
// Para cada item, compara a taxa financeira da tabela cobrada (6x ou 12x) com a taxa
// da condição de pagamento escolhida pelo cliente. A diferença é a margem disponível.
export function computeFreightMargin({ items, products, productGroups, productSubgroups, config, paymentInstallments }) {
  if (!items || items.length === 0) return 0;
  const customerFee = getFinancialFee(config?.financial_fee_table, Number(paymentInstallments) || 1);
  let margin = 0;
  for (const item of items) {
    const product = (products || []).find(p => p.id === item.product_id);
    if (!product) continue;
    const cost = getEffectiveCost(product, productSubgroups || [], productGroups || []);
    const effMargin = getEffectiveMargin(product, productSubgroups || [], productGroups || [], config);
    const priceVista = computePrice(cost, config, 1, "mg", effMargin, product.sale_price);
    // Tabela cobrada: 12x para produtos > 500, 6x caso contrário
    const chargedInstallments = priceVista > 500 ? 12 : 6;
    const chargedFee = getFinancialFee(config?.financial_fee_table, chargedInstallments);
    const feeDiff = chargedFee - customerFee;
    if (feeDiff > 0) {
      margin += (item.unit_price || 0) * feeDiff / 100 * (item.quantity || 1);
    }
  }
  return Math.max(0, margin);
}

// Verifica se o frete pode ser isentado dado o contexto da venda
export function canExemptFreight({ total, deliveryModality, freight, items, products, productGroups, productSubgroups, config, paymentInstallments }) {
  const t = Number(total) || 0;
  const f = Number(freight) || 0;

  // Vendas abaixo de R$ 150,00: deve-se cobrar taxa de deslocamento — não isentar
  if (t < 150) {
    return { allowed: false, reason: "Vendas abaixo de R$ 150,00 devem cobrar taxa de deslocamento — frete não pode ser isentado." };
  }

  // Calcula a margem financeira disponível
  const margin = computeFreightMargin({ items, products, productGroups, productSubgroups, config, paymentInstallments });

  if (f > margin) {
    return {
      allowed: false,
      reason: `Frete (R$ ${f.toFixed(2)}) excede a margem financeira disponível (R$ ${margin.toFixed(2)}).`,
      margin,
    };
  }

  // Modalidade Envio com pagamento à vista (menor valor cobrado): não permitir isentar o frete
  if (deliveryModality === "Envio" && (!paymentInstallments || paymentInstallments === 1)) {
    return { allowed: false, reason: "Modalidade Envio com pagamento à vista (menor valor) — não é possível isentar o frete.", margin };
  }

  return { allowed: true, margin };
}

// Verifica se o desconto à vista pode ser aplicado
// Para vendas abaixo de R$ 300,00 nas modalidades Entrega ou Entrega + Instalação,
// não permitir desconto à vista (deve-se trabalhar com a tabela de 6x)
export function canApplyCashDiscount(total, deliveryModality) {
  const t = Number(total) || 0;
  if (t < 300 && deliveryModality !== "Envio") {
    return { allowed: false, reason: "Vendas abaixo de R$ 300,00 nas modalidades Entrega/Entrega+Instalação devem usar a tabela de 6x — desconto à vista não permitido." };
  }
  return { allowed: true };
}

// Calcula o desconto máximo permitido com base na condição de pagamento selecionada.
// O desconto não pode fazer o preço cair abaixo do preço da condição de pagamento escolhida
// (à vista = preço 1x, 6x = preço 6x, 12x = preço 12x). Sem pagamento selecionado, usa 12x (conservador).
// Elemento filtrante (refil/cápsula) — item alvo do benefício Cliente VIP Brazon
export function isFilterElementItem(item, products, productGroups) {
  const product = (products || []).find(p => p.id === item.product_id);
  if (!product) return false;
  const norm = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const groupName = norm(product.group_name || (productGroups || []).find(g => g.id === product.group_id)?.name);
  if (groupName.includes("capsula")) return true;
  return /(refil|elemento filtrante)/.test(norm(product.name));
}

export function getMaxDiscount({ items, products, productGroups, productSubgroups, config, floorInstallments, vipDiscountPercent = 0 }) {
  if (!items || items.length === 0) return 0;
  const floor = Number(floorInstallments) || 12;
  let maxDiscount = 0;
  for (const item of items) {
    const product = (products || []).find(p => p.id === item.product_id);
    if (!product) continue;
    const cost = getEffectiveCost(product, productSubgroups || [], productGroups || []);
    const effMargin = getEffectiveMargin(product, productSubgroups || [], productGroups || [], config);
    const floorPrice = computePrice(cost, config, floor, "mg", effMargin, product.sale_price);
    const currentTotal = (item.unit_price || 0) * (item.quantity || 1);
    const floorTotal = floorPrice * (item.quantity || 1);
    let room = Math.max(0, currentTotal - floorTotal);
    // Cliente VIP Brazon: o elemento filtrante pode chegar ao preço com o desconto do programa
    if (vipDiscountPercent > 0 && isFilterElementItem(item, products, productGroups)) {
      const vipFloor = currentTotal * (1 - vipDiscountPercent / 100);
      room = Math.max(0, currentTotal - Math.min(floorTotal, vipFloor));
    }
    maxDiscount += room;
  }
  return Math.max(0, maxDiscount);
}