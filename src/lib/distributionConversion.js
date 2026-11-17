// Regras de conversão da distribuição de clientes.
// Só conta venda lançada para o cliente A PARTIR da data em que ele foi distribuído
// (data do lote de distribuição). Vendas canceladas são ignoradas.
export const STAGE_RANK = {
  "Orçamento": 0,
  "Confirmada": 1,
  "Pagamento Aprovado": 2,
  "Em OS": 3,
  "Faturada": 4,
  "Concluída": 5,
};

export const SALE_STATUS = {
  converted: "Em OS",
  quote: "Em Orçamento",
  none: "Sem Venda",
};

const dayOf = (value) => String(value || "").slice(0, 10);

// client_id -> { rank, stage, status, order_number, date } da melhor venda pós-distribuição.
// clients: clientes no escopo (usa distribution_batch_id) | batchMap: id do lote -> lote
export function buildConversionMap(clients, sales, batchMap) {
  const sinceByClient = new Map();
  for (const c of clients) {
    sinceByClient.set(c.id, dayOf(batchMap?.get(c.distribution_batch_id)?.date));
  }

  const best = new Map();
  for (const sale of sales) {
    if (!sale.client_id || sale.stage === "Cancelada") continue;
    const rank = STAGE_RANK[sale.stage];
    if (rank === undefined) continue;
    if (!sinceByClient.has(sale.client_id)) continue;
    const saleDay = dayOf(sale.date || sale.created_date);
    const since = sinceByClient.get(sale.client_id);
    if (since && saleDay && saleDay < since) continue;
    const current = best.get(sale.client_id);
    if (!current || rank > current.rank) {
      best.set(sale.client_id, {
        rank,
        stage: sale.stage,
        status: rank > 0 ? SALE_STATUS.converted : SALE_STATUS.quote,
        order_number: sale.order_number || "",
        date: saleDay,
      });
    }
  }
  return best;
}