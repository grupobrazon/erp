import React, { useState, useEffect } from "react";
import { AlertTriangle, Loader2, CalendarClock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";

const ALERT_OPTIONS = [
  { value: "Crítico", label: "Crítico", color: "bg-amber-500", text: "text-amber-700", border: "border-amber-400", bg: "bg-amber-50" },
  { value: "Muito Crítico", label: "Muito Crítico", color: "bg-red-500", text: "text-red-700", border: "border-red-400", bg: "bg-red-50" },
];

export default function SalePriorityAlertDialog({ sale, open, onOpenChange, onSaved }) {
  const [alertLevel, setAlertLevel] = useState(null);
  const [note, setNote] = useState("");
  const [newForecastDate, setNewForecastDate] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (sale) {
      setAlertLevel(sale.priority_alert || null);
      setNote(sale.priority_alert_note || "");
      setNewForecastDate(sale.priority_alert_new_forecast_date || "");
    }
  }, [sale]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = {
        priority_alert: alertLevel || null,
        priority_alert_note: note || null,
        priority_alert_new_forecast_date: alertLevel ? (newForecastDate || null) : null,
      };
      if (alertLevel) {
        updates.priority_alert_set_date = new Date().toISOString();
      } else {
        updates.priority_alert_set_by = null;
        updates.priority_alert_set_date = null;
      }
      await base44.entities.Sale.update(sale.id, updates);
      toast({ title: alertLevel ? `Alerta ${alertLevel} definido` : "Alerta removido" });
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro ao salvar alerta", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Alerta de Prioridade — {sale?.order_number || ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-sm font-medium mb-2 block">Nível do alerta</Label>
            <div className="grid grid-cols-2 gap-2">
              {ALERT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAlertLevel(opt.value === alertLevel ? null : opt.value)}
                  className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-all ${
                    alertLevel === opt.value
                      ? `${opt.border} ${opt.bg} ${opt.text}`
                      : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <span className={`h-3 w-3 rounded-full ${opt.color}`} />
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAlertLevel(null)}
              className={`mt-2 text-xs ${!alertLevel ? "text-destructive font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              Remover alerta
            </button>
          </div>

          {alertLevel && (
            <div>
              <Label className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4 text-primary" /> Nova previsão de expedição
              </Label>
              <Input
                type="date"
                value={newForecastDate}
                onChange={(e) => setNewForecastDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">Nova data prometida ao cliente. Este pedido sobe para o topo da fila de produção.</p>
            </div>
          )}

          <div>
            <Label className="text-sm font-medium mb-2 block">Observação</Label>
            <Textarea
              placeholder="Descreva o motivo do alerta (ex: produto atrasado, cliente aguardando)..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}