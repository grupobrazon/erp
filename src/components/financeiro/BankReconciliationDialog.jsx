import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowDownCircle, ArrowUpCircle, CheckCircle, Loader2, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function BankReconciliationDialog({ transaction, open, onOpenChange, onReconciled }) {
  const [selectedId, setSelectedId] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const queryClient = useQueryClient();

  const isEntrada = transaction?.direction === "Entrada";

  const { data: sales = [] } = useQuery({
    queryKey: ["sales"],
    queryFn: () => base44.entities.Sale.list("-created_date", 500),
    enabled: isEntrada && open,
  });

  const { data: payables = [] } = useQuery({
    queryKey: ["accountsPayable", "open"],
    queryFn: () => base44.entities.AccountPayable.filter({ status: "Em Aberto" }),
    enabled: !isEntrada && open,
  });

  const pendingPayments = [];
  if (isEntrada) {
    for (const s of sales) {
      for (let i = 0; i < (s.payments || []).length; i++) {
        if (s.payments[i].payment_status === "Pendente") {
          pendingPayments.push({ sale: s, payment: s.payments[i], index: i });
        }
      }
    }
  }

  const matches = isEntrada ? pendingPayments : payables.map(p => ({ payable: p }));
  const txAmount = transaction?.amount || 0;
  const withMatch = matches.map(m => {
    const amt = isEntrada ? m.payment.amount : m.payable.amount;
    return { ...m, exactMatch: Math.abs((amt || 0) - txAmount) < 0.01 };
  });
  const sortedMatches = [...withMatch].sort((a, b) => (b.exactMatch ? 1 : 0) - (a.exactMatch ? 1 : 0));

  useEffect(() => {
    if (!open || selectedId) return;
    const firstExact = withMatch.find(m => m.exactMatch);
    if (firstExact) setSelectedId(isEntrada ? firstExact.sale.id : firstExact.payable.id);
  }, [open, withMatch.length]);

  const handleReconcile = async () => {
    if (!selectedId || !transaction) return;
    setReconciling(true);
    try {
      if (isEntrada) {
        const match = pendingPayments.find(p => p.sale.id === selectedId);
        if (!match) return;
        const updatedPayments = [...match.sale.payments];
        updatedPayments[match.index] = { ...updatedPayments[match.index], payment_status: "Realizada" };
        await base44.entities.Sale.update(match.sale.id, { payments: updatedPayments });
        await base44.entities.BankTransaction.update(transaction.id, {
          reconciled: true,
          reconciled_with_type: "receivable",
          reconciled_with_id: match.sale.id,
          reconciled_with_label: `${match.sale.order_number} — ${match.sale.client_name}`,
          source_type: "Recebimento",
        });
      } else {
        const payable = payables.find(p => p.id === selectedId);
        if (!payable) return;
        await base44.entities.AccountPayable.update(payable.id, {
          status: "Pago",
          payment_date: transaction.date,
          reconciled_transaction_id: transaction.id,
        });
        await base44.entities.BankTransaction.update(transaction.id, {
          reconciled: true,
          reconciled_with_type: "payable",
          reconciled_with_id: payable.id,
          reconciled_with_label: payable.description,
          source_type: "Pagamento",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["bankTransactions"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["accountsPayable"] });
      onReconciled();
      onOpenChange(false);
      setSelectedId("");
    } catch (err) {
      console.error(err);
    } finally {
      setReconciling(false);
    }
  };

  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSelectedId(""); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEntrada ? <ArrowDownCircle className="h-5 w-5 text-emerald-600" /> : <ArrowUpCircle className="h-5 w-5 text-rose-600" />}
            Conciliação Bancária
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border p-3 bg-muted/30 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data:</span>
              <span className="font-medium">{transaction.date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Descrição:</span>
              <span className="font-medium">{transaction.description}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor:</span>
              <span className={`font-bold text-base ${isEntrada ? "text-emerald-600" : "text-rose-600"}`}>
                {isEntrada ? "+" : "−"} R$ {(transaction.amount || 0).toFixed(2)}
              </span>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">
              {isEntrada ? "Selecione o recebimento correspondente:" : "Selecione a conta a pagar correspondente:"}
            </p>
            {matches.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg">
                Nenhum registro pendente para conciliação.
              </div>
            ) : (
              <ScrollArea className="h-64 rounded-lg border">
                <div className="divide-y">
                  {sortedMatches.map((m) => {
                    const id = isEntrada ? m.sale.id : m.payable.id;
                    const label = isEntrada
                      ? `${m.sale.order_number} — ${m.sale.client_name}`
                      : m.payable.description;
                    const subLabel = isEntrada
                      ? m.payment.condition_name
                      : `${m.payable.category} • ${m.payable.supplier_name || "—"}`;
                    const amount = isEntrada ? m.payment.amount : m.payable.amount;
                    const dueDate = isEntrada ? null : m.payable.due_date;
                    return (
                      <label
                        key={id}
                        className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/50 ${selectedId === id ? "bg-accent" : ""}`}
                        onClick={() => setSelectedId(id)}
                      >
                        <input type="radio" checked={selectedId === id} readOnly className="accent-primary" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{label}</p>
                            {m.exactMatch && (
                              <Badge className="bg-accent/20 text-accent border-transparent text-[10px] gap-1 shrink-0">
                                <Sparkles className="h-2.5 w-2.5" /> Sugestão
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{subLabel}{dueDate ? ` • Venc: ${dueDate}` : ""}</p>
                        </div>
                        <span className="text-sm font-bold whitespace-nowrap">R$ {(amount || 0).toFixed(2)}</span>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleReconcile} disabled={!selectedId || reconciling || matches.length === 0} className="gap-1">
            {reconciling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Confirmar Conciliação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}