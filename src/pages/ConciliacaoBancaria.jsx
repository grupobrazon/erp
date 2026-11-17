import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDownCircle, ArrowUpCircle, Plus, X, ArrowLeftRight, CheckCircle, Link2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import BankReconciliationDialog from "@/components/financeiro/BankReconciliationDialog";
import OfxImportDialog from "@/components/financeiro/OfxImportDialog";

export default function ConciliacaoBancaria() {
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [subtab, setSubtab] = useState("conciliar");
  const [showForm, setShowForm] = useState(false);
  const [reconcileTarget, setReconcileTarget] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    amount: "",
    direction: "Entrada",
    description: "",
  });
  const queryClient = useQueryClient();

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bankAccounts"],
    queryFn: () => base44.entities.BankAccount.list("-created_date", 100),
  });

  useEffect(() => {
    if (bankAccounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(bankAccounts[0].id);
    }
  }, [bankAccounts]);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["bankTransactions", selectedAccountId],
    queryFn: () => base44.entities.BankTransaction.filter({ bank_account_id: selectedAccountId }, "-date", 500),
    enabled: !!selectedAccountId,
  });

  const createTxMut = useMutation({
    mutationFn: (data) => base44.entities.BankTransaction.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bankTransactions"] });
      resetForm();
    },
  });

  const deleteTxMut = useMutation({
    mutationFn: (id) => base44.entities.BankTransaction.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bankTransactions"] }),
  });

  const resetForm = () => {
    setForm({ date: new Date().toISOString().split("T")[0], amount: "", direction: "Entrada", description: "" });
    setShowForm(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const account = bankAccounts.find(b => b.id === selectedAccountId);
    createTxMut.mutate({
      ...form,
      amount: parseFloat(form.amount) || 0,
      bank_account_id: selectedAccountId,
      bank_account_name: account?.name || "",
      source_type: "Manual",
    });
  };

  const selectedAccount = bankAccounts.find(b => b.id === selectedAccountId);
  const unreconciled = transactions.filter(t => !t.reconciled);
  const reconciled = transactions.filter(t => t.reconciled);

  const totalEntradas = unreconciled.filter(t => t.direction === "Entrada").reduce((s, t) => s + (t.amount || 0), 0);
  const totalSaidas = unreconciled.filter(t => t.direction === "Saída").reduce((s, t) => s + (t.amount || 0), 0);
  const totalReconciledIn = reconciled.filter(t => t.direction === "Entrada").reduce((s, t) => s + (t.amount || 0), 0);
  const totalReconciledOut = reconciled.filter(t => t.direction === "Saída").reduce((s, t) => s + (t.amount || 0), 0);

  const list = subtab === "conciliar" ? unreconciled : reconciled;

  return (
    <div>
      <PageHeader title="Conciliação Bancária" description="Concilie transações bancárias com recebimentos e pagamentos" />

      <div className="mb-6 flex items-center gap-4 flex-wrap">
        <div className="w-72">
          <Label className="text-xs">Conta Bancária</Label>
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger><SelectValue placeholder="Selecione uma conta" /></SelectTrigger>
            <SelectContent>
              {bankAccounts.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {selectedAccount && (
          <div className="text-sm text-muted-foreground pt-5">
            {selectedAccount.bank_name || "—"} • Ag {selectedAccount.agency || "—"} • Cc {selectedAccount.account_number || "—"}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <ArrowDownCircle className="h-4 w-4 text-emerald-600" />
            <span className="text-xs text-muted-foreground uppercase">Entradas (A Conciliar)</span>
          </div>
          <p className="text-xl font-bold text-emerald-600">R$ {totalEntradas.toFixed(2)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpCircle className="h-4 w-4 text-rose-600" />
            <span className="text-xs text-muted-foreground uppercase">Saídas (A Conciliar)</span>
          </div>
          <p className="text-xl font-bold text-rose-600">R$ {totalSaidas.toFixed(2)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="h-4 w-4 text-blue-600" />
            <span className="text-xs text-muted-foreground uppercase">Recebimentos Conciliados</span>
          </div>
          <p className="text-xl font-bold">R$ {totalReconciledIn.toFixed(2)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="h-4 w-4 text-blue-600" />
            <span className="text-xs text-muted-foreground uppercase">Pagamentos Conciliados</span>
          </div>
          <p className="text-xl font-bold">R$ {totalReconciledOut.toFixed(2)}</p>
        </Card>
      </div>

      <div className="mb-4 flex items-center gap-4 flex-wrap">
        <Tabs value={subtab} onValueChange={setSubtab}>
          <TabsList>
            <TabsTrigger value="conciliar">A Conciliar ({unreconciled.length})</TabsTrigger>
            <TabsTrigger value="conciliado">Conciliado ({reconciled.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex-1" />
        <Button variant="secondary" onClick={() => setShowImport(true)} className="gap-2" disabled={!selectedAccountId}>
          <Upload className="h-4 w-4" /> Importar OFX
        </Button>
        {!showForm ? (
          <Button onClick={() => setShowForm(true)} className="gap-2" disabled={!selectedAccountId}>
            <Plus className="h-4 w-4" /> Nova Transação
          </Button>
        ) : (
          <Button variant="outline" onClick={resetForm} className="gap-2">
            <X className="h-4 w-4" /> Cancelar
          </Button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-4 bg-muted/30 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs">Data *</Label>
              <Input required type="date" value={form.date} onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Direção *</Label>
              <Select value={form.direction} onValueChange={v => setForm(prev => ({ ...prev, direction: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Entrada">Entrada (Recebimento)</SelectItem>
                  <SelectItem value="Saída">Saída (Pagamento)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Valor (R$) *</Label>
              <Input required type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <Label className="text-xs">Descrição *</Label>
              <Input required value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Descrição da transação" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={createTxMut.isPending}>Adicionar Transação</Button>
          </div>
        </form>
      )}

      {!selectedAccountId ? (
        <EmptyState icon={ArrowLeftRight} title="Selecione uma conta bancária" description="Escolha uma conta para visualizar as transações." />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : list.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} title="Nenhuma transação" description={subtab === "conciliar" ? "Nenhuma transação para conciliar." : "Nenhuma transação conciliada."} />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Direção</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Conciliado com</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map(tx => (
                <TableRow key={tx.id}>
                  <TableCell className="text-sm font-mono">{tx.date}</TableCell>
                  <TableCell className="font-medium text-sm">{tx.description}</TableCell>
                  <TableCell>
                    {tx.direction === "Entrada" ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-transparent gap-1">
                        <ArrowDownCircle className="h-3 w-3" /> Entrada
                      </Badge>
                    ) : (
                      <Badge className="bg-rose-100 text-rose-700 border-transparent gap-1">
                        <ArrowUpCircle className="h-3 w-3" /> Saída
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className={`text-right font-medium ${tx.direction === "Entrada" ? "text-emerald-600" : "text-rose-600"}`}>
                    {tx.direction === "Entrada" ? "+" : "−"} R$ {(tx.amount || 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {tx.reconciled ? (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Link2 className="h-3 w-3" /> {tx.reconciled_with_label || "—"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!tx.reconciled ? (
                      <Button size="sm" variant="outline" onClick={() => setReconcileTarget(tx)} className="gap-1">
                        <ArrowLeftRight className="h-3 w-3" /> Conciliar
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" onClick={() => deleteTxMut.mutate(tx.id)}>
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <OfxImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        bankAccountId={selectedAccountId}
        bankAccountName={selectedAccount?.name}
      />

      <BankReconciliationDialog
        transaction={reconcileTarget}
        open={!!reconcileTarget}
        onOpenChange={(v) => !v && setReconcileTarget(null)}
        onReconciled={() => queryClient.invalidateQueries({ queryKey: ["bankTransactions"] })}
      />
    </div>
  );
}