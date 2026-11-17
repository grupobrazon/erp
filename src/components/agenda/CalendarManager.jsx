import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Calendar, MapPin, Layers, Building2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { CALENDAR_COLORS, getColorClasses } from "@/lib/calendarColors";
import RegionCoverageMap, { STATE_CENTERS } from "@/components/agenda/RegionCoverageMap";
import ZoneGenerationPanel from "@/components/agenda/ZoneGenerationPanel";
import CoverageCitiesPanel from "@/components/agenda/CoverageCitiesPanel";
import CalendarServiceConfig from "@/components/agenda/CalendarServiceConfig";
import CalendarGroupManager from "@/components/agenda/CalendarGroupManager";
import ErrorBoundary from "@/components/ui/ErrorBoundary";

const BRAZILIAN_STATES = Object.keys(STATE_CENTERS).sort();

const DEFAULT_FORM = { name: "", color: "blue", city: "", description: "", is_active: true, allow_any_region: false, group_id: "", group_name: "", state: "", center_city: "", coverage_radius_km: 0, center_lat: null, center_lng: null, coverage_cities: [], period_mode: "Dia Inteiro", service_start_time: "08:00", service_end_time: "18:00", lunch_start_time: "", lunch_end_time: "", technicians_count: 1, vehicle_type: "", technicians: [], calendar_services: [],   capacity_moto_manha: 4, capacity_moto_tarde: 5, capacity_carro_manha: 4, capacity_carro_tarde: 5, min_advance_business_days: 2, car_first_rule: true, moto_can_use_car_slots: true, departure_street: "", departure_number: "", departure_neighborhood: "", departure_city: "", departure_state: "", departure_zip: "", period_regions: [{ period: "Dia Inteiro", region_id: "", region_name: "" }] };

export default function CalendarManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editCalendar, setEditCalendar] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [groupMgrOpen, setGroupMgrOpen] = useState(false);

  const { data: calendars = [] } = useQuery({
    queryKey: ["calendarioRotas"],
    queryFn: () => base44.entities.CalendarioRota.list("-created_date", 200),
  });

  // Zonas vinculadas ao calendário em edição (para exibir no mapa — compartilha cache com ZoneGenerationPanel)
  const { data: calendarZones = [] } = useQuery({
    queryKey: ["routeZones", "calendar", editCalendar?.id],
    queryFn: () => base44.entities.RouteZone.filter({ calendar_id: editCalendar.id }, "-created_date", 200),
    enabled: !!editCalendar?.id,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["calendarGroups"],
    queryFn: () => base44.entities.CalendarGroup.list("-created_date", 200),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editCalendar) {
        return base44.entities.CalendarioRota.update(editCalendar.id, form);
      }
      return base44.entities.CalendarioRota.create(form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendarioRotas"] });
      toast({ title: editCalendar ? "Calendário atualizado" : "Calendário criado" });
      setOpen(false);
      setEditCalendar(null);
      setForm(DEFAULT_FORM);
    },
    onError: (err) => toast({ title: "Erro", description: err?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CalendarioRota.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendarioRotas"] });
      queryClient.invalidateQueries({ queryKey: ["agendamentoRotas"] });
      toast({ title: "Calendário excluído" });
    },
    onError: (err) => toast({ title: "Erro", description: err?.message, variant: "destructive" }),
  });

  const openNew = () => {
    setEditCalendar(null);
    setForm(DEFAULT_FORM);
    setOpen(true);
  };

  const openEdit = (cal) => {
    setEditCalendar(cal);
    setForm({
      name: cal.name || "",
      color: cal.color || "blue",
      city: cal.city || "",
      description: cal.description || "",
      is_active: cal.is_active !== false,
      allow_any_region: cal.allow_any_region === true,
      group_id: cal.group_id || "",
      group_name: cal.group_name || "",
      state: cal.state || "",
      center_city: cal.center_city || "",
      coverage_radius_km: cal.coverage_radius_km || 0,
      center_lat: cal.center_lat ?? null,
      center_lng: cal.center_lng ?? null,
      coverage_cities: cal.coverage_cities || [],
      period_mode: cal.period_mode || "Dia Inteiro",
      service_start_time: cal.service_start_time || "",
      service_end_time: cal.service_end_time || "",
      lunch_start_time: cal.lunch_start_time || "",
      lunch_end_time: cal.lunch_end_time || "",
      technicians_count: cal.technicians_count ?? 1,
      vehicle_type: cal.vehicle_type || "",
      technicians: cal.technicians || [],
      calendar_services: cal.calendar_services || [],
      capacity_moto_manha: cal.capacity_moto_manha ?? 4,
      capacity_moto_tarde: cal.capacity_moto_tarde ?? 5,
      capacity_carro_manha: cal.capacity_carro_manha ?? 4,
      capacity_carro_tarde: cal.capacity_carro_tarde ?? 5,
      min_advance_business_days: cal.min_advance_business_days ?? 2,
      car_first_rule: cal.car_first_rule !== false,
      moto_can_use_car_slots: cal.moto_can_use_car_slots !== false,
      departure_street: cal.departure_street || "",
      departure_number: cal.departure_number || "",
      departure_neighborhood: cal.departure_neighborhood || "",
      departure_city: cal.departure_city || "",
      departure_state: cal.departure_state || "",
      departure_zip: cal.departure_zip || "",
      period_regions: cal.period_regions || (cal.period_mode === "Periodos"
        ? [{ period: "Manha", region_id: "", region_name: "" }, { period: "Tarde", region_id: "", region_name: "" }]
        : [{ period: "Dia Inteiro", region_id: "", region_name: "" }]),
    });
    setOpen(true);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" onClick={openNew}>
          <Plus className="h-4 w-4" /> Gerenciar Calendários
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            {editCalendar ? "Editar Calendário" : "Novo Calendário"}
          </DialogTitle>
        </DialogHeader>

        {/* Existing calendars list */}
        {calendars.length > 0 && !editCalendar && (
          <div className="space-y-1.5 max-h-40 overflow-y-auto border rounded-lg p-2">
            {calendars.map(cal => {
              const colors = getColorClasses(cal.color);
              return (
                <div key={cal.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50">
                  <span className={`w-3 h-3 rounded-full ${colors.dot}`} />
                  <span className="font-medium text-sm flex-1">{cal.name}</span>
                  {cal.city && <span className="text-xs text-muted-foreground">{cal.city}</span>}
                  {!cal.is_active && <span className="text-xs text-muted-foreground">(inativo)</span>}
                  {cal.allow_any_region && <span className="text-xs text-amber-600">(qualquer região)</span>}
                  {cal.period_mode === "Periodos" && <span className="text-xs text-indigo-600">(manhã/tarde)</span>}
                  {cal.group_name && <span className="text-xs text-primary font-medium">grupo: {cal.group_name}</span>}
                  {cal.technicians_count > 0 && <span className="text-xs text-muted-foreground">{cal.technicians_count}téc</span>}
                  {cal.vehicle_type && <span className="text-xs text-muted-foreground">{cal.vehicle_type}</span>}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cal)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMutation.mutate(cal.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Form */}
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome do Calendário *</Label>
            <Input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Ex: Belo Horizonte, Contagem, Grande BH"
            />
          </div>
          <div>
            <Label className="text-xs">Cor do Calendário</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {CALENDAR_COLORS.map(c => {
                const colors = getColorClasses(c.value);
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, color: c.value }))}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border-2 text-xs font-medium transition ${form.color === c.value ? "border-foreground" : "border-transparent bg-muted/50"}`}
                  >
                    <span className={`w-4 h-4 rounded-full ${colors.dot}`} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label className="text-xs">Cidade (opcional)</Label>
            <Input
              value={form.city}
              onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
              placeholder="Cidade associada"
            />
          </div>
          <div>
            <Label className="text-xs">Descrição (opcional)</Label>
            <Textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Observações sobre este calendário"
              rows={2}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={form.is_active}
              onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))}
            />
            <span className="text-sm">Calendário ativo</span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer rounded-lg border p-3 bg-amber-50/40">
            <Checkbox
              checked={form.allow_any_region}
              onCheckedChange={v => setForm(p => ({ ...p, allow_any_region: v }))}
              className="mt-0.5"
            />
            <div>
              <span className="text-sm font-medium">Permitir qualquer região</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permite agendar clientes sem região atribuída neste calendário (calendário avulso/genérico). Desmarcado = exige que o cliente pertença à região do calendário.
              </p>
            </div>
          </label>

          {/* Grupo de Calendários */}
          <div className="rounded-lg border p-3 bg-primary/5">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-primary" /> Grupo de Calendários
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setGroupMgrOpen(true)}
              >
                <Layers className="h-4 w-4" /> Gerenciar Grupos
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Calendários do mesmo grupo compartilham o mesmo pool de técnicos. O dia é dividido pela quantidade de técnicos do grupo — cada técnico atende apenas uma região por dia.
            </p>
            <Select
              value={form.group_id || "none"}
              onValueChange={v => {
                const grp = groups.find(g => g.id === v);
                setForm(p => ({
                  ...p,
                  group_id: v === "none" ? "" : v,
                  group_name: grp?.name || "",
                  technicians: v === "none" ? p.technicians : (grp?.technicians || []),
                  technicians_count: v === "none" ? p.technicians_count : (grp?.technicians?.length || 1),
                }));
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecione um grupo (opcional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Nenhum (técnicos próprios) —</SelectItem>
                {groups.map(g => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name} ({g.technicians_count || 0} técnicos)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.group_id && (
              <p className="text-xs text-primary mt-1.5 font-medium">
                ✓ Técnicos gerenciados pelo grupo "{form.group_name}". Os técnicos abaixo são somente leitura — edite no grupo.
              </p>
            )}
          </div>
        </div>

        {/* Região de Atuação */}
        <div className="space-y-3 border-t pt-4">
          <div>
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-primary" /> Região de Atuação
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Defina o estado, a cidade central e o raio de atuação. Clique no mapa para posicionar o centro.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Estado (UF)</Label>
              <Select
                value={form.state || "none"}
                onValueChange={(v) => {
                  const state = v === "none" ? "" : v;
                  const sc = state ? STATE_CENTERS[state] : null;
                  setForm(p => ({
                    ...p,
                    state,
                    center_lat: sc && !p.center_lat ? sc.lat : p.center_lat,
                    center_lng: sc && !p.center_lng ? sc.lng : p.center_lng,
                  }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecionar estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nenhum —</SelectItem>
                  {BRAZILIAN_STATES.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Cidade Central</Label>
              <Input
                value={form.center_city}
                onChange={e => setForm(p => ({ ...p, center_city: e.target.value }))}
                placeholder="Ex: São Paulo, Belo Horizonte"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Raio de Atuação (km)</Label>
            <Input
              type="number"
              min={0}
              value={form.coverage_radius_km || ""}
              onChange={e => setForm(p => ({ ...p, coverage_radius_km: parseFloat(e.target.value) || 0 }))}
              placeholder="Ex: 50 (raio de 50km a partir do centro)"
            />
          </div>
          <ErrorBoundary>
            <RegionCoverageMap
              state={form.state}
              centerLat={form.center_lat}
              centerLng={form.center_lng}
              radiusKm={form.coverage_radius_km}
              zones={calendarZones}
              onCenterChange={({ lat, lng }) => setForm(p => ({ ...p, center_lat: lat, center_lng: lng }))}
            />
          </ErrorBoundary>

          {/* Cidades cobertas pela região (interior / multi-cidade) */}
          <CoverageCitiesPanel
            state={form.state}
            centerCity={form.center_city}
            radiusKm={form.coverage_radius_km}
            cities={form.coverage_cities}
            onCitiesChange={(cities) => setForm(p => ({ ...p, coverage_cities: cities }))}
          />
          {(form.center_lat != null || form.coverage_radius_km > 0) && (
            <p className="text-xs text-muted-foreground">
              Centro: {form.center_lat?.toFixed(4)}, {form.center_lng?.toFixed(4)}
              {form.coverage_radius_km > 0 && ` · Raio: ${form.coverage_radius_km}km`}
            </p>
          )}
        </div>

        {/* Ponto de Partida (Empresa) — de onde os técnicos saem para a rota */}
        <div className="space-y-3 border-t pt-4">
          <div>
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-primary" /> Ponto de Partida (Empresa)
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Endereço de onde os técnicos saem no início do dia. A rota é calculada a partir deste ponto. Se vazio, usa o endereço global do RouteConfig.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Logradouro</Label>
              <Input value={form.departure_street} onChange={e => setForm(p => ({ ...p, departure_street: e.target.value }))} placeholder="Rua, avenida..." />
            </div>
            <div>
              <Label className="text-xs">Número</Label>
              <Input value={form.departure_number} onChange={e => setForm(p => ({ ...p, departure_number: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Bairro</Label>
              <Input value={form.departure_neighborhood} onChange={e => setForm(p => ({ ...p, departure_neighborhood: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Cidade</Label>
              <Input value={form.departure_city} onChange={e => setForm(p => ({ ...p, departure_city: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">UF</Label>
              <Select value={form.departure_state || "none"} onValueChange={v => setForm(p => ({ ...p, departure_state: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {BRAZILIAN_STATES.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">CEP</Label>
              <Input value={form.departure_zip} onChange={e => setForm(p => ({ ...p, departure_zip: e.target.value }))} placeholder="00000-000" />
            </div>
          </div>
        </div>

        {/* Parametrização de Períodos, Horários, Técnicos, Veículos e Serviços */}
        <CalendarServiceConfig form={form} setForm={setForm} />

        {/* Geração de Zonas com IA (apenas ao editar um calendário já salvo) */}
        {editCalendar && (
          <ZoneGenerationPanel calendar={editCalendar} />
        )}

        <DialogFooter>
          {editCalendar && (
            <Button variant="ghost" onClick={() => { setEditCalendar(null); setForm(DEFAULT_FORM); }}>
              Novo Calendário
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
          <Button
            disabled={!form.name || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Salvando..." : editCalendar ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <CalendarGroupManager open={groupMgrOpen} onOpenChange={setGroupMgrOpen} />
    </>
  );
}