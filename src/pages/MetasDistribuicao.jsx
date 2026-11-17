import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import MetaDistribuicaoDialog from "@/components/metas/MetaDistribuicaoDialog";
import MultiSelectFilter from "@/components/ui/MultiSelectFilter";
import { normalizeBrand } from "@/lib/brandNormalize";
import { Plus, Pencil, Archive, Loader2, Target, TrendingUp, Trophy, Filter } from "lucide-react";

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ACTIVE_STATUSES = ["Ativo", "Em manutenção"];
const SEM_EQUIP = "Sem equipamento";
const COUNTED_STAGES = ["Confirmada", "Pagamento Aprovado", "Em OS", "Faturada", "Concluída"];
const STAGE_OPTIONS = [
  { value: "Orçamento", label: "Orçamento" },
  { value: "Confirmada", label: "Confirmada" },
  { value: "Pagamento Aprovado", label: "Pagamento Aprovado" },
  { value: "Em OS", label: "Em OS" },
  { value: "Faturada", label: "Faturada" },
  { value: "Concluída", label: "Concluída" },
  { value: "Cancelada", label: "Cancelada" },
];

export default function MetasDistribuicao() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedStages, setSelectedStages] = useState(["Faturada"]);
  const countedStages = selectedStages.length === 0 ? COUNTED_STAGES : selectedStages;

  const { user } = useAuth();
  const roles = [user?.role, ...(user?.additional_roles || [])].filter(Boolean);
  const canConfig = roles.includes("admin") || roles.includes("supervisor");

  const metasQ = useQuery({
    queryKey: ["metas-distribuicao"],
    queryFn: () => base44.entities.MetaDistribuicao.list("-goal_date", 200),
  });
  const batchesQ = useQuery({
    queryKey: ["distributionBatches"],
    queryFn: () => base44.entities.DistributionBatch.list("-date", 500),
  });
  const clientsQ = useQuery({
    queryKey: ["clients-all-metas"],
    queryFn: () => base44.entities.Client.list("-updated_date", 5000),
  });
  const equipQ = useQuery({
    queryKey: ["equipment-all-metas"],
    queryFn: () => base44.entities.Equipment.list("-updated_date", 5000),
  });
  const sellersQ = useQuery({
    queryKey: ["sellers-all-metas"],
    queryFn: () => base44.entities.Seller.list(),
  });
  const productsQ = useQuery({
    queryKey: ["products-all-metas"],
    queryFn: () => base44.entities.Product.list("-updated_date", 5000),
  });
  const salesQ = useQuery({
    queryKey: ["sales-all-metas"],
    queryFn: () => base44.entities.Sale.list("-date", 5000),
  });

  const loading =
    metasQ.isLoading || batchesQ.isLoading || clientsQ.isLoading || equipQ.isLoading ||
    sellersQ.isLoading || productsQ.isLoading || salesQ.isLoading;

  const batches = batchesQ.data || [];
  const clients = clientsQ.data || [];
  const equipment = equipQ.data || [];
  const sellers = sellersQ.data || [];
  const products = productsQ.data || [];
  const sales = salesQ.data || [];
  const metas = metasQ.data || [];

  const batchMap = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);

  const equipByClient = useMemo(() => {
    const map = new Map();
    equipment.forEach((e) => {
      if (!ACTIVE_STATUSES.includes(e.status)) return;
      if (!map.has(e.client_id)) map.set(e.client_id, []);
      map.get(e.client_id).push(e);
    });
    return map;
  }, [equipment]);

  const salesByClient = useMemo(() => {
    const map = new Map();
    sales.forEach((s) => {
      if (!countedStages.includes(s.stage)) return;
      if (!map.has(s.client_id)) map.set(s.client_id, []);
      map.get(s.client_id).push(s);
    });
    return map;
  }, [sales, countedStages]);

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const sellerMap = useMemo(() => new Map(sellers.map((s) => [s.id, s])), [sellers]);

  const STATUS_ORDER = ["Ótimo Recorrente", "Ótimo - Cliente Brazon", "Ótimo", "Novo", "Base Inativa LSOFT"];
  const STATUS_COLORS = {
    "Ótimo Recorrente": "bg-violet-100 text-violet-700",
    "Ótimo - Cliente Brazon": "bg-indigo-100 text-indigo-700",
    "Ótimo": "bg-sky-100 text-sky-700",
    "Novo": "bg-emerald-100 text-emerald-700",
    "Base Inativa LSOFT": "bg-zinc-100 text-zinc-600",
  };

  const computeGoal = (meta) => {
    const clientIdsSet = new Set();
    (meta.batch_ids || []).forEach((bid) => {
      const b = batchMap.get(bid);
      if (b) (b.client_ids || []).forEach((id) => clientIdsSet.add(id));
    });
    const clientsInScope = [...clientIdsSet].map((id) => clientMap.get(id)).filter(Boolean);

    const gatilhos = [...(meta.gatilhos || [])].sort((a, b) => (a.threshold || 0) - (b.threshold || 0));

    const rows = (meta.sellers || []).map((sv) => {
      const sellerClients = clientsInScope.filter((c) => c && c.seller_id === sv.seller_id);
      const sellerClientIds = new Set(sellerClients.map((c) => c.id));
      let forecast = 0;
      const byStatus = {};
      const byStatusCount = {};
      sellerClients.forEach((c) => {
        const eqs = equipByClient.get(c.id) || [];
        let f;
        if (eqs.length === 0) {
          f = meta.brand_tickets?.[SEM_EQUIP] || 0;
        } else {
          const distinctBrands = new Set(eqs.map((e) => normalizeBrand(e.brand)));
          f = [...distinctBrands].reduce((acc, b) => acc + (meta.brand_tickets?.[b] || 0), 0);
        }
        forecast += f;
        const st = c.status || "Novo";
        byStatus[st] = (byStatus[st] || 0) + f;
        byStatusCount[st] = (byStatusCount[st] || 0) + 1;
      });
      let achieved = 0;
      sellerClientIds.forEach((cid) => {
        const ss = salesByClient.get(cid) || [];
        ss.forEach((s) => {
          if (meta.goal_date && s.date && s.date > meta.goal_date) return;
          achieved += Number(s.grand_total || s.total || 0);
        });
      });
      let gatilhoAtingido = null;
      gatilhos.forEach((g) => {
        if (achieved >= (g.threshold || 0)) gatilhoAtingido = g;
      });
      const commissionPercent = gatilhoAtingido ? (Number(gatilhoAtingido.commission_percent) || 0) : 0;
      const commission = (achieved * commissionPercent) / 100;
      const progress = forecast > 0 ? (achieved / forecast) * 100 : 0;
      return {
        seller_id: sv.seller_id,
        seller_name: sv.seller_name,
        photo_url: sellerMap.get(sv.seller_id)?.photo_url,
        client_count: sellerClients.length,
        forecast,
        byStatus,
        byStatusCount,
        achieved,
        gatilhoAtingido,
        commission,
        progress,
      };
    });

    const totals = rows.reduce(
      (acc, r) => ({
        forecast: acc.forecast + r.forecast,
        achieved: acc.achieved + r.achieved,
        commission: acc.commission + r.commission,
        byStatus: mergeStatus(acc.byStatus, r.byStatus),
      }),
      { forecast: 0, achieved: 0, commission: 0, byStatus: {} }
    );
    totals.progress = totals.forecast > 0 ? (totals.achieved / totals.forecast) * 100 : 0;
    return { rows, totals, clientCount: clientsInScope.length, gatilhos };
  };

  const mergeStatus = (a, b) => {
    const out = { ...a };
    Object.entries(b || {}).forEach(([k, v]) => { out[k] = (out[k] || 0) + v; });
    return out;
  };

  const handleNew = () => { setEditing(null); setDialogOpen(true); };
  const handleEdit = (m) => { setEditing(m); setDialogOpen(true); };

  const handleArchive = async (m) => {
    try {
      await base44.entities.MetaDistribuicao.update(m.id, { status: "Arquivada" });
      qc.invalidateQueries(["metas-distribuicao"]);
      toast({ title: "Meta arquivada" });
    } catch (e) {
      toast({ title: "Erro ao arquivar", description: String(e?.message || e), variant: "destructive" });
    }
  };

  const progressStatus = (p) => {
    if (p >= 100) return { label: "Potencial atingido", className: "bg-emerald-100 text-emerald-700" };
    if (p >= 75) return { label: "Próximo do potencial", className: "bg-amber-100 text-amber-700" };
    return { label: "Abaixo do potencial", className: "bg-rose-100 text-rose-700" };
  };

  const visibleMetas = metas.filter((m) => m.status !== "Arquivada");
  const archivedMetas = metas.filter((m) => m.status === "Arquivada");

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Metas de Distribuição" description="Previsão de faturamento por lote de distribuição e acompanhamento por vendedora.">
        <div className="flex items-center gap-2">
          <MultiSelectFilter
            options={STAGE_OPTIONS}
            selected={selectedStages}
            onChange={setSelectedStages}
            placeholder="Filtrar por status"
            allLabel="Todos os status"
            icon={Filter}
          />
          {canConfig && (
            <Button onClick={handleNew}>
              <Plus className="h-4 w-4" /> Nova meta
            </Button>
          )}
        </div>
      </PageHeader>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando...
        </div>
      ) : visibleMetas.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center">
            <Target className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhuma meta criada ainda.</p>
            <Button className="mt-4" onClick={handleNew}>
              <Plus className="h-4 w-4" /> Criar primeira meta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {visibleMetas.map((m) => {
            const { rows, totals, clientCount, gatilhos } = computeGoal(m);
            const st = progressStatus(totals.progress);
            return (
              <Card key={m.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {m.name}
                        <Badge variant="outline">{m.status}</Badge>
                        <Badge className={st.className}>
                          {st.label} · {totals.progress.toFixed(1)}%
                        </Badge>
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        {m.batch_protocols?.length || 0} lote(s) · {(m.batch_protocols || []).join(", ")} · {clientCount} clientes · prazo {m.goal_date ? new Date(m.goal_date).toLocaleDateString("pt-BR") : "—"}
                      </p>
                    </div>
                    {gatilhos.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {gatilhos.map((g, i) => (
                          <div key={i} className="rounded-md border bg-muted/30 px-2.5 py-1 text-xs">
                            <span className="font-medium">{i + 1}º gatilho:</span> {fmtBRL(g.threshold)} → <span className="font-semibold text-primary">{g.commission_percent}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {canConfig && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => handleEdit(m)}>
                            <Pencil className="h-3.5 w-3.5" /> Editar
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleArchive(m)}>
                            <Archive className="h-3.5 w-3.5" /> Arquivar
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Stat label="Potencial (100%)" value={fmtBRL(totals.forecast)} icon={<TrendingUp className="h-4 w-4 text-primary" />} />
                    <Stat label="Realizado" value={fmtBRL(totals.achieved)} icon={<Trophy className="h-4 w-4 text-emerald-500" />} />
                    <Stat label="Comissão" value={fmtBRL(totals.commission)} icon={<Target className="h-4 w-4 text-amber-500" />} />
                    <Stat label="Progresso" value={`${totals.progress.toFixed(1)}%`} icon={<TrendingUp className="h-4 w-4 text-violet-500" />} />
                  </div>

                  {totals.forecast > 0 && (
                    <div className="rounded-md border bg-muted/30 p-3">
                      <div className="text-xs font-medium text-muted-foreground mb-2">Previsão de faturamento por perfil de cliente</div>
                      <div className="flex flex-wrap gap-2">
                        {STATUS_ORDER.filter((st) => (totals.byStatus[st] || 0) > 0).map((st) => {
                          const v = totals.byStatus[st] || 0;
                          const pct = totals.forecast > 0 ? (v / totals.forecast) * 100 : 0;
                          return (
                            <div key={st} className={`rounded-md px-2.5 py-1.5 text-xs ${STATUS_COLORS[st] || "bg-muted text-muted-foreground"}`}>
                              <div className="font-semibold">{st}</div>
                              <div>{fmtBRL(v)} · {pct.toFixed(1)}% da previsão</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="border rounded-md">
                    <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b text-xs font-medium text-muted-foreground">
                      <div className="col-span-3">Vendedora</div>
                      <div className="col-span-1 text-center">Clientes</div>
                      <div className="col-span-2 text-right">Potencial</div>
                      <div className="col-span-2 text-right">Realizado</div>
                      <div className="col-span-2 text-center">Gatilho</div>
                      <div className="col-span-1 text-right">Comissão</div>
                      <div className="col-span-1 text-right">Prog.</div>
                    </div>
                    {rows.length === 0 && (
                      <div className="p-4 text-sm text-muted-foreground">Nenhuma vendedora configurada.</div>
                    )}
                    {rows.map((r) => {
                      const rs = progressStatus(r.progress);
                      return (
                        <div key={r.seller_id} className="px-3 py-2.5 border-b last:border-0 space-y-1.5">
                          <div className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-3 text-sm font-medium flex items-center gap-2">
                              {r.photo_url ? (
                                <img src={r.photo_url} alt={r.seller_name} className="h-7 w-7 rounded-full object-cover border" />
                              ) : (
                                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                                  {(r.seller_name || "?").charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span>{r.seller_name}</span>
                            </div>
                            <div className="col-span-1 text-center text-sm">{r.client_count}</div>
                            <div className="col-span-2 text-right text-sm">{fmtBRL(r.forecast)}</div>
                            <div className="col-span-2 text-right text-sm font-medium">{fmtBRL(r.achieved)}</div>
                            <div className="col-span-2 text-center">
                              {r.gatilhoAtingido ? (
                                <Badge className="bg-emerald-100 text-emerald-700 text-xs">{fmtBRL(r.gatilhoAtingido.threshold)} · {r.gatilhoAtingido.commission_percent}%</Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">Nenhum</Badge>
                              )}
                            </div>
                            <div className="col-span-1 text-right text-sm font-semibold text-primary">{fmtBRL(r.commission)}</div>
                            <div className="col-span-1 text-right">
                              <Badge className={rs.className + " text-xs"}>{r.progress.toFixed(0)}%</Badge>
                            </div>
                          </div>
                          <Progress value={Math.min(100, r.progress)} className="h-1.5" />
                          {r.forecast > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {STATUS_ORDER.filter((st) => (r.byStatus[st] || 0) > 0).map((st) => {
                                const v = r.byStatus[st] || 0;
                                const pct = r.forecast > 0 ? (v / r.forecast) * 100 : 0;
                                return (
                                  <span key={st} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${STATUS_COLORS[st] || "bg-muted text-muted-foreground"}`} title={`${r.byStatusCount[st] || 0} cliente(s)`}>
                                    {st}: {fmtBRL(v)} · {pct.toFixed(0)}% ({r.byStatusCount[st] || 0})
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {archivedMetas.length > 0 && (
            <details className="mt-4">
              <summary className="text-sm text-muted-foreground cursor-pointer">
                Metas arquivadas ({archivedMetas.length})
              </summary>
              <div className="mt-2 space-y-2">
                {archivedMetas.map((m) => (
                  <div key={m.id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm opacity-70">
                    <span>{m.name} · {m.batch_protocols?.length || 0} lote(s)</span>
                    {canConfig && (
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(m)}>
                        <Pencil className="h-3.5 w-3.5" /> Reativar
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <MetaDistribuicaoDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={() => qc.invalidateQueries(["metas-distribuicao"])}
        editing={editing}
        batches={batches}
        clients={clients}
        equipment={equipment}
        sellers={sellers}
        products={products}
      />
    </div>
  );
}

function Stat({ label, value, icon }) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon} {label}</div>
      <div className="text-lg font-bold mt-0.5">{value}</div>
    </div>
  );
}