import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function PurchaseAdvanceDialog({ purchaseOrder, open, onOpenChange, onDone }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: chartAccounts = [] } = useQuery({
    queryKey: ["chartOfAccounts"],
    queryFn: () => base44.entities.ChartOfAccount.list("-code", 500),
  });

  useEffect(() => {
    if (purchaseOrder && open) {
      setAmount(""); setDueDate(new Date().toISOString().slice(0, 10)); setNotes("");
    }
  }, [purchaseOrder, open]);

  if (!purchaseOrder) return null;

  const handleConfirm = async () => {
    const coa = chartAccounts.find(a => a.code === "1206");
    setSaving(true);
    try {
      const payable = await base44.entities.AccountPayable.create({
        description: `Antecipação ${purchaseOrder.code} — ${purchaseOrder.supplier_name}`,
        category: "Fornecedor",
        chart_of_account_id: coa?.id || null,
        chart_of_account_code: coa?.code || "1206",
        chart_of_account_name: coa?.name || "Adiantamento de Fornecedor",
        supplier_name: purchaseOrder.supplier_name,
        supplier_document: purchaseOrder.supplier_document || "",
        amount: parseFloat(amount) || 0,
        due_date: dueDate,
        status: "Em Aberto",
        notes: notes || `Entrada para produção — Pedido ${purchaseOrder.code}`,
        purchase_order_id: purchaseOrder.id,
        purchase_order_code: purchaseOrder.code,
      });
      await base44.entities.PurchaseOrder.update(purchaseOrder.id, { advance_payable_id: payable.id });
      queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] });
      queryClient.invalidateQueries({ queryKey: ["accountsPayable"] });
      onDone();
      onOpenChange(false);
    } catch (err) {
      alert("Erro: " + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Antecipação de Pagamento ao Fornecedor</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border p-3 bg-muted/30 text-sm">
            <p><span className="text-muted-foreground">Pedido: </span><span className="font-mono font-semibold">{purchaseOrder.code}</span></p>
            <p><span className="text-muted-foreground">Fornecedor: </span>{purchaseOrder.supplier_name}</p>
            <p className="text-xs text-muted-foreground mt-1">Categorizado em 1206 — Adiantamento de Fornecedor</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Valor da Entrada (R$) *</Label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Vencimento *</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: entrada para iniciar produção" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={saving || !amount} className="gap-1">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Gerar Conta a Pagar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}