import React from "react";

const STEPS = [
  { label: "Pedido", sub: "Venda" },
  { label: "Análise Financeira", sub: "Validação" },
  { label: "Liberação", sub: "Produção" },
  { label: "Produção", sub: "Fábrica" },
  { label: "Faturamento", sub: "Nota Fiscal" },
  { label: "Contas a Receber", sub: "Geração" },
  { label: "Cobrança", sub: "Cobrança" },
  { label: "Recebimento", sub: "Recebimento" },
  { label: "Conciliação", sub: "Financeira" },
];

export function computeFlowStep(sale, osList = []) {
  if (!sale) return 0;
  const payments = sale.payments || [];
  const hasPending = payments.some(p => p.payment_status === "Pendente");
  const allReceived = payments.length > 0 && payments.every(p => p.payment_status === "Realizada");

  if (allReceived) return 8; // Conciliação
  if (payments.some(p => p.payment_status === "Realizada")) return 7; // Recebimento (partial)

  const hasDelivered = osList.some(os => os.status === "Entregue" || os.status === "Concluída");
  if (hasPending && hasDelivered) return 6; // Cobrança

  const hasInvoiced = osList.some(os => os.invoiced);
  if (hasInvoiced) return 5; // Contas a Receber

  const hasProduction = osList.some(os => os.status === "Em Produção" || os.status === "Produção Liberada");
  if (hasProduction) return 4; // Produção

  const hasExpedition = osList.some(os =>
    os.status === "Produção/Expedição" || os.status === "Etiqueta Gerada" ||
    os.status === "Separação" || os.status === "Saída do Estoque" || os.status === "Em Transporte"
  );
  if (hasExpedition) return 3; // Liberação

  if (sale.stage === "Pagamento Aprovado") return 2; // Liberação
  if (sale.stage === "Em OS") return 2;

  const hasFinancePending = osList.some(os => os.status === "Aprovação Comercial" || os.status === "Aprovação Financeira");
  if (hasFinancePending || sale.stage === "Confirmada") return 1; // Análise Financeira

  return 0; // Pedido
}

export default function IntegratedFlowStepper({ sale, osList = [], reprovado }) {
  const currentStep = reprovado ? 1 : computeFlowStep(sale, osList);

  return (
    <div className="w-full">
      <div className="flex items-center gap-0.5 overflow-x-auto pb-1">
        {STEPS.map((step, i) => {
          const isReprovado = reprovado && i === 1;
          const isDone = !isReprovado && i < currentStep;
          const isCurrent = !isReprovado && i === currentStep;
          return (
            <React.Fragment key={i}>
              <div className={`flex flex-col items-center px-2.5 py-1.5 rounded-lg border min-w-[88px] text-center transition-colors ${
                isReprovado ? "bg-red-50 border-red-400 text-red-700" :
                isDone ? "bg-emerald-50 border-emerald-300 text-emerald-700" :
                isCurrent ? "bg-primary/10 border-primary text-primary font-semibold" :
                "bg-muted/30 border-border text-muted-foreground"
              }`}>
                <span className="text-[11px] leading-tight">{step.label}</span>
                <span className="text-[9px] opacity-60 leading-tight">{step.sub}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 w-3 flex-shrink-0 ${isDone ? "bg-emerald-400" : "bg-border"}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      {reprovado && (
        <div className="mt-1.5 text-[11px] text-red-600 font-medium">↳ Reprovado — retornado para o comercial para revisão</div>
      )}
    </div>
  );
}