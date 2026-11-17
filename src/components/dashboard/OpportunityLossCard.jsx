import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CalendarClock, Eye } from "lucide-react";

const money = (value) => (value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

function formatVisitDate(date) {
  if (!date) return "";
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("pt-BR");
}

export default function OpportunityLossCard({ losses, pending, onViewPending }) {
  const items = losses?.items || [];
  const lostValue = losses?.value || 0;

  return (
    <Card className="mb-6 border-amber-200">
      <CardHeader>
        <CardTitle className="text-base font-heading flex flex-wrap items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" /> Perda de Oportunidade
          {items.length > 0 && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
              {items.length} {items.length === 1 ? "pedido" : "pedidos"} · R$ {money(lostValue)}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Pedidos do mês em que o técnico não concluiu o atendimento. Eles saíram do faturamento — reagende o cliente na{" "}
          <Link to="/agenda-rotas" className="text-primary hover:underline">Agenda de Rotas</Link>{" "}
          e o pedido volta a contar automaticamente.
        </p>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhuma perda de oportunidade no mês.
          </p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {items.map((item) => (
              <div key={item.sale_id} className="rounded-lg border p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{item.order_number || "—"}</span>
                    <span className="text-sm truncate">{item.client_name || "Cliente não informado"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {item.seller_name ? `${item.seller_name} · ` : ""}
                    {[item.os_code, item.tos_code].filter(Boolean).join(" · ")}
                    {formatVisitDate(item.date) ? ` · Atendimento ${formatVisitDate(item.date)}` : ""}
                  </div>
                  {item.reason && (
                    <p className="text-xs text-amber-700 mt-1 line-clamp-2">Motivo: {item.reason}</p>
                  )}
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <p className="font-semibold text-sm">R$ {money(item.value)}</p>
                  <Badge variant="outline" className="text-[11px] bg-amber-50 text-amber-700 border-amber-200">
                    {item.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 pt-3 border-t flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            Em andamento no mês (ainda não contabilizados): {pending?.count || 0}{" "}
            {(pending?.count || 0) === 1 ? "pedido" : "pedidos"} · R$ {money(pending?.value)}
          </div>
          {(pending?.count || 0) > 0 && (
            <Button variant="outline" size="sm" onClick={onViewPending}>
              <Eye className="h-3.5 w-3.5" /> Ver pedidos
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}