import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { DollarSign, ShoppingCart, TrendingUp, Target, ChevronLeft, ChevronRight, Trophy, Plus, Pencil, Archive, Link2, Store } from "lucide-react";
import { format, subMonths, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import MetaVendaDialog from "@/components/dashboard/MetaVendaDialog";
import OpportunityLossCard from "@/components/dashboard/OpportunityLossCard";
import DashboardSalesDialog from "@/components/dashboard/DashboardSalesDialog";
import OpenQuotesCard from "@/components/dashboard/OpenQuotesCard";
import ResaleDashboard from "@/components/dashboard/ResaleDashboard";
import SellerAvatar from "@/components/dashboard/SellerAvatar";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const [refMonth, setRefMonth] = useState(new Date());

  const monthKey = format(refMonth, "yyyy-MM");
  const monthLabel = format(refMonth, "MMMM 'de' yyyy", { locale: ptBR });

  const { data: sellers = [] } = useQuery({
    queryKey: ["sellers"],
    queryFn: () => base44.entities.Seller.list(),
  });
  // A contagem do mês é calculada no servidor, com as regras por modalidade:
  // Envio só conta com aprovação financeira; Entrega conta com atendimento concluído
  // pelo técnico ou com o cliente agendado na agenda de rotas.
  const { data: dash, isLoading: dashLoading } = useQuery({
    queryKey: ["commercial-dashboard", monthKey],
    queryFn: async () => {
      const res = await base44.functions.invoke("getCommercialDashboard", { month: monthKey });
      return res.data;
    },
  });
  const { data: metasDistribuicao = [] } = useQuery({
    queryKey: ["metas-distribuicao"],
    queryFn: () => base44.entities.MetaDistribuicao.list("-goal_date", 200),
  });
  const { data: metasVenda = [] } = useQuery({
    queryKey: ["metas-venda"],
    queryFn: () => base44.entities.MetaVenda.list("-goal_date", 200),
  });

  const [metaDialogOpen, setMetaDialogOpen] = useState(false);
  const [editingMeta, setEditingMeta] = useState(null);
  const [salesDialog, setSalesDialog] = useState(null);
  const qc = useQueryClient();

  const activeDistMetas = metasDistribuicao.filter((m) => m.status === "Ativa");
  const activeMetasVenda = metasVenda.filter((m) => m.status === "Ativa");

  const handleNewMeta = () => { setEditingMeta(null); setMetaDialogOpen(true); };
  const handleEditMeta = (m) => { setEditingMeta(m); setMetaDialogOpen(true); };
  const handleArchiveMeta = async (m) => {
    try {
      await base44.entities.MetaVenda.update(m.id, { status: "Arquivada" });
      qc.invalidateQueries(["metas-venda"]);
    } catch (e) {}
  };

  const totalRevenue = dash?.counted?.revenue || 0;
  const totalSalesCount = dash?.counted?.count || 0;
  // Faturamento separado: o ranking principal é de venda direta; revenda tem o próprio
  // dashboard (abaixo). O total do mês é a soma dos dois.
  const direct = dash?.direct || { count: 0, revenue: 0, ticket: 0 };
  const resale = dash?.resale || { count: 0, revenue: 0, ticket: 0 };

  // Faturamento por vendedor: venda direta (azul) e revenda (vermelho) somadas separadamente.
  const sellerStats = useMemo(() => {
    const byId = {};
    sellers.forEach(s => { byId[s.id] = s; });
    const stats = {};
    const ensure = (seller) => {
      if (!stats[seller.id]) {
        stats[seller.id] = { seller, directRevenue: 0, directCount: 0, resaleRevenue: 0, resaleCount: 0 };
      }
      return stats[seller.id];
    };
    sellers.forEach(s => ensure(s));
    (dash?.sellers || []).forEach(row => {
      const seller = byId[row.seller_id]
        || { id: row.seller_id, name: row.seller_name || "Sem Vendedor", photo_url: "" };
      const stat = ensure(seller);
      stat.directRevenue += row.revenue || 0;
      stat.directCount += row.count || 0;
    });
    (dash?.resale_sellers || []).forEach(row => {
      const seller = byId[row.seller_id]
        || { id: row.seller_id, name: row.seller_name || "Sem Vendedor", photo_url: "" };
      const stat = ensure(seller);
      stat.resaleRevenue += row.revenue || 0;
      stat.resaleCount += row.count || 0;
    });
    // Vendedor inativado só aparece se teve venda contabilizada no mês
    return Object.values(stats)
      .filter(stat => stat.seller.is_active !== false || stat.directCount > 0 || stat.resaleCount > 0)
      .sort((a, b) => (b.directRevenue - a.directRevenue) || (b.resaleRevenue - a.resaleRevenue));
  }, [sellers, dash]);

  const maxRevenue = sellerStats.reduce((max, s) => Math.max(max, s.directRevenue), 0);

  return (
    <div>
      <PageHeader
        title="Dashboard Comercial"
        description="Faturamento por vendedor — Envio conta com aprovação financeira; Entrega conta com atendimento concluído pelo técnico ou cliente agendado na agenda"
      />

      {/* Month selector */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <Button variant="outline" size="icon" onClick={() => setRefMonth(subMonths(refMonth, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-lg font-heading font-semibold capitalize min-w-48 text-center">{monthLabel}</span>
        <Button variant="outline" size="icon" onClick={() => setRefMonth(addMonths(refMonth, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {format(refMonth, "yyyy-MM") !== format(new Date(), "yyyy-MM") && (
          <Button variant="ghost" size="sm" onClick={() => setRefMonth(new Date())}>Hoje</Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Faturamento Total do Mês</p>
              <p className="text-2xl font-bold font-heading">
                {dashLoading
                  ? "…"
                  : `R$ ${totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
              </p>
              {!dashLoading && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Direta R$ {direct.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  {" · "}Revenda R$ {resale.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              )}
              {!dashLoading && (dash?.bonus?.count || 0) > 0 && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {dash.bonus.count} {dash.bonus.count === 1 ? "pedido" : "pedidos"} de bonificação/permuta/brinde fora do total
                  {" · "}R$ {dash.bonus.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
              <ShoppingCart className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Venda Direta</p>
              <p className="text-2xl font-bold font-heading text-blue-600">
                {dashLoading ? "…" : `R$ ${direct.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {direct.count} {direct.count === 1 ? "pedido" : "pedidos"} · Ticket R$ {direct.ticket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center">
              <Store className="h-6 w-6 text-sky-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Revenda</p>
              <p className="text-2xl font-bold font-heading text-red-600">
                {dashLoading ? "…" : `R$ ${resale.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {resale.count} {resale.count === 1 ? "pedido" : "pedidos"} · Ticket R$ {resale.ticket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-violet-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vendas no Mês</p>
              <p className="text-2xl font-bold font-heading">{dashLoading ? "…" : totalSalesCount}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Ticket médio R$ {(totalSalesCount > 0 ? totalRevenue / totalSalesCount : 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Seller performance cards */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-heading flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" /> Ranking de Vendedores
            </span>
            <span className="flex items-center gap-3 text-xs font-normal text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Venda Direta
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-600" /> Revenda
              </span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sellerStats.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="Nenhuma venda neste período"
              description="As vendas realizadas aparecerão aqui com o valor por vendedor."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sellerStats.map((stat, idx) => (
                <div
                  key={stat.seller.id}
                  onClick={() => {
                    if (stat.directCount > 0) {
                      setSalesDialog({ scope: "counted", sellerId: stat.seller.id, sellerName: stat.seller.name });
                    } else if (stat.resaleCount > 0) {
                      setSalesDialog({ scope: "resale", sellerId: stat.seller.id, sellerName: stat.seller.name });
                    }
                  }}
                  className={`rounded-xl border p-4 flex items-center gap-4 transition-colors ${idx === 0 && maxRevenue > 0 ? "border-amber-300 bg-amber-50/50" : ""} ${stat.directCount > 0 || stat.resaleCount > 0 ? "cursor-pointer hover:border-primary/40 hover:bg-primary/5" : ""}`}
                >
                  <div className="relative flex-shrink-0">
                    <SellerAvatar seller={stat.seller} />
                    {idx === 0 && maxRevenue > 0 && (
                      <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center border-2 border-background">
                        <Trophy className="h-3.5 w-3.5 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {idx < 3 && maxRevenue > 0 && (
                        <span className="text-xs font-bold text-muted-foreground">#{idx + 1}</span>
                      )}
                      <p className="font-medium truncate">{stat.seller.name}</p>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="text-lg font-bold text-blue-600 font-heading">
                        R$ {stat.directRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-lg font-bold text-red-600 font-heading">
                        R$ {stat.resaleRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      <span>{stat.directCount} {stat.directCount === 1 ? "venda direta" : "vendas diretas"}</span>
                      {stat.directCount > 0 && (
                        <span className="text-blue-600">Ticket: R$ {(stat.directRevenue / stat.directCount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      )}
                      {stat.resaleCount > 0 && (
                        <span className="text-red-600">{stat.resaleCount} {stat.resaleCount === 1 ? "pedido de revenda" : "pedidos de revenda"}</span>
                      )}
                    </div>
                    {/* Progress bar — future goals placeholder */}
                    <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full"
                        style={{ width: maxRevenue > 0 ? `${(stat.directRevenue / maxRevenue) * 100}%` : "0%" }}
                      />
                    </div>
                    {stat.directCount > 0 && (
                      <p className="text-[11px] text-blue-600 mt-1.5">Ver os {stat.directCount} pedidos contabilizados</p>
                    )}
                    {stat.resaleCount > 0 && (
                      <p
                        className="text-[11px] text-red-600 mt-1.5 hover:underline cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSalesDialog({ scope: "resale", sellerId: stat.seller.id, sellerName: stat.seller.name });
                        }}
                      >
                        Ver os {stat.resaleCount} {stat.resaleCount === 1 ? "pedido" : "pedidos"} de revenda
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ResaleDashboard
        resale={resale}
        resaleSellers={dash?.resale_sellers || []}
        sellers={sellers}
        loading={dashLoading}
        onOpenOrders={(sellerId, sellerName) => setSalesDialog({ scope: "resale", sellerId: sellerId || undefined, sellerName })}
      />

      <OpportunityLossCard
        losses={dash?.losses}
        pending={dash?.pending}
        onViewPending={() => setSalesDialog({ scope: "pending" })}
      />

      <OpenQuotesCard
        quotes={dash?.quotes}
        onViewAll={() => setSalesDialog({ scope: "quote" })}
      />

      {/* Metas section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-heading font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" /> Metas
          </h2>
          <Button onClick={handleNewMeta}>
            <Plus className="h-4 w-4" /> Nova meta
          </Button>
        </div>

        {/* Distribution metas (pulled from Metas de Distribuição) */}
        {activeDistMetas.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-heading flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" /> Metas de Distribuição
                <Link to="/metas-distribuicao" className="text-xs text-primary hover:underline ml-1">ver detalhes</Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeDistMetas.map((m) => (
                  <div key={m.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm truncate">{m.name}</p>
                      <Badge variant="outline" className="text-xs shrink-0">{m.status}</Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Potencial: <strong className="text-foreground">R$ {(m.forecast_total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Prazo: {m.goal_date ? new Date(m.goal_date).toLocaleDateString("pt-BR") : "—"}
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: "0%" }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Generic sales metas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" /> Metas de Vendas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeMetasVenda.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhuma meta cadastrada. Clique em "Nova meta" para criar metas de prospecção, ticket médio, produto, etc.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeMetasVenda.map((m) => {
                  const progress = m.goal_value > 0 ? Math.min(100, (m.current_value / m.goal_value) * 100) : 0;
                  const unit = m.unit || "";
                  return (
                    <div key={m.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{m.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge variant="secondary" className="text-xs">{m.tipo}</Badge>
                            {m.seller_name && <span className="text-xs text-muted-foreground truncate">{m.seller_name}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditMeta(m)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleArchiveMeta(m)}>
                            <Archive className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 text-sm">
                        <span className="font-semibold text-primary">{(m.current_value || 0).toLocaleString("pt-BR")} {unit}</span>
                        <span className="text-muted-foreground"> / {(m.goal_value || 0).toLocaleString("pt-BR")} {unit}</span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{progress.toFixed(0)}% concluído</span>
                        <span>Prazo: {m.goal_date ? new Date(m.goal_date).toLocaleDateString("pt-BR") : "—"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <DashboardSalesDialog
        open={!!salesDialog}
        onClose={() => setSalesDialog(null)}
        month={monthKey}
        monthLabel={monthLabel}
        scope={salesDialog?.scope}
        sellerId={salesDialog?.sellerId}
        sellerName={salesDialog?.sellerName}
      />

      <MetaVendaDialog
        open={metaDialogOpen}
        onClose={() => setMetaDialogOpen(false)}
        onSaved={() => qc.invalidateQueries(["metas-venda"])}
        editing={editingMeta}
        sellers={sellers}
      />
    </div>
  );
}