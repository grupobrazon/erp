import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, MapPin, Layers } from "lucide-react";
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
const COLORS = [
  { value: "blue", label: "Azul" }, { value: "green", label: "Verde" }, { value: "amber", label: "Âmbar" },
  { value: "violet", label: "Violeta" }, { value: "rose", label: "Rosa" }, { value: "teal", label: "Teal" }
];
const colorClass = (c) => ({
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  green: "bg-emerald-100 text-emerald-700 border-emerald-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  violet: "bg-violet-100 text-violet-700 border-violet-200",
  rose: "bg-rose-100 text-rose-700 border-rose-200",
  teal: "bg-teal-100 text-teal-700 border-teal-200",
}[c] || "bg-slate-100 text-slate-700 border-slate-200");

export default function ZoneManager() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", region_id: "", region_name: "", state: "", cities: [], cep_prefixes: [], use_radius: false, center_city: "", center_state: "", radius_km: 150, daily_capacity: 1, active_days: ["seg","ter","qua","qui","sex"], color: "blue" });
  const [newCity, setNewCity] = useState("");
  const [newCep, setNewCep] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["routeZones"],
    queryFn: () => base44.entities.RouteZone.list("-created_date", 200),
  });
  const { data: regions = [] } = useQuery({
    queryKey: ["routeRegions"],
    queryFn: () => base44.entities.RouteRegion.list("-created_date", 200),
  });
  const { data: techs = [] } = useQuery({
    queryKey: ["technicians"],
    queryFn: () => base44.entities.Technician.list("-created_date", 200),
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.RouteZone.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["routeZones"] }); resetForm(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RouteZone.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["routeZones"] }); resetForm(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.RouteZone.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routeZones"] }),
  });

  const resetForm = () => { setForm({ name: "", region_id: "", region_name: "", state: "", cities: [], cep_prefixes: [], use_radius: false, center_city: "", center_state: "", radius_km: 150, daily_capacity: 1, active_days: ["seg","ter","qua","qui","sex"], color: "blue" }); setNewCity(""); setNewCep(""); setEditing(null); setShowForm(false); };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editing) updateMut.mutate({ id: editing, data: form });
    else createMut.mutate(form);
  };

  const startEdit = (item) => {
    setEditing(item.id);
    setForm({ name: item.name || "", region_id: item.region_id || "", region_name: item.region_name || "", state: item.state || "", cities: item.cities || [], cep_prefixes: item.cep_prefixes || [], use_radius: item.use_radius || false, center_city: item.center_city || "", center_state: item.center_state || "", radius_km: item.radius_km || 150, daily_capacity: item.daily_capacity || 1, active_days: item.active_days || ["seg","ter","qua","qui","sex"], color: item.color || "blue" });
    setNewCity(""); setShowForm(true);
  };

  const addCity = () => { const c = newCity.trim(); if (!c || form.cities.includes(c)) return; setForm(p => ({ ...p, cities: [...p.cities, c] })); setNewCity(""); };
  const addCep = () => { const c = newCep.replace(/\D/g, ""); if (!c || c.length < 3 || c.length > 8) return; if (form.cep_prefixes.includes(c)) return; setForm(p => ({ ...p, cep_prefixes: [...p.cep_prefixes, c] })); setNewCep(""); };
  const toggleDay = (key) => setForm(p => ({ ...p, active_days: p.active_days.includes(key) ? p.active_days.filter(d => d !== key) : [...p.active_days, key] }));
  const onRegionChange = (val) => { const r = regions.find(x => x.id === val); setForm(p => ({ ...p, region_id: val, region_name: r?.name || "", state: r?.state || p.state })); };

  const techCount = (zoneId) => techs.filter(t => t.zone_id === zoneId).length;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Divida regiões em zonas (ex: SP Central, Campinas, ABC) com capacidade diária de técnicos e dias de atendimento</p>
        {!showForm && <Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="h-4 w-4" /> Nova Zona</Button>}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Nome da Zona *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required placeholder="Ex: SP Central" />
            </div>
            <div>
              <Label>Região</Label>
              <Select value={form.region_id} onValueChange={onRegionChange}>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>{regions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estado (UF)</Label>
              <Input value={form.state} onChange={e => setForm(p => ({ ...p, state: e.target.value }))} placeholder="Ex: SP" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Capacidade Diária (técnicos/dia)</Label>
              <Input type="number" min="1" max="10" value={form.daily_capacity} onChange={e => setForm(p => ({ ...p, daily_capacity: parseInt(e.target.value) || 1 }))} />
            </div>
            <div>
              <Label>Cor de Identificação</Label>
              <Select value={form.color} onValueChange={v => setForm(p => ({ ...p, color: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{COLORS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Dias de Atendimento</Label>
            <div className="flex gap-3 flex-wrap mt-1">
              {DAYS.map(d => (
                <label key={d.key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox checked={form.active_days.includes(d.key)} onCheckedChange={() => toggleDay(d.key)} /> {d.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 py-1">
            <Checkbox id="use_radius" checked={form.use_radius} onCheckedChange={v => setForm(p => ({ ...p, use_radius: v }))} />
            <Label htmlFor="use_radius" className="cursor-pointer text-sm">Usar raio de atendimento (todas as cidades dentro de X km de uma cidade central)</Label>
          </div>

          {form.use_radius ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>Cidade Central</Label>
                <Input value={form.center_city} onChange={e => setForm(p => ({ ...p, center_city: e.target.value }))} placeholder="Ex: Belo Horizonte" />
              </div>
              <div>
                <Label>UF da Cidade Central</Label>
                <Input value={form.center_state} onChange={e => setForm(p => ({ ...p, center_state: e.target.value.toUpperCase() }))} placeholder="Ex: MG" maxLength="2" />
              </div>
              <div>
                <Label>Raio (km)</Label>
                <Input type="number" min="1" max="500" value={form.radius_km} onChange={e => setForm(p => ({ ...p, radius_km: parseInt(e.target.value) || 150 }))} />
              </div>
            </div>
          ) : (
            <div>
              <Label>Cidades da Zona</Label>
              <div className="flex gap-2 mb-2">
                <Input value={newCity} onChange={e => setNewCity(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCity(); } }} placeholder="Nome da cidade" />
                <Button type="button" variant="outline" onClick={addCity} className="gap-2 shrink-0"><Plus className="h-4 w-4" /> Adicionar</Button>
              </div>
              {form.cities.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.cities.map(c => <Badge key={c} variant="secondary" className="gap-1 py-1.5 pl-3"><MapPin className="h-3 w-3" /> {c}<button type="button" onClick={() => setForm(p => ({ ...p, cities: p.cities.filter(x => x !== c) }))} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button></Badge>)}
                </div>
              )}
            </div>
          )}
          <div>
            <Label>Prefixos de CEP <span className="text-muted-foreground font-normal">(matching prioritário — mais preciso que cidade/bairro)</span></Label>
            <div className="flex gap-2 mb-2">
              <Input value={newCep} onChange={e => setNewCep(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCep(); } }} placeholder="Ex: 301, 302, 30380 (3-8 dígitos)" />
              <Button type="button" variant="outline" onClick={addCep} className="gap-2 shrink-0"><Plus className="h-4 w-4" /> Adicionar</Button>
            </div>
            {form.cep_prefixes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.cep_prefixes.map(c => <Badge key={c} variant="secondary" className="gap-1 py-1.5 pl-3"><MapPin className="h-3 w-3" /> {c}<button type="button" onClick={() => setForm(p => ({ ...p, cep_prefixes: p.cep_prefixes.filter(x => x !== c) }))} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button></Badge>)}
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>{editing ? "Salvar" : "Adicionar"}</Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : items.length === 0 ? (
        <EmptyState title="Nenhuma zona cadastrada" description="Crie zonas para dividir regiões em sub-áreas com capacidade própria de técnicos." icon={<Layers className="h-8 w-8 text-muted-foreground" />} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zona</TableHead>
              <TableHead>Região</TableHead>
              <TableHead>Cidades</TableHead>
              <TableHead>CEPs</TableHead>
              <TableHead>Capacidade</TableHead>
              <TableHead>Dias</TableHead>
              <TableHead>Técnicos</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-3 h-3 rounded-full border ${colorClass(item.color)}`} />
                    {item.name}
                  </div>
                </TableCell>
                <TableCell>{item.region_name || "—"}</TableCell>
                <TableCell>{item.use_radius ? `Raio ${item.radius_km}km de ${item.center_city || "—"}` : `${item.cities?.length || 0} cidade(s)`}</TableCell>
                <TableCell className="text-xs">{(item.cep_prefixes && item.cep_prefixes.length > 0) ? item.cep_prefixes.join(", ") : "—"}</TableCell>
                <TableCell>{item.daily_capacity || 1}/dia</TableCell>
                <TableCell className="text-xs">{(item.active_days || []).join(", ") || "—"}</TableCell>
                <TableCell>{techCount(item.id)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(item)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMut.mutate(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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