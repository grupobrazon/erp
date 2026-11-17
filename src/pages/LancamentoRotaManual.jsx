import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Flag, Navigation, Plus, Clock, CheckCircle2, AlertTriangle, Route as RouteIcon } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import EmptyState from "@/components/ui/EmptyState";

const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const geocodeAddress = async (addr) => {
  const q = [
    addr.street && addr.number ? `${addr.number} ${addr.street}` : addr.street,
    addr.neighborhood,
    addr.city,
    addr.state,
    addr.zip_code,
    "Brasil",
  ].filter(Boolean).join(", ");
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "Accept-Language": "pt-BR" } });
  const data = await res.json();
  if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display_name: data[0].display_name };
  }
  return null;
};

const formatAddrStr = (a) => {
  if (!a) return "";
  return [a.street && a.number ? `${a.street}, ${a.number}` : a.street, a.neighborhood, a.city && a.state ? `${a.city}/${a.state}` : a.city, a.zip_code && `CEP ${a.zip_code}`].filter(Boolean).join(" - ");
};

const emptyAddr = { zip_code: "", street: "", number: "", neighborhood: "", city: "", state: "" };

const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";
const fmtDateTime = (d) => d ? new Date(d).toLocaleString("pt-BR") : "—";

const REASON_OPTIONS = [
  "Treinamento",
  "Levar produto na transportadora",
  "Buscar material/peça",
  "Visita técnica externa",
  "Reunião externa",
  "Outro",
];

export default function LancamentoRotaManual() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    reason: "",
    customReason: "",
  });
  const [startLoc, setStartLoc] = useState(null);
  const [endLoc, setEndLoc] = useState(null);
  const [locating, setLocating] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const [startManual, setStartManual] = useState(emptyAddr);
  const [endManual, setEndManual] = useState(emptyAddr);
  const [startMode, setStartMode] = useState("gps"); // "gps" | "manual"
  const [endMode, setEndMode] = useState("gps");
  const [geocoding, setGeocoding] = useState(null);
  const [addrError, setAddrError] = useState(null);

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["manualRouteEntries", user?.full_name],
    queryFn: () => base44.entities.ManualRouteEntry.filter(
      { technician_name: user?.full_name || "__none__" },
      "-date",
      100
    ),
    enabled: !!user?.full_name,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => base44.entities.ManualRouteEntry.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manualRouteEntries"] });
      toast({ title: "Lançamento registrado!" });
      setShowForm(false);
      setForm({ date: new Date().toISOString().slice(0, 10), reason: "", customReason: "" });
      setStartLoc(null);
      setEndLoc(null);
      setStartManual(emptyAddr);
      setEndManual(emptyAddr);
      setStartMode("gps");
      setEndMode("gps");
      setGeoError(null);
      setAddrError(null);
    },
    onError: (err) => toast({ title: "Erro", description: err?.message, variant: "destructive" }),
  });

  const captureLocation = (which) => {
    if (!navigator.geolocation) {
      setGeoError("Seu navegador não suporta captura de localização.");
      return;
    }
    setLocating(which);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, captured_at: new Date().toISOString() };
        if (which === "start") setStartLoc(loc);
        else setEndLoc(loc);
        setLocating(null);
      },
      (err) => {
        setLocating(null);
        let msg = "Não foi possível capturar a localização.";
        if (err.code === 1) msg = "Permissão de localização negada. Autorize o acesso no navegador.";
        else if (err.code === 2) msg = "Posição indisponível. Verifique o GPS.";
        else if (err.code === 3) msg = "Tempo esgotado ao capturar localização.";
        setGeoError(msg);
        toast({ title: "Localização não capturada", description: msg, variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const kmEstimate = (startLoc && endLoc) ? haversineKm(startLoc.lat, startLoc.lng, endLoc.lat, endLoc.lng) : 0;

  const resolveLocation = async (which) => {
    const isStart = which === "start";
    const mode = isStart ? startMode : endMode;
    const manualAddr = isStart ? startManual : endManual;
    const gpsLoc = isStart ? startLoc : endLoc;

    if (mode === "gps") {
      return gpsLoc ? { loc: gpsLoc, address: "" } : null;
    }
    // Manual mode — geocode the typed address
    if (!manualAddr.street || !manualAddr.city) {
      throw new Error("Preencha pelo menos rua e cidade do endereço manual.");
    }
    setGeocoding(which);
    setAddrError(null);
    try {
      const result = await geocodeAddress(manualAddr);
      if (!result) {
        throw new Error("Endereço não encontrado. Verifique os dados ou use o CEP.");
      }
      const loc = { lat: result.lat, lng: result.lng, captured_at: new Date().toISOString() };
      return { loc, address: formatAddrStr(manualAddr) || result.display_name };
    } finally {
      setGeocoding(null);
    }
  };

  const handleSubmit = async () => {
    if (!form.date || !form.reason) {
      toast({ title: "Campos obrigatórios", description: "Preencha a data e o motivo.", variant: "destructive" });
      return;
    }
    const finalReason = form.reason === "Outro" ? form.customReason : form.reason;
    if (!finalReason) {
      toast({ title: "Motivo obrigatório", description: "Especifique o motivo do deslocamento.", variant: "destructive" });
      return;
    }
    try {
      const [startRes, endRes] = await Promise.all([
        resolveLocation("start"),
        resolveLocation("end"),
      ]);
      if (!startRes || !endRes) {
        toast({ title: "Localização obrigatória", description: "Capture a localização (GPS ou endereço) de partida e chegada.", variant: "destructive" });
        return;
      }
      const km = haversineKm(startRes.loc.lat, startRes.loc.lng, endRes.loc.lat, endRes.loc.lng);
      createMutation.mutate({
        technician_name: user?.full_name || "",
        technician_id: user?.id || "",
        date: form.date,
        reason: finalReason,
        start_lat: startRes.loc.lat,
        start_lng: startRes.loc.lng,
        start_address: startRes.address,
        start_captured_at: startRes.loc.captured_at,
        end_lat: endRes.loc.lat,
        end_lng: endRes.loc.lng,
        end_address: endRes.address,
        end_captured_at: endRes.loc.captured_at,
        km_traveled: Math.round(km * 10) / 10,
        status: "Concluída",
      });
    } catch (err) {
      setAddrError(err.message);
      toast({ title: "Erro no endereço", description: err.message, variant: "destructive" });
    }
  };

  const totalKmMonth = entries
    .filter(e => e.date && e.date.slice(0, 7) === new Date().toISOString().slice(0, 7))
    .reduce((sum, e) => sum + (e.km_traveled || 0), 0);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <RouteIcon className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-lg">Lançamento de Rota Manual</h1>
            <p className="text-xs text-muted-foreground">{user?.full_name || "—"}</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowForm(s => !s)}>
          {showForm ? "Cancelar" : <><Plus className="h-4 w-4" /> Novo</>}
        </Button>
      </div>

      {/* Summary */}
      <Card className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <Navigation className="h-4 w-4 text-primary" />
          <span className="text-[10px] text-muted-foreground uppercase font-semibold">KM Total do Mês</span>
        </div>
        <p className="text-2xl font-bold">{totalKmMonth.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">km</span></p>
      </Card>

      {/* Form */}
      {showForm && (
        <Card className="p-4 space-y-4 border-primary/30">
          <h2 className="font-semibold text-sm">Novo Lançamento de Rota Manual</h2>
          <p className="text-xs text-muted-foreground -mt-2">
            Use para registrar deslocamentos fora da rota de clientes (treinamento, transportadora, etc.).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Data <span className="text-destructive">*</span></Label>
              <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Motivo <span className="text-destructive">*</span></Label>
              <Select value={form.reason} onValueChange={v => setForm(p => ({ ...p, reason: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {REASON_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.reason === "Outro" && (
            <div>
              <Label className="text-xs">Especifique o motivo <span className="text-destructive">*</span></Label>
              <Textarea rows={2} value={form.customReason} onChange={e => setForm(p => ({ ...p, customReason: e.target.value }))} placeholder="Descreva o deslocamento..." />
            </div>
          )}

          {/* Localização de partida */}
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-sm font-medium">
                <MapPin className="h-4 w-4 text-emerald-600" /> Localização de Partida <span className="text-destructive">*</span>
              </div>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant={startMode === "gps" ? "default" : "ghost"} onClick={() => setStartMode("gps")}>GPS</Button>
                <Button type="button" size="sm" variant={startMode === "manual" ? "default" : "ghost"} onClick={() => setStartMode("manual")}>Digitar Endereço</Button>
              </div>
            </div>
            {startMode === "gps" ? (
              <div className="flex items-center gap-2 flex-wrap">
                <Button type="button" variant="outline" size="sm" onClick={() => captureLocation("start")} disabled={locating === "start"}>
                  {locating === "start" ? "Capturando..." : <><MapPin className="h-3 w-3" /> Capturar Partida</>}
                </Button>
                {startLoc && (
                  <span className="text-xs text-emerald-600 font-medium">
                    ✓ {startLoc.lat.toFixed(6)}, {startLoc.lng.toFixed(6)}
                  </span>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <Label className="text-[10px]">CEP</Label>
                    <Input value={startManual.zip_code} onChange={e => setStartManual(p => ({ ...p, zip_code: e.target.value }))} placeholder="00000-000" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px]">Rua</Label>
                    <Input value={startManual.street} onChange={e => setStartManual(p => ({ ...p, street: e.target.value }))} placeholder="Logradouro" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px]">Número</Label>
                    <Input value={startManual.number} onChange={e => setStartManual(p => ({ ...p, number: e.target.value }))} placeholder="Nº" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px]">Bairro</Label>
                    <Input value={startManual.neighborhood} onChange={e => setStartManual(p => ({ ...p, neighborhood: e.target.value }))} placeholder="Bairro" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Label className="text-[10px]">Cidade</Label>
                    <Input value={startManual.city} onChange={e => setStartManual(p => ({ ...p, city: e.target.value }))} placeholder="Cidade" />
                  </div>
                  <div>
                    <Label className="text-[10px]">UF</Label>
                    <Input value={startManual.state} onChange={e => setStartManual(p => ({ ...p, state: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="SP" />
                  </div>
                </div>
                {geocoding === "start" && <p className="text-xs text-muted-foreground">Buscando coordenadas do endereço...</p>}
              </div>
            )}
          </div>

          {/* Localização de chegada */}
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-sm font-medium">
                <Flag className="h-4 w-4 text-rose-600" /> Localização de Chegada <span className="text-destructive">*</span>
              </div>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant={endMode === "gps" ? "default" : "ghost"} onClick={() => setEndMode("gps")}>GPS</Button>
                <Button type="button" size="sm" variant={endMode === "manual" ? "default" : "ghost"} onClick={() => setEndMode("manual")}>Digitar Endereço</Button>
              </div>
            </div>
            {endMode === "gps" ? (
              <div className="flex items-center gap-2 flex-wrap">
                <Button type="button" variant="outline" size="sm" onClick={() => captureLocation("end")} disabled={locating === "end"}>
                  {locating === "end" ? "Capturando..." : <><Flag className="h-3 w-3" /> Capturar Chegada</>}
                </Button>
                {endLoc && (
                  <span className="text-xs text-rose-600 font-medium">
                    ✓ {endLoc.lat.toFixed(6)}, {endLoc.lng.toFixed(6)}
                  </span>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <Label className="text-[10px]">CEP</Label>
                    <Input value={endManual.zip_code} onChange={e => setEndManual(p => ({ ...p, zip_code: e.target.value }))} placeholder="00000-000" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px]">Rua</Label>
                    <Input value={endManual.street} onChange={e => setEndManual(p => ({ ...p, street: e.target.value }))} placeholder="Logradouro" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px]">Número</Label>
                    <Input value={endManual.number} onChange={e => setEndManual(p => ({ ...p, number: e.target.value }))} placeholder="Nº" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px]">Bairro</Label>
                    <Input value={endManual.neighborhood} onChange={e => setEndManual(p => ({ ...p, neighborhood: e.target.value }))} placeholder="Bairro" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Label className="text-[10px]">Cidade</Label>
                    <Input value={endManual.city} onChange={e => setEndManual(p => ({ ...p, city: e.target.value }))} placeholder="Cidade" />
                  </div>
                  <div>
                    <Label className="text-[10px]">UF</Label>
                    <Input value={endManual.state} onChange={e => setEndManual(p => ({ ...p, state: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="SP" />
                  </div>
                </div>
                {geocoding === "end" && <p className="text-xs text-muted-foreground">Buscando coordenadas do endereço...</p>}
              </div>
            )}
          </div>

          {(geoError || addrError) && (
            <div className="flex items-start gap-1.5 text-xs text-destructive bg-destructive/5 rounded p-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {geoError || addrError}
            </div>
          )}

          {/* KM estimado */}
          {startLoc && endLoc && (
            <div className="rounded-md bg-primary/5 border border-primary/20 p-3 flex items-center justify-between">
              <span className="text-sm font-medium">KM estimado (linha reta):</span>
              <span className="text-lg font-bold text-primary">{kmEstimate.toFixed(1)} km</span>
            </div>
          )}

          <Button className="w-full" onClick={handleSubmit} disabled={createMutation.isPending || !!geocoding || !form.reason}>
            {createMutation.isPending ? "Registrando..." : geocoding ? "Buscando endereço..." : "Registrar Lançamento"}
          </Button>
        </Card>
      )}

      {/* History */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Histórico de Lançamentos</h3>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={RouteIcon}
            title="Nenhum lançamento"
            description="Seus lançamentos de rota manual aparecerão aqui."
          />
        ) : (
          <div className="space-y-3">
            {entries.map(entry => (
              <Card key={entry.id} className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1">
                      <Clock className="h-3 w-3" /> {fmtDate(entry.date)}
                    </Badge>
                    <Badge className="bg-primary/10 text-primary gap-1">
                      <Navigation className="h-3 w-3" /> {(entry.km_traveled || 0).toFixed(1)} km
                    </Badge>
                  </div>
                  <Badge className="gap-1 bg-emerald-100 text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" /> {entry.status}
                  </Badge>
                </div>
                <p className="text-sm font-medium">{entry.reason}</p>
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  <div className="flex items-center gap-1"><MapPin className="h-3 w-3 text-emerald-600" /> Partida: {entry.start_address || `${entry.start_lat?.toFixed(6) || "—"}, ${entry.start_lng?.toFixed(6) || "—"}`} — {fmtDateTime(entry.start_captured_at)}</div>
                  <div className="flex items-center gap-1"><Flag className="h-3 w-3 text-rose-600" /> Chegada: {entry.end_address || `${entry.end_lat?.toFixed(6) || "—"}, ${entry.end_lng?.toFixed(6) || "—"}`} — {fmtDateTime(entry.end_captured_at)}</div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}