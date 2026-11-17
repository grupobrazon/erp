import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Upload, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { computeAccountingSplit, accountName } from "@/lib/receivableSplit";

export default function ReconcilePaymentDialog({ sale, paymentIndex, open, onOpenChange, onReconciled }) {
  const [receiptUrl, setReceiptUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const { toast } = useToast();

  const { data: chartAccounts = [] } = useQuery({
    queryKey: ["chartOfAccounts"],
    queryFn: () => base44.entities.ChartOfAccount.list("-code", 500),
  });

  if (!sale || paymentIndex == null) return null;
  const payment = sale.payments[paymentIndex];
  const split = computeAccountingSplit(sale, payment);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setReceiptUrl(file_url);
    } catch (err) {
      toast({ title: "Erro ao enviar comprovante", description: err?.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const updatedPayments = [...sale.payments];
      updatedPayments[paymentIndex] = {
        ...updatedPayments[paymentIndex],
        payment_status: "Realizada",
        receipt_url: receiptUrl || updatedPayments[paymentIndex].receipt_url,
      };
      await base44.entities.Sale.update(sale.id, { payments: updatedPayments });
      toast({ title: "Recebimento conciliado com sucesso" });
      onReconciled();
      onOpenChange(false);
      setReceiptUrl(null);
    } catch (err) {
      toast({ title: "Erro ao conciliar", description: err?.message, variant: "destructive" });
    } finally {
      setReconciling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setReceiptUrl(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Conciliação de Recebimento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Pedido:</span>
            <span className="font-mono font-semibold">{sale.order_number}</span>
          </div>
          <div><span className="text-muted-foreground">Cliente: </span>{sale.client_name}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">Pagamento:</span>
            <Badge variant="outline" className="bg-amber-50 text-amber-700">Pendente</Badge>
            <span className="font-bold text-base">R$ {(payment.amount || 0).toFixed(2)}</span>
            <span className="text-muted-foreground">{payment.condition_name}</span>
            {payment.payment_moment && <span className="text-muted-foreground">({payment.payment_moment})</span>}
          </div>
          <div className="rounded-lg border p-2 bg-muted/30 space-y-1">
            <p className="text-xs text-muted-foreground">Contabilização — lançamento separado:</p>
            {split.map(line => (
              <div key={line.code} className="flex justify-between text-xs">
                <span className={line.kind === "frete" ? "text-blue-600" : "text-emerald-600"}>{line.code} · {accountName(line.code, chartAccounts)}</span>
                <span className="font-medium">R$ {line.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="rounded-lg border p-3">
            <label className="text-muted-foreground text-xs">Comprovante de Pagamento (opcional)</label>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <label className="cursor-pointer">
                <input type="file" accept="image/*,application/pdf" onChange={handleUpload} className="hidden" disabled={uploading} />
                <span className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent">
                  <Upload className="h-3 w-3" /> {uploading ? "Enviando..." : "Anexar"}
                </span>
              </label>
              {receiptUrl && (
                <a href={receiptUrl} target="_blank" rel="noreferrer" className="text-primary text-xs hover:underline flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> Ver comprovante
                </a>
              )}
              {payment.receipt_url && !receiptUrl && (
                <a href={payment.receipt_url} target="_blank" rel="noreferrer" className="text-primary text-xs hover:underline flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> Comprovante atual
                </a>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleReconcile} disabled={reconciling} className="gap-1">
            {reconciling ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Confirmar Recebimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}