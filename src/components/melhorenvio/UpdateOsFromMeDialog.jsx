import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Truck, CheckCircle2, Package } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const STATUS_OPTIONS = [
  { value: "Em Transporte", label: "Mercadoria Enviada", desc: "Status: Em Transporte", icon: Truck },
  { value: "Entregue", label: "Mercadoria Recebida", desc: "Status: Entregue", icon: CheckCircle2 },
];

export default function UpdateOsFromMeDialog({ open, onOpenChange, row, onUpdated }) {
  const { toast } = useToast();
  const [targetStatus, setTargetStatus] = useState("Em Transporte");
  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("");
  const [saving, setSaving] = useState(false);

  const meMatch = row?.me_matches?.[0];

  useEffect(() => {
    if (open && meMatch) {
      setTracking(meMatch.tracking || "");
      setCarrier(meMatch.company || "");
      // Pré-seleção inteligente: se ME já está delivered → Entregue, senão → Em Transporte
      setTargetStatus(meMatch.status === "delivered" ? "Entregue" : "Em Transporte");
    }
  }, [open, meMatch]);

  if (!row || !meMatch) return null;

  const handleSave = async () => {
    if (!row.os_id) {
      toast({ title: "Sem OS vinculada", description: "Esta venda não possui ordem de serviço para atualizar.", variant: "destructive" });
      return;
    }
    if (!tracking.trim()) {
      toast({ title: "Rastreio obrigatório", description: "Informe o código de rastreio.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tracking_code: tracking.trim(),
        carrier: carrier.trim(),
        status: targetStatus,
      };
      if (targetStatus === "Entregue") {
        payload.exit_date = new Date().toISOString().slice(0, 10);
      }
      await base44.entities.ServiceOrder.update(row.os_id, payload);
      // Ao confirmar entrega, conclui automaticamente a venda vinculada
      let saleCompleted = false;
      if (targetStatus === "Entregue" && row.sale_id) {
        await base44.entities.Sale.update(row.sale_id, { stage: "Concluída" });
        saleCompleted = true;
      }
      toast({
        title: "OS atualizada",
        description: `${row.os_code} → ${targetStatus} | Rastreio: ${tracking.trim()}${saleCompleted ? " • Venda concluída" : ""}`,
      });
      onUpdated?.(row);
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro ao atualizar OS", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Atualizar Ordem de Serviço
          </DialogTitle>
          <DialogDescription>
            Atualize o rastreio e o status da OS com base no envio do Melhor Envio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Info da OS */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">OS</span>
              <span className="font-mono font-medium">{row.os_code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cliente</span>
              <span className="font-medium text-right">{row.client_name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status atual</span>
              <Badge variant="outline" className="text-xs">{row.os_status || "—"}</Badge>
            </div>
          </div>

          {/* Info do ME */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transportadora (ME)</span>
              <span className="font-medium">{meMatch.company || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rastreio (ME)</span>
              <span className="font-mono text-xs font-medium">{meMatch.tracking || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status (ME)</span>
              <Badge variant="secondary" className="text-xs">{meMatch.status}</Badge>
            </div>
          </div>

          {/* Edição */}
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Código de Rastreio</Label>
              <Input value={tracking} onChange={(e) => setTracking(e.target.value)} className="mt-1 font-mono text-sm" />
            </div>
            <div>
              <Label className="text-xs">Transportadora</Label>
              <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} className="mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-2 block">Status a aplicar na OS</Label>
              <RadioGroup value={targetStatus} onValueChange={setTargetStatus} className="gap-2">
                {STATUS_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <label
                      key={opt.value}
                      htmlFor={`st-${opt.value}`}
                      className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    >
                      <RadioGroupItem value={opt.value} id={`st-${opt.value}`} />
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">{opt.label}</div>
                        <div className="text-xs text-muted-foreground">{opt.desc}</div>
                      </div>
                    </label>
                  );
                })}
              </RadioGroup>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !tracking.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Atualizar OS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}