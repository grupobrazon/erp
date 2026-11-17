import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import ReverseOSDetailDialog from "./ReverseOSDetailDialog";

export default function ReverseOSSection({ order }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [generating, setGenerating] = useState(false);
  const [selectedReverse, setSelectedReverse] = useState(null);

  // Busca OS Reversas vinculadas a esta OS pai
  const { data: reverseOrders = [] } = useQuery({
    queryKey: ["reverseOS", order?.id],
    queryFn: () => base44.entities.ServiceOrder.filter({ reverse_parent_os_id: order.id }, '-created_date', 10),
    enabled: !!order?.id,
  });

  // Calcula dias desde a entrega
  const deliveryDate = React.useMemo(() => {
    const history = Array.isArray(order?.status_history) ? order.status_history : [];
    for (let i = history.length - 1; i >= 0; i--) {
      if (["Entregue", "Concluída"].includes(history[i].new_status)) return history[i].date;
    }
    return order?.tech_completion_date || order?.date;
  }, [order]);

  const daysSinceDelivery = deliveryDate
    ? Math.floor((Date.now() - new Date(deliveryDate).getTime()) / 86400000)
    : 0;
  const withinDeadline = daysSinceDelivery <= 30;

  const handleGenerate = async () => {
    if (!reason.trim()) {
      toast({ title: "Informe o motivo da devolução", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const res = await base44.functions.invoke("generateReverseOS", { os_id: order.id, reason });
      const data = res.data || res;
      if (data.error) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      toast({ title: "OS Reversa gerada", description: `Código: ${data.reverse_code}` });
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["reverseOS", order.id] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      setSelectedReverse(data.reverse_os);
    } catch (err) {
      const msg = err?.message || "Falha ao gerar OS Reversa";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  if (!order) return null;

  return (
    <div className="rounded-md border border-purple-200 bg-purple-50/30 p-3">
      <div className="flex items-center gap-1 mb-2 text-sm font-semibold">
        <RotateCcw className="h-4 w-4 text-purple-600" /> OS Reversa (Devolução)
      </div>

      {reverseOrders.length > 0 && (
        <div className="mb-3 space-y-1">
          {reverseOrders.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded border bg-white p-2 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  className="font-mono font-semibold text-purple-700 hover:underline"
                  onClick={() => setSelectedReverse(r)}
                >
                  {r.code}
                </button>
                <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                {r.reverse_received && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Recebida</Badge>}
              </div>
              <span className="text-muted-foreground truncate max-w-[200px]">{r.reverse_reason}</span>
            </div>
          ))}
        </div>
      )}

      {reverseOrders.length === 0 && (
        <>
          <p className="text-xs text-muted-foreground mb-2">
            Produto chegou errado ou com defeito? Gere uma OS Reversa para acompanhar a devolução até a empresa.
          </p>
          {!withinDeadline && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-2 flex items-start gap-1">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>Fora do prazo de 30 dias (entrega há {daysSinceDelivery} dias). Apenas administradores podem autorizar.</span>
            </div>
          )}
          {withinDeadline && daysSinceDelivery > 20 && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-2 flex items-start gap-1">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>Atenção: restam {30 - daysSinceDelivery} dias para gerar a coleta reversa (entrega há {daysSinceDelivery} dias).</span>
            </div>
          )}
          <Textarea
            rows={2}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Motivo da devolução (produto errado, defeito, voltagem errada, etc.)"
            className="bg-white mb-2 text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1 w-full border-purple-300 text-purple-700 hover:bg-purple-100"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <><div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Gerando...</>
            ) : (
              <><RotateCcw className="h-3.5 w-3.5" /> Gerar OS Reversa</>
            )}
          </Button>
        </>
      )}

      <ReverseOSDetailDialog
        open={!!selectedReverse}
        onOpenChange={(v) => !v && setSelectedReverse(null)}
        order={selectedReverse}
      />
    </div>
  );
}