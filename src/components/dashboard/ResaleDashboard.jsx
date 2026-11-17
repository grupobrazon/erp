import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Store, Trophy } from "lucide-react";
import SellerAvatar from "@/components/dashboard/SellerAvatar";

const money = (v) => `R$ ${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Dashboard de revenda: faturamento e ranking apenas dos pedidos marcados como revenda,
// separado do dashboard de venda direta (ranking principal do mês).
export default function ResaleDashboard({ resale, resaleSellers = [], sellers = [], loading, onOpenOrders }) {
  const stats = useMemo(() => {
    const byId = {};
    sellers.forEach(s => { byId[s.id] = s; });
    return resaleSellers
      .map(row => ({
        seller: byId[row.seller_id] || { id: row.seller_id, name: row.seller_name || "Sem vendedor", photo_url: "" },
        count: row.count || 0,
        revenue: row.revenue || 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [resaleSellers, sellers]);

  const maxRevenue = stats.length > 0 ? stats[0].revenue : 0;
  const hasOrders = (resale?.count || 0) > 0;

  return (
    <Card className="mb-6 border-sky-200">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-3">
        <CardTitle className="text-base font-heading flex items-center gap-2">
          <Store className="h-4 w-4 text-sky-600" /> Dashboard de Revenda
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => onOpenOrders?.(null, "")} disabled={!hasOrders}>
          Ver pedidos de revenda
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Faturamento de Revenda</p>
            <p className="text-xl font-bold font-heading text-sky-700">{loading ? "…" : money(resale?.revenue)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Pedidos de Revenda</p>
            <p className="text-xl font-bold font-heading">{loading ? "…" : (resale?.count || 0)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Ticket Médio Revenda</p>
            <p className="text-xl font-bold font-heading">{loading ? "…" : money(resale?.ticket)}</p>
          </div>
        </div>

        {!hasOrders ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhum pedido marcado como revenda neste mês. Abra o pedido na lista de Vendas (ícone do olho) e clique em
            <strong className="text-foreground"> "Marcar como revenda"</strong> para ele passar a contar aqui.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.map((stat, idx) => (
              <div
                key={stat.seller.id}
                onClick={() => onOpenOrders?.(stat.seller.id, stat.seller.name)}
                className={`rounded-xl border p-4 flex items-center gap-4 cursor-pointer transition-colors hover:border-sky-400 hover:bg-sky-50/60 ${idx === 0 ? "border-sky-300 bg-sky-50/50" : ""}`}
              >
                <div className="relative flex-shrink-0">
                  <SellerAvatar seller={stat.seller} />
                  {idx === 0 && maxRevenue > 0 && (
                    <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center border-2 border-background">
                      <Trophy className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{stat.seller.name}</p>
                  <p className="text-xl font-bold text-sky-700 font-heading">{money(stat.revenue)}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{stat.count} {stat.count === 1 ? "pedido" : "pedidos"}</span>
                    <span>· Ticket: {money(stat.count > 0 ? stat.revenue / stat.count : 0)}</span>
                  </div>
                  <p className="text-[11px] text-sky-700 mt-1.5">Ver os {stat.count} pedidos de revenda</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}