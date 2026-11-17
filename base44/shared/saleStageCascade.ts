// Cascata de etapa da venda baseada no status da OS.
// Quando a OS é entregue/concluída, a venda vinculada também avança (sem regredir).

const SALE_STAGE_RANK: Record<string, number> = {
  'Orçamento': 1,
  'Confirmada': 2,
  'Pagamento Aprovado': 3,
  'Em OS': 4,
  'Faturada': 5,
  'Concluída': 6,
  'Cancelada': 0,
};

/**
 * Avança a etapa da venda vinculada à OS conforme o status operacional:
 * - OS "Entregue" + venda já "Faturada" → venda "Concluída" (entregue + faturado = processo completo)
 * - OS "Entregue" + venda ainda não faturada → venda "Faturada" (entrega confirmada, pronto para faturar)
 * - OS "Concluída" → venda "Concluída"
 * Nunca regred a etapa da venda. Usa asServiceRole para funcionar de qualquer contexto.
 */
export async function cascadeSaleStageFromOs(base44, os) {
  if (!os?.sale_id) return;
  if (os.status !== 'Entregue' && os.status !== 'Concluída') return;

  let sale = null;
  try {
    sale = await base44.asServiceRole.entities.Sale.get(os.sale_id);
  } catch {
    return;
  }
  if (!sale) return;

  const currentRank = SALE_STAGE_RANK[sale.stage] || 0;
  let targetStage: string | null = null;

  if (os.status === 'Concluída') {
    targetStage = 'Concluída';
  } else if (os.status === 'Entregue') {
    // Se já foi faturada (venda em Faturada OU OS com nota emitida), a entrega conclui o processo;
    // senão avança para Faturada (entrega confirmada, pronto para faturar)
    const alreadyInvoiced = sale.stage === 'Faturada' || os.invoiced === true ||
      Boolean(os.invoice_number) || Boolean(os.nota_simples_number);
    targetStage = alreadyInvoiced ? 'Concluída' : 'Faturada';
  }

  if (!targetStage) return;

  const targetRank = SALE_STAGE_RANK[targetStage] || 0;
  if (targetRank > currentRank) {
    await base44.asServiceRole.entities.Sale.update(os.sale_id, {
      stage: targetStage,
      status: 'Confirmada',
    });
  }
}