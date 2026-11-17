import React from "react";
import { Check } from "lucide-react";

const expeditionSteps = [
  { key: "Produção/Expedição", short: "Produção" },
  { key: "Aguardando Produção", short: "Aguardando" },
  { key: "Produção Iniciada", short: "Iniciada" },
  { key: "Produção Liberada", short: "Liberação" },
  { key: "Etiqueta Gerada", short: "Etiqueta" },
  { key: "Separação", short: "Separação" },
  { key: "Saída do Estoque", short: "Saída" },
  { key: "Em Transporte", short: "Transporte" },
  { key: "Entregue", short: "Entregue" },
];

const deliverySteps = [
  { key: "Produção/Expedição", short: "Estoque" },
  { key: "Aguardando Produção", short: "Aguardando" },
  { key: "Produção Iniciada", short: "Iniciada" },
  { key: "Produção Liberada", short: "OS Liberada" },
  { key: "Agendamento/Rota", short: "Agend. Prévio" },
  { key: "Rota Enviada", short: "Rota Enviada" },
  { key: "Em Rota", short: "Em Rota" },
  { key: "Concluída pelo Técnico", short: "Concluída" },
  { key: "Aguardando Faturamento - Pós", short: "Aguard. Fat." },
  { key: "OK - Aprov. Financeira", short: "Aprov. Fin." },
  { key: "Faturamento", short: "Faturamento" },
  { key: "Concluída", short: "Concluída" },
];

export default function ExpeditionStepper({ status, type }) {
  const steps = type === "Expedição" ? expeditionSteps : deliverySteps;
  const currentIndex = steps.findIndex(s => s.key === status);
  if (currentIndex < 0) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {steps.map((step, i) => {
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <React.Fragment key={step.key}>
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
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 min-w-[8px] ${i < currentIndex ? "bg-emerald-500" : "bg-muted"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}