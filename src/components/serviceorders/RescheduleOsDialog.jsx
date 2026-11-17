import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { CalendarClock } from "lucide-react";

export default function RescheduleOsDialog({ open, onOpenChange, order, onDone }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!reason.trim()) {
      toast({ title: "Informe o motivo", description: "O motivo do reagendamento é obrigatório.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await base44.functions.invoke("rescheduleServiceOrder", {
        os_id: order.id,
        reason: reason.trim(),
        source: "Detalhe da OS",
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast({
        title: "OS marcada como Reagendada",
        description: `${order.code} foi liberada da rota anterior e já pode entrar em uma nova rota.`,
      });
      setReason("");
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setReason(""); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-amber-600" />
            Marcar {order?.code} como Reagendada
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A OS será liberada da rota atual e voltará a ficar disponível para entrar em uma nova rota.
            O histórico do reagendamento fica registrado na OS.
          </p>
          <div>
            <Label className="text-xs">Motivo do reagendamento *</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: cliente pediu para remarcar, técnico não conseguiu atender, produto em falta..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !reason.trim()}>
            {saving ? "Salvando..." : "Confirmar reagendamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}