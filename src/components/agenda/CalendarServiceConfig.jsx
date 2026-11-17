import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Bike, Car, Plus, Trash2, Wrench, MapPinned, User, Settings, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function CalendarServiceConfig({ form, setForm }) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const { data: services = [] } = useQuery({
    queryKey: ["services", "active"],
    queryFn: () => base44.entities.Service.filter({ is_active: true }, "name", 200),
  });

  const { data: regions = [] } = useQuery({
    queryKey: ["regionalVizinhanca"],
    queryFn: () => base44.entities.RegionalVizinhanca.list("-created_date", 500),
  });

  // Group regionals by area for the select dropdown
  const regionsByArea = regions.reduce((acc, r) => {
    const area = r.area || "Outras";
    if (!acc[area]) acc[area] = [];
    acc[area].push(r);
    return acc;
  }, {});
  const areaOrder = ["BH Capital", "Grande BH", "SP Capital", "Grande SP", "Outras"];

  const { data: technicians = [] } = useQuery({
    queryKey: ["technicians", "active"],
    queryFn: () => base44.entities.Technician.filter({ is_active: true }, "name", 200),
  });

  const calendarTechnicians = form.technicians || [];

  const addTechnician = () => {
    setForm(p => ({
      ...p,
      technicians: [...(p.technicians || []), { technician_id: "", technician_name: "", vehicle_type: "Carro" }],
      technicians_count: (p.technicians || []).length + 1,
    }));
  };

  const updateTechnician = (idx, field, value) => {
    setForm(p => {
      const ts = [...(p.technicians || [])];
      ts[idx] = { ...ts[idx], [field]: value };
      if (field === "technician_id") {
        const tech = technicians.find(t => t.id === value);
        ts[idx].technician_name = tech?.name || "";
        if (!ts[idx].vehicle_type && tech?.vehicle_type) ts[idx].vehicle_type = tech.vehicle_type;
      }
      return { ...p, technicians: ts, technicians_count: ts.length };
    });
  };

  const removeTechnician = (idx) => {
    setForm(p => {
      const ts = (p.technicians || []).filter((_, i) => i !== idx);
      return { ...p, technicians: ts, technicians_count: ts.length };
    });
  };

  const periodOptions = form.period_mode === "Periodos"
    ? [{ value: "Manha", label: "Manhã" }, { value: "Tarde", label: "Tarde" }]
    : [{ value: "Dia Inteiro", label: "Dia Inteiro" }];

  // Ensure period_regions matches the current period_mode
  const ensurePeriodRegions = (mode) => {
    const opts = mode === "Periodos"
      ? ["Manha", "Tarde"]
      : ["Dia Inteiro"];
    const existing = form.period_regions || [];
    const kept = existing.filter(pr => opts.includes(pr.period));
    const newOnes = opts.filter(p => !kept.find(pr => pr.period === p)).map(p => ({ period: p, region_id: "", region_name: "" }));
    return [...kept, ...newOnes];
  };

  const updatePeriodRegion = (period, field, value) => {
    setForm(p => {
      const prs = [...(p.period_regions || [])];
      const idx = prs.findIndex(pr => pr.period === period);
      if (idx === -1) {
        prs.push({ period, [field]: value, region_name: field === "region_id" ? (regions.find(r => r.id === value)?.regional || "") : "" });
      } else {
        prs[idx] = { ...prs[idx], [field]: value };
        if (field === "region_id") prs[idx].region_name = regions.find(r => r.id === value)?.regional || "";
      }
      return { ...p, period_regions: prs };
    });
  };

  const addCalendarService = () => {
    setForm(p => ({
      ...p,
      calendar_services: [...(p.calendar_services || []), { service_id: "", service_name: "", duration_minutes: 60 }],
    }));
  };

  const updateCalendarService = (idx, field, value) => {
    setForm(p => {
      const cs = [...(p.calendar_services || [])];
      cs[idx] = { ...cs[idx], [field]: value };
      if (field === "service_id") {
        const svc = services.find(s => s.id === value);
        cs[idx].service_name = svc?.name || "";
      }
      return { ...p, calendar_services: cs };
    });
  };

  const removeCalendarService = (idx) => {
    setForm(p => ({
      ...p,
      calendar_services: (p.calendar_services || []).filter((_, i) => i !== idx),
    }));
  };

  return (
    <div className="space-y-4 border-t pt-4">
      {/* Períodos e Horários */}
      <div>
        <Label className="text-sm font-semibold flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-primary" /> Períodos e Horários de Atendimento
        </Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          Defina se a agenda é fechada o dia inteiro para a região ou dividida em manhã e tarde.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { value: "Dia Inteiro", label: "Dia Inteiro", desc: "Agenda fechada o dia todo" },
          { value: "Periodos", label: "Manhã / Tarde", desc: "Dividido em dois períodos" },
        ].map(opt => {
          const active = (form.period_mode || "Dia Inteiro") === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setForm(p => ({ ...p, period_mode: opt.value, period_regions: ensurePeriodRegions(opt.value) }))}
              className={`flex flex-col items-start gap-0.5 p-3 rounded-lg border-2 text-left transition ${active ? "border-primary bg-primary/5" : "border-muted hover:bg-muted/50"}`}
            >
              <span className="text-sm font-medium">{opt.label}</span>
              <span className="text-xs text-muted-foreground">{opt.desc}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Início do Atendimento</Label>
          <Input
            type="time"
            value={form.service_start_time || ""}
            onChange={e => setForm(p => ({ ...p, service_start_time: e.target.value }))}
          />
        </div>
        <div>
          <Label className="text-xs">Fim do Atendimento</Label>
          <Input
            type="time"
            value={form.service_end_time || ""}
            onChange={e => setForm(p => ({ ...p, service_end_time: e.target.value }))}
          />
        </div>
        <div>
          <Label className="text-xs">Início do Almoço (opcional)</Label>
          <Input
            type="time"
            value={form.lunch_start_time || ""}
            onChange={e => setForm(p => ({ ...p, lunch_start_time: e.target.value }))}
          />
        </div>
        <div>
          <Label className="text-xs">Fim do Almoço (opcional)</Label>
          <Input
            type="time"
            value={form.lunch_end_time || ""}
            onChange={e => setForm(p => ({ ...p, lunch_end_time: e.target.value }))}
          />
        </div>
      </div>

      {/* Técnicos e Veículos */}
      <div className="border-t pt-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold flex items-center gap-1.5">
            <User className="h-4 w-4 text-primary" /> Técnicos {form.group_id ? "do Grupo" : "do Calendário"}
          </Label>
          {!form.group_id && (
            <Button type="button" variant="outline" size="sm" onClick={addTechnician} className="h-7 gap-1">
              <Plus className="h-3.5 w-3.5" /> Adicionar Técnico
            </Button>
          )}
        </div>
        {form.group_id ? (
          <>
            <p className="text-xs text-primary mt-0.5 mb-2 font-medium">
              Pool de técnicos do grupo "{form.group_name}" — compartilhado entre todos os calendários do grupo. Edite pelo botão "Gerenciar Grupos".
            </p>
            <div className="space-y-2">
              {calendarTechnicians.map((t, idx) => (
                <div key={idx} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/40">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">Técnico {idx + 1}</span>
                  <span className="flex-1 text-sm font-medium">{t.technician_name || "—"}</span>
                  <Badge variant="outline" className="text-xs gap-1">
                    {t.vehicle_type === "Moto" ? <Bike className="h-3 w-3" /> : <Car className="h-3 w-3" />}
                    {t.vehicle_type || "Carro"}
                  </Badge>
                </div>
              ))}
              {calendarTechnicians.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Nenhum técnico no pool do grupo. Abra "Gerenciar Grupos" para adicionar.</p>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">
              Vincule este calendário a um grupo para compartilhar técnicos, ou adicione técnicos próprios abaixo.
            </p>
            <div className="space-y-2">
              {calendarTechnicians.map((t, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">Técnico {idx + 1}</span>
                  <Select
                    value={t.technician_id || "none"}
                    onValueChange={v => updateTechnician(idx, "technician_id", v === "none" ? "" : v)}
                  >
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Selecionar técnico" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Nenhum —</SelectItem>
                      {technicians.map(tech => (
                        <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={t.vehicle_type || "Carro"}
                    onValueChange={v => updateTechnician(idx, "vehicle_type", v)}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Carro"><span className="flex items-center gap-1.5"><Car className="h-3.5 w-3.5" /> Carro</span></SelectItem>
                      <SelectItem value="Moto"><span className="flex items-center gap-1.5"><Bike className="h-3.5 w-3.5" /> Moto</span></SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeTechnician(idx)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
              {calendarTechnicians.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Nenhum técnico vinculado. Clique em "Adicionar Técnico" ou vincule a um grupo.</p>
              )}
            </div>
          </>
        )}
        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
          <span>{calendarTechnicians.length} técnico(s) {form.group_id ? "no pool do grupo" : "por período"}</span>
          {calendarTechnicians.filter(t => t.vehicle_type === "Moto").length > 0 && (
            <span className="flex items-center gap-1"><Bike className="h-3.5 w-3.5" /> {calendarTechnicians.filter(t => t.vehicle_type === "Moto").length} moto(s)</span>
          )}
          {calendarTechnicians.filter(t => t.vehicle_type === "Carro").length > 0 && (
            <span className="flex items-center gap-1"><Car className="h-3.5 w-3.5" /> {calendarTechnicians.filter(t => t.vehicle_type === "Carro").length} carro(s)</span>
          )}
        </div>
      </div>

      {/* Capacidade de Atendimento por Dia */}
      <div className="border-t pt-3">
        <Label className="text-sm font-semibold flex items-center gap-1.5">
          <Wrench className="h-4 w-4 text-primary" /> Capacidade de Atendimento por Dia
        </Label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2">
          Média de atendimentos que cabem por dia, por veículo e período. Ex: moto = 4 de manhã + 5 à tarde = 9/dia. O sistema usa estes limites para alertar quando uma data está cheia.
        </p>
        {form.period_mode === "Periodos" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 rounded-lg border p-2.5">
              <div className="text-xs font-medium flex items-center gap-1.5"><Bike className="h-3.5 w-3.5" /> Moto</div>
              <div className="flex items-center gap-2">
                <Label className="text-xs w-16">Manhã</Label>
                <Input type="number" min={0} value={form.capacity_moto_manha ?? 4} onChange={e => setForm(p => ({ ...p, capacity_moto_manha: parseInt(e.target.value) || 0 }))} className="w-20" />
                <span className="text-xs text-muted-foreground">clientes</span>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs w-16">Tarde</Label>
                <Input type="number" min={0} value={form.capacity_moto_tarde ?? 5} onChange={e => setForm(p => ({ ...p, capacity_moto_tarde: parseInt(e.target.value) || 0 }))} className="w-20" />
                <span className="text-xs text-muted-foreground">clientes</span>
              </div>
            </div>
            <div className="space-y-2 rounded-lg border p-2.5">
              <div className="text-xs font-medium flex items-center gap-1.5"><Car className="h-3.5 w-3.5" /> Carro</div>
              <div className="flex items-center gap-2">
                <Label className="text-xs w-16">Manhã</Label>
                <Input type="number" min={0} value={form.capacity_carro_manha ?? 4} onChange={e => setForm(p => ({ ...p, capacity_carro_manha: parseInt(e.target.value) || 0 }))} className="w-20" />
                <span className="text-xs text-muted-foreground">clientes</span>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs w-16">Tarde</Label>
                <Input type="number" min={0} value={form.capacity_carro_tarde ?? 5} onChange={e => setForm(p => ({ ...p, capacity_carro_tarde: parseInt(e.target.value) || 0 }))} className="w-20" />
                <span className="text-xs text-muted-foreground">clientes</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 rounded-lg border p-2.5">
              <Bike className="h-4 w-4" />
              <Label className="text-xs flex-1">Moto (dia)</Label>
              <Input type="number" min={0} value={form.capacity_moto_manha ?? 9} onChange={e => setForm(p => ({ ...p, capacity_moto_manha: parseInt(e.target.value) || 0, capacity_moto_tarde: 0 }))} className="w-20" />
              <span className="text-xs text-muted-foreground">clientes</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border p-2.5">
              <Car className="h-4 w-4" />
              <Label className="text-xs flex-1">Carro (dia)</Label>
              <Input type="number" min={0} value={form.capacity_carro_manha ?? 9} onChange={e => setForm(p => ({ ...p, capacity_carro_manha: parseInt(e.target.value) || 0, capacity_carro_tarde: 0 }))} className="w-20" />
              <span className="text-xs text-muted-foreground">clientes</span>
            </div>
          </div>
        )}
      </div>

      {/* Regras de Agendamento (engrenagem) */}
      <div className="border-t pt-3">
        <button
          type="button"
          onClick={() => setRulesOpen(o => !o)}
          className="w-full flex items-center gap-1.5 text-sm font-semibold text-left hover:text-primary transition"
        >
          <Settings className="h-4 w-4 text-primary" />
          Regras de Agendamento
          {rulesOpen ? <ChevronDown className="h-4 w-4 ml-auto" /> : <ChevronRight className="h-4 w-4 ml-auto" />}
        </button>
        {rulesOpen && (
          <div className="mt-2 space-y-3">
            <div>
              <Label className="text-xs">Antecedência Mínima (dias úteis)</Label>
              <Input
                type="number"
                min={0}
                value={form.min_advance_business_days ?? 2}
                onChange={e => setForm(p => ({ ...p, min_advance_business_days: parseInt(e.target.value) || 0 }))}
                className="w-24"
              />
              <p className="text-xs text-muted-foreground mt-0.5">
                Bloqueia o vendedor de marcar com menos antecedência. Padrão 2 — dá tempo para a logística remanejar agendas.
              </p>
            </div>
            <label className="flex items-start gap-2 cursor-pointer rounded-lg border p-2.5 bg-blue-50/40">
              <Checkbox
                checked={form.car_first_rule !== false}
                onCheckedChange={v => setForm(p => ({ ...p, car_first_rule: v }))}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium">Regra do Primeiro Carro</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  O primeiro atendimento do técnico de carro no dia deve ser de um cliente que precisa de carro. Após o primeiro carro, clientes de moto podem ser puxados para o técnico de carro (overflow).
                </p>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer rounded-lg border p-2.5 bg-blue-50/40">
              <Checkbox
                checked={form.moto_can_use_car_slots !== false}
                onCheckedChange={v => setForm(p => ({ ...p, moto_can_use_car_slots: v }))}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium">Moto pode usar slots de Carro</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Permite que atendimentos de moto ocupem slots de carro quando os slots de moto estiverem cheios (overflow). Desative para forçar que moto só use slots de moto.
                </p>
              </div>
            </label>
          </div>
        )}
      </div>

      {/* Serviços do Calendário */}
      <div className="border-t pt-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold flex items-center gap-1.5">
            <Wrench className="h-4 w-4 text-primary" /> Serviços Realizados
          </Label>
          <Button type="button" variant="outline" size="sm" onClick={addCalendarService} className="h-7 gap-1">
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2">
          O vendedor seleciona um destes serviços ao agendar. A duração é preenchida automaticamente.
        </p>
        <div className="space-y-2">
          {(form.calendar_services || []).map((cs, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Select
                value={cs.service_id || "none"}
                onValueChange={v => updateCalendarService(idx, "service_id", v === "none" ? "" : v)}
              >
                <SelectTrigger className="flex-1"><SelectValue placeholder="Selecionar serviço" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nenhum —</SelectItem>
                  {services.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name} {s.code ? `(${s.code})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1 w-28">
                <Input
                  type="number"
                  min={5}
                  step={5}
                  value={cs.duration_minutes}
                  onChange={e => updateCalendarService(idx, "duration_minutes", parseInt(e.target.value) || 60)}
                  className="w-20"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">min</span>
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeCalendarService(idx)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
          {(!form.calendar_services || form.calendar_services.length === 0) && (
            <p className="text-xs text-muted-foreground italic">Nenhum serviço cadastrado neste calendário.</p>
          )}
        </div>
      </div>

      {/* Região por Período (Regra de Permissão) */}
      <div className="border-t pt-3">
        <Label className="text-sm font-semibold flex items-center gap-1.5">
          <MapPinned className="h-4 w-4 text-primary" /> Região por Período
        </Label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2">
          Define qual região o cliente precisa pertencer para ser agendado em cada período.
          {form.period_mode === "Periodos" && " Manhã e Tarde podem ser a mesma região."}
        </p>
        <div className="space-y-2">
          {periodOptions.map(opt => {
            const pr = (form.period_regions || []).find(p => p.period === opt.value) || { region_id: "", region_name: "" };
            return (
              <div key={opt.value} className="flex items-center gap-2">
                <span className="text-sm font-medium w-20">{opt.label}</span>
                <Select
                  value={pr.region_id || "none"}
                  onValueChange={v => updatePeriodRegion(opt.value, "region_id", v === "none" ? "" : v)}
                >
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Selecionar região" /></SelectTrigger>
                  <SelectContent className="max-h-80">
                    <SelectItem value="none">— Nenhuma (livre) —</SelectItem>
                    {areaOrder.filter(a => regionsByArea[a]?.length).map(area => (
                      <SelectGroup key={area}>
                        <SelectLabel className="text-[10px] font-bold uppercase text-muted-foreground/60 px-2 pt-2 pb-0.5">{area}</SelectLabel>
                        {regionsByArea[area].map(r => (
                          <SelectItem key={r.id} value={r.id}>{r.regional}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}