import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, ArrowUpCircle, CheckCircle, Pencil, Trash2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import AccountPayableDialog from "@/components/financeiro/AccountPayableDialog";

export default function ContasPagar() {
  const [subtab, setSubtab] = useState("aberto");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [settleTarget, setSettleTarget] = useState(null);
  const [settleDate, setSettleDate] = useState(new Date().toISOString().split("T")[0]);
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["accountsPayable"],
    queryFn: () => base44.entities.AccountPayable.list("-due_date", 500),
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bankAccounts"],
    queryFn: () => base44.entities.BankAccount.list("-created_date", 100),
  });

  const settleMut = useMutation({
    mutationFn: async ({ id, date }) => {
      await base44.entities.AccountPayable.update(id, {
        status: "Pago",
        payment_date: date,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accountsPayable"] });
      setSettleTarget(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.AccountPayable.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accountsPayable"] }),
  });

  const today = new Date().toISOString().split("T")[0];
  const openItems = items.filter(i => i.status === "Em Aberto");
  const paidItems = items.filter(i => i.status === "Pago");
  const overdueItems = openItems.filter(i => i.due_date && i.due_date < today);

  const totalOpen = openItems.reduce((s, i) => s + (i.amount || 0), 0);
  const totalPaid = paidItems.reduce((s, i) => s + (i.amount || 0), 0);
  const totalOverdue = overdueItems.reduce((s, i) => s + (i.amount || 0), 0);

  const list = subtab === "aberto" ? openItems : paidItems;
  const filtered = list.filter(i =>
    !search || i.description?.toLowerCase().includes(search.toLowerCase()) || i.supplier_name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSettle = () => {
    if (settleTarget) settleMut.mutate({ id: settleTarget.id, date: settleDate });
  };

  return (
    <div>
      <PageHeader title="Contas a Pagar" description="Gestão de contas, fornecedores e pagamentos">
        <Button onClick={() => { setEditingItem(null); setDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Conta
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpCircle className="h-4 w-4 text-amber-600" />
            <span className="text-xs text-muted-foreground uppercase">A Pagar (Em Aberto)</span>
          </div>
          <p className="text-2xl font-bold">R$ {totalOpen.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">{openItems.length} conta(s) em aberto</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            <span className="text-xs text-muted-foreground uppercase">Vencido</span>
          </div>
          <p className="text-2xl font-bold text-rose-600">R$ {totalOverdue.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">{overdueItems.length} conta(s) vencida(s)</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            <span className="text-xs text-muted-foreground uppercase">Pago</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">R$ {totalPaid.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">{paidItems.length} conta(s) pagas</p>
        </Card>
      </div>

      <div className="mb-4 flex items-center gap-4 flex-wrap">
        <Tabs value={subtab} onValueChange={setSubtab}>
          <TabsList>
            <TabsTrigger value="aberto">Em Aberto ({openItems.length})</TabsTrigger>
            <TabsTrigger value="pago">Pago ({paidItems.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por descrição ou fornecedor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={ArrowUpCircle} title="Nada por aqui" description={subtab === "aberto" ? "Nenhuma conta em aberto." : "Nenhuma conta paga."} />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(item => {
                const isOverdue = item.status === "Em Aberto" && item.due_date && item.due_date < today;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.description}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{item.category}</Badge></TableCell>
                    <TableCell className="text-sm">{item.supplier_name || "—"}</TableCell>
                    <TableCell className="text-right font-medium">R$ {(item.amount || 0).toFixed(2)}</TableCell>
                    <TableCell className={`text-sm ${isOverdue ? "text-rose-600 font-medium" : ""}`}>{item.due_date || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.payment_date || "—"}</TableCell>
                    <TableCell>
                      {item.status === "Pago" ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-transparent">Pago</Badge>
                      ) : isOverdue ? (
                        <Badge className="bg-rose-100 text-rose-700 border-transparent">Vencido</Badge>
                      ) : (
                        <Badge variant="outline">Em Aberto</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {item.status === "Em Aberto" && (
                          <Button size="sm" variant="outline" onClick={() => { setSettleTarget(item); setSettleDate(new Date().toISOString().split("T")[0]); }} className="gap-1">
                            <CheckCircle className="h-3 w-3" /> Pagar
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => { setEditingItem(item); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMut.mutate(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AccountPayableDialog open={dialogOpen} onOpenChange={setDialogOpen} editingItem={editingItem} />

      <Dialog open={!!settleTarget} onOpenChange={(v) => !v && setSettleTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento</DialogTitle>
          </DialogHeader>
          {settleTarget && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border p-3 bg-muted/30">
                <p className="font-medium">{settleTarget.description}</p>
                <p className="text-muted-foreground">{settleTarget.supplier_name}</p>
                <p className="font-bold text-base mt-1">R$ {(settleTarget.amount || 0).toFixed(2)}</p>
              </div>
              <div>
                <Label className="text-xs">Data do Pagamento</Label>
                <Input type="date" value={settleDate} onChange={e => setSettleDate(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleTarget(null)}>Cancelar</Button>
            <Button onClick={handleSettle} disabled={settleMut.isPending} className="gap-1">
              <CheckCircle className="h-4 w-4" /> Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}