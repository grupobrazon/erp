import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ShieldCheck, Wrench, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function MaintenanceOSConvertDialog({ open, onOpenChange, order }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [convertTo, setConvertTo] = useState("Garantia");
  const [serviceFee, setServiceFee] = useState(0);
  const [displacementFee, setDisplacementFee] = useState(0);
  const [chargeReason, setChargeReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setConvertTo("Garantia");
      setServiceFee(0);
      setDisplacementFee(0);
      setChargeReason("");
    }
  }, [open]);

  if (!order) return null;

  const handleConvert = async () => {
    if (convertTo === "Assistência Técnica" && !chargeReason.trim()) {
      toast({ title: "Justificativa obrigatória", description: "Informe o motivo da cobrança ao converter para Assistência Técnica.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await base44.functions.invoke("convertAnalysisOS", {
        os_id: order.id,
        convert_to: convertTo,
        service_fee: convertTo === "Assistência Técnica" ? Number(serviceFee) : 0,
        displacement_fee: convertTo === "Assistência Técnica" ? Number(displacementFee) : 0,
        charge_reason: convertTo === "Assistência Técnica" ? chargeReason : "",
      });
      toast({ title: "Análise convertida", description: `OS ${order.code} → ${convertTo}` });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro ao converter", description: err?.message || "Falha", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Converter Análise — {order.code}
          </DialogTitle>
          <DialogDescription>
            Defina o resultado da análise. A OS deixará de ser "Análise" e passará a ser o tipo selecionado abaixo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setConvertTo("Garantia")}
              className={`text-left p-3 border rounded-lg transition-all ${convertTo === "Garantia" ? "border-emerald-500 ring-1 ring-emerald-500 bg-emerald-50/50" : "border-input hover:border-emerald-500/50"}`}
            >
              <ShieldCheck className="h-5 w-5 text-emerald-600 mb-1" />
              <div className="font-medium text-sm">Garantia</div>
              <p className="text-xs text-muted-foreground">Sem custo ao cliente</p>
            </button>
            <button
              onClick={() => setConvertTo("Assistência Técnica")}
              className={`text-left p-3 border rounded-lg transition-all ${convertTo === "Assistência Técnica" ? "border-blue-500 ring-1 ring-blue-500 bg-blue-50/50" : "border-input hover:border-blue-500/50"}`}
            >
              <Wrench className="h-5 w-5 text-blue-600 mb-1" />
              <div className="font-medium text-sm">Assistência Técnica</div>
              <p className="text-xs text-muted-foreground">Serviço cobrado</p>
            </button>
          </div>

          {convertTo === "Assistência Técnica" && (
            <div className="space-y-3 border rounded-lg p-3 bg-blue-50/30">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Valor do Serviço (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={serviceFee}
                    onChange={e => setServiceFee(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Taxa de Deslocamento (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={displacementFee}
                    onChange={e => setDisplacementFee(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Justificativa da cobrança *</Label>
                <Textarea
                  value={chargeReason}
                  onChange={e => setChargeReason(e.target.value)}
                  placeholder="Ex: Problema não coberto pela garantia — dano por mau uso, equipamento fora da garantia, etc."
                  rows={2}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                Total a cobrar: <strong className="text-blue-700">R$ {(Number(serviceFee || 0) + Number(displacementFee || 0)).toFixed(2)}</strong>
              </div>
            </div>
          )}

          {convertTo === "Garantia" && (
            <div className="text-sm text-muted-foreground border rounded-lg p-3 bg-emerald-50/30">
              O serviço será realizado sem custo ao cliente. Itens e deslocamento permanecem zerados.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConvert} disabled={saving}>
            {saving ? "Convertendo..." : "Converter Análise"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}