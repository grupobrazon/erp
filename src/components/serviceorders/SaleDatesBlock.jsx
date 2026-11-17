import React from "react";
import { Calendar } from "lucide-react";

const fmtDate = (d) => d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";
const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function SaleDatesBlock({ sale }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-sm font-medium mb-2 flex items-center gap-1"><Calendar className="h-4 w-4 text-primary" /> Datas & Relacionamento (Vendedor)</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <div><span className="text-muted-foreground">Data do pedido:</span> {fmtDate(sale?.date)}</div>
        <div><span className="text-muted-foreground">Previsão de expedição:</span> <span className="font-medium text-primary">{fmtDate(sale?.expedition_forecast_date)}</span></div>
        <div><span className="text-muted-foreground">Enviar até:</span> {fmtDate(sale?.cr_shipping_deadline)}</div>
        <div><span className="text-muted-foreground">Cliente quer receber até:</span> {fmtDate(sale?.cr_delivery_deadline)}</div>
        <div><span className="text-muted-foreground">Agendamento:</span> {sale?.cr_scheduling_type || "—"}</div>
        {sale?.cr_preferred_date && <div><span className="text-muted-foreground">Data preferida:</span> {fmtDate(sale.cr_preferred_date)}</div>}
        {sale?.cr_time_range && <div><span className="text-muted-foreground">Horário:</span> {sale.cr_time_range}</div>}
        <div><span className="text-muted-foreground">Período:</span> {sale?.cr_period || "—"}</div>
        {sale?.cr_weekdays?.length > 0 && (
          <div className="col-span-2"><span className="text-muted-foreground">Dias disponíveis:</span> {sale.cr_weekdays.map(d => WEEKDAY_LABELS[d] || d).join(", ")}</div>
        )}
        {sale?.cr_notes && (
          <div className="col-span-2 border-t pt-1.5 mt-0.5"><span className="text-muted-foreground">Obs. do vendedor:</span> {sale.cr_notes}</div>
        )}
      </div>
    </div>
  );
}