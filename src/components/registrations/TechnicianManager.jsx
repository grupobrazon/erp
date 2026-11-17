import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, MapPin, User, Phone, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from "@/components/ui/table";
import EmptyState from "@/components/ui/EmptyState";

const DAYS = [
  { key: "seg", label: "Seg" }, { key: "ter", label: "Ter" }, { key: "qua", label: "Qua" },
  { key: "qui", label: "Qui" }, { key: "sex", label: "Sex" }, { key: "sab", label: "Sáb" }, { key: "dom", label: "Dom" }
];

export default function TechnicianManager() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", vehicle_type: "Carro", allocated_locations: [], calendar_ids: [], calendar_names: [], region_id: "", region_name: "", zone_id: "", zone_name: "", available_days: [], home_street: "", home_number: "", home_neighborhood: "", home_city: "", home_state: "", home_zip: "" });
  const [newLocation, setNewLocation] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["technicians"],
    queryFn: () => base44.entities.Technician.list("-created_date", 200),
  });

  const { data: calendars = [] } = useQuery({
    queryKey: ["calendarioRotas"],
    queryFn: () => base44.entities.CalendarioRota.list("-created_date", 200),
  });
  const { data: routeRegions = [] } = useQuery({
    queryKey: ["routeRegions"],
    queryFn: () => base44.entities.RouteRegion.list("-created_date", 200),
  });
  const { data: routeZones = [] } = useQuery({
    queryKey: ["routeZones"],
    queryFn: () => base44.entities.RouteZone.list("-created_date", 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Technician.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["technicians"] }); resetForm(); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Technician.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["technicians"] }); resetForm(); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Technician.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["technicians"] }),
  });

  const resetForm = () => {
    setForm({ name: "", phone: "", vehicle_type: "Carro", allocated_locations: [], calendar_ids: [], calendar_names: [], region_id: "", region_name: "", zone_id: "", zone_name: "", available_days: [], home_street: "", home_number: "", home_neighborhood: "", home_city: "", home_state: "", home_zip: "" });
    setNewLocation("");
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editing) updateMutation.mutate({ id: editing, data: form });
    else createMutation.mutate(form);
  };

  const startEdit = (item) => {
    setEditing(item.id);
    setForm({ name: item.name || "", phone: item.phone || "", vehicle_type: item.vehicle_type || "Carro", allocated_locations: item.allocated_locations || [], calendar_ids: item.calendar_ids || [], calendar_names: item.calendar_names || [], region_id: item.region_id || "", region_name: item.region_name || "", zone_id: item.zone_id || "", zone_name: item.zone_name || "", available_days: item.available_days || [], home_street: item.home_street || "", home_number: item.home_number || "", home_neighborhood: item.home_neighborhood || "", home_city: item.home_city || "", home_state: item.home_state || "", home_zip: item.home_zip || "" });
    setNewLocation("");
    setShowForm(true);
  };

  const addLocation = () => {
    const loc = newLocation.trim();
    if (!loc) return;
    if (form.allocated_locations.includes(loc)) return;
    setForm(p => ({ ...p, allocated_locations: [...p.allocated_locations, loc] }));
    setNewLocation("");
  };

  const removeLocation = (loc) => {
    setForm(p => ({ ...p, allocated_locations: p.allocated_locations.filter(l => l !== loc) }));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Cadastre os técnicos e os locais (cidades/regiões) onde cada um está alocado</p>
        {!showForm && <Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="h-4 w-4" /> Novo Técnico</Button>}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Nome *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required placeholder="Nome do técnico" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="(11) 99999-9999" />
            </div>
            <div>
              <Label>Veículo</Label>
              <Select value={form.vehicle_type || "Carro"} onValueChange={v => setForm(p => ({ ...p, vehicle_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Carro">Carro</SelectItem>
                  <SelectItem value="Moto">Moto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label>Calendários de Rota</Label>
              <p className="text-xs text-muted-foreground mb-1.5">Vincule o técnico a um ou mais calendários. Ele atenderá <strong>todas as zonas</strong> de todos os calendários selecionados (ex: Grande BH + Contagem).</p>
              {calendars.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Nenhum calendário cadastrado.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {calendars.map(c => {
                    const checked = form.calendar_ids.includes(c.id);
                    return (
                      <label key={c.id} className={`flex items-center gap-1.5 text-sm cursor-pointer border rounded-md px-2.5 py-1.5 transition-colors ${checked ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-muted"}`}>
                        <Checkbox checked={checked} onCheckedChange={() => {
                          setForm(p => {
                            const ids = checked ? p.calendar_ids.filter(x => x !== c.id) : [...p.calendar_ids, c.id];
                            const names = ids.map(id => calendars.find(cal => cal.id === id)?.name || "").filter(Boolean);
                            return { ...p, calendar_ids: ids, calendar_names: names, zone_id: "", zone_name: "" };
                          });
                        }} />
                        {c.name}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <Label>Zona Específica (opcional)</Label>
              <p className="text-xs text-muted-foreground mb-1.5">Deixe vazio para atender todas as zonas dos calendários selecionados. Selecione uma zona específica para restringir o atendimento a ela.</p>
              <Select value={form.zone_id || "none"} onValueChange={v => {
                const zone = routeZones.find(z => z.id === v);
                setForm(p => ({ ...p, zone_id: v === "none" ? "" : v, zone_name: zone?.name || "", region_id: zone?.region_id || p.region_id, region_name: zone?.region_name || p.region_name }));
              }}>
                <SelectTrigger><SelectValue placeholder="Todas as zonas dos calendários" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Todas as zonas dos calendários</SelectItem>
                  {routeZones.filter(z => !form.calendar_ids?.length || z.calendar_id && form.calendar_ids.includes(z.calendar_id)).map(z => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Dias Disponíveis</Label>
            <p className="text-xs text-muted-foreground mb-2">Selecione os dias em que o técnico atende (vazio = todos os dias ativos da zona)</p>
            <div className="flex gap-3 flex-wrap">
              {DAYS.map(d => (
                <label key={d.key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox checked={form.available_days.includes(d.key)} onCheckedChange={() => {
                    setForm(p => ({ ...p, available_days: p.available_days.includes(d.key) ? p.available_days.filter(x => x !== d.key) : [...p.available_days, d.key] }));
                  }} /> {d.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>Locais de Alocação</Label>
            <div className="flex gap-2 mb-2">
              <Input
                value={newLocation}
                onChange={e => setNewLocation(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addLocation(); } }}
                placeholder="Cidade/Estado (ex: Tupi Paulista/SP)"
              />
              <Button type="button" variant="outline" onClick={addLocation} className="gap-2 shrink-0">
                <Plus className="h-4 w-4" /> Adicionar Local
              </Button>
            </div>
            {form.allocated_locations.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.allocated_locations.map(loc => (
                  <Badge key={loc} variant="secondary" className="gap-1 py-1.5 pl-3">
                    <MapPin className="h-3 w-3" /> {loc}
                    <button type="button" onClick={() => removeLocation(loc)} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="border-t pt-4 space-y-3">
            <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-primary" /> Endereço de Moradia (destino final da rota)</Label>
            <p className="text-xs text-muted-foreground">A rota do técnico termina na casa dele, não volta para o escritório</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Logradouro</Label>
                <Input value={form.home_street} onChange={e => setForm(p => ({ ...p, home_street: e.target.value }))} placeholder="Rua / Av." />
              </div>
              <div>
                <Label className="text-xs">Número</Label>
                <Input value={form.home_number} onChange={e => setForm(p => ({ ...p, home_number: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Bairro</Label>
                <Input value={form.home_neighborhood} onChange={e => setForm(p => ({ ...p, home_neighborhood: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Cidade</Label>
                <Input value={form.home_city} onChange={e => setForm(p => ({ ...p, home_city: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">UF</Label>
                <Input value={form.home_state} onChange={e => setForm(p => ({ ...p, home_state: e.target.value }))} maxLength="2" />
              </div>
              <div>
                <Label className="text-xs">CEP</Label>
                <Input value={form.home_zip} onChange={e => setForm(p => ({ ...p, home_zip: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {editing ? "Salvar" : "Adicionar"}
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : items.length === 0 ? (
        <EmptyState title="Nenhum técnico cadastrado" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Técnico</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Calendário / Zona</TableHead>
              <TableHead>Dias</TableHead>
              <TableHead>Locais de Alocação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-muted border flex items-center justify-center">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <span className="font-medium">{item.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {item.phone ? (
                    <span className="text-sm flex items-center gap-1"><Phone className="h-3 w-3 text-muted-foreground" /> {item.phone}</span>
                  ) : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">{item.vehicle_type || "Carro"}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    {item.calendar_names?.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.calendar_names.map((n, i) => (
                          <Badge key={i} variant="outline" className="text-xs gap-1 w-fit"><Calendar className="h-2.5 w-2.5" /> {n}</Badge>
                        ))}
                      </div>
                    ) : <span className="text-muted-foreground text-sm">—</span>}
                    {item.zone_name
                      ? <Badge variant="secondary" className="text-xs w-fit">{item.zone_name}</Badge>
                      : item.calendar_names?.length > 0 && <span className="text-xs text-muted-foreground italic">Todas as zonas</span>}
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  {item.available_days?.length ? item.available_days.join(", ") : <span className="text-muted-foreground">Todos</span>}
                </TableCell>
                <TableCell>
                  {item.allocated_locations?.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {item.allocated_locations.map(loc => (
                        <Badge key={loc} variant="outline" className="text-xs gap-1"><MapPin className="h-2.5 w-2.5" /> {loc}</Badge>
                      ))}
                    </div>
                  ) : <span className="text-muted-foreground text-sm">—</span>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(item)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}