import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertCircle, Ban, PackageCheck } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const fmtDateTime = (d) => {
  if (!d) return "—";
  const date = new Date(d.length === 10 ? d + "T00:00:00" : d);
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function ProductionCancellationDecision({ os, readOnly }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [decision, setDecision] = useState(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  if (!os?.production_cancellation_requested) return null;
  const decided = os.production_cancellation_decision && os.production_cancellation_decision !== "Pendente";

  const handleConfirm = async () => {
    if (!decision) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke("decideProductionCancellation", {
        os_id: os.id,
        decision,
        notes: notes.trim(),
      });
      const data = res?.data || res;
      if (data?.success) {
        toast({
          title: decision === "Suspensa" ? "Produção suspensa" : "Produção continua para estoque",
          description: data.romaneio_code ? `Romaneio ${data.romaneio_code} gerado.` : "Item descartado.",
        });
        queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
        setDecision(null);
        setNotes("");
      } else {
        toast({ title: "Erro", description: data?.error || "Não foi possível decidir.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-md border border-purple-300 bg-purple-50 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-purple-600" />
        <span className="text-sm font-medium text-purple-900">Solicitação de Cancelamento da Produção</span>
        {decided && <Badge className="bg-purple-100 text-purple-700">{os.production_cancellation_decision}</Badge>}
      </div>
      <div className="text-xs text-purple-800 space-y-0.5">
        <div>Solicitado por <strong>{os.production_cancellation_requested_by || "—"}</strong> em {fmtDateTime(os.production_cancellation_requested_date)}</div>
        <div className="bg-white/60 rounded p-2 mt-1">Motivo: {os.production_cancellation_reason || "—"}</div>
      </div>

      {decided ? (
        <div className="text-xs text-purple-700 bg-white/60 rounded p-2">
          Decidido por <strong>{os.production_cancellation_decided_by}</strong> em {fmtDateTime(os.production_cancellation_decided_date)}
          {os.production_cancellation_decision_notes && <div className="mt-1">Observações: {os.production_cancellation_decision_notes}</div>}
        </div>
      ) : readOnly ? (
        <div className="text-xs text-muted-foreground">Aguardando decisão da produção...</div>
      ) : (
        <div className="space-y-2 border-t border-purple-200 pt-2">
          <Label className="text-xs">Decisão da Produção</Label>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={decision === "Suspensa" ? "destructive" : "outline"}
              className="gap-1 flex-1"
              onClick={() => setDecision("Suspensa")}
            >
              <Ban className="h-3.5 w-3.5" /> Suspender (descartar)
            </Button>
            <Button
              size="sm"
              variant={decision === "Continuar para Estoque" ? "default" : "outline"}
              className="gap-1 flex-1"
              onClick={() => setDecision("Continuar para Estoque")}
            >
              <PackageCheck className="h-3.5 w-3.5" /> Continuar p/ Estoque
            </Button>
          </div>
          {decision && (
            <>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={decision === "Suspensa" ? "Motivo da suspensão/descarte..." : "Observações sobre a continuação para estoque..."}
              />
              <Button size="sm" className="w-full" disabled={loading} onClick={handleConfirm}>
                {loading ? "Processando..." : `Confirmar: ${decision}`}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}