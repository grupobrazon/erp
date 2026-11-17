import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PackageCheck, CalendarClock, AlertTriangle } from "lucide-react";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function LiberateProductionDialog({ open, onOpenChange, osCode, onConfirm, busy }) {
  const [mode, setMode] = useState("today");
  const [retroDate, setRetroDate] = useState(todayISO());
  const [justification, setJustification] = useState("");

  useEffect(() => {
    if (open) {
      setMode("today");
      setRetroDate(todayISO());
      setJustification("");
    }
  }, [open]);

  const isRetro = mode === "retroactive";
  const liberateDate = isRetro ? retroDate : todayISO();
  const canConfirm = !isRetro || (retroDate && justification.trim().length >= 10);

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      liberateDate,
      retroactive: isRetro,
      justification: isRetro ? justification.trim() : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-teal-600" />
            Liberar Produção — {osCode}
          </DialogTitle>
          <DialogDescription>
            Confirme a data em que a produção foi liberada fisicamente.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={mode} onValueChange={setMode} className="gap-3">
          <Label
            htmlFor="opt-today"
            className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/50 has-[:checked]:border-teal-500 has-[:checked]:bg-teal-50"
          >
            <RadioGroupItem value="today" id="opt-today" className="mt-0.5" />
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 font-medium text-sm">
                <PackageCheck className="h-4 w-4 text-teal-600" />
                Liberar na data de hoje
              </div>
              <p className="text-xs text-muted-foreground">
                A produção está sendo liberada agora, na data de hoje ({new Date().toLocaleDateString("pt-BR")}).
              </p>
            </div>
          </Label>

          <Label
            htmlFor="opt-retro"
            className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/50 has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50"
          >
            <RadioGroupItem value="retroactive" id="opt-retro" className="mt-0.5" />
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 font-medium text-sm">
                <CalendarClock className="h-4 w-4 text-amber-600" />
                Liberar com data retroativa
              </div>
              <p className="text-xs text-muted-foreground">
                A produção foi liberada fisicamente em uma data anterior à de hoje.
              </p>
            </div>
          </Label>
        </RadioGroup>

        {isRetro && (
          <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              Justificativa obrigatória
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data da liberação física *</Label>
              <Input
                type="date"
                value={retroDate}
                max={todayISO()}
                onChange={(e) => setRetroDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                Justifique por que a liberação não foi lançada na data correta *
              </Label>
              <Textarea
                placeholder="Ex: A produção foi liberada fisicamente no dia X, mas não houve tempo de registrar no sistema na mesma data porque..."
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                rows={3}
                className="text-sm"
              />
              {justification.trim().length > 0 && justification.trim().length < 10 && (
                <p className="text-[10px] text-amber-600">
                  A justificativa precisa ter no mínimo 10 caracteres.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm || busy} className="gap-1.5">
            <PackageCheck className="h-4 w-4" />
            {busy ? "Liberando..." : "Confirmar Liberação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}