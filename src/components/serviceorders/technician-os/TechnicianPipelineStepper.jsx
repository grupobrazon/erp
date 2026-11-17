import React from "react";
import { Check } from "lucide-react";

// Pipeline do ponto de vista do técnico — acompanha o status da OS mãe.
// Mostra o progresso: OS Gerada → Enviada p/ Ordem → Em Execução → Concluída →
// Finalizada → Aprov. Fin. → Faturamento → Faturada → Concluída
const pipelineSteps = [
  { short: "OS Gerada", statuses: ["Aprovação Comercial", "Aprovação Financeira", "Produção/Expedição", "Aguardando Produção", "Produção Iniciada", "Produção Liberada"] },
  { short: "Enviada p/ Ordem", statuses: ["Agendamento/Rota", "Rota Enviada", "Em Rota", "Liberado para Técnico", "OS Técnico"] },
  { short: "Em Execução", statuses: ["Em Execução"] },
  { short: "Concluída", statuses: ["Concluída pelo Técnico"] },
  { short: "Aguard. Fat.", statuses: ["Aguardando Faturamento - Pós"] },
  { short: "Aprov. Fin.", statuses: ["OK - Aprov. Financeira"] },
  { short: "Faturamento", statuses: ["Faturamento"] },
  { short: "Faturada", statuses: ["Faturada"] },
  { short: "Concluída", statuses: ["Concluída"] },
];

export default function TechnicianPipelineStepper({ parentStatus }) {
  const currentIndex = pipelineSteps.findIndex(step =>
    step.statuses.includes(parentStatus)
  );

  if (currentIndex < 0) return null;

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {pipelineSteps.map((step, i) => {
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center gap-1 min-w-[56px]">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                  isDone ? "bg-emerald-500 text-white" :
                  isCurrent ? "bg-primary text-primary-foreground ring-2 ring-primary/30" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {isDone ? <Check className="h-3 w-3" /> : i + 1}
                </div>
                <span className={`text-[9px] text-center leading-tight whitespace-nowrap ${
                  isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}>{step.short}</span>
              </div>
              {i < pipelineSteps.length - 1 && (
                <div className={`h-0.5 flex-1 min-w-[8px] ${i < currentIndex ? "bg-emerald-500" : "bg-muted"}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}