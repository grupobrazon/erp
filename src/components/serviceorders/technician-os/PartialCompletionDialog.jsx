import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle } from "lucide-react";

const REASONS = [
  "Aparelho com defeito — necessita troca/retorno",
  "Falta de peça/material para finalizar",
  "Serviço parcialmente executado — necessita retorno",
  "Cliente não autorizou a instalação completa",
  "Outro",
];

export default function PartialCompletionDialog({ open, onOpenChange, onConfirm, loading }) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const handleConfirm = () => {
    if (!reason) return;
    onConfirm({ reason, notes });
  };

  const canConfirm = reason && !loading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="h-5 w-5" /> Atendido Parcialmente
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            O cliente estava presente e assinou, mas o serviço não pôde ser finalizado. Justifique o motivo do atendimento parcial.
          </p>

          <div>
            <Label className="text-xs font-semibold">Motivo da parcial <span className="text-destructive">*</span></Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Selecione o motivo..." /></SelectTrigger>
              <SelectContent>
                {REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-semibold">Observação</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Detalhe o que foi feito e o que falta para concluir o serviço..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button variant="default" className="bg-amber-600 hover:bg-amber-700" onClick={handleConfirm} disabled={!canConfirm}>
            {loading ? "Registrando..." : "Confirmar Atendimento Parcial"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}