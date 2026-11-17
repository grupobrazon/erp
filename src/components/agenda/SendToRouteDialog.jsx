import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Route, MapPin, AlertCircle, CheckCircle2, Navigation, Building2, Home, Users, Plus, Trash2, Flag, Clock, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function SendToRouteDialog({ open, onOpenChange, currentDate, calendars, appointments }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedCalendarIds, setSelectedCalendarIds] = useState([]);
  const [selectedTechIds, setSelectedTechIds] = useState([]);
  const [endPointPref, setEndPointPref] = useState("auto");
  const [startPointPref, setStartPointPref] = useState("empresa");
  const [customStartAddress, setCustomStartAddress] = useState("");
  const [customEndAddress, setCustomEndAddress] = useState("");
  const [intermediateStops, setIntermediateStops] = useState([]);
  const [targetFirstStopArrival, setTargetFirstStopArrival] = useState("");

  const dateStr = useMemo(() => {
    if (!currentDate) return format(new Date(), "yyyy-MM-dd");
    if (typeof currentDate === "string") return currentDate;
    return format(currentDate, "yyyy-MM-dd");
  }, [currentDate]);

  // Get day's appointments (ALL — with or without OS)
  const dayAppts = useMemo(() => {
    return (appointments || []).filter(a => a.date === dateStr && a.status !== "Cancelado" && a.status !== "Bloqueado");
  }, [appointments, dateStr]);

  const apptsWithOS = useMemo(() => dayAppts.filter(a => a.os_id), [dayAppts]);
  const apptsWithoutOS = useMemo(() => dayAppts.filter(a => !a.os_id), [dayAppts]);

  // Get technicians from selected calendar
  const { data: technicians = [] } = useQuery({
    queryKey: ["technicians"],
    queryFn: () => base44.entities.Technician.list("-created_date", 200),
  });

  // Combine technicians from ALL selected calendars (preserving which calendar each belongs to)
  const calendarTechs = useMemo(() => {
    const result = [];
    const seen = new Set();
    for (const calId of selectedCalendarIds) {
      const cal = calendars.find(c => c.id === calId);
      if (!cal) continue;
      const calName = cal.name;
      const calTechs = cal.technicians?.length ? cal.technicians : [];
      for (const t of calTechs) {
        if (seen.has(t.technician_id)) continue;
        seen.add(t.technician_id);
        const full = technicians.find(ft => ft.id === t.technician_id);
        result.push({
          id: t.technician_id,
          name: t.technician_name || full?.name || "",
          vehicle_type: t.vehicle_type || full?.vehicle_type,
          calendar_id: calId,
          calendar_name: calName,
        });
      }
    }
    return result;
  }, [calendars, selectedCalendarIds, technicians]);

  // Map technician_id -> calendar_id (for backend route generation)
  const techCalendarMap = useMemo(() => {
    const m = {};
    calendarTechs.forEach(t => { m[t.id] = t.calendar_id; });
    return m;
  }, [calendarTechs]);

  const toggleTech = (id) => {
    setSelectedTechIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  // Distribui os agendamentos replicando o agrupamento da agenda: cada agendamento
  // vai para o técnico dono (technician_id) quando definido; os sem técnico são
  // auto-atribuídos por vehicle_type ao primeiro técnico selecionado daquele veículo
  // (mesma lógica das colunas da agenda). Agendamentos de técnico não selecionado
  // ficam de fora — assim a rota recebe só os clientes da agenda do técnico escolhido.
  const techAssignments = useMemo(() => {
    const assignments = {};
    selectedTechIds.forEach(id => { assignments[id] = []; });
    if (selectedTechIds.length === 0) return assignments;
    const selectedSet = new Set(selectedTechIds);
    const usedApptIds = new Set();
    // 1ª passada: agendamentos com technician_id explícito
    for (const appt of dayAppts) {
      if (appt.technician_id && selectedSet.has(appt.technician_id)) {
        assignments[appt.technician_id].push(appt);
        usedApptIds.add(appt.id);
      }
    }
    // 2ª passada: auto-atribuição por vehicle_type (primeiro técnico selecionado do veículo)
    selectedTechIds.forEach((techId, i) => {
      const tech = calendarTechs.find(t => t.id === techId);
      if (!tech) return;
      const firstOfVehicleIdx = selectedTechIds.findIndex(tid => {
        const t = calendarTechs.find(tt => tt.id === tid);
        return t?.vehicle_type === tech.vehicle_type;
      });
      if (firstOfVehicleIdx !== i) return; // só o primeiro técnico do veículo recebe os sem-técnico
      for (const appt of dayAppts) {
        if (usedApptIds.has(appt.id)) continue;
        if (appt.technician_id) continue; // já dono definido (mesmo que não selecionado)
        if (appt.vehicle_type === tech.vehicle_type) {
          assignments[techId].push(appt);
          usedApptIds.add(appt.id);
        }
      }
    });
    return assignments;
  }, [dayAppts, selectedTechIds, calendarTechs]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const results = [];
      for (const techId of selectedTechIds) {
        const tech = calendarTechs.find(t => t.id === techId);
        const apptIds = techAssignments[techId].map(a => a.id);
        const res = await base44.functions.invoke("generateTechnicianRoute", {
          date: dateStr,
          calendar_id: techCalendarMap[techId] || selectedCalendarIds[0],
          technician_id: techId,
          technician_name: tech?.name || "",
          appointment_ids: apptIds,
          end_point_preference: endPointPref,
          start_point_preference: startPointPref,
          custom_start_address: startPointPref === "custom" ? customStartAddress : "",
          custom_end_address: endPointPref === "custom" ? customEndAddress : "",
          intermediate_stops: intermediateStops.filter(s => s.address && s.address.trim()),
          target_first_stop_arrival: targetFirstStopArrival || "",
        });
        results.push(res.data);
      }
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["technicianRoutes"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["agendamentoRotas"] });
      const totalStops = results.reduce((s, r) => s + (r.stops_count || 0), 0);
      const totalKm = results.reduce((s, r) => s + (r.total_distance_km || 0), 0);
      toast({
        title: `${results.length} rota(s) gerada(s)`,
        description: `${totalStops} paradas · ${totalKm.toFixed(1)} km total · ${results.length} técnico(s)`,
      });
      onOpenChange(false);
      setSelectedCalendarIds([]);
      setSelectedTechIds([]);
      setEndPointPref("auto");
      setStartPointPref("empresa");
      setCustomStartAddress("");
      setCustomEndAddress("");
      setIntermediateStops([]);
      setTargetFirstStopArrival("");
    },
    onError: (err) => {
      const respData = err?.response?.data;
      const backendMsg = (typeof respData === "string" ? respData : respData?.error || respData?.message) || err?.message || "Erro desconhecido";
      toast({ title: "Erro ao gerar rota", description: backendMsg, variant: "destructive" });
    },
  });

  const selectedCals = calendars.filter(c => selectedCalendarIds.includes(c.id));
  const primaryCal = selectedCals[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            Enviar para Rota — {format(new Date(dateStr + "T00:00:00"), "dd 'de' MMMM", { locale: ptBR })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary of day's appointments */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {apptsWithOS.length} com OS · {apptsWithoutOS.length} sem OS
            </div>
            {dayAppts.length === 0 ? (
              <div className="flex items-start gap-2 text-xs text-amber-700">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>Nenhum agendamento nesta data. Crie agendamentos antes de gerar a rota.</div>
              </div>
            ) : (
              <>
                {apptsWithoutOS.length > 0 && (
                  <div className="flex items-start gap-2 text-xs text-blue-700 mb-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>{apptsWithoutOS.length} agendamento(s) sem OS serão gerados automaticamente ao criar a rota.</div>
                  </div>
                )}
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {dayAppts.map(a => (
                    <div key={a.id} className="flex items-center gap-2 text-xs">
                      {a.os_id ? (
                        <Badge variant="outline" className="bg-cyan-50 text-cyan-700">{a.os_code}</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700">OS auto</Badge>
                      )}
                      <span className="font-medium">{a.title}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div>
            <Label className="text-xs flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Calendários * (selecione um ou mais)</Label>
            <p className="text-xs text-muted-foreground mb-1.5">
              Selecione os calendários cujos técnicos farão a rota. Os agendamentos do dia (de todos os calendários visíveis) já entram todos na rota.
            </p>
            <div className="space-y-1.5 border rounded-lg p-2 max-h-40 overflow-y-auto">
              {calendars.filter(c => c.is_active !== false).map(c => {
                const checked = selectedCalendarIds.includes(c.id);
                return (
                  <label key={c.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => {
                        setSelectedCalendarIds(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]);
                        setSelectedTechIds([]);
                      }}
                    />
                    <span className="text-sm flex-1">{c.name}</span>
                    {c.technicians?.length > 0 && (
                      <Badge variant="outline" className="text-xs">{c.technicians.length} técnico(s)</Badge>
                    )}
                  </label>
                );
              })}
              {calendars.filter(c => c.is_active !== false).length === 0 && (
                <p className="text-xs text-muted-foreground py-2">Nenhum calendário ativo.</p>
              )}
            </div>
          </div>

          {/* Multi-select technicians */}
          <div>
            <Label className="text-xs flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Técnicos * (selecione um ou mais)</Label>
            {selectedCalendarIds.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Selecione um ou mais calendários primeiro.</p>
            ) : calendarTechs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Nenhum técnico nos calendários selecionados.</p>
            ) : (
              <div className="space-y-1.5 border rounded-lg p-2 max-h-40 overflow-y-auto">
                {calendarTechs.map(t => (
                  <label key={t.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer">
                    <Checkbox checked={selectedTechIds.includes(t.id)} onCheckedChange={() => toggleTech(t.id)} />
                    <span className="text-sm flex-1">{t.name}</span>
                    {selectedCalendarIds.length > 1 && t.calendar_name && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">{t.calendar_name}</Badge>
                    )}
                    {t.vehicle_type && <Badge variant="outline" className="text-xs">{t.vehicle_type}</Badge>}
                    {techAssignments[t.id]?.length > 0 && (
                      <Badge variant="secondary" className="text-xs">{techAssignments[t.id].length} OS</Badge>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* End point preference */}
          <div>
            <Label className="text-xs">Retorno do técnico (ponto de chegada)</Label>
            <Select value={endPointPref} onValueChange={setEndPointPref}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  <span className="flex items-center gap-2"><Route className="h-3.5 w-3.5" /> Automático (empresa se cedo, casa se tarde)</span>
                </SelectItem>
                <SelectItem value="empresa">
                  <span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5" /> Voltar para a empresa</span>
                </SelectItem>
                <SelectItem value="casa">
                  <span className="flex items-center gap-2"><Home className="h-3.5 w-3.5" /> Ir para casa do técnico</span>
                </SelectItem>
                <SelectItem value="custom">
                  <span className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> Endereço personalizado</span>
                </SelectItem>
              </SelectContent>
            </Select>
            {endPointPref === "custom" && (
              <Input
                className="mt-2"
                placeholder="Endereço de retorno (rua, número, bairro, cidade, UF)"
                value={customEndAddress}
                onChange={e => setCustomEndAddress(e.target.value)}
              />
            )}
          </div>

          {/* Start point preference */}
          <div>
            <Label className="text-xs">Partida do técnico (ponto de saída)</Label>
            <Select value={startPointPref} onValueChange={setStartPointPref}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="empresa">
                  <span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5" /> Sair da empresa</span>
                </SelectItem>
                <SelectItem value="casa">
                  <span className="flex items-center gap-2"><Home className="h-3.5 w-3.5" /> Sair da casa do técnico</span>
                </SelectItem>
                <SelectItem value="custom">
                  <span className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> Endereço personalizado</span>
                </SelectItem>
              </SelectContent>
            </Select>
            {startPointPref === "custom" && (
              <Input
                className="mt-2"
                placeholder="Endereço de partida (rua, número, bairro, cidade, UF)"
                value={customStartAddress}
                onChange={e => setCustomStartAddress(e.target.value)}
              />
            )}
          </div>

          {/* Target arrival time at first stop */}
          <div>
            <Label className="text-xs flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Horário alvo de chegada na primeira parada (opcional)</Label>
            <p className="text-xs text-muted-foreground mb-1.5">
              Informe o horário que o técnico precisa chegar na primeira parada. O sistema calcula o horário de saída de casa automaticamente.
            </p>
            <Input
              type="time"
              value={targetFirstStopArrival}
              onChange={e => setTargetFirstStopArrival(e.target.value)}
            />
          </div>

          {/* Intermediate stops (paradas sem OS — contabilizar KM) */}
          <div>
            <Label className="text-xs flex items-center gap-1.5"><Flag className="h-3.5 w-3.5" /> Paradas intermediárias (sem OS — para contabilizar KM)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Ex: técnico passa na fábrica antes de iniciar os atendimentos. As paradas são visitadas em ordem antes das OSs.
            </p>
            <div className="space-y-2">
              {intermediateStops.map((stop, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div className="flex-1 space-y-1">
                    <Input
                      placeholder="Endereço da parada (rua, número, bairro, cidade, UF)"
                      value={stop.address}
                      onChange={e => setIntermediateStops(prev => prev.map((s, i) => i === idx ? { ...s, address: e.target.value } : s))}
                    />
                    <Input
                      placeholder="Identificação (ex: Fábrica Brazon, Fornecedor XYZ)"
                      value={stop.label}
                      onChange={e => setIntermediateStops(prev => prev.map((s, i) => i === idx ? { ...s, label: e.target.value } : s))}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive shrink-0"
                    onClick={() => setIntermediateStops(prev => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIntermediateStops(prev => [...prev, { address: "", label: "" }])}
              >
                <Plus className="h-4 w-4 mr-1" /> Adicionar parada
              </Button>
            </div>
          </div>

          {selectedCalendarIds.length > 0 && (
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="flex items-center gap-1.5">
                <MapPin className="h-3 w-3" />
                Partida: {startPointPref === "empresa"
                  ? (primaryCal?.departure_street
                    ? `${primaryCal.departure_street}, ${primaryCal.departure_city}`
                    : "Não configurado — use o endereço global do RouteConfig")
                  : startPointPref === "casa"
                    ? "Casa do técnico"
                    : (customStartAddress || "Endereço personalizado (preencha acima)")}
              </p>
              {intermediateStops.filter(s => s.address).length > 0 && (
                <p className="flex items-center gap-1.5">
                  <Flag className="h-3 w-3" />
                  {intermediateStops.filter(s => s.address).length} parada(s) intermediária(s) antes dos atendimentos
                </p>
              )}
              <p className="flex items-center gap-1.5">
                <Route className="h-3 w-3" />
                A rota será otimizada pelo Google Maps, as OSs do Técnico serão geradas automaticamente (com os dados do agendamento) e as OSs atualizadas para "Rota Enviada".
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={selectedCalendarIds.length === 0 || selectedTechIds.length === 0 || dayAppts.length === 0 || generateMutation.isPending}
            onClick={() => generateMutation.mutate()}
          >
            {generateMutation.isPending ? (
              <><div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" /> Gerando {selectedTechIds.length} rota(s)...</>
            ) : (
              <><Navigation className="h-4 w-4 mr-1" /> Gerar {selectedTechIds.length > 0 ? `${selectedTechIds.length} Rota(s)` : "Rota"}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}