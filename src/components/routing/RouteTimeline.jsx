import React from "react";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, Navigation, Home, Building2, Truck, Wrench, DollarSign, Route as RouteIcon, CheckCircle2, Play, Square, Navigation2, Flag } from "lucide-react";

const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
const mapUrl = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}&z=18`;

export default function RouteTimeline({ route, tosMap = {} }) {
  if (!route?.stops?.length) {
    return <p className="text-sm text-muted-foreground">Nenhuma parada nesta rota.</p>;
  }

  const stops = [...route.stops].sort((a, b) => (a.order || 0) - (b.order || 0));
  const endPointLabel = route.end_point_type === "empresa" ? "Empresa" : "Casa do Técnico";
  const EndPointIcon = route.end_point_type === "empresa" ? Building2 : Home;

  // Real-time status helpers
  const isStarted = !!route.checkin_at;
  const isFinished = !!route.checkout_at;
  const isStopCompleted = (stop) => {
    // Expedição OS and Parada intermediária have no TOS — completed when checked in
    if (stop.service_type === "Expedição" || stop.service_type === "Parada") return stop.checked_in;
    // Entrega / Entrega + Instalação / Manutenção require a TOS — never mark as completed just from check-in
    if (!stop.tos_id) return false; // data integrity issue — TOS not linked, cannot be completed
    const st = tosMap[stop.tos_id]?.status;
    return st === "Concluída Técnico" || st === "Atendimento Interrompido" || st === "Atendido Parcialmente" || st === "Aguardando Faturamento - Pós" || st === "Finalizada" || st === "Cancelada";
  };
  const completedCount = stops.filter(isStopCompleted).length;
  const checkedInCount = stops.filter(s => s.checked_in).length;

  // Determine current stop (first non-completed, checked-in stop, or first non-checked-in if none checked-in)
  const currentStopIdx = isStarted && !isFinished
    ? stops.findIndex(s => !isStopCompleted(s))
    : -1;

  return (
    <div className="space-y-3">
      {/* Route summary */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline" className="gap-1 bg-blue-50">
          <RouteIcon className="h-3 w-3" /> {route.total_distance_km || 0} km
        </Badge>
        <Badge variant="outline" className="gap-1 bg-purple-50">
          <Clock className="h-3 w-3" /> {route.total_travel_min || 0}min desloc.
        </Badge>
        <Badge variant="outline" className="gap-1 bg-amber-50">
          <Wrench className="h-3 w-3" /> {route.total_service_min || 0}min atendimento
        </Badge>
        {route.departure_time && (
          <Badge variant="outline" className="gap-1 bg-primary/10 text-primary">
            <Clock className="h-3 w-3" /> Saída {route.departure_time}
          </Badge>
        )}
        <Badge variant="outline" className="gap-1 bg-emerald-50">
          <Clock className="h-3 w-3" /> Término {route.estimated_end_time || "—"}
        </Badge>
        <Badge variant="outline" className={`gap-1 ${route.end_point_type === "empresa" ? "bg-orange-50 text-orange-700" : "bg-indigo-50 text-indigo-700"}`}>
          <EndPointIcon className="h-3 w-3" /> {endPointLabel}
        </Badge>
        {route.optimized && (
          <Badge variant="outline" className="gap-1 bg-cyan-50 text-cyan-700">
            <Navigation className="h-3 w-3" /> Otimizada Google Maps
          </Badge>
        )}
        {isStarted && !isFinished && (
          <Badge variant="outline" className="gap-1 bg-cyan-50 text-cyan-700">
            <Navigation2 className="h-3 w-3" /> ETA ao vivo (trânsito)
          </Badge>
        )}
        {/* Real-time progress badges */}
        {isStarted && !isFinished && (
          <Badge className="gap-1 bg-purple-100 text-purple-700">
            <Navigation2 className="h-3 w-3 animate-pulse" /> Em Andamento · {completedCount}/{stops.length} concluídas
          </Badge>
        )}
        {isFinished && (
          <Badge className="gap-1 bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> Concluída · {route.total_km_tracked || 0} km rodado
          </Badge>
        )}
      </div>

      {/* Real-time route status bar */}
      {isStarted && (
        <div className="rounded-md border bg-muted/30 p-2 text-xs space-y-1">
          <div className="flex flex-wrap gap-3">
            <span className="flex items-center gap-1 text-emerald-700">
              <Play className="h-3 w-3" /> Início: <strong>{fmtDateTime(route.checkin_at)}</strong>
            </span>
            {isFinished && (
              <span className="flex items-center gap-1 text-emerald-700">
                <Square className="h-3 w-3" /> Fim: <strong>{fmtDateTime(route.checkout_at)}</strong>
              </span>
            )}
            <span className="text-muted-foreground">
              Check-ins: {checkedInCount}/{stops.length} · Concluídas: {completedCount}/{stops.length}
            </span>
          </div>
          {route.checkin_lat != null && (
            <p className="text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Local inicial:{" "}
              <a href={mapUrl(route.checkin_lat, route.checkin_lng)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                {route.checkin_lat?.toFixed(5)}, {route.checkin_lng?.toFixed(5)}
              </a>
            </p>
          )}
        </div>
      )}

      {/* Departure point */}
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isStarted ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground"}`}>
            {isStarted ? <Play className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
          </div>
          <div className="w-0.5 h-full bg-border flex-1 min-h-[20px]" />
        </div>
        <div className="flex-1 pt-1">
          <p className="text-sm font-medium">Partida — {route.departure_address?.includes(",") ? "Endereço de partida" : "Empresa"}</p>
          <p className="text-xs text-muted-foreground">{route.departure_address || "Endereço não configurado"}</p>
          {route.departure_time && !isStarted && (
            <p className="text-xs text-primary flex items-center gap-1 mt-0.5 font-medium">
              <Clock className="h-3 w-3" /> Saída prevista: {route.departure_time}
            </p>
          )}
          {isStarted && (
            <p className="text-xs text-emerald-700 flex items-center gap-1 mt-0.5">
              <Clock className="h-3 w-3" /> Saída: {fmtTime(route.checkin_at)}
            </p>
          )}
        </div>
      </div>

      {/* Stops */}
      {stops.map((stop, i) => {
        const isParada = stop.service_type === "Parada";
        const completed = isStopCompleted(stop);
        const tos = stop.tos_id ? tosMap[stop.tos_id] : null;
        const isCurrent = i === currentStopIdx;
        const checkinTime = stop.checkin_at ? fmtTime(stop.checkin_at) : null;
        const completedTime = tos?.completed_at ? fmtTime(tos.completed_at) : null;

        return (
          <div key={stop.os_id || stop.stop_id || i} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                completed ? "bg-emerald-500 text-white" :
                stop.checked_in ? "bg-blue-500 text-white" :
                isCurrent ? "bg-primary text-primary-foreground ring-2 ring-primary/30 animate-pulse" :
                isParada ? "bg-amber-500 text-white" :
                "bg-primary text-primary-foreground"
              }`}>
                {completed ? <CheckCircle2 className="h-4 w-4" /> : isParada ? <Flag className="h-3.5 w-3.5" /> : stop.checked_in ? <Clock className="h-3.5 w-3.5" /> : stop.order}
              </div>
              {i < stops.length - 1 && <div className={`w-0.5 h-full flex-1 min-h-[20px] ${completed ? "bg-emerald-400" : "bg-border"}`} />}
            </div>
            <div className="flex-1 pt-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                {stop.os_code ? <span className="font-mono text-xs font-semibold">{stop.os_code}</span> : <span className="font-mono text-xs font-semibold text-amber-700">PARADA</span>}
                <span className="font-medium text-sm">{stop.client_name}</span>
                <Badge variant="outline" className="text-xs gap-1">
                  {isParada ? <Flag className="h-3 w-3" /> : stop.service_type === "Entrega + Instalação" ? <Wrench className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
                  {stop.service_type}
                </Badge>
                {completed && (
                  <Badge className="gap-1 bg-emerald-100 text-emerald-700 text-xs">
                    <CheckCircle2 className="h-3 w-3" /> Concluída
                  </Badge>
                )}
                {isCurrent && !completed && (
                  <Badge className="gap-1 bg-blue-100 text-blue-700 text-xs animate-pulse">
                    <Navigation2 className="h-3 w-3" /> Em Atendimento
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {stop.address || "Sem endereço"}
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" className="gap-1 bg-muted/50">
                  <Clock className="h-3 w-3" /> Prev. Chegada {stop.arrival_time}
                </Badge>
                <Badge variant="outline" className="gap-1 bg-blue-50">
                  Atend. {stop.service_start_time} → {stop.departure_time}
                </Badge>
                {stop.travel_from_prev_min > 0 && (
                  <Badge variant="outline" className="gap-1 bg-purple-50">
                    <Navigation className="h-3 w-3" /> {stop.travel_from_prev_min}min · {stop.distance_from_prev_km}km
                  </Badge>
                )}
                {stop.has_payment && (
                  <Badge variant="outline" className="gap-1 bg-amber-50 text-amber-700">
                    <DollarSign className="h-3 w-3" /> R$ {stop.payment_amount?.toFixed(2)}
                  </Badge>
                )}
              </div>
              {/* Real-time check-in / completion data */}
              {stop.checked_in && (
                <div className="flex flex-wrap gap-2 text-xs pt-1 border-t border-dashed">
                  <Badge variant="outline" className="gap-1 bg-blue-50 text-blue-700">
                    <Navigation2 className="h-3 w-3" /> Check-in: {checkinTime}
                  </Badge>
                  {stop.checkin_lat != null && (
                    <a href={mapUrl(stop.checkin_lat, stop.checkin_lng)} target="_blank" rel="noopener noreferrer">
                      <Badge variant="outline" className="gap-1 bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary cursor-pointer transition-colors">
                        <MapPin className="h-3 w-3" /> {stop.checkin_lat?.toFixed(5)}, {stop.checkin_lng?.toFixed(5)}
                      </Badge>
                    </a>
                  )}
                  {completedTime && (
                    <Badge variant="outline" className="gap-1 bg-emerald-50 text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> Finalizada: {completedTime}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Arrival point */}
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isFinished ? "bg-emerald-500 text-white" : "bg-secondary text-secondary-foreground"}`}>
          {isFinished ? <CheckCircle2 className="h-4 w-4" /> : <EndPointIcon className="h-4 w-4" />}
        </div>
        <div className="flex-1 pt-1">
          <p className="text-sm font-medium">Chegada — {endPointLabel}</p>
          <p className="text-xs text-muted-foreground">{route.arrival_address || "Endereço não configurado"}</p>
          {isFinished && (
            <p className="text-xs text-emerald-700 flex items-center gap-1 mt-0.5">
              <Clock className="h-3 w-3" /> Chegada: {fmtTime(route.checkout_at)} · {route.total_km_tracked || 0} km rodado
            </p>
          )}
        </div>
      </div>
    </div>
  );
}