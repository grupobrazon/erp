import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Calculator, XCircle } from "lucide-react";

const fmt = (v) => `R$ ${(Number(v) || 0).toFixed(2)}`;

/**
 * Ajuste de valor da venda pelo pós-venda quando a OS foi reprovada pelo financeiro
 * (ex: "Valor da venda divergente da OS"). Permite corrigir o valor de cada pagamento
 * da venda — o total geral é recalculado pela diferença — sem estornar o pedido
 * para Orçamento. O reenvio ao financeiro continua sendo feito pela ação
 * "Reenviar ao Financeiro" já existente.
 */
export default function SaleValueAdjustDialog({ open, onOpenChange, order, sale, currentUser, onSaved }) {
  const { toast } = useToast();
  const [amounts, setAmounts] = useState([]);
  const [totalInput, setTotalInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && sale) {
      setAmounts((sale.payments || []).map((p) => Number(p.amount) || 0));
      setTotalInput(String(Number(sale.grand_total) || 0));
    }
  }, [open, sale]);

  if (!open || !sale || !order) return null;

  const currentPaymentsTotal = (sale.payments || []).reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const newPaymentsTotal = amounts.reduce((a, b) => a + (Number(b) || 0), 0);
  const diff = newPaymentsTotal - currentPaymentsTotal;
  const newGrandTotal = (Number(sale.grand_total) || 0) + diff;
  // Total do pedido editável diretamente (quando o erro está no total da venda, não nos pagamentos)
  const totalFromPayments = Number.isNaN(Number(totalInput)) ? null : Number(Number(totalInput).toFixed(2));
  const totalChanged = totalFromPayments !== null && Math.abs(totalFromPayments - (Number(sale.grand_total) || 0)) > 0.009;
  const finalTotal = totalChanged ? totalFromPayments : newGrandTotal;
  const changed = Math.abs(diff) > 0.009 || totalChanged;
  const invalid = amounts.some((a) => a < 0) || (totalFromPayments !== null && totalFromPayments < 0);

  const save = async () => {
    setSaving(true);
    try {
      const payments = (sale.payments || []).map((p, i) => ({
        ...p,
        amount: Number(Number(amounts[i]).toFixed(2)),
      }));
      const now = new Date().toISOString();
      const actor = currentUser?.full_name || currentUser?.email || "";
      await base44.entities.Sale.update(sale.id, {
        payments,
        grand_total: Number(finalTotal.toFixed(2)),
        value_adjust_history: [
          ...(sale.value_adjust_history || []),
          {
            date: now,
            actor,
            order_code: order.code || "",
            previous_payments_total: Number(currentPaymentsTotal.toFixed(2)),
            new_payments_total: Number(newPaymentsTotal.toFixed(2)),
            previous_grand_total: Number(sale.grand_total) || 0,
            new_grand_total: Number(finalTotal.toFixed(2)),
            payments_snapshot: payments.map((p) => ({
              condition_name: p.condition_name || "",
              amount: p.amount,
              payment_status: p.payment_status || "",
            })),
            reason: order.finance_rejected_reason || "",
          },
        ],
      });
      // Auditoria do ajuste no histórico da OS (append-only)
      const history = [...(order.status_history || [])];
      history.push({
        date: now,
        actor,
        source: "Reprovação financeira — ajuste de valor",
        notes: `Valor da venda ajustado: ${fmt(currentPaymentsTotal)} → ${fmt(newPaymentsTotal)} (total geral ${fmt(sale.grand_total)} → ${fmt(finalTotal)})`,
        previous_status: order.status || "",
        new_status: order.status || "",
      });
      await base44.entities.ServiceOrder.update(order.id, { status_history: history });
      toast({
        title: "Valor da venda ajustado",
        description: `Total geral atualizado para ${fmt(finalTotal)}. Reenvie a OS ao financeiro.`,
      });
      onOpenChange(false);
      if (onSaved) onSaved();
    } catch (err) {
      toast({ title: "Erro ao ajustar", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" /> Ajustar Valor da Venda
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {order.finance_rejected && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-800 flex gap-2">
              <XCircle className="h-4 w-4 shrink-0" />
              <div>
                <span className="font-medium">{order.finance_rejected_reason || "Reprovado pelo financeiro"}</span>
                {order.finance_rejected_by ? ` — por ${order.finance_rejected_by}` : ""}
              </div>
            </div>
          )}

          {Number(order.received_amount) > 0 && (
            <div className="rounded-md border bg-blue-50 border-blue-300 p-3 text-xs text-blue-800">
              Valor efetivamente cobrado pelo técnico nesta OS: <strong>{fmt(order.received_amount)}</strong>
              {order.received_method ? ` — ${order.received_method}` : ""}
            </div>
          )}

          <div className="space-y-3">
            <Label className="text-xs font-medium">Pagamentos da venda</Label>
            {(sale.payments || []).map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{p.condition_name || "Pagamento"}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Badge variant={p.payment_status === "Realizada" ? "outline" : "secondary"} className="text-[10px] px-1 py-0">
                      {p.payment_status}
                    </Badge>
                    {p.payment_moment || ""}
                  </div>
                </div>
                <div className="w-32">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amounts[i] ?? 0}
                    onChange={(e) => setAmounts((prev) => prev.map((v, j) => (j === i ? Number(e.target.value) : v)))}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-md border bg-muted/50 p-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor atual dos pagamentos</span>
              <span>{fmt(currentPaymentsTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Diferença nos pagamentos</span>
              <span className={diff >= 0 ? "text-emerald-700" : "text-red-700"}>
                {diff >= 0 ? "+" : "−"} {fmt(Math.abs(diff)).replace("R$ ", "R$ ")}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-t pt-2">
              <span className="font-medium text-foreground">Total do pedido</span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">atual: {fmt(sale.grand_total)}</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-28 h-8"
                  value={totalInput}
                  onChange={(e) => setTotalInput(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving || !changed || invalid}>
            {saving ? "Salvando..." : "Salvar Ajuste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}