import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2 } from "lucide-react";
import { exportDashboardSales } from "@/lib/excelExport";

const money = (value) => (value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

const fmtDate = (date) => {
  if (!date) return "—";
  const parsed = new Date(String(date).length === 10 ? `${date}T12:00:00` : date);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("pt-BR");
};

export default function DashboardSalesDialog({ open, onClose, month, monthLabel, scope, sellerId, sellerName }) {
  const { data, isLoading } = useQuery({
    queryKey: ["commercial-dashboard-sales", month, scope, sellerId || "all"],
    enabled: open && !!scope,
    queryFn: async () => {
      const res = await base44.functions.invoke("getCommercialDashboardSales", {
        month,
        scope,
        seller_id: sellerId || undefined,
      });
      return res.data;
    },
  });

  const items = data?.items || [];
  const total = data?.total || 0;
  const isQuote = scope === "quote";
  const isResale = scope === "resale";
  const isCounted = scope === "counted" || isResale;
  const title = isQuote
    ? "Orçamentos em aberto"
    : isResale
      ? (sellerId ? `Pedidos de revenda de ${sellerName || ""}` : "Pedidos de revenda contabilizados")
      : isCounted
        ? (sellerId ? `Pedidos de ${sellerName || ""}` : "Pedidos de venda direta contabilizados")
        : "Pedidos em andamento no mês (não contabilizados)";

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
          <DialogDescription className="capitalize">
            {isQuote ? "Situação atual da base" : monthLabel} · {data?.count || 0}{" "}
            {isQuote
              ? (data?.count === 1 ? "orçamento em aberto" : "orçamentos em aberto")
              : (data?.count === 1 ? "pedido" : "pedidos")} · R$ {money(total)}
            {isQuote ? "" : isCounted ? " contabilizados" : " aguardando conclusão/agendamento"}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nenhum pedido nesta lista.</p>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 sticky top-0 z-10">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Pedido</th>
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  {!sellerId && <th className="px-3 py-2 font-medium">Vendedor</th>}
                  {!isQuote && <th className="px-3 py-2 font-medium">Etapa</th>}
                  {isQuote && <th className="px-3 py-2 font-medium">Em aberto</th>}
                  {!isQuote && <th className="px-3 py-2 font-medium">OS</th>}
                  {scope === "pending" && <th className="px-3 py-2 font-medium">Agendamento</th>}
                  <th className="px-3 py-2 font-medium">Modalidade</th>
                  <th className="px-3 py-2 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.sale_id} className="border-t align-top">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{item.order_number || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(item.date)}</td>
                    <td className="px-3 py-2">{item.client_name || "—"}</td>
                    {!sellerId && <td className="px-3 py-2 whitespace-nowrap">{item.seller_name || "—"}</td>}
                    {!isQuote && (
                      <td className="px-3 py-2">
                        <Badge variant="secondary" className="text-[11px] whitespace-nowrap">{item.stage || "—"}</Badge>
                      </td>
                    )}
                    {isQuote && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        {item.days_open != null ? `${item.days_open} ${item.days_open === 1 ? "dia" : "dias"}` : "—"}
                        {item.returned && (
                          <span className="block text-xs text-amber-700">voltou para Orçamento</span>
                        )}
                      </td>
                    )}
                    {!isQuote && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span>{item.os_code || "—"}</span>
                        {item.os_status && <span className="block text-xs text-muted-foreground">{item.os_status}</span>}
                      </td>
                    )}
                    {scope === "pending" && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        {item.appointment_date ? fmtDate(item.appointment_date) : <span className="text-muted-foreground">sem agendamento</span>}
                      </td>
                    )}
                    <td className="px-3 py-2 whitespace-nowrap">{item.modality || "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap font-medium">R$ {money(item.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {isQuote
              ? "Orçamentos que ainda não viraram venda — liste por tempo em aberto para priorizar o contato."
              : isCounted
                ? `Estes pedidos já entram no faturamento${isResale ? " de revenda" : " de venda direta"}.`
                : "Estes pedidos ainda não entram no faturamento — bom ponto de partida para o follow-up."}
          </p>
          <Button variant="outline" onClick={() => exportDashboardSales(items, title)} disabled={items.length === 0}>
            <Download className="h-4 w-4" /> Baixar em Excel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}