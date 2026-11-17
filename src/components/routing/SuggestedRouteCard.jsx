import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { MapPin, Banknote, Clock, Route, Calendar, GripVertical, Navigation, Search, Plus, Pin, RefreshCw, ExternalLink, Gauge, Trash2, Home, Building2, AlertTriangle, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Droppable, Draggable } from "@hello-pangea/dnd";

const periodOptions = [
  { value: "Manhã", label: "Manhã" },
  { value: "Tarde", label: "Tarde" },
  { value: "Dia Inteiro", label: "Dia Inteiro" },
];

const schedBadge = (type) => {
  if (type === "Data Específica") return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">Data fixa</Badge>;
  if (type === "Flexível") return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">Flexível</Badge>;
  return null;
};

// Compute bearing from point1 to point2 (0-360, 0=north)
function bearingFrom(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function angularDiff(b1, b2) {
  if (b1 == null || b2 == null) return 0;
  const diff = Math.abs(b1 - b2) % 360;
  return diff > 180 ? 360 - diff : diff;
}
function haversineKm(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity;
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
// Dynamic geographic feasibility check based on current stops
function computeGeoWarning(stops, depLat, depLng) {
  if (!depLat || !depLng || stops.length < 2) return null;
  const coords = stops.map(s => s.coords);
  const bearings = coords.map(c => c ? bearingFrom(depLat, depLng, c.lat, c.lng) : null);
  let maxAng = 0, maxDist = 0;
  for (let i = 0; i < coords.length; i++) {
    for (let j = i + 1; j < coords.length; j++) {
      if (bearings[i] == null || bearings[j] == null) continue;
      const diff = angularDiff(bearings[i], bearings[j]);
      if (diff > maxAng) maxAng = diff;
      if (coords[i] && coords[j]) {
        const d = haversineKm(coords[i].lat, coords[i].lng, coords[j].lat, coords[j].lng);
        if (d > maxDist) maxDist = d;
      }
    }
  }
  if (maxAng <= 135 && maxDist <= 80) return null;
  const hasFixed = stops.some(s => s.pinned_date || (s.scheduling_type === "Data Específica" && s.preferred_date));
  return {
    max_angular_diff: Math.round(maxAng),
    max_pair_distance_km: Math.round(maxDist),
    has_fixed_date_stops: hasFixed,
    message: maxAng > 135
      ? `Rota com destinos opostos (dispersão angular ${Math.round(maxAng)}°). Reorganize manualmente.`
      : `Rota muito dispersa (par mais distante ${Math.round(maxDist)} km). Reorganize manualmente.`,
  };
}

export default function SuggestedRouteCard({ dayPlan, zone, allUnassigned = [], stops, departureAddress = "", departureLat = null, departureLng = null, onStopsChange, onRecalculate, recalculating }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [technician, setTechnician] = useState("");
  const [period, setPeriod] = useState("Dia Inteiro");
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [pinReason, setPinReason] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [alerting, setAlerting] = useState(false);

  // Dynamic geographic warning — recomputes when stops change (drag, add, remove)
  const dynamicGeoWarning = computeGeoWarning(stops, departureLat, departureLng);
  const geoWarning = dynamicGeoWarning || dayPlan.geographic_warning;
  const hasGeoWarning = !!geoWarning;

  const { data: routes = [] } = useQuery({
    queryKey: ["technicianRoutes"],
    queryFn: () => base44.entities.TechnicianRoute.list("-created_date", 200),
  });

  const totalKm = (dayPlan.technician_routes || []).reduce((s, tr) => s + (tr.total_distance_km || 0), 0);
  const totalTravelMin = (dayPlan.technician_routes || []).reduce((s, tr) => s + (tr.total_travel_min || 0), 0);
  const availableTechs = dayPlan.available_techs || [];

  const searchOS = () => {
    const q = searchQuery.trim().toUpperCase();
    if (!q) return;
    const found = allUnassigned.find(os =>
      (os.os_code || "").toUpperCase().includes(q) || (os.os_id || "").includes(q)
    );
    if (found) setSearchResult(found);
    else { setSearchResult(null); toast({ title: "OS não encontrada", description: "Verifique o código ou se já está atribuída a um dia", variant: "destructive" }); }
  };

  const bringToDay = async () => {
    if (!searchResult) return;
    if (showPin && pinReason.trim()) {
      try {
        await base44.entities.ServiceOrder.update(searchResult.os_id, {
          pinned_date: dayPlan.date, pinned_reason: pinReason.trim(),
        });
      } catch (e) { toast({ title: "Erro ao fixar", description: e.message, variant: "destructive" }); return; }
    }
    onStopsChange([...stops, {
      ...searchResult, service_time: "", period: "",
      pinned_date: showPin ? dayPlan.date : null, pinned_reason: showPin ? pinReason : null,
    }]);
    toast({ title: showPin ? "OS fixada e adicionada" : "OS adicionada", description: `${searchResult.os_code} — ${searchResult.client_name}` });
    setSearchQuery(""); setSearchResult(null); setPinReason(""); setShowPin(false);
  };

  const removeStop = async (osId) => {
    const stop = stops.find(s => s.os_id === osId);
    if (stop?.pinned_date) {
      try { await base44.entities.ServiceOrder.update(osId, { pinned_date: null, pinned_reason: null }); } catch (e) {}
    }
    onStopsChange(stops.filter(s => s.os_id !== osId));
  };

  const togglePin = async (stop) => {
    if (stop.pinned_date) {
      // Unpin
      try {
        await base44.entities.ServiceOrder.update(stop.os_id, { pinned_date: null, pinned_reason: null });
        onStopsChange(stops.map(s => s.os_id === stop.os_id ? { ...s, pinned_date: null, pinned_reason: null } : s));
        toast({ title: "OS desafixada", description: `${stop.os_code} pode ser remanejada pelo motor` });
      } catch (e) { toast({ title: "Erro ao desafixar", description: e.message, variant: "destructive" }); }
    } else {
      // Pin to this date
      const reason = window.prompt("Motivo da fixação (ex: cliente pediu para remarcar):", "");
      if (reason === null) return; // cancelled
      try {
        await base44.entities.ServiceOrder.update(stop.os_id, { pinned_date: dayPlan.date, pinned_reason: reason.trim() });
        onStopsChange(stops.map(s => s.os_id === stop.os_id ? { ...s, pinned_date: dayPlan.date, pinned_reason: reason.trim() } : s));
        toast({ title: "OS fixada", description: `${stop.os_code} fixada para ${dayPlan.date}` });
      } catch (e) { toast({ title: "Erro ao fixar", description: e.message, variant: "destructive" }); }
    }
  };

  const createGeoAlert = async () => {
    setAlerting(true);
    try {
      // Find admin users (post-sales team) to alert
      const users = await base44.entities.User.list("-created_date", 50);
      const admins = users.filter(u => u.role === "admin");
      const stopSummary = stops.map(s => `${s.os_code} (${s.city || "?"})`).join(", ");
      const message = `${geoWarning.message}\n\nAtendimentos: ${stopSummary}\n\nData: ${dayPlan.day_label}, ${dayPlan.date}\nZona: ${zone?.zone_name || "N/A"}\n\nAção necessária: Reorganizar rota manualmente, entrar em contato com os clientes e remarcar conforme necessidade.`;
      for (const admin of admins) {
        await base44.entities.Alert.create({
          user_id: admin.id,
          user_name: admin.full_name || admin.email,
          type: "Outro",
          title: `Rota inviável — ${dayPlan.date} (${zone?.zone_name || "Zona"})`,
          message,
          related_sale_id: stops[0]?.sale_id || null,
          related_order_number: stops[0]?.os_code || null,
          read: false,
          created_by_name: "Sistema de Rotas",
        });
      }
      toast({ title: "Alerta enviado ao pós-venda", description: `${admins.length} administrador(es) notificado(s) para reorganização manual` });
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    } catch (e) { toast({ title: "Erro ao criar alerta", description: e.message, variant: "destructive" }); }
    finally { setAlerting(false); }
  };

  const openGoogleMaps = () => {
    const addrs = [];
    if (departureAddress) addrs.push(departureAddress);
    addrs.push(...stops.map(s => s.address_string || s.address).filter(Boolean));
    if (addrs.length === 0) return;
    const url = `https://www.google.com/maps/dir/${addrs.map(encodeURIComponent).join("/")}`;
    window.open(url, "_blank");
  };

  const createRoute = async () => {
    if (!technician) { toast({ title: "Selecione um técnico", variant: "destructive" }); return; }
    setCreating(true);
    try {
      const nextCode = `R${String(routes.length + 1).padStart(6, "0")}`;
      const route = await base44.entities.TechnicianRoute.create({
        code: nextCode, technician, date: dayPlan.date, period, status: "Planejada",
        notes: `Rota sugerida pelo sistema — ${zone?.zone_name || ""}`,
      });
      for (let i = 0; i < stops.length; i++) {
        await base44.entities.ServiceOrder.update(stops[i].os_id, { route_id: route.id, route_order: i + 1 });
      }
      toast({ title: `Rota ${nextCode} criada`, description: `${stops.length} paradas atribuídas a ${technician}` });
      queryClient.invalidateQueries({ queryKey: ["technicianRoutes"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
    } catch (e) { toast({ title: "Erro ao criar rota", description: e.message, variant: "destructive" }); }
    finally { setCreating(false); }
  };

  const renderStop = (stop, index) => {
    const content = (
      <div className="flex items-start gap-2 text-xs border-l-2 border-primary/30 pl-3 py-1.5 bg-card rounded-r">
        <span className="font-mono text-muted-foreground shrink-0 w-6">{index + 1}.</span>
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-sm">{stop.client_name}</span>
            <span className="text-muted-foreground">{stop.os_code}</span>
            {schedBadge(stop.scheduling_type)}
            {stop.pinned_date && (
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs gap-0.5">
                <Pin className="h-2.5 w-2.5" /> {stop.pinned_reason || "Fixada"}
              </Badge>
            )}
            <button onClick={() => togglePin(stop)} title={stop.pinned_date ? "Desafixar" : "Fixar nesta data"}
              className={`shrink-0 ml-auto ${stop.pinned_date ? "text-red-600 hover:text-red-700" : "text-muted-foreground hover:text-red-600"}`}>
              <Pin className={`h-3 w-3 ${stop.pinned_date ? "fill-current" : ""}`} />
            </button>
            <button onClick={() => removeStop(stop.os_id)} title="Remover da rota" className="text-muted-foreground hover:text-destructive shrink-0">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground mt-0.5">
            <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{stop.address}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {stop.service_time && (
              <Badge variant="outline" className="text-xs gap-0.5 bg-blue-50 text-blue-700 border-blue-200">
                <Clock className="h-2.5 w-2.5" /> {stop.service_time}
              </Badge>
            )}
            {stop.period && (
              <Badge variant="outline" className={`text-xs ${stop.period === "Manhã" ? "bg-yellow-50 text-yellow-700 border-yellow-200" : "bg-indigo-50 text-indigo-700 border-indigo-200"}`}>
                {stop.period}
              </Badge>
            )}
            {stop.travel_from_prev_min > 0 && (
              <Badge variant="outline" className="text-xs gap-0.5 text-muted-foreground">
                <Navigation className="h-2.5 w-2.5" /> {stop.travel_from_prev_min}min
              </Badge>
            )}
            {stop.has_payment && (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs gap-0.5">
                <Banknote className="h-2.5 w-2.5" /> R$ {stop.payment_amount?.toFixed(0)}
              </Badge>
            )}
          </div>
        </div>
      </div>
    );
    return (
      <Draggable key={stop.os_id} draggableId={stop.os_id} index={index}>
        {(provided, snapshot) => (
          <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
            className={snapshot.isDragging ? "opacity-60" : ""}>
            {content}
          </div>
        )}
      </Draggable>
    );
  };

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-card">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{dayPlan.day_label}, {dayPlan.date}</span>
          <span className="text-xs text-muted-foreground">{stops.length} paradas</span>
          {totalKm > 0 && (
            <Badge variant="outline" className="text-xs gap-0.5 bg-green-50 text-green-700 border-green-200">
              <Gauge className="h-2.5 w-2.5" /> {totalKm} km
            </Badge>
          )}
          {totalTravelMin > 0 && (
            <Badge variant="outline" className="text-xs gap-0.5 text-muted-foreground">
              <Navigation className="h-2.5 w-2.5" /> {totalTravelMin}min
            </Badge>
          )}
          {hasGeoWarning && (
            <Badge variant="outline" className="text-xs gap-0.5 bg-red-50 text-red-700 border-red-300">
              <AlertTriangle className="h-2.5 w-2.5" /> Rota inviável
            </Badge>
          )}
          {stops.length === 0 && <Badge variant="outline" className="text-xs bg-muted/50">Dia vazio</Badge>}
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={openGoogleMaps} disabled={stops.length === 0} className="gap-1.5 h-7 text-xs">
            <ExternalLink className="h-3 w-3" /> Ver rota
          </Button>
          <Button size="sm" variant="outline" onClick={onRecalculate} disabled={recalculating || stops.length === 0} className="gap-1.5 h-7 text-xs">
            {recalculating ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Recalcular
          </Button>
        </div>
      </div>

      {/* Geographic warning banner */}
      {hasGeoWarning && (
        <div className="border border-red-300 bg-red-50 rounded-lg p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-800">Rota geograficamente inviável</p>
              <p className="text-xs text-red-700 mt-0.5">{geoWarning.message}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-red-600">
                {geoWarning.max_angular_diff > 135 && <span>Dispersão: {geoWarning.max_angular_diff}°</span>}
                {geoWarning.max_pair_distance_km > 0 && <span>Par +distante: {geoWarning.max_pair_distance_km} km</span>}
                {geoWarning.has_fixed_date_stops && <span className="font-medium">Inclui atendimentos com data fixa</span>}
              </div>
              <p className="text-xs text-red-700 mt-1.5">
                Envio ao técnico bloqueado. Reorganize as paradas, remova destinos opostos ou alerte o pós-venda para contato manual com o cliente.
              </p>
            </div>
          </div>
          <Button size="sm" variant="destructive" onClick={createGeoAlert} disabled={alerting} className="gap-1.5 h-7 text-xs w-full">
            {alerting ? <Clock className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />} Alertar Pós-venda para Reorganização Manual
          </Button>
        </div>
      )}

      {/* Search OS */}
      <div className="border rounded-lg p-2 space-y-2 bg-muted/20">
        <div className="flex gap-1.5">
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); searchOS(); } }}
            placeholder="Buscar OS por código..."
            className="h-7 text-xs" />
          <Button size="sm" variant="outline" onClick={searchOS} className="h-7 px-2 shrink-0">
            <Search className="h-3 w-3" />
          </Button>
        </div>
        {searchResult && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs bg-card border rounded p-1.5">
              <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="font-medium">{searchResult.os_code}</span>
              <span className="truncate flex-1">{searchResult.client_name} — {searchResult.city || "Sem cidade"}</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input type="checkbox" checked={showPin} onChange={e => setShowPin(e.target.checked)} className="h-3 w-3" />
                Fixar nesta data
              </label>
              {showPin && (
                <Input value={pinReason} onChange={e => setPinReason(e.target.value)}
                  placeholder="Motivo (ex: cliente pediu para remarcar)"
                  className="h-7 text-xs flex-1" />
              )}
              <Button size="sm" onClick={bringToDay} className="h-7 text-xs gap-1 shrink-0">
                <Plus className="h-3 w-3" /> Trazer
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Departure point (company) — non-draggable origin marker */}
      {departureAddress && stops.length > 0 && (
        <div className="flex items-start gap-2 text-xs border-l-2 border-primary pl-3 py-1.5 bg-primary/5 rounded-r">
          <span className="font-mono text-primary shrink-0 w-6 flex items-center gap-0.5">
            <Building2 className="h-3 w-3" /> 0.
          </span>
          <div className="flex-1 min-w-0">
            <span className="font-medium text-sm">Partida — Empresa</span>
            <div className="flex items-center gap-1 text-muted-foreground mt-0.5">
              <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{departureAddress}</span>
            </div>
          </div>
        </div>
      )}

      {/* Stops — Droppable (supports cross-day drag via parent DragDropContext) */}
      {stops.length === 0 ? (
        <Droppable droppableId={dayPlan.date}>
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps}
              className="text-xs text-muted-foreground py-6 text-center border-2 border-dashed rounded-lg min-h-[60px] flex items-center justify-center">
              <div>
                <Home className="h-4 w-4 mx-auto mb-1 opacity-30" />
                Dia vazio — arraste atendimentos ou busque acima
              </div>
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      ) : (
        <Droppable droppableId={dayPlan.date}>
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5 min-h-[40px]">
              {stops.map((stop, i) => renderStop(stop, i))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      )}

      {/* Create route */}
      <div className="flex items-end gap-2 pt-2 border-t">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Técnico</label>
          <Select value={technician} onValueChange={setTechnician}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecionar técnico..." /></SelectTrigger>
            <SelectContent>
              {availableTechs.length > 0 ? availableTechs.map(t => (
                <SelectItem key={t.id} value={t.name}>{t.name} {t.vehicle_type === "Moto" ? "🏍️" : "🚗"}</SelectItem>
              )) : <SelectItem value="_none" disabled>Sem técnico disponível</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        <div className="w-32">
          <label className="text-xs text-muted-foreground">Período</label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{periodOptions.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={createRoute} disabled={creating || !technician || technician === "_none" || stops.length === 0 || hasGeoWarning} className="gap-1.5 shrink-0" title={hasGeoWarning ? "Rota inviável — não pode ser enviada ao técnico" : undefined}>
          {creating ? <Clock className="h-3.5 w-3.5 animate-spin" /> : <Route className="h-3.5 w-3.5" />} Criar Rota
        </Button>
      </div>
    </div>
  );
}