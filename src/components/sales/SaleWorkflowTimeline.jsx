import React from "react";
import { Check, X } from "lucide-react";

const TOTAL_MILESTONES = [
  "Orçamento",
  "Confirmada",
  "Pagamento Aprovado",
  "Em OS",
  "Agendamento/Rota",
  "Faturamento",
  "Liberado p/ Técnico",
  "Concluída pelo Técnico",
  "Concluída",
];

const PARCIAL_MILESTONES = [
  "Orçamento",
  "Confirmada Parcial",
  "Em OS",
  "Agendamento/Rota",
  "Liberado p/ Técnico",
  "Concluída pelo Técnico",
  "Pagamento Aprovado",
  "Faturada",
  "Concluída",
];

export function getCurrentMilestone(sale, os) {
  if (!sale) return 0;
  const isParcial = sale.confirmation_type === "Parcial";
  const milestones = isParcial ? PARCIAL_MILESTONES : TOTAL_MILESTONES;

  if (sale.stage === "Cancelada") return -1;
  if (sale.stage === "Concluída") return milestones.length - 1;
  if (sale.stage === "Faturada") return isParcial ? 7 : milestones.length - 1;
  if (sale.stage === "Orçamento") return 0;

  if (isParcial) {
    // Parcial: Orçamento → Confirmada → Em OS → ... → Pagamento Aprovado → Faturada → Concluída
    if (sale.stage === "Confirmada") return 1;
    if (sale.stage === "Pagamento Aprovado") return 6;
    if (sale.stage === "Em OS") {
      if (!os) return 2;
      if (os.status === "Concluída") return 8;
      if (os.status === "Faturada") return 7;
      if (os.status === "OK - Aprov. Financeira") return 6;
      if (os.status === "Concluída pelo Técnico") return 5;
      if (os.status === "Em Execução") return 5;
      if (os.status === "Liberado para Técnico") return 4;
      if (os.status === "Faturamento") return 3;
      if (os.status === "Agendamento/Rota") return 3;
      if (["Aguardando Rota", "Produção/Expedição", "Aprovação Comercial", "Aprovação Financeira",
           "Aguardando Produção", "Produção Iniciada", "Produção Liberada"].includes(os.status)) return 2;
      return 2;
    }
  } else {
    // Total: Orçamento → Confirmada → Pagamento Aprovado → Em OS → ... → Concluída
    if (sale.stage === "Confirmada") return 1;
    if (sale.stage === "Pagamento Aprovado") return 2;
    if (sale.stage === "Em OS") {
      if (!os) return 3;
      if (os.status === "Concluída") return 8;
      if (os.status === "Concluída pelo Técnico") return 7;
      if (os.status === "Em Execução") return 7;
      if (os.status === "Liberado para Técnico") return 6;
      if (os.status === "Faturamento") return 5;
      if (os.invoiced || os.invoice_number) return 5;
      if (os.status === "Agendamento/Rota") return 4;
      if (["Aguardando Rota", "Produção/Expedição", "Aprovação Financeira",
           "Aguardando Produção", "Produção Iniciada", "Produção Liberada"].includes(os.status)) return 3;
      return 3;
    }
  }
  return 0;
}

export default function SaleWorkflowTimeline({ sale, serviceOrder }) {
  const isParcial = sale?.confirmation_type === "Parcial";
  const milestones = isParcial ? PARCIAL_MILESTONES : TOTAL_MILESTONES;
  const current = getCurrentMilestone(sale, serviceOrder);
  const isCancelled = sale?.stage === "Cancelada";

  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="flex items-start min-w-[820px] px-1">
        {milestones.map((label, idx) => {
          const isDone = !isCancelled && idx < current;
          const isCurrent = !isCancelled && idx === current;
          const isFuture = !isCancelled && idx > current;
          return (
            <React.Fragment key={idx}>
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0 w-20">
                <div
                  className={[
                    "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                    isDone ? "bg-emerald-500 border-emerald-500 text-white" : "",
                    isCurrent ? "bg-primary border-primary text-primary-foreground ring-4 ring-primary/20" : "",
                    isFuture ? "bg-muted border-border text-muted-foreground" : "",
                    isCancelled ? "bg-destructive/10 border-destructive/30 text-destructive" : "",
                  ].join(" ")}
                >
                  {isDone ? <Check className="h-4 w-4" /> : isCancelled ? <X className="h-3 w-3" /> : idx + 1}
                </div>
                <span
                  className={[
                    "text-[10px] font-medium text-center leading-tight",
                    isCurrent ? "text-primary" : isDone ? "text-emerald-600" : "text-muted-foreground",
                  ].join(" ")}
                >
                  {label}
                </span>
              </div>
              {idx < milestones.length - 1 && (
                <div
                  className={[
                    "h-0.5 flex-1 mx-0.5 mt-4 transition-colors",
                    idx < current ? "bg-emerald-500" : "bg-border",
                  ].join(" ")}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${isParcial ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
          {isParcial ? "FLUXO PARCIAL — Pagamento na Entrega" : "FLUXO TOTAL — Pagamento Antecipado"}
        </span>
        {isCancelled && (
          <span className="text-xs text-destructive font-medium flex items-center gap-1">
            <X className="h-3 w-3" /> Venda Cancelada
          </span>
        )}
      </div>
    </div>
  );
}