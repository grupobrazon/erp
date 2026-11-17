// Parametrização contábil do Contas a Receber:
// Toda venda lançada é categorizada em 5103 (Receita de Produto Vendido).
// O frete cobrado do cliente é separado em 8102 (FRETE VENDAS).
// O lançamento é separado mesmo quando o pagamento é único (junto) — a divisão é proporcional ao frete/grand_total.

export const RECEITA_CODE = "5103";
export const FRETE_CODE = "8102";

export const ACCOUNT_LABELS = {
  "5103": "Receita de Produto Vendido",
  "8102": "FRETE VENDAS",
};

// Frete efetivamente cobrado do cliente (frete isentado não gera lançamento em 8102)
export function chargedFreight(sale) {
  if (!sale) return 0;
  if (sale.freight_exempt) return 0;
  return sale.freight || 0;
}

// Divide um pagamento em lançamentos contábeis (5103 receita + 8102 frete quando houver frete cobrado)
export function computeAccountingSplit(sale, payment) {
  const freight = chargedFreight(sale);
  const grand = sale?.grand_total || 0;
  const amt = payment?.amount || 0;

  if (freight > 0 && grand > 0) {
    const freightAmt = Math.round((amt * freight / grand) * 100) / 100;
    const receitaAmt = Math.round((amt - freightAmt) * 100) / 100;
    return [
      { code: RECEITA_CODE, amount: receitaAmt, kind: "receita" },
      { code: FRETE_CODE, amount: freightAmt, kind: "frete" },
    ];
  }
  return [{ code: RECEITA_CODE, amount: amt, kind: "receita" }];
}

export function accountName(code, chartAccounts = []) {
  return chartAccounts.find(a => a.code === code)?.name || ACCOUNT_LABELS[code] || code;
}