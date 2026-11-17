import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, CheckCircle, ExternalLink, Clock, Eye, XCircle, BadgeCheck, Receipt, Wrench, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import SaleApprovalDialog from "@/components/receivables/SaleApprovalDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/use-toast";
import { usePermissions } from "@/lib/permissions";

export default function SaleConfirmations() {
  const [tab, setTab] = useState("confirmacao");
  const [search, setSearch] = useState("");
  const [selectedSale, setSelectedSale] = useState(null);
  const [reproveTarget, setReproveTarget] = useState(null);
  const [reproveReason, setReproveReason] = useState("");
  const [postReproveTarget, setPostReproveTarget] = useState(null);
  const [postReproveReason, setPostReproveReason] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canConfirmSale } = usePermissions();

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales", "confirmations"],
    queryFn: () => base44.entities.Sale.filter({ stage: { $in: ["Confirmada", "Em OS"] } }, "-created_date", 1000),
  });

  const { data: serviceOrders = [] } = useQuery({
    queryKey: ["serviceOrders"],
    queryFn: () => base44.entities.ServiceOrder.list("-created_date", 2000),
  });

  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const osBySale = {};
  for (const os of serviceOrders) {
    if (os.sale_id) {
      if (!osBySale[os.sale_id]) osBySale[os.sale_id] = [];
      osBySale[os.sale_id].push(os);
    }
  }

  const approveMutation = useMutation({
    mutationFn: async (saleId) => {
      await base44.entities.Sale.update(saleId, { stage: "Pagamento Aprovado" });
      // Financeiro aprovou: gera a OS quando ela ainda não existe —
      // se já existe (venda parcial recolhida para análise), apenas libera/restaura
      const existingOS = await base44.entities.ServiceOrder.filter({ sale_id: saleId });
      if (existingOS.length === 0) {
        try {
          await base44.functions.invoke("generateServiceOrder", { sale_id: saleId });
        } catch (_e) { /* OS já pode existir */ }
      }
      const osList = await base44.entities.ServiceOrder.filter({ sale_id: saleId });
      for (const os of osList) {
        const payload = {
          financial_approved_by: currentUser?.full_name || "Financeiro",
          financial_approval_date: new Date().toISOString(),
        };
        // Venda parcial recolhida para análise financeira: restaura o status operacional anterior
        if (os.status === "Aprovação Financeira" && os.financial_hold_previous_status) {
          payload.status = os.financial_hold_previous_status;
        }
        await base44.entities.ServiceOrder.update(os.id, payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      toast({ title: "Pagamento aprovado — OS liberada para estoque/produção" });
    },
    onError: (err) => toast({ title: "Erro ao confirmar", description: err.message, variant: "destructive" }),
  });

  const reproveMutation = useMutation({
    mutationFn: async ({ saleId, reason }) => {
      await base44.entities.Sale.update(saleId, { stage: "Orçamento" });
      const osList = await base44.entities.ServiceOrder.filter({ sale_id: saleId });
      for (const os of osList) {
        if (os.status === "Produção/Expedição") {
          await base44.entities.ServiceOrder.update(os.id, { status: "Cancelada" });
        }
      }
      const sale = sales.find(s => s.id === saleId);
      try {
        await base44.functions.invoke("alerts", {
          action: "create",
          seller_id: sale?.seller_id,
          user_name: sale?.seller_name || "",
          type: "Reprovação Financeira",
          title: `Pedido ${sale?.order_number || ""} reprovado pelo financeiro`,
          message: reason || "Seu pedido foi reprovado na análise financeira. Abra o pedido para ajustar a condição de pagamento.",
          related_sale_id: saleId,
          related_order_number: sale?.order_number || "",
        });
      } catch (_e) { /* ignora falha no alerta */ }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["my-alerts"] });
      toast({ title: "Venda reprovada — retornada para o comercial" });
    },
    onError: (err) => toast({ title: "Erro ao reprovar", description: err.message, variant: "destructive" }),
  });

  const hasAllReceipts = (sale) => (sale.payments || []).filter(p => p.payment_status === "Realizada").every(p => p.receipt_url);

  // Regra obrigatória: o pedido só entra em Confirmações de Venda com comprovante de
  // pagamento anexado — todas as parcelas marcadas como "Realizada" precisam de comprovante
  const hasPaymentEvidence = (sale) => {
    const realizadas = (sale.payments || []).filter(p => p.payment_status === "Realizada");
    return realizadas.length > 0 && realizadas.every(p => p.receipt_url);
  };

  // Total e Parcial: aguardam aprovação financeira — a OS só é liberada após o Confirmar
  const pendingConfirm = sales.filter(s =>
    s.stage === "Confirmada" && hasPaymentEvidence(s)
  );

  const totalPending = pendingConfirm.reduce((sum, s) => sum + (s.grand_total || 0), 0);

  const filtered = pendingConfirm.filter(s =>
    !search || s.client_name?.toLowerCase().includes(search.toLowerCase()) || s.order_number?.toLowerCase().includes(search.toLowerCase())
  );

  // OS aguardando aprovação financeira pós-rota (técnico recebeu pagamento na casa do cliente)
  const TECHNICIAN_TYPES = ["Entrega", "Entrega + Instalação", "Manutenção"];
  const postRouteApproval = serviceOrders.filter((o) =>
    (o.status === "OK - Aprov. Financeira" || o.status === "Aguardando Faturamento - Pós") && TECHNICIAN_TYPES.includes(o.type) && !o.finance_rejected
  );
  // Helpers: valor recebido e comprovantes da venda (fallback quando a OS não tem dados do técnico)
  const getSaleReceivedAmount = (sale) =>
    (sale?.payments || []).filter(p => p.payment_status === "Realizada").reduce((sum, p) => sum + (p.amount || 0), 0);

  const getOsDisplayAmount = (o) => {
    const sale = sales.find(s => s.id === o.sale_id);
    const saleReceived = getSaleReceivedAmount(sale);
    if (o.received_amount > 0) return o.received_amount;
    if (saleReceived > 0) return saleReceived;
    return o.pending_payment_amount || 0;
  };

  const postRouteFiltered = postRouteApproval.filter((o) =>
    !search || o.client_name?.toLowerCase().includes(search.toLowerCase()) || o.code?.toLowerCase().includes(search.toLowerCase()) || o.sale_order_number?.toLowerCase().includes(search.toLowerCase())
  );
  const postRouteTotal = postRouteApproval.reduce((sum, o) => sum + getOsDisplayAmount(o), 0);

  const approvePostRouteMutation = useMutation({
    mutationFn: async (osId) => {
      await base44.functions.invoke("updateOsStatus", {
        os_id: osId,
        updates: { status: "Aguardando Faturamento Final" },
        expected_status: null,
        source: "Confirmações de Venda — aprovação financeira pós-rota",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast({ title: "Aprovação financeira concluída", description: "A OS foi liberada para faturamento final." });
    },
    onError: (err) => toast({ title: "Erro ao aprovar", description: err?.message, variant: "destructive" }),
  });

  // Financeiro reprovou a OS pós-rota: volta ao pós-venda ("Aguardando Faturamento - Pós")
  // com a flag de reprovação + motivo. Some da lista do financeiro até o pós-venda reenviar.
  const reprovePostRouteMutation = useMutation({
    mutationFn: async ({ osId, reason }) => {
      const result = await base44.functions.invoke("updateOsStatus", {
        os_id: osId,
        updates: {
          status: "Aguardando Faturamento - Pós",
          finance_rejected: true,
          finance_rejected_reason: reason,
          finance_rejected_by: currentUser?.full_name || "Financeiro",
          finance_rejected_date: new Date().toISOString(),
        },
        expected_status: null,
        notes: `Reprovado pelo financeiro: ${reason}`,
        source: "Confirmações de Venda — reprovação financeira pós-rota",
      });
      const body = result?.data || result;
      if (!body.success) throw new Error(body.message || "Não foi possível reprovar a OS.");
      // Alerta automático para todo o pós-vendas
      const os = body.os || serviceOrders.find((o) => o.id === osId);
      try {
        await base44.functions.invoke("alerts", {
          action: "create",
          target_role: "pos_vendas",
          type: "Reprovação Financeira",
          title: `OS ${os?.code || ""} reprovada pelo financeiro`,
          message: reason || "O pedido foi reprovado na análise financeira pós-rota. Corrija os dados e reenvie ao financeiro.",
          related_sale_id: os?.sale_id || "",
          related_order_number: os?.sale_order_number || "",
        });
      } catch (_e) { /* ignora falha no alerta */ }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["my-alerts"] });
      toast({ title: "OS reprovada e retornada ao pós-venda", description: "O pós-venda verá o motivo, poderá corrigir e reenviar ao financeiro." });
    },
    onError: (err) => toast({ title: "Erro ao reprovar", description: err?.message, variant: "destructive" }),
  });

  const renderPayments = (sale) => {
    const payments = sale.payments || [];
    if (payments.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
    return (
      <div className="space-y-1">
        {payments.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <Badge variant="outline" className={p.payment_status === "Realizada" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}>
              {p.payment_status}
            </Badge>
            <span>R$ {(p.amount || 0).toFixed(2)}</span>
            <span className="text-muted-foreground">{p.condition_name}</span>
            {p.payment_moment && <span className="text-muted-foreground">({p.payment_moment})</span>}
            {p.receipt_url && (
              <a href={p.receipt_url} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-0.5">
                <ExternalLink className="h-3 w-3" /> Comp.
              </a>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="Aprovação Financeira" description="Confirmação de pedidos (antes da OS) e aprovação pós-rota (pagamento recebido pelo técnico na casa do cliente) — tudo no financeiro" />

      <div className="mb-4 flex items-center gap-4 flex-wrap">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="confirmacao" className="gap-1">
              <Clock className="h-3.5 w-3.5" /> Antes da OS ({pendingConfirm.length})
            </TabsTrigger>
            <TabsTrigger value="pos-rota" className="gap-1">
              <Wrench className="h-3.5 w-3.5" /> Pós-Rota de Técnico ({postRouteApproval.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por cliente, pedido ou OS..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      {tab === "confirmacao" ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-amber-600" />
                <span className="text-xs text-muted-foreground uppercase">Aguardando Confirmação</span>
              </div>
              <p className="text-2xl font-bold">R$ {totalPending.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{pendingConfirm.length} venda(s) — análise financeira pendente</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                <span className="text-xs text-muted-foreground uppercase">Fluxo</span>
              </div>
              <p className="text-sm font-medium pt-1">Pedido (Total ou Parcial) → Comprovante anexado → Aprovação Financeira → OS (Estoque/Produção) → Faturamento</p>
              <p className="text-xs text-muted-foreground mt-1">Sem comprovante de pagamento anexado, o pedido não aparece aqui nem gera OS</p>
            </Card>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <EmptyState title="Nenhuma confirmação pendente" description="Nenhuma venda aguardando análise financeira." />
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Pedido</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Valor Total</TableHead>
                    <TableHead>Pagamentos</TableHead>
                    <TableHead className="text-right">Detalhes</TableHead>
                    <TableHead className="text-right">Confirmação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs font-semibold">{s.order_number}</TableCell>
                      <TableCell>
                        {(osBySale[s.id] || []).map(os => (
                          <div key={os.id} className="flex items-center gap-1">
                            <span className="font-mono text-xs">{os.code}</span>
                            <Badge variant="outline" className="text-[10px] py-0">{os.type}</Badge>
                          </div>
                        ))}
                      </TableCell>
                      <TableCell className="font-medium">{s.client_name}</TableCell>
                      <TableCell>R$ {(s.grand_total || 0).toFixed(2)}</TableCell>
                      <TableCell>{renderPayments(s)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedSale(s)} className="gap-1">
                          <Eye className="h-3 w-3" /> Ver
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        {canConfirmSale ? (
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setReproveTarget(s); setReproveReason(""); }}
                              disabled={reproveMutation.isPending}
                              className="gap-1 text-destructive hover:bg-destructive/5"
                            >
                              <XCircle className="h-3 w-3" /> Reprovar
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => approveMutation.mutate(s.id)}
                              disabled={approveMutation.isPending || !hasAllReceipts(s)}
                              className="gap-1"
                              title={!hasAllReceipts(s) ? "Anexe o comprovante dos pagamentos realizados antes de aprovar" : "Confirmar venda"}
                            >
                              <CheckCircle className="h-3 w-3" /> Confirmar
                            </Button>
                          </div>
                        ) : (
                          <Badge variant="outline" className="bg-muted text-muted-foreground">Somente visualização</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <BadgeCheck className="h-4 w-4 text-blue-600" />
                <span className="text-xs text-muted-foreground uppercase">Aguardando Aprovação Pós-Rota</span>
              </div>
              <p className="text-2xl font-bold">R$ {postRouteTotal.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{postRouteApproval.length} OS(s) — técnico recebeu pagamento, financeiro precisa conferir</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Wrench className="h-4 w-4 text-violet-600" />
                <span className="text-xs text-muted-foreground uppercase">Fluxo Pós-Rota</span>
              </div>
              <p className="text-sm font-medium pt-1">Técnico conclui → Pós-venda revisa → Aprovação Financeira (lançar caixa + conferir comprovante) → Faturamento Final</p>
              <p className="text-xs text-muted-foreground mt-1">O técnico recebeu o dinheiro na casa do cliente — o financeiro confere e libera para faturar</p>
            </Card>
          </div>

          {postRouteFiltered.length === 0 ? (
            <EmptyState
              icon={BadgeCheck}
              title="Nenhuma OS aguardando aprovação pós-rota"
              description="Quando o técnico recebe pagamento na casa do cliente, a OS vem para cá após a revisão do pós-venda. O financeiro lança o caixa, confere o comprovante e libera para faturamento."
            />
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>OS</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Técnico</TableHead>
                    <TableHead>Valor Recebido</TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead>Comprovante</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {postRouteFiltered.map((o) => {
                    const sale = sales.find(s => s.id === o.sale_id);
                    const tosReceipt = o.payment_receipt_url;
                    const saleReceipts = (sale?.payments || []).filter(p => p.receipt_url).map(p => p.receipt_url);
                    const allReceipts = tosReceipt ? [tosReceipt, ...saleReceipts] : saleReceipts;
                    const displayAmount = getOsDisplayAmount(o);
                    const saleMethods = (sale?.payments || [])
                      .filter(p => p.payment_status === "Realizada")
                      .map(p => p.condition_name)
                      .filter(Boolean);
                    const displayMethod = o.received_method || saleMethods.join(", ") || "—";
                    const saleTotal = sale?.grand_total || 0;
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-xs font-semibold">{o.code}</TableCell>
                        <TableCell className="font-mono text-xs">{o.sale_order_number || "—"}</TableCell>
                        <TableCell className="font-medium text-sm">{o.client_name}</TableCell>
                        <TableCell className="text-sm">{o.technician || "—"}</TableCell>
                        <TableCell className="text-sm font-medium">
                          R$ {displayAmount.toFixed(2)}
                          {saleTotal > 0 && displayAmount !== saleTotal && (
                            <div className="text-[10px] text-muted-foreground">Venda: R$ {saleTotal.toFixed(2)}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{displayMethod}</TableCell>
                        <TableCell>
                          {allReceipts.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {allReceipts.map((url, i) => (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                  <Receipt className="h-3.5 w-3.5" /> {allReceipts.length > 1 ? `Comp. ${i + 1}` : "Ver comprovante"}
                                </a>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {canConfirmSale ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1"
                                  disabled={approvePostRouteMutation.isPending || reprovePostRouteMutation.isPending}
                                >
                                  <MoreHorizontal className="h-4 w-4" /> Ações
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => approvePostRouteMutation.mutate(o.id)} className="gap-1 text-emerald-700">
                                  <BadgeCheck className="h-4 w-4" /> Aprovar e Liberar
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => { setPostReproveTarget(o); setPostReproveReason(""); }} className="gap-1 text-destructive">
                                  <XCircle className="h-4 w-4" /> Reprovar e Estornar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <Badge variant="outline" className="bg-muted text-muted-foreground">Somente visualização</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      <SaleApprovalDialog
        sale={selectedSale}
        osList={selectedSale ? (osBySale[selectedSale.id] || []) : []}
        open={!!selectedSale}
        onOpenChange={(v) => !v && setSelectedSale(null)}
        onApprove={canConfirmSale && selectedSale ? () => {
          approveMutation.mutate(selectedSale.id);
          setSelectedSale(null);
        } : undefined}
        approving={approveMutation.isPending}
        onReprove={canConfirmSale && selectedSale ? () => {
          setReproveTarget(selectedSale);
          setReproveReason("");
          setSelectedSale(null);
        } : undefined}
        reprovePending={reproveMutation.isPending}
      />

      <Dialog open={!!reproveTarget} onOpenChange={(v) => !v && setReproveTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><XCircle className="h-4 w-4 text-destructive" /> Reprovar Pedido</DialogTitle>
            <DialogDescription>
              O pedido <strong className="font-mono text-foreground">{reproveTarget?.order_number}</strong> de <strong className="text-foreground">{reproveTarget?.seller_name || "—"}</strong> será retornado ao orçamento. O vendedor receberá um alerta com o motivo informado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Motivo da reprovação *</Label>
              <Textarea rows={4} value={reproveReason} onChange={e => setReproveReason(e.target.value)} placeholder="Ex: comprovante de pagamento não anexado; valor divergente do recebido; condição de pagamento incorreta." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReproveTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={reproveMutation.isPending || !reproveReason.trim()}
              onClick={() => {
                if (reproveTarget) reproveMutation.mutate({ saleId: reproveTarget.id, reason: reproveReason.trim() });
                setReproveTarget(null);
              }}
              className="gap-1"
            >
              <XCircle className="h-4 w-4" /> Confirmar Reprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!postReproveTarget} onOpenChange={(v) => !v && setPostReproveTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><XCircle className="h-4 w-4 text-destructive" /> Reprovar e Estornar</DialogTitle>
            <DialogDescription>
              A OS <strong className="font-mono text-foreground">{postReproveTarget?.code}</strong> de <strong className="text-foreground">{postReproveTarget?.client_name || "—"}</strong> retorna ao pós-venda para análise, com o motivo informado. Ela sai da sua lista até o pós-venda corrigir e reenviar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Motivo da reprovação *</Label>
              <Textarea rows={4} value={postReproveReason} onChange={e => setPostReproveReason(e.target.value)} placeholder="Ex: comprovante divergente do valor recebido; forma de pagamento não registrada; valor lançado no caixa incorreto." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPostReproveTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={reprovePostRouteMutation.isPending || !postReproveReason.trim()}
              onClick={() => {
                if (postReproveTarget) reprovePostRouteMutation.mutate({ osId: postReproveTarget.id, reason: postReproveReason.trim() });
                setPostReproveTarget(null);
              }}
              className="gap-1"
            >
              <XCircle className="h-4 w-4" /> Confirmar Reprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}