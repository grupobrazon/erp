import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Paperclip, ExternalLink, CheckCircle2, AlertCircle, DollarSign, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import PaymentConditionCombobox from "@/components/sales/PaymentConditionCombobox";

// Statuses em que a OS já foi despachada (mercadoria saiu / técnico assumiu) — não permite mais registro antecipado
export const DISPATCHED_STATUSES = [
  "Agendamento/Rota",
  "Aguardando Rota",
  "Liberado para Técnico",
  "Em Execução",
  "Concluída pelo Técnico",
  "Atendimento Interrompido",
  "Aguardando Faturamento - Pós",
  "OK - Aprov. Financeira",
  "Saída do Estoque",
  "Em Transporte",
  "Faturada",
  "Concluída",
  "Entregue",
  "Cancelada",
];

const emptyPayment = () => ({
  payment_type: "",
  condition_id: "",
  condition_name: "",
  amount: 0,
  receipt_url: "",
});

export default function RecordAdvancePaymentDialog({ open, onOpenChange, order, sale }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: paymentConditions = [] } = useQuery({
    queryKey: ["paymentConditions"],
    queryFn: () => base44.entities.PaymentCondition.list("-created_date", 200),
  });

  const pendingPayments = (sale?.payments || []).filter(p => p.payment_status === "Pendente");
  const totalPending = pendingPayments.reduce((s, p) => s + (p.amount || 0), 0);

  const [payments, setPayments] = useState([]);
  const [remainderConditionId, setRemainderConditionId] = useState("");
  const [remainderMoment, setRemainderMoment] = useState("Na Entrega");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && sale) {
      setPayments([emptyPayment()]);
      // Pré-seleciona a condição do restante com a primeira condição pendente original (se houver)
      const firstPending = pendingPayments[0];
      setRemainderConditionId(firstPending?.condition_id || "");
      setRemainderMoment(order?.pending_payment_moment || "Na Entrega");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sale?.id]);

  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const restante = Math.max(0, totalPending - totalPaid);

  const addPayment = () => setPayments(prev => [...prev, emptyPayment()]);

  const updatePayment = (index, field, value) => {
    setPayments(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === "payment_type") {
        next[index].condition_id = "";
        next[index].condition_name = "";
      }
      if (field === "condition_id") {
        const cond = paymentConditions.find(c => c.id === value);
        next[index].condition_name = cond?.name || "";
      }
      return next;
    });
  };

  const removePayment = (index) => setPayments(prev => prev.filter((_, i) => i !== index));

  const handleUpload = async (index, file) => {
    if (!file) return;
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      updatePayment(index, "receipt_url", file_url);
    } catch (err) {
      toast({ title: "Erro no upload", description: err.message, variant: "destructive" });
    }
  };

  const handleSave = async () => {
    // Validate
    const valid = payments.filter(p => p.condition_id && (p.amount || 0) > 0);
    if (valid.length === 0) {
      toast({ title: "Pagamento obrigatório", description: "Adicione ao menos uma condição de pagamento válida.", variant: "destructive" });
      return;
    }
    const missingReceipt = valid.find(p => !p.receipt_url);
    if (missingReceipt) {
      toast({ title: "Comprovante obrigatório", description: "Anexe o comprovante de todos os pagamentos.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const realized = (sale.payments || []).filter(p => p.payment_status === "Realizada");
      const newRealized = valid.map(p => ({
        condition_id: p.condition_id,
        condition_name: p.condition_name,
        amount: p.amount,
        receipt_url: p.receipt_url,
        payment_status: "Realizada",
        payment_moment: "Antecipada",
      }));

      let newPayments = [...realized, ...newRealized];

      // Se pagou menos que o total pendente, mantém o restante como pendente para o técnico cobrar
      if (totalPaid < totalPending) {
        if (!remainderConditionId) {
          toast({ title: "Forma de cobrança obrigatória", description: "Selecione a forma de pagamento que o técnico deverá cobrar pelo restante.", variant: "destructive" });
          setSaving(false);
          return;
        }
        const cond = paymentConditions.find(c => c.id === remainderConditionId);
        newPayments.push({
          condition_id: remainderConditionId,
          condition_name: cond?.name || "Restante pendente",
          amount: totalPending - totalPaid,
          payment_status: "Pendente",
          payment_moment: remainderMoment,
        });
      }

      const stillPending = newPayments.some(p => p.payment_status === "Pendente");
      const pendingAmount = newPayments
        .filter(p => p.payment_status === "Pendente")
        .reduce((s, p) => s + (p.amount || 0), 0);

      await base44.entities.Sale.update(sale.id, { payments: newPayments });
      await base44.entities.ServiceOrder.update(order.id, {
        has_pending_payment: stillPending,
        pending_payment_amount: pendingAmount,
        pending_payment_moment: stillPending ? remainderMoment : "",
      });

      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["sale", sale.id] });
      toast({
        title: stillPending ? "Pagamento parcial registrado" : "Pagamento confirmado",
        description: stillPending
          ? "Ainda há valor pendente para o técnico receber na entrega."
          : "Técnico não precisará receber na entrega — apenas executar o serviço.",
      });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" /> Registrar Pagamento Antecipado
          </DialogTitle>
        </DialogHeader>

        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <span>
            O cliente pagou o valor pendente durante a produção. Registre o pagamento, anexe o comprovante
            e confirme — o técnico não precisará receber na entrega, apenas executar o serviço.
          </span>
        </div>

        <div className="flex justify-between items-center">
          <div className="text-sm">
            <span className="text-muted-foreground">Total pendente: </span>
            <span className="font-semibold">R$ {totalPending.toFixed(2)}</span>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addPayment} className="gap-1">
            <Plus className="h-3 w-3" /> Adicionar Pagamento
          </Button>
        </div>

        <div className="space-y-2">
          {payments.map((pay, i) => {
            const effectiveType = pay.payment_type || (pay.condition_id ? paymentConditions.find(c => c.id === pay.condition_id)?.payment_type : "") || "";
            return (
              <div key={i} className="bg-muted/30 p-3 rounded-lg">
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <Label className="text-xs">Tipo de Pagamento *</Label>
                    <Select value={effectiveType} onValueChange={v => updatePayment(i, "payment_type", v)}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="À Vista">À Vista</SelectItem>
                        <SelectItem value="Parcelado">Parcelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-6">
                    <Label className="text-xs">Valor</Label>
                    <Input type="number" step="0.01" className="h-9" value={pay.amount} onChange={e => updatePayment(i, "amount", parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => removePayment(i)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2">
                  <Label className="text-xs">Condição de Pagamento {!effectiveType && <span className="text-muted-foreground">(selecione o tipo primeiro)</span>}</Label>
                  <PaymentConditionCombobox
                    conditions={effectiveType ? paymentConditions.filter(c => c.payment_type === effectiveType) : []}
                    value={pay.condition_id}
                    onChange={v => updatePayment(i, "condition_id", v)}
                    disabled={!effectiveType}
                    placeholder={effectiveType ? "Buscar condição..." : "Selecione o tipo de pagamento primeiro"}
                  />
                </div>
                {(() => {
                  const cond = paymentConditions.find(c => c.id === pay.condition_id);
                  if (!cond || cond.payment_type !== "Parcelado") return null;
                  const feeAmount = (pay.amount || 0) * ((cond.financial_fee || 0) / 100);
                  return (
                    <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-muted-foreground">
                      <span>Tipo: <span className="text-foreground font-medium">{cond.payment_type}</span></span>
                      <span>Parcelas: <span className="text-foreground font-medium">{cond.installments}x</span></span>
                      <span>Taxa Financ. ({(cond.financial_fee || 0).toFixed(2)}%): <span className="text-destructive font-medium">R$ {feeAmount.toFixed(2)}</span></span>
                    </div>
                  );
                })()}
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    id={`adv-receipt-${i}`}
                    onChange={ev => handleUpload(i, ev.target.files?.[0])}
                  />
                  {pay.receipt_url ? (
                    <>
                      <Button type="button" variant="outline" size="sm" className="gap-1 h-7 text-xs" asChild>
                        <a href={pay.receipt_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3 w-3" /> Ver Comprovante
                        </a>
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => document.getElementById(`adv-receipt-${i}`).click()}>
                        <Paperclip className="h-3 w-3" /> Trocar
                      </Button>
                    </>
                  ) : (
                    <Button type="button" variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={() => document.getElementById(`adv-receipt-${i}`).click()}>
                      <Paperclip className="h-3 w-3" /> Anexar Comprovante
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-3 mt-2 border-t pt-4">
          <div><Label className="text-xs">Total Pago</Label><Input value={`R$ ${totalPaid.toFixed(2)}`} disabled className="bg-muted" /></div>
          <div><Label className="text-xs">Total Pendente</Label><Input value={`R$ ${totalPending.toFixed(2)}`} disabled className="bg-muted" /></div>
          <div><Label className="text-xs">Restante</Label><Input value={`R$ ${restante.toFixed(2)}`} disabled className="bg-muted" /></div>
        </div>

        {restante > 0 && (
          <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 space-y-2">
            <div className="flex items-start gap-1 text-xs text-blue-800">
              <AlertCircle className="h-3.5 w-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
              <span>Restante será cobrado pelo técnico. Defina a forma de pagamento e o momento da cobrança — a rota será liberada diretamente (sem aprovação financeira).</span>
            </div>
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-7">
                <Label className="text-xs">Forma de Pagamento do Restante *</Label>
                <PaymentConditionCombobox
                  conditions={paymentConditions}
                  value={remainderConditionId}
                  onChange={setRemainderConditionId}
                  placeholder="Buscar condição para o técnico cobrar..."
                />
              </div>
              <div className="col-span-5">
                <Label className="text-xs">Momento da Cobrança</Label>
                <Select value={remainderMoment} onValueChange={setRemainderMoment}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Na Entrega">Na Entrega</SelectItem>
                    <SelectItem value="Na Instalação">Na Instalação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || pendingPayments.length === 0}>
            {saving ? "Salvando..." : <><CheckCircle2 className="h-4 w-4" /> Confirmar Pagamento</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}