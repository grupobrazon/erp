import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Search, CheckCircle2, FileText, RotateCcw, XCircle, FileDown, Loader2, Eye, Send, Wrench, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import RemessaFormDialog from "@/components/remessa/RemessaFormDialog";
import RemessaViewDialog from "@/components/remessa/RemessaViewDialog";
import CreateRemessaOsDialog from "@/components/remessa/CreateRemessaOsDialog";
import RemessaPriorityAlertDialog from "@/components/remessa/RemessaPriorityAlertDialog";
import { usePermissions } from "@/lib/permissions";
import { openRemessaPdf } from "@/components/remessa/RemessaPdfExport";
import { useToast } from "@/components/ui/use-toast";

const typeColors = {
  "Demonstração": "bg-violet-100 text-violet-700",
  "Remessa": "bg-blue-100 text-blue-700",
  "Consignação": "bg-indigo-100 text-indigo-700",
  "Devolução": "bg-amber-100 text-amber-700",
  "Retorno": "bg-teal-100 text-teal-700",
};

const statusColors = {
  "Rascunho": "bg-gray-100 text-gray-700",
  "Aprovada": "bg-blue-100 text-blue-700",
  "Aguardando Financeiro": "bg-amber-100 text-amber-700",
  "Aprovada Financeiro": "bg-cyan-100 text-cyan-700",
  "Faturada": "bg-emerald-100 text-emerald-700",
  "Cancelada": "bg-red-100 text-red-700",
};

export default function Remessas() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);
  const [viewRemessa, setViewRemessa] = useState(null);
  const [createOsRemessa, setCreateOsRemessa] = useState(null);
  const [priorityRemessa, setPriorityRemessa] = useState(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canBill } = usePermissions();

  const { data: remessas = [], isLoading } = useQuery({
    queryKey: ["remessas"],
    queryFn: () => base44.entities.Remessa.list("-created_date", 200),
  });

  const priorityRank = (r) => (r.priority_alert === "Muito Crítico" ? 2 : r.priority_alert === "Crítico" ? 1 : 0);
  const filtered = remessas
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return r.code?.toLowerCase().includes(q) || r.client_name?.toLowerCase().includes(q) || r.remessa_type?.toLowerCase().includes(q);
    })
    .sort((a, b) => priorityRank(b) - priorityRank(a));

  const reload = () => queryClient.invalidateQueries({ queryKey: ["remessas"] });

  const approve = async (r) => {
    const needsReturn = ["Demonstração", "Consignação"].includes(r.remessa_type);
    try {
      await base44.entities.Remessa.update(r.id, {
        status: "Aguardando Financeiro",
        return_status: needsReturn ? "Pendente Retorno" : "Não Aplicável",
      });
      toast({ title: "Remessa aprovada e enviada para o financeiro" });
      reload();
    } catch (err) {
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    }
  };

  const sendToFinancial = async (r) => {
    try {
      await base44.entities.Remessa.update(r.id, { status: "Aguardando Financeiro" });
      toast({ title: "Remessa enviada para o financeiro" });
      reload();
    } catch (err) {
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    }
  };

  const approveFinancial = async (r) => {
    try {
      const me = await base44.auth.me();
      await base44.entities.Remessa.update(r.id, {
        status: "Aprovada Financeiro",
        financial_approved_by: me?.full_name || me?.email || "—",
        financial_approval_date: new Date().toISOString(),
      });
      toast({ title: "Remessa aprovada pelo financeiro" });
      reload();
    } catch (err) {
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    }
  };

  const markReturned = async (r) => {
    try {
      await base44.entities.Remessa.update(r.id, { return_status: "Retornado", return_date: new Date().toISOString().slice(0, 10) });
      toast({ title: "Remessa marcada como retornada" });
      reload();
    } catch (err) {
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    }
  };

  const cancel = async (r) => {
    if (!confirm("Cancelar esta remessa?")) return;
    try {
      await base44.entities.Remessa.update(r.id, { status: "Cancelada" });
      toast({ title: "Remessa cancelada" });
      reload();
    } catch (err) {
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    }
  };

  const handleDownloadPdf = async (r) => {
    setPdfLoadingId(r.id);
    try {
      const [client, billingLocations] = await Promise.all([
        r.client_id ? base44.entities.Client.get(r.client_id).catch(() => null) : null,
        base44.entities.BillingLocation.list("-created_date", 200).catch(() => []),
      ]);
      const billingLocation = billingLocations.find((l) => l.id === r.billing_location_id) || null;
      openRemessaPdf({ remessa: r, client, billingLocation });
    } catch (err) {
      toast({ title: "Erro ao gerar PDF", description: err?.message || "Falha desconhecida", variant: "destructive" });
    } finally {
      setPdfLoadingId(null);
    }
  };

  const fmtMoney = (v) => `R$ ${(v || 0).toFixed(2)}`;
  const pendingCount = remessas.filter((r) => r.status === "Rascunho").length;
  const finPendingCount = remessas.filter((r) => r.status === "Aguardando Financeiro" || r.status === "Aprovada").length;
  const faturadaCount = remessas.filter((r) => r.status === "Faturada").length;

  return (
    <div>
      <PageHeader title="Remessas" description="Pedidos de operações não-venda: demonstração, remessa, consignação, devolução e retorno">
        <Button onClick={() => setDialogOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Nova Remessa</Button>
      </PageHeader>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Rascunhos</p><p className="text-2xl font-bold text-gray-600">{pendingCount}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Aguardando Financeiro</p><p className="text-2xl font-bold text-amber-600">{finPendingCount}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Faturadas</p><p className="text-2xl font-bold text-emerald-600">{faturadaCount}</p></CardContent></Card>
      </div>

      <div className="mb-6 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por código, cliente ou tipo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhuma remessa" description="Crie sua primeira remessa para demonstração, consignação ou devolução." />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Código</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Retorno</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono text-xs font-semibold">
                    {r.code || "—"}
                    {r.os_code && (
                      <button
                        onClick={() => navigate(`/ordens-servico?os=${r.os_id}`)}
                        className="mt-0.5 flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-blue-700 hover:bg-blue-100 transition-colors"
                        title="Ver OS"
                      >
                        <Wrench className="h-2.5 w-2.5" /> {r.os_code}
                      </button>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="secondary" className={typeColors[r.remessa_type] || ""}>{r.remessa_type}</Badge></TableCell>
                  <TableCell className="font-medium text-sm">{r.client_name || "—"}</TableCell>
                  <TableCell className="text-sm">{r.date || "—"}</TableCell>
                  <TableCell className="text-sm font-medium">{fmtMoney(r.grand_total)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className={statusColors[r.status] || ""}>{r.status}</Badge>
                      {r.priority_alert && (
                        <Badge variant="outline" className={r.priority_alert === "Muito Crítico" ? "bg-red-50 text-red-700 border-red-300 text-xs gap-1" : "bg-amber-50 text-amber-700 border-amber-300 text-xs gap-1"}>
                          <AlertTriangle className="h-3 w-3" /> {r.priority_alert}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {r.return_status === "Retornado" ? (
                      <Badge variant="outline" className="bg-teal-50 text-teal-700 text-xs gap-1"><RotateCcw className="h-3 w-3" /> Retornado</Badge>
                    ) : r.return_status === "Pendente Retorno" ? (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 text-xs">Pendente</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setPriorityRemessa(r)} title="Alerta de prioridade" className={r.priority_alert ? (r.priority_alert === "Muito Crítico" ? "text-red-600" : "text-amber-600") : ""}><AlertTriangle className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setViewRemessa(r)} title="Visualizar"><Eye className="h-4 w-4" /></Button>
                      {r.status === "Rascunho" && (
                        <Button variant="outline" size="sm" onClick={() => approve(r)} className="gap-1"><CheckCircle2 className="h-3 w-3" /> Aprovar</Button>
                      )}
                      {r.status === "Aprovada" && (
                        <Button variant="outline" size="sm" onClick={() => sendToFinancial(r)} className="gap-1"><Send className="h-3 w-3" /> Enviar p/ Financeiro</Button>
                      )}
                      {r.status === "Aguardando Financeiro" && canBill && (
                        <Button variant="default" size="sm" onClick={() => approveFinancial(r)} className="gap-1"><CheckCircle2 className="h-3 w-3" /> Aprovar</Button>
                      )}
                      {r.status === "Aprovada Financeiro" && (
                        <Button variant="default" size="sm" onClick={() => navigate(`/faturamento/remessa/${r.id}`)} className="gap-1"><FileText className="h-3 w-3" /> Faturar</Button>
                      )}
                      {r.status === "Faturada" && (
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/faturamento/remessa/${r.id}`)} className="gap-1"><FileText className="h-3 w-3" /> Ver Nota</Button>
                      )}
                      {r.os_id && (
                        <Button variant="ghost" size="icon" onClick={() => navigate(`/ordens-servico?os=${r.os_id}`)} title={`OS ${r.os_code}`}><Wrench className="h-4 w-4" /></Button>
                      )}
                      {!r.os_id && r.status !== "Rascunho" && r.status !== "Cancelada" && (
                        <Button variant="ghost" size="icon" onClick={() => setCreateOsRemessa(r)} title="Criar OS"><Wrench className="h-4 w-4" /></Button>
                      )}
                      {(["Demonstração", "Consignação"].includes(r.remessa_type) && r.return_status === "Pendente Retorno" && (
                        <Button variant="outline" size="sm" onClick={() => markReturned(r)} className="gap-1"><RotateCcw className="h-3 w-3" /> Retorno</Button>
                      ))}
                      {r.items?.length > 0 && (
                        <Button variant="ghost" size="icon" onClick={() => handleDownloadPdf(r)} title="Baixar PDF da remessa" disabled={pdfLoadingId === r.id}>
                          {pdfLoadingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                        </Button>
                      )}
                      {r.status !== "Cancelada" && r.status !== "Faturada" && (
                        <Button variant="ghost" size="icon" onClick={() => cancel(r)} title="Cancelar"><XCircle className="h-4 w-4 text-destructive" /></Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <RemessaFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={reload} />
      <RemessaViewDialog remessa={viewRemessa} open={!!viewRemessa} onOpenChange={(v) => !v && setViewRemessa(null)} />
      <CreateRemessaOsDialog remessa={createOsRemessa} open={!!createOsRemessa} onOpenChange={(v) => !v && setCreateOsRemessa(null)} onCreated={reload} />
      <RemessaPriorityAlertDialog remessa={priorityRemessa} open={!!priorityRemessa} onOpenChange={(v) => !v && setPriorityRemessa(null)} onSaved={reload} />
    </div>
  );
}