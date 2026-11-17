import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function CancellationRequestDialog({ sale, open, onOpenChange }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleConfirm = async () => {
    if (!reason.trim()) {
      toast({ title: "Informe o motivo do cancelamento", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await base44.functions.invoke("processSaleCancellation", {
        action: "request",
        sale_id: sale.id,
        reason: reason.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast({ title: "Cancelamento solicitado", description: "Aguardando aprovação do gerente." });
      setReason("");
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) setReason(""); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Solicitar Cancelamento
          </DialogTitle>
          <DialogDescription>
            O pedido <strong className="font-mono text-foreground">{sale?.order_number}</strong> de{" "}
            <strong className="text-foreground">{sale?.client_name}</strong> será enviado para aprovação do supervisor em
            <strong className="text-foreground"> Vendas Canceladas</strong>. Se aprovado, a venda será cancelada, a OS será encerrada e o fluxo de estorno iniciado. Se rejeitado, a venda volta para a etapa em que estava.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Motivo do cancelamento *</Label>
            <Textarea
              rows={4}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ex: cliente desistiu da compra; produto não atendeu; erro no pedido..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Voltar</Button>
          <Button
            variant="destructive"
            disabled={saving || !reason.trim()}
            onClick={handleConfirm}
            className="gap-1"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
            Solicitar Cancelamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}