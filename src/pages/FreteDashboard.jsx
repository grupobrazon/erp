import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Truck, DollarSign, TrendingDown, Receipt, ArrowRight, ShieldAlert, AlertCircle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/use-toast";

const fmtMoney = (v) => `R$ ${(v || 0).toFixed(2)}`;
const fmtDate = (d) => d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";
const fmtDateTime = (d) => d ? new Date(d).toLocaleString("pt-BR") : "—";

export default function FreteDashboard() {
  const [search, setSearch] = useState("");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [approving, setApproving] = useState(null);
  const [rejectReasons, setRejectReasons] = useState({});

  const isAdmin = user?.role === "admin";

  const { data: exemptedSales = [], isLoading: loadingSales } = useQuery({
    queryKey: ["freteExemptedSales"],
    queryFn: () => base44.entities.Sale.filter({ freight_exempt: true }, "-updated_date", 200),
  });

  const { data: exemptedOS = [], isLoading: loadingOS } = useQuery({
    queryKey: ["freteExemptedOS"],
    queryFn: () => base44.entities.ServiceOrder.filter({ freight_diff_exempt: true }, "-updated_date", 200),
  });

  const { data: chargedOS = [], isLoading: loadingCharged } = useQuery({
    queryKey: ["freteChargedOS"],
    queryFn: () => base44.entities.ServiceOrder.filter({ freight_diff_charged: true }, "-updated_date", 200),
  });

  const { data: pendingRequotes = [], isLoading: loadingPending } = useQuery({
    queryKey: ["fretePendingRequotes"],
    queryFn: () => base44.entities.Sale.filter({ requote_diff_status: "Pendente Aprovação" }, "-updated_date", 200),
  });

  const { data: approvedRequotes = [], isLoading: loadingApproved } = useQuery({
    queryKey: ["freteApprovedRequotes"],
    queryFn: () => base44.entities.Sale.filter({ requote_diff_status: "Aprovado" }, "-updated_date", 200),
  });

  const totalSellerExempt = exemptedSales.reduce((s, sale) => s + (sale.freight_exempt_value || 0), 0);
  const totalPosVendasExempt = exemptedOS.reduce((s, os) => s + (os.freight_diff_exempt_value || 0), 0);
  const totalCharged = chargedOS.reduce((s, os) => s + (os.freight_diff_amount || 0), 0);
  const totalCarrierChanges = exemptedOS.length + chargedOS.length;
  const totalRequoteDiff = approvedRequotes.reduce((s, sale) => s + (sale.requote_diff_amount || 0), 0);

  const handleApprove = async (saleId) => {
    setApproving(saleId);
    try {
      const res = await base44.functions.invoke("approveRequoteShipping", { sale_id: saleId, action: "approve" });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: ["fretePendingRequotes"] });
      queryClient.invalidateQueries({ queryKey: ["freteApprovedRequotes"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["sale"] });
      toast({ title: "Diferença aprovada", description: `Frete de R$ ${data.applied_freight?.toFixed(2)} aplicado. Adicional por erro de cotação: R$ ${data.diff_amount?.toFixed(2)}.` });
    } catch (err) {
      toast({ title: "Erro ao aprovar", description: err.message, variant: "destructive" });
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (saleId) => {
    setApproving(saleId);
    try {
      const reason = rejectReasons[saleId] || "";
      const res = await base44.functions.invoke("approveRequoteShipping", { sale_id: saleId, action: "reject", reason });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: ["fretePendingRequotes"] });
      queryClient.invalidateQueries({ queryKey: ["freteApprovedRequotes"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast({ title: "Recotação rejeitada", description: "O frete original foi mantido." });
      setRejectReasons(prev => { const c = { ...prev }; delete c[saleId]; return c; });
    } catch (err) {
      toast({ title: "Erro ao rejeitar", description: err.message, variant: "destructive" });
    } finally {
      setApproving(null);
    }
  };

  const filterFn = (item) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (item.client_name || item.code || item.order_number || "").toLowerCase().includes(q);
  };

  const sellerFiltered = exemptedSales.filter(filterFn);
  const posVendasFiltered = exemptedOS.filter(filterFn);
  const chargedFiltered = chargedOS.filter(filterFn);

  return (
    <div className="space-y-4">
      <PageHeader title="Dashboard de Fretes" description="Isenções de frete pelo vendedor, trocas de transportadora e isenções do pós-vendas" />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> Isenções Vendedor</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">{fmtMoney(totalSellerExempt)}</div>
            <div className="text-xs text-muted-foreground">{exemptedSales.length} venda(s)</div>
          </CardContent>
        </Card>
        <Card className="border-violet-200 bg-violet-50/30">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Isenções Pós-Vendas</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-violet-700">{fmtMoney(totalPosVendasExempt)}</div>
            <div className="text-xs text-muted-foreground">{exemptedOS.length} OS(s)</div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Receipt className="h-3 w-3" /> Cobrado do Cliente</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{fmtMoney(totalCharged)}</div>
            <div className="text-xs text-muted-foreground">{chargedOS.length} OS(s)</div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Truck className="h-3 w-3" /> Trocas de Transportadora</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{totalCarrierChanges}</div>
            <div className="text-xs text-muted-foreground">total de trocas</div>
          </CardContent>
        </Card>
        <Card className="border-rose-200 bg-rose-50/30">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Adicionais por Erro de Cotação</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-700">{fmtMoney(totalRequoteDiff)}</div>
            <div className="text-xs text-muted-foreground">{approvedRequotes.length} recotação(ões) aprovada(s)</div>
          </CardContent>
        </Card>
      </div>

      {/* Pending requote approvals (admin only) */}
      {isAdmin && pendingRequotes.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-amber-600" /> Recotações Aguardando Aprovação ({pendingRequotes.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {loadingPending ? (
              <div className="p-4 text-sm text-muted-foreground">Carregando...</div>
            ) : (
              <div className="divide-y">
                {pendingRequotes.map(sale => (
                  <div key={sale.id} className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm">{sale.client_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{sale.order_number} — solicitado por {sale.requote_requested_by} em {fmtDateTime(sale.requote_requested_date)}</div>
                      </div>
                      <Badge className="bg-amber-100 text-amber-700 border-transparent whitespace-nowrap">
                        +{fmtMoney(sale.requote_diff_amount)}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs bg-muted/30 rounded p-2">
                      <div>
                        <div className="text-muted-foreground">Original</div>
                        <div className="font-medium">{fmtMoney(sale.requote_original_freight)} ({sale.requote_original_volumes_count} vol.)</div>
                        {sale.requote_original_carrier && <div className="text-muted-foreground truncate">{sale.requote_original_carrier}</div>}
                      </div>
                      <div>
                        <div className="text-muted-foreground">Novo</div>
                        <div className="font-medium">{fmtMoney(sale.requote_new_freight)} ({sale.requote_new_volumes_count} vol.)</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Diferença</div>
                        <div className="font-medium text-rose-600">+{fmtMoney(sale.requote_diff_amount)}</div>
                        <div className="text-muted-foreground">erro de cotação</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Motivo da rejeição (opcional)"
                        value={rejectReasons[sale.id] || ""}
                        onChange={e => setRejectReasons(prev => ({ ...prev, [sale.id]: e.target.value }))}
                        className="h-8 text-xs flex-1"
                        disabled={approving === sale.id}
                      />
                      <Button
                        variant="destructive"
                        size="sm"
                        className="gap-1"
                        onClick={() => handleReject(sale.id)}
                        disabled={approving === sale.id}
                      >
                        {approving === sale.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />} Rejeitar
                      </Button>
                      <Button
                        size="sm"
                        className="gap-1"
                        onClick={() => handleApprove(sale.id)}
                        disabled={approving === sale.id}
                      >
                        {approving === sale.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Aprovar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Input placeholder="Buscar por cliente, código OS ou pedido..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" />

      {/* Seller exemptions */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4 text-emerald-600" /> Isenções de Frete pelo Vendedor</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loadingSales ? (
            <div className="p-4 text-sm text-muted-foreground">Carregando...</div>
          ) : sellerFiltered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Nenhuma isenção de frete pelo vendedor.</div>
          ) : (
            <div className="divide-y">
              {sellerFiltered.map(sale => (
                <div key={sale.id} className="flex items-center justify-between gap-2 p-3 text-sm hover:bg-muted/30">
                  <div className="min-w-0">
                    <div className="font-medium">{sale.client_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{sale.order_number} — {fmtDate(sale.date)}</div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Badge className="bg-emerald-100 text-emerald-700 border-transparent">{fmtMoney(sale.freight_exempt_value)}</Badge>
                    <span className="text-xs text-muted-foreground">Frete: {fmtMoney(sale.freight)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Post-sales exemptions */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TrendingDown className="h-4 w-4 text-violet-600" /> Isenções de Diferença de Frete (Pós-Vendas)</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loadingOS ? (
            <div className="p-4 text-sm text-muted-foreground">Carregando...</div>
          ) : posVendasFiltered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Nenhuma isenção de diferença pelo pós-vendas.</div>
          ) : (
            <div className="divide-y">
              {posVendasFiltered.map(os => (
                <div key={os.id} className="flex items-center justify-between gap-2 p-3 text-sm hover:bg-muted/30">
                  <div className="min-w-0">
                    <div className="font-medium">{os.client_name || "—"}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <span>{os.code}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span className="line-through">{os.original_selected_carrier}</span>
                      <span>→ {os.original_selected_service ? "" : ""}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{os.freight_change_reason}</div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Badge className="bg-violet-100 text-violet-700 border-transparent">Isentado {fmtMoney(os.freight_diff_exempt_value)}</Badge>
                    <span className="text-xs text-muted-foreground">{os.freight_changed_by}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charged to customer */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Receipt className="h-4 w-4 text-amber-600" /> Diferenças Cobradas do Cliente</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loadingCharged ? (
            <div className="p-4 text-sm text-muted-foreground">Carregando...</div>
          ) : chargedFiltered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Nenhuma diferença cobrada do cliente.</div>
          ) : (
            <div className="divide-y">
              {chargedFiltered.map(os => (
                <div key={os.id} className="flex items-center justify-between gap-2 p-3 text-sm hover:bg-muted/30">
                  <div className="min-w-0">
                    <div className="font-medium">{os.client_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {os.code} — {os.original_selected_carrier} → {fmtMoney(os.original_freight_value)} + {fmtMoney(os.freight_diff_amount)}
                    </div>
                    <div className="text-xs text-muted-foreground">{os.freight_change_reason}</div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Badge className="bg-amber-100 text-amber-700 border-transparent">{fmtMoney(os.freight_diff_amount)}</Badge>
                    <span className="text-xs text-muted-foreground">{os.freight_diff_payment_method}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Requote diffs approved (Adicionais por Erro de Cotação) */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4 text-rose-600" /> Adicionais por Erro de Cotação (Recotações Aprovadas)</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loadingApproved ? (
            <div className="p-4 text-sm text-muted-foreground">Carregando...</div>
          ) : approvedRequotes.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Nenhuma recotação aprovada.</div>
          ) : (
            <div className="divide-y">
              {approvedRequotes.map(sale => (
                <div key={sale.id} className="flex items-center justify-between gap-2 p-3 text-sm hover:bg-muted/30">
                  <div className="min-w-0">
                    <div className="font-medium">{sale.client_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {sale.order_number} — {sale.requote_original_volumes_count} → {sale.requote_new_volumes_count} volumes
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fmtMoney(sale.requote_original_freight)} → {fmtMoney(sale.requote_new_freight)} • Aprovado por {sale.requote_approved_by} em {fmtDateTime(sale.requote_approved_date)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Badge className="bg-rose-100 text-rose-700 border-transparent">+{fmtMoney(sale.requote_diff_amount)}</Badge>
                    <span className="text-xs text-muted-foreground">erro de cotação</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}