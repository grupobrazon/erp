import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Navigation, Flag, Play, Square, Clock, Route as RouteIcon, Gauge, FileText, Wrench, CheckCircle2, ArrowRight, Lock, Map as MapIcon, RefreshCw, Activity } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import RouteTimeline from "./RouteTimeline";
import RouteRomaneioDialog from "./RouteRomaneioDialog";
import RouteMapDialog from "./RouteMapDialog";

function haversineKm(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return 0;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocalização não suportada"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error("Erro ao obter localização: " + err.message)),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// Tenta obter a localização, mas retorna null em vez de lançar erro — permite que o check-in prossiga sem geolocalização
async function getPositionOptional() {
  try {
    return await getPosition();
  } catch {
    return null;
  }
}

export default function RouteExecutionPanel({ route, onStopCheckin, onTOSDialogClose }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [showRomaneio, setShowRomaneio] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [etaRecalc, setEtaRecalc] = useState(null);
  const [etaLoading, setEtaLoading] = useState(false);
  const stopRefs = useRef({});
  const etaIntervalRef = useRef(null);

  // Recálculo de ETA em tempo real (Google Maps com tráfego ao vivo)
  const recalculateEta = async (silent = true) => {
    if (!route?.id || !route.checkin_at || route.checkout_at) return;
    setEtaLoading(true);
    try {
      let currentLat = null, currentLng = null;
      try {
        const pos = await getPositionOptional();
        if (pos) { currentLat = pos.lat; currentLng = pos.lng; }
      } catch {}
      const res = await base44.functions.invoke("recalculateRouteEta", {
        route_id: route.id,
        current_lat: currentLat,
        current_lng: currentLng,
      });
      const data = res?.data || res;
      if (data?.updated) {
        setEtaRecalc(data);
        queryClient.invalidateQueries({ queryKey: ["techRoutes"] });
        queryClient.invalidateQueries({ queryKey: ["technicianRoutes"] });
        if (!silent) {
          toast({ title: "Previsão atualizada", description: `Novo término estimado: ${data.estimated_end_time}` });
        }
      }
    } catch (err) {
      if (!silent) {
        toast({ title: "Erro ao recalcular previsão", description: err.message, variant: "destructive" });
      }
    } finally {
      setEtaLoading(false);
    }
  };

  useEffect(() => {
    if (!route?.id || !route.checkin_at || route.checkout_at) {
      setEtaRecalc(null);
      return;
    }
    recalculateEta(true);
    etaIntervalRef.current = setInterval(() => recalculateEta(true), 120000);
    return () => { if (etaIntervalRef.current) clearInterval(etaIntervalRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.id, route?.checkin_at, route?.checkout_at]);

  // Fetch TOS records to check completion status
  const { data: tosMap = {}, refetch: refetchTosMap } = useQuery({
    queryKey: ["route-tos-status", route?.id],
    queryFn: async () => {
      const tosIds = (route.stops || []).map(s => s.tos_id).filter(Boolean);
      if (tosIds.length === 0) return {};
      const tosList = await base44.entities.TechnicianServiceOrder.filter({ id: { $in: tosIds } });
      const map = {};
    for (const tos of tosList) {
        map[tos.id] = tos;
    }
      return map;
    },
    enabled: !!route && (route.stops || []).some(s => s.tos_id),
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  if (!route) return null;

  const isStarted = !!route.checkin_at;
  const isFinished = !!route.checkout_at;
  const stops = route.stops || [];
  const sortedStops = [...stops].sort((a, b) => (a.order || 0) - (b.order || 0));
  const checkedInCount = sortedStops.filter(s => s.checked_in).length;

  // Unique key for a stop — os_id for OS stops, stop_id for intermediate paradas
  const stopKey = (stop) => stop.os_id || stop.stop_id || `parada-${stop.order}`;

  // Check if a stop's TOS is completed
  const isStopCompleted = (stop) => {
    // Expedição OS and Parada intermediária have no TOS — completed when checked in
    if (stop.service_type === "Expedição" || stop.service_type === "Parada") return stop.checked_in;
    // Entrega / Entrega + Instalação / Manutenção require a TOS — never mark as completed just from check-in
    if (!stop.tos_id) return false; // data integrity issue — TOS not linked, cannot be completed
    const tos = tosMap[stop.tos_id];
    if (!tos) return false; // TOS not loaded yet — wait for it to load (refetches every 3s)
    // "Concluída Técnico" = serviço finalizado | "Atendimento Interrompido" = técnico visitou mas não pôde concluir
    // Ambas permitem seguir para a próxima parada (o técnico já lidou com esta OS)
    return tos?.status === "Concluída Técnico" || tos?.status === "Atendimento Interrompido" || tos?.status === "Atendido Parcialmente" || tos?.status === "Aguardando Faturamento - Pós" || tos?.status === "Finalizada" || tos?.status === "Cancelada";
  };

  // Can only check in at stop N if stop N-1 is completed (or it's the first stop)
  const canCheckIn = (stop) => {
    const idx = sortedStops.findIndex(s => stopKey(s) === stopKey(stop));
    if (idx <= 0) return true;
    return isStopCompleted(sortedStops[idx - 1]);
  };

  const completedCount = sortedStops.filter(isStopCompleted).length;
  const allCompleted = sortedStops.length > 0 && sortedStops.every(isStopCompleted);

  // Calculate total KM from check-ins
  const computeTrackedKm = (updatedRoute) => {
    const pts = [];
    if (updatedRoute.checkin_lat != null) pts.push({ lat: updatedRoute.checkin_lat, lng: updatedRoute.checkin_lng });
    for (const s of updatedRoute.stops || []) {
      if (s.checked_in && s.checkin_lat != null) pts.push({ lat: s.checkin_lat, lng: s.checkin_lng });
    }
    if (updatedRoute.checkout_lat != null) pts.push({ lat: updatedRoute.checkout_lat, lng: updatedRoute.checkout_lng });
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += haversineKm(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
    }
    return Math.round(total * 10) / 10;
  };

  const handleStartRoute = async () => {
    setBusy(true);
    try {
      const pos = await getPositionOptional();
      const now = new Date().toISOString();
      await base44.entities.TechnicianRoute.update(route.id, {
        checkin_lat: pos?.lat ?? null,
        checkin_lng: pos?.lng ?? null,
        checkin_at: now,
        status: "Em Andamento",
      });
      queryClient.invalidateQueries({ queryKey: ["techRoutes"] });
      if (pos) {
        toast({ title: "Rota iniciada", description: "Check-in registrado. Bom trabalho!" });
      } else {
        toast({ title: "Rota iniciada", description: "Check-in sem geolocalização (permissão negada). Rota liberada mesmo assim." });
      }
    } catch (err) {
      toast({ title: "Erro no check-in", description: err.message, variant: "destructive" });
    }
    setBusy(false);
  };

  const handleStopCheckin = async (stop) => {
    setBusy(true);
    try {
      const pos = await getPositionOptional();
      const now = new Date().toISOString();
      const key = stopKey(stop);
      const updatedStops = (route.stops || []).map(s =>
        stopKey(s) === key
          ? { ...s, checked_in: true, checkin_lat: pos?.lat ?? null, checkin_lng: pos?.lng ?? null, checkin_at: now }
          : s
      );
      await base44.entities.TechnicianRoute.update(route.id, { stops: updatedStops });
      queryClient.invalidateQueries({ queryKey: ["techRoutes"] });
      const label = stop.service_type === "Parada" ? `Parada ${stop.client_name}` : `Check-in OS ${stop.os_code}`;
      if (pos) {
        toast({ title: label, description: `Chegada registrada em ${new Date(now).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` });
      } else {
        toast({ title: label, description: `Registrado em ${new Date(now).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} (sem geolocalização)` });
      }
    } catch (err) {
      toast({ title: "Erro no check-in", description: err.message, variant: "destructive" });
    }
    setBusy(false);
  };

  const handleEndRoute = async () => {
    setBusy(true);
    try {
      const pos = await getPosition();
      const now = new Date().toISOString();
      // Calculate total KM from all check-in points
      const pts = [];
      if (route.checkin_lat != null) pts.push({ lat: route.checkin_lat, lng: route.checkin_lng });
      for (const s of route.stops || []) {
        if (s.checked_in && s.checkin_lat != null) pts.push({ lat: s.checkin_lat, lng: s.checkin_lng });
      }
      if (pos) pts.push({ lat: pos.lat, lng: pos.lng });
      let totalKm = 0;
      for (let i = 1; i < pts.length; i++) {
        totalKm += haversineKm(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
      }
      totalKm = Math.round(totalKm * 10) / 10;

      await base44.entities.TechnicianRoute.update(route.id, {
        checkout_lat: pos.lat,
        checkout_lng: pos.lng,
        checkout_at: now,
        total_km_tracked: totalKm,
        status: "Concluída",
      });
      queryClient.invalidateQueries({ queryKey: ["techRoutes"] });
      toast({ title: "Rota encerrada", description: `Check-out registrado · KM total: ${totalKm} km` });
    } catch (err) {
      toast({
        title: "Localização obrigatória",
        description: "Não foi possível capturar o GPS para o check-out. Verifique a permissão de localização e tente novamente.",
        variant: "destructive",
      });
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      {/* Route header */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <RouteIcon className="h-5 w-5 text-primary" />
              <span className="font-mono font-semibold text-base sm:text-lg">{route.code}</span>
              <Badge variant="outline">{route.status}</Badge>
            </div>
            <div className="flex gap-1.5 sm:gap-2 text-xs flex-wrap items-center">
              <Badge variant="outline" className="gap-1 bg-blue-50">{route.total_distance_km || 0} km</Badge>
              <Badge variant="outline" className={`gap-1 ${etaRecalc ? "bg-cyan-50 text-cyan-700" : "bg-emerald-50"}`}>
                {etaRecalc && <Activity className="h-3 w-3" />}
                Término {route.estimated_end_time || "—"}
              </Badge>
              {route.total_km_tracked != null && route.total_km_tracked > 0 && (
                <Badge variant="outline" className="gap-1 bg-purple-50">
                  <Gauge className="h-3 w-3" /> {route.total_km_tracked} km rodado
                </Badge>
              )}
              {isStarted && !isFinished && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs gap-1"
                  disabled={etaLoading}
                  onClick={() => recalculateEta(false)}
                  title="Recalcular previsão com trânsito em tempo real"
                >
                  <RefreshCw className={`h-3 w-3 ${etaLoading ? "animate-spin" : ""}`} />
                  {etaLoading ? "Recalculando..." : "Atualizar ETA"}
                </Button>
              )}
            </div>
          </div>

          {/* Check-in/Check-out controls */}
          <div className="flex gap-2 flex-wrap">
            {!isStarted && (
              <Button onClick={handleStartRoute} disabled={busy} className="gap-2">
                <Play className="h-4 w-4" /> Iniciar Rota (Check-in)
              </Button>
            )}
            {isStarted && !isFinished && (
              <Button
                onClick={handleEndRoute}
                disabled={busy || !allCompleted}
                variant="default"
                className="gap-2 bg-destructive hover:bg-destructive/90"
                title={!allCompleted ? "Conclua todas as OS da rota antes de encerrar" : ""}
              >
                <MapPin className="h-4 w-4" /> Encerrar Rota (Check-out)
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowRomaneio(true)} className="gap-2">
              <FileText className="h-4 w-4" /> Romaneio
            </Button>
            <Button variant="outline" onClick={() => setShowMap(true)} className="gap-2">
              <MapIcon className="h-4 w-4" /> Ver no Mapa
            </Button>
            {isFinished && (
              <Badge className="gap-1 bg-emerald-100 text-emerald-700">
                <Flag className="h-3 w-3" /> Rota Concluída · {route.total_km_tracked || 0} km
              </Badge>
            )}
          </div>

          {isStarted && !isFinished && (
            <p className="text-xs text-muted-foreground">
              {completedCount}/{stops.length} OS concluídas · {checkedInCount}/{stops.length} check-ins · Iniciada em {new Date(route.checkin_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          {isStarted && !isFinished && !allCompleted && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <Lock className="h-3 w-3" /> Encerrar rota disponível apenas após concluir todas as OS
            </p>
          )}
          {isStarted && !isFinished && allCompleted && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> O check-out exige captura de localização (GPS)
            </p>
          )}
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardContent className="pt-5">
          <RouteTimeline route={route} tosMap={tosMap} />
        </CardContent>
      </Card>

      {/* Per-stop check-in buttons */}
      {isStarted && !isFinished && stops.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> Check-in por Parada
            </h4>
            <div className="space-y-2">
              {sortedStops.map((stop) => {
                const key = stopKey(stop);
                const isParada = stop.service_type === "Parada";
                const completed = isStopCompleted(stop);
                const canCheck = canCheckIn(stop);
                const idx = sortedStops.findIndex(s => stopKey(s) === key);
                const isLast = idx === sortedStops.length - 1;
                const checkinTime = stop.checkin_at ? new Date(stop.checkin_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
                const completedTime = stop.tos_id && tosMap[stop.tos_id]?.completed_at
                  ? new Date(tosMap[stop.tos_id].completed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                  : null;

                return (
                  <div
                    key={key}
                    ref={el => stopRefs.current[key] = el}
                  >
                  <div className={`flex items-center justify-between gap-2 p-2 rounded-lg ${completed ? "bg-emerald-50/60 border border-emerald-200" : stop.checked_in ? "bg-blue-50/40 border border-blue-200" : !canCheck ? "bg-muted/20 opacity-60" : isParada ? "bg-amber/10 border border-amber/20" : "bg-muted/30"}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold shrink-0 ${completed ? "bg-emerald-500 text-white" : stop.checked_in ? "bg-primary text-primary-foreground" : isParada ? "bg-amber-500 text-white" : "bg-muted-foreground/30 text-muted-foreground"}`}>
                        {completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : isParada ? <Flag className="h-3 w-3" /> : stop.order}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {stop.os_code ? <span className="font-mono text-xs font-semibold">{stop.os_code}</span> : <span className="font-mono text-xs font-semibold text-amber-700">PARADA</span>}
                          <span className="font-medium text-sm truncate">{stop.client_name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{stop.address}</p>
                        {completed && checkinTime && (completedTime || isParada) && (
                          <p className="text-xs text-emerald-700 flex items-center gap-1 mt-0.5">
                            <Clock className="h-3 w-3" /> {checkinTime}{completedTime ? ` → ${completedTime}` : ""}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {completed ? (
                        <Badge className="gap-1 bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> Concluída
                        </Badge>
                      ) : stop.checked_in ? (
                        <>
                          <Badge className="gap-1 bg-blue-100 text-blue-700">
                            <Clock className="h-3 w-3" /> {checkinTime}
                          </Badge>
                          {stop.tos_id && onStopCheckin && (
                            <Button size="sm" variant="default" onClick={() => onStopCheckin(stop)} className="gap-1.5">
                              <Wrench className="h-3 w-3" /> OS do Técnico
                            </Button>
                          )}
                        </>
                      ) : canCheck ? (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => handleStopCheckin(stop)} className="shrink-0">
                          <Navigation className="h-3 w-3" /> Check-in
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Lock className="h-3 w-3" /> Aguarde parada anterior
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Próxima Parada button — appears after completing an OS, before the next stop */}
                  {completed && !isLast && (() => {
                    const nextStop = sortedStops[idx + 1];
                    const nextCompleted = isStopCompleted(nextStop);
                    if (nextCompleted) return null; // next already done, no need
                    const nextKey = stopKey(nextStop);
                    const nextLabel = nextStop.service_type === "Parada" ? nextStop.client_name : nextStop.os_code;
                    return (
                      <div className="flex justify-center py-1.5">
                        <Button
                          size="sm"
                          variant="default"
                          className="gap-2 bg-primary"
                          onClick={() => {
                            if (stopRefs.current[nextKey]) {
                              stopRefs.current[nextKey].scrollIntoView({ behavior: "smooth", block: "center" });
                            }
                          }}
                        >
                          <ArrowRight className="h-3.5 w-3.5" /> Próxima Parada — {nextLabel}
                        </Button>
                      </div>
                    );
                  })()}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

          <RouteRomaneioDialog open={showRomaneio} onOpenChange={setShowRomaneio} route={route} />
          <RouteMapDialog open={showMap} onOpenChange={setShowMap} route={route} />
          </div>
          );
          }