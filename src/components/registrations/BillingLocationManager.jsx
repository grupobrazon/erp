import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from "@/components/ui/table";
import EmptyState from "@/components/ui/EmptyState";

export default function BillingLocationManager() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", cnpj: "", state_registration: "", municipal_registration: "", tax_regime: "Simples Nacional", cnae: "", ibge_code: "", email: "", phone: "", zip_code: "", street: "", number: "", neighborhood: "", city: "", state: "" });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["billingLocations"],
    queryFn: () => base44.entities.BillingLocation.list("-created_date", 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.BillingLocation.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["billingLocations"] }); resetForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BillingLocation.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["billingLocations"] }); resetForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.BillingLocation.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["billingLocations"] }),
  });

  const resetForm = () => { setForm({ name: "", cnpj: "", state_registration: "", municipal_registration: "", tax_regime: "Simples Nacional", cnae: "", ibge_code: "", email: "", phone: "", zip_code: "", street: "", number: "", neighborhood: "", city: "", state: "" }); setEditing(null); setShowForm(false); };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editing) updateMutation.mutate({ id: editing, data: form });
    else createMutation.mutate(form);
  };

  const startEdit = (item) => {
    setEditing(item.id);
    setForm({ name: item.name || "", cnpj: item.cnpj || "", state_registration: item.state_registration || "", municipal_registration: item.municipal_registration || "", tax_regime: item.tax_regime || "Simples Nacional", cnae: item.cnae || "", ibge_code: item.ibge_code || "", email: item.email || "", phone: item.phone || "", zip_code: item.zip_code || "", street: item.street || "", number: item.number || "", neighborhood: item.neighborhood || "", city: item.city || "", state: item.state || "" });
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Cadastre os locais de faturamento (CNPJs) da empresa</p>
        {!showForm && <Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="h-4 w-4" /> Novo Local</Button>}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Nome *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required /></div>
            <div><Label>CNPJ *</Label><Input value={form.cnpj} onChange={e => setForm(p => ({ ...p, cnpj: e.target.value }))} required /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><Label>Inscrição Estadual</Label><Input value={form.state_registration} onChange={e => setForm(p => ({ ...p, state_registration: e.target.value }))} placeholder="ISENTO se aplicável" /></div>
            <div><Label>Inscrição Municipal</Label><Input value={form.municipal_registration} onChange={e => setForm(p => ({ ...p, municipal_registration: e.target.value }))} /></div>
            <div>
              <Label>Regime Tributário (CRT)</Label>
              <Select value={form.tax_regime} onValueChange={v => setForm(p => ({ ...p, tax_regime: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Simples Nacional">Simples Nacional</SelectItem>
                  <SelectItem value="Simples Nacional - Sublimite">Simples Nacional - Sublimite</SelectItem>
                  <SelectItem value="Lucro Presumido">Lucro Presumido</SelectItem>
                  <SelectItem value="Lucro Real">Lucro Real</SelectItem>
                  <SelectItem value="Regime Normal">Regime Normal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><Label>CNAE</Label><Input value={form.cnae} onChange={e => setForm(p => ({ ...p, cnae: e.target.value }))} /></div>
            <div><Label>Código IBGE</Label><Input value={form.ibge_code} onChange={e => setForm(p => ({ ...p, ibge_code: e.target.value }))} /></div>
            <div><Label>Telefone</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><Label>CEP</Label><Input value={form.zip_code} onChange={e => setForm(p => ({ ...p, zip_code: e.target.value }))} /></div>
            <div className="col-span-2"><Label>Logradouro</Label><Input value={form.street} onChange={e => setForm(p => ({ ...p, street: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div><Label>Número</Label><Input value={form.number} onChange={e => setForm(p => ({ ...p, number: e.target.value }))} /></div>
            <div className="col-span-2"><Label>Bairro</Label><Input value={form.neighborhood} onChange={e => setForm(p => ({ ...p, neighborhood: e.target.value }))} /></div>
            <div><Label>UF</Label><Input value={form.state} onChange={e => setForm(p => ({ ...p, state: e.target.value }))} maxLength={2} /></div>
          </div>
          <div><Label>Cidade</Label><Input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} /></div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{editing ? "Salvar" : "Adicionar"}</Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : items.length === 0 ? (
        <EmptyState title="Nenhum local de faturamento" />
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>CNPJ</TableHead><TableHead>Cidade/UF</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.cnpj}</TableCell>
                <TableCell>{item.city}/{item.state}</TableCell>
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