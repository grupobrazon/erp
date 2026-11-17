import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { GripVertical, MapPin, CheckCircle2, AlertTriangle, Clock, Send } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function ReorderStopsDialog({ open, onOpenChange, route, routeOrders = [], tosMap = {} }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [stops, setStops] = useState([]);
  const [reason, setReason] = useState("");

  // Build stops from ServiceOrders when route.stops is empty (manually created routes)
  const buildStopsFromOrders = (orders) => {
    return orders
      .slice()
      .sort((a, b) => (a.route_order || 0) - (b.route_order || 0))
      .map((o, i) => {
        const addr = o.delivery_address || {};
        const addressParts = [addr.street, addr.number, addr.neighborhood, addr.city, addr.state].filter(Boolean);
        return {
          order: o.route_order || i + 1,
          os_id: o.id,
          os_code: o.code,
          client_name: o.client_name,
          address: addressParts.join(", "),
          service_type: o.type,
          tos_id: null,
          tos_code: null,
        };
      });
  };

  // Initialize stops from route.stops (optimized) or fallback to routeOrders (manual routes)
  useEffect(() => {
    if (open && route) {
      const sourceStops = route.stops?.length > 0 ? route.stops : buildStopsFromOrders(routeOrders);
      setStops([...sourceStops].sort((a, b) => (a.order || 0) - (b.order || 0)));
      setReason("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, route?.id]);

  const isStopCompleted = (stop) => {
    if (stop.service_type === "Expedição" || stop.service_type === "Parada") return stop.checked_in;
    if (!stop.tos_id) return false;
    const tos = tosMap[stop.tos_id];
    return tos?.status === "Concluída Técnico" || tos?.status === "Atendimento Interrompido" || tos?.status === "Atendido Parcialmente" || tos?.status === "Aguardando Faturamento - Pós" || tos?.status === "Finalizada" || tos?.status === "Cancelada";
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;

    const reordered = [...stops];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);

    // Renumber order field
    const renumbered = reordered.map((s, i) => ({ ...s, order: i + 1 }));
    setStops(renumbered);
  };

  const reorderMutation = useMutation({
    mutationFn: async () => {
      const updatedStops = stops.map((s, i) => ({ ...s, order: i + 1 }));
      const reorderLog = {
        date: new Date().toISOString(),
        actor: "Supervisor/Logística",
        reason,
        previous_order: (route.stops || []).sort((a, b) => (a.order || 0) - (b.order || 0)).map(s => s.os_code || s.client_name || `Parada ${s.order}`),
        new_order: updatedStops.map(s => s.os_code || s.client_name || `Parada ${s.order}`),
      };

      await base44.entities.TechnicianRoute.update(route.id, {
        stops: updatedStops,
        notes: route.notes
          ? `${route.notes}\n\n[Reordenação ${new Date().toLocaleString("pt-BR")}] ${reason}`
          : `[Reordenação ${new Date().toLocaleString("pt-BR")}] ${reason}`,
      });

      // Also update ServiceOrder.route_order for consistency
      const osUpdates = updatedStops
        .filter(s => s.os_id)
        .map((s, i) => ({ id: s.os_id, route_order: i + 1 }));
      if (osUpdates.length > 0) {
        await base44.entities.ServiceOrder.bulkUpdate(osUpdates);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["technicianRoutes"] });
      queryClient.invalidateQueries({ queryKey: ["techRoutes"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["route-tos-status-all"] });
      toast({
        title: "Rota reordenada e enviada ao técnico",
        description: "O técnico verá a nova ordem na próxima atualização do app.",
      });
      onOpenChange(false);
    },
    onError: (err) => toast({ title: "Erro ao reordenar", description: err?.message, variant: "destructive" }),
  });

  const completedCount = stops.filter(isStopCompleted).length;
  const hasCompleted = completedCount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" /> Reordenar Atendimentos — {route?.code}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {hasCompleted && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                <strong>Atenção:</strong> {completedCount} parada(s) já foram concluídas pelo técnico.
                Movê-las pode causar confusão — o técnico já registrou o atendimento.
                Recomenda-se reordenar apenas as paradas pendentes.
              </p>
            </div>
          )}

          <div>
            <Label className="text-xs mb-2 block">Arraste para reordenar as paradas:</Label>
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="stops">
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`space-y-2 rounded-lg p-2 transition-colors ${snapshot.isDraggingOver ? "bg-primary/5" : ""}`}
                  >
                    {stops.map((stop, index) => {
                      const completed = isStopCompleted(stop);
                      const isParada = stop.service_type === "Parada";
                      return (
                        <Draggable
                          key={stop.os_id || stop.stop_id || `parada-${stop.order}`}
                          draggableId={String(stop.os_id || stop.stop_id || `parada-${stop.order}`)}
                          index={index}
                        >
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              className={`flex items-center gap-2 p-2.5 rounded-lg border bg-card transition-shadow ${snap.isDragging ? "shadow-lg border-primary" : "border-border"} ${completed ? "opacity-60" : ""}`}
                            >
                              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab" />
                              <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold shrink-0 ${completed ? "bg-emerald-500 text-white" : isParada ? "bg-amber-500 text-white" : "bg-primary text-primary-foreground"}`}>
                                {completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  {stop.os_code ? (
                                    <span className="font-mono text-xs font-semibold">{stop.os_code}</span>
                                  ) : (
                                    <span className="font-mono text-xs font-semibold text-amber-700">PARADA</span>
                                  )}
                                  <span className="font-medium text-sm truncate">{stop.client_name}</span>
                                </div>
                                <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                  <MapPin className="h-2.5 w-2.5" /> {stop.address || "Sem endereço"}
                                </p>
                              </div>
                              {completed && (
                                <Badge className="gap-1 bg-emerald-100 text-emerald-700 shrink-0">
                                  <CheckCircle2 className="h-3 w-3" /> Feita
                                </Badge>
                              )}
                              {stop.checked_in && !completed && (
                                <Badge className="gap-1 bg-blue-100 text-blue-700 shrink-0">
                                  <Clock className="h-3 w-3" /> Check-in
                                </Badge>
                              )}
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>

          <div>
            <Label className="text-xs mb-1 block">Justificativa da reordenação *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Cliente não estava em casa no primeiro endereço, técnico precisa retornar mais tarde..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground mt-1">A justificativa será registrada no histórico da rota.</p>
          </div>
        </div>

        <DialogFooter className="flex-col items-stretch gap-2">
          <Button
            onClick={() => reorderMutation.mutate()}
            disabled={!reason.trim() || reorderMutation.isPending}
            className="w-full gap-2"
          >
            <Send className="h-4 w-4" />
            {reorderMutation.isPending ? "Enviando..." : "Reordenar e Enviar ao Técnico"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}