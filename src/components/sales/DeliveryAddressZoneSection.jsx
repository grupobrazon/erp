import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Loader2, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

/**
 * Mostra a zona de rota atribuída ao endereço de entrega do pedido.
 * Calcula automaticamente quando o endereço tem cidade preenchida.
 * Se não encontrar zona automaticamente, permite seleção manual.
 */
export default function DeliveryAddressZoneSection({ address, zoneId, zoneName, calendarId, calendarName, onZoneChange }) {
  const { toast } = useToast();
  const [assigning, setAssigning] = useState(false);
  const [manualZoneId, setManualZoneId] = useState("");

  // Busca todas as zonas para seleção manual
  const { data: allZones = [] } = useQuery({
    queryKey: ["routeZones"],
    queryFn: () => base44.entities.RouteZone.list("-created_date", 500),
  });

  const hasCity = !!address?.city?.trim();
  const hasZone = !!zoneId;

  // Auto-atribui zona quando o endereço muda (tem cidade) e ainda não tem zona
  const autoAssign = useCallback(async () => {
    if (!hasCity) return;
    setAssigning(true);
    try {
      const res = await base44.functions.invoke("assignAddressZone", { address });
      const data = res.data;
      if (data.assignments && data.assignments.length > 0) {
        const a = data.assignments[0];
        onZoneChange({
          delivery_route_zone_id: a.zone_id || "",
          delivery_route_zone_name: a.zone_name || "",
          delivery_route_calendar_id: a.calendar_id || "",
          delivery_route_calendar_name: a.calendar_name || "",
        });
        if (a.zone_id) {
          toast({ title: "Zona atribuída", description: `Endereço de entrega na zona "${a.zone_name}".` });
        } else {
          toast({ title: "Calendário atribuído", description: `Endereço no calendário "${a.calendar_name}" — atribua a sub-zona manualmente.`, variant: "default" });
        }
      } else if (data.not_parametrized) {
        toast({ title: "Endereço não parametrizado", description: "Nenhuma zona encontrada para esta cidade. Selecione uma zona manualmente.", variant: "destructive" });
      } else {
        toast({ title: "Zona não encontrada", description: "Não foi possível atribuir a zona automaticamente. Selecione manualmente.", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Erro ao atribuir zona", description: e?.message || "Falha ao calcular zona", variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  }, [address, hasCity, onZoneChange, toast]);

  // Auto-atribui quando a cidade muda e não tem zona ainda
  useEffect(() => {
    if (hasCity && !hasZone && !assigning) {
      const timeout = setTimeout(() => autoAssign(), 800);
      return () => clearTimeout(timeout);
    }
  }, [address?.city, address?.neighborhood, hasCity, hasZone]); // eslint-disable-line react-hooks/exhaustive-deps

  // Limpa a zona quando o endereço muda significativamente (cidade ou bairro)
  useEffect(() => {
    if (hasZone && hasCity) {
      // Se a cidade mudou, limpa a zona para recalcular
      // (o useEffect acima vai disparar o autoAssign)
    }
  }, [address?.city]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleManualZoneChange = (zId) => {
    setManualZoneId(zId);
    const zone = allZones.find(z => z.id === zId);
    if (zone) {
      onZoneChange({
        delivery_route_zone_id: zone.id,
        delivery_route_zone_name: zone.name,
        delivery_route_calendar_id: zone.calendar_id || "",
        delivery_route_calendar_name: zone.calendar_name || "",
      });
      toast({ title: "Zona atribuída manualmente", description: `Zona "${zone.name}" atribuída ao endereço de entrega.` });
    }
  };

  const handleRecalculate = () => {
    onZoneChange({
      delivery_route_zone_id: "",
      delivery_route_zone_name: "",
      delivery_route_calendar_id: "",
      delivery_route_calendar_name: "",
    });
    autoAssign();
  };

  if (!hasCity) {
    return (
      <div className="rounded-lg border border-muted bg-muted/30 p-3 text-sm flex items-center gap-2 text-muted-foreground">
        <MapPin className="h-4 w-4 shrink-0" />
        <span>Preencha a cidade do endereço de entrega para atribuir a zona de rota automaticamente.</span>
      </div>
    );
  }

  if (assigning) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
        <span className="text-primary">Calculando zona de rota para o endereço de entrega...</span>
      </div>
    );
  }

  if (hasZone) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-emerald-900 font-medium">Zona de rota atribuída: {zoneName}</p>
            {calendarName && <p className="text-emerald-700 text-xs mt-0.5">Calendário: {calendarName}</p>}
            <p className="text-emerald-700 text-xs mt-1">O agendamento usará esta zona para validar o calendário.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleRecalculate} className="gap-1.5 shrink-0">
            <RefreshCw className="h-3.5 w-3.5" /> Recalcular
          </Button>
        </div>
      </div>
    );
  }

  // Sem zona — mostra seleção manual
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-amber-900 font-medium">Zona não atribuída automaticamente</p>
          <p className="text-amber-800 text-xs mt-0.5">Selecione a zona de rota manualmente para liberar o agendamento.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={handleRecalculate} className="gap-1.5 shrink-0">
          <RefreshCw className="h-3.5 w-3.5" /> Recalcular
        </Button>
      </div>
      <div>
        <Label className="text-xs">Zona de Rota *</Label>
        <Select value={manualZoneId} onValueChange={handleManualZoneChange}>
          <SelectTrigger><SelectValue placeholder="Selecione a zona..." /></SelectTrigger>
          <SelectContent>
            {allZones.map(z => (
              <SelectItem key={z.id} value={z.id}>
                {z.name}{z.calendar_name ? ` (${z.calendar_name})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}