import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function RequestProductionCancellationDialog({ open, onOpenChange, order }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast({ title: "Informe o motivo", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await base44.functions.invoke("requestProductionCancellation", {
        os_id: order.id,
        reason: reason.trim(),
      });
      const data = res?.data || res;
      if (data?.success) {
        toast({ title: "Solicitação enviada", description: "A produção foi notificada. O pedido está liberado para rota." });
        queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
        queryClient.invalidateQueries({ queryKey: ["serviceOrder", order.id] });
        setReason("");
        onOpenChange(false);
      } else {
        toast({ title: "Erro", description: data?.error || "Não foi possível enviar a solicitação.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            Solicitar Cancelamento da Produção
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A OS <strong className="font-mono">{order?.code}</strong> está em produção. Solicite o cancelamento para liberar o pedido para a rota do técnico — a entrega sairá de outro item em estoque.
          </p>
          <div>
            <Label className="text-xs">Motivo da solicitação *</Label>
            <Textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Cliente aguardando entrega urgente, produto disponível em estoque para entrega imediata..."
            />
          </div>
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-1">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>A produção será notificada e decidirá: <strong>Suspender</strong> (item descartado) ou <strong>Continuar para Estoque</strong> (item finalizado vai para o estoque da empresa com romaneio de troca). O pedido fica liberado para rota imediatamente após a solicitação.</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading || !reason.trim()}>
            {loading ? "Enviando..." : "Solicitar Cancelamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}