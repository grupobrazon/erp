import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from "@/components/ui/table";
import EmptyState from "@/components/ui/EmptyState";

export default function RouteRegionManager() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", state: "", cities: [] });
  const [newCity, setNewCity] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["routeRegions"],
    queryFn: () => base44.entities.RouteRegion.list("-created_date", 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.RouteRegion.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["routeRegions"] }); resetForm(); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RouteRegion.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["routeRegions"] }); resetForm(); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.RouteRegion.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routeRegions"] }),
  });

  const resetForm = () => { setForm({ name: "", state: "", cities: [] }); setNewCity(""); setEditing(null); setShowForm(false); };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editing) updateMutation.mutate({ id: editing, data: form });
    else createMutation.mutate(form);
  };

  const startEdit = (item) => {
    setEditing(item.id);
    setForm({ name: item.name || "", state: item.state || "", cities: item.cities || [] });
    setNewCity("");
    setShowForm(true);
  };

  const addCity = () => {
    const city = newCity.trim();
    if (!city || form.cities.includes(city)) return;
    setForm(p => ({ ...p, cities: [...p.cities, city] }));
    setNewCity("");
  };

  const removeCity = (c) => setForm(p => ({ ...p, cities: p.cities.filter(x => x !== c) }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Cadastre as regiões de rota (ex: São Paulo, Belo Horizonte) para enviar as OS de entrega/instalação</p>
        {!showForm && <Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="h-4 w-4" /> Nova Região</Button>}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Nome da Região *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required placeholder="Ex: São Paulo" />
            </div>
            <div>
              <Label>Estado (UF)</Label>
              <Input value={form.state} onChange={e => setForm(p => ({ ...p, state: e.target.value }))} placeholder="Ex: SP" />
            </div>
          </div>
          <div>
            <Label>Cidades Atendidas</Label>
            <div className="flex gap-2 mb-2">
              <Input value={newCity} onChange={e => setNewCity(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCity(); } }} placeholder="Nome da cidade" />
              <Button type="button" variant="outline" onClick={addCity} className="gap-2 shrink-0"><Plus className="h-4 w-4" /> Adicionar</Button>
            </div>
            {form.cities.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.cities.map(c => (
                  <Badge key={c} variant="secondary" className="gap-1 py-1.5 pl-3"><MapPin className="h-3 w-3" /> {c}<button type="button" onClick={() => removeCity(c)} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button></Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{editing ? "Salvar" : "Adicionar"}</Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : items.length === 0 ? (
        <EmptyState title="Nenhuma região cadastrada" description="Cadastre regiões para organizar as rotas dos técnicos por área." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Região</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Cidades</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.state || "—"}</TableCell>
                <TableCell>
                  {item.cities?.length > 0 ? (
                    <div className="flex flex-wrap gap-1">{item.cities.map(c => <Badge key={c} variant="outline" className="text-xs gap-1"><MapPin className="h-2.5 w-2.5" /> {c}</Badge>)}</div>
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