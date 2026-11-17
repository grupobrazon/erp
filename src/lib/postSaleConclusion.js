/**
 * Lógica de conclusão pós-venda da OS do Técnico.
 * Decide o desfecho pós-atendimento do técnico:
 *
 * Cenário 1 — Pagamento na casa do cliente (90% das vendas de rota):
 *   O técnico recebeu dinheiro/vendeu in loco → precisa de APROVAÇÃO FINANCEIRA
 *   (lançar caixa, conferir comprovante) ANTES do faturamento.
 *   Fluxo: Pós-venda conclui → "OK - Aprov. Financeira"
 *         → Financeiro aprova → "Aguardando Faturamento Final"
 *         → NF-e/Nota Simples → "Concluída" (cascata conclui a venda)
 *
 * Cenário 2 — Pagamento 100% antecipado, OS mãe ainda não faturada:
 *   O pagamento foi verificado antes da ida do técnico, mas a OS não foi faturada.
 *   Pula aprovação financeira (pagamento já conferido) → vai direto para faturamento.
 *   Fluxo: Pós-venda conclui → "Aguardando Faturamento Final"
 *         → NF-e/Nota Simples → "Concluída"
 *
 * Cenário 3 — Pagamento 100% antecipado E OS mãe já faturada:
 *   Tudo já foi pago e faturado antes da ida do técnico → conclui imediatamente.
 *   Fluxo: Pós-venda conclui → OS e venda concluídas (sem etapa extra)
 *
 * Cenário 4 — Sem valor a receber e sem venda in loco (venda parcial não pré-paga):
 *   Não há o que faturar pós-rota → apenas conclui a OS do técnico.
 */

/**
 * Calcula o desfecho da revisão pós-venda.
 * @param {Object} tos - Registro da OS do Técnico
 * @param {Object|null} sale - Registro da venda vinculada (opcional)
 * @param {Object|null} parentOS - Registro da OS pai (opcional)
 * @returns {{ shouldSendToFaturamento: boolean, needsFinancialApproval: boolean, validationErrors: string[], buttonLabel: string, warningText: string }}
 */
export function evaluatePostSaleConclusion(tos, sale, parentOS) {
  // Valor pendente pode vir de 3 fontes: valor pré-carregado na OS do Técnico,
  // valor recebido registrado pelo técnico (sem forma/comprovante) ou
  // pagamento ainda "Pendente" na venda vinculada.
  const saleHasPendingPayment = (sale?.payments || []).some((p) => p.payment_status === "Pendente");
  const hasPendingPayment =
    Number(tos?.pending_payment_amount || 0) > 0 ||
    Number(tos?.received_amount || 0) > 0 ||
    saleHasPendingPayment;
  const hasTechnicianSale = Number(tos?.technician_sale_total || 0) > 0;
  const isPrePaid = sale?.confirmation_type === "Total";
  const parentInvoiced = parentOS?.invoiced === true;

  const validationErrors = [];

  if (hasPendingPayment) {
    if (!tos?.received_method) {
      validationErrors.push("Forma de recebimento (in loco) deve ser informada");
    }
    if (!tos?.payment_receipt_url) {
      validationErrors.push("Comprovante de pagamento deve ser anexado");
    }
  }

  // Precisa de aprovação financeira? Sim quando o técnico recebeu dinheiro na casa do cliente
  // ou lançou uma venda in loco — o financeiro precisa lançar o caixa e conferir o comprovante.
  const needsFinancialApproval = hasPendingPayment || hasTechnicianSale;

  // Precisa ir para faturamento? Sim quando há aprovação financeira pendente,
  // ou quando o pagamento foi antecipado mas a OS ainda não foi faturada.
  const shouldSendToFaturamento =
    needsFinancialApproval || (isPrePaid && !parentInvoiced);

  const buttonLabel = needsFinancialApproval
    ? "Concluir e enviar para Aprovação Financeira"
    : shouldSendToFaturamento
      ? "Concluir e enviar para Faturamento Final"
      : "Concluir OS";

  let warningText;
  if (hasPendingPayment) {
    warningText =
      "Há valor pendente a receber na visita. A OS só pode ser concluída com as informações financeiras preenchidas e o comprovante de pagamento anexado. Será enviada para APROVAÇÃO FINANCEIRA (lançar caixa e conferir comprovante). Após a aprovação, vai para faturamento final → NF-e → conclusão automática da OS e do pedido.";
  } else if (hasTechnicianSale) {
    warningText =
      "O técnico lançou uma venda in loco. A OS será enviada para APROVAÇÃO FINANCEIRA para conferir o recebimento da venda do técnico. Após a aprovação, vai para faturamento final → NF-e → conclusão automática.";
  } else if (isPrePaid && !parentInvoiced) {
    warningText =
      "O pagamento foi integralmente antecipado e a OS mãe ainda não foi faturada. A OS será enviada direto para o FATURAMENTO FINAL (sem aprovação financeira — pagamento já conferido).";
  } else if (isPrePaid && parentInvoiced) {
    warningText =
      "O pagamento foi integralmente antecipado e a OS mãe já foi faturada. A OS será concluída imediatamente — não há etapas pendentes.";
  } else {
    warningText =
      "Não há valores a receber na visita e o técnico não lançou venda in loco. A OS será apenas concluída.";
  }

  return { shouldSendToFaturamento, needsFinancialApproval, validationErrors, buttonLabel, warningText };
}

/**
 * Propaga o recebimento registrado pelo técnico (na OS do Técnico) para os pagamentos da venda.
 * Marca como "Realizada" os pagamentos pendentes de momento in loco (Na Entrega / Na Instalação),
 * refletindo a forma de recebimento, parcelas, condição de pagamento e comprovante anexados pelo técnico.
 * @param {Object} sale - Registro da venda
 * @param {Object} tos - Registro da OS do Técnico (com received_method, payment_receipt_url, ...)
 * @returns {Array} Lista de pagamentos atualizada
 */
export function buildSalePaymentsFromTechnician(sale, tos) {
  const payments = [...(sale?.payments || [])];
  if (!payments.length) return payments;

  // Alvo: pagamentos pendentes de momento in loco; sem nenhum, qualquer pendente
  let targets = payments
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.payment_status === "Pendente" && (p.payment_moment === "Na Entrega" || p.payment_moment === "Na Instalação"));
  if (!targets.length) {
    targets = payments.map((p, i) => ({ p, i })).filter(({ p }) => p.payment_status === "Pendente");
  }

  const receipt = tos?.payment_receipt_url || null;
  const method = tos?.received_method || null;
  const installments = tos?.received_installments ?? null;
  const condId = tos?.payment_condition_id || null;
  const condName = tos?.payment_condition_name || null;

  targets.forEach(({ i }) => {
    payments[i] = {
      ...payments[i],
      payment_status: "Realizada",
      receipt_url: payments[i].receipt_url || receipt,
      ...(method ? { received_method: method } : {}),
      ...(installments != null ? { received_installments: installments } : {}),
      ...(condId ? { condition_id: condId } : {}),
      ...(condName ? { condition_name: condName } : {}),
    };
  });
  return payments;
}