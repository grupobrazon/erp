import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import EmptyState from "@/components/ui/EmptyState";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const EMPTY = {
  name: "", fantasy_name: "", document: "", state_registration: "",
  contact_name: "", phone: "", email: "",
  zip_code: "", street: "", number: "", neighborhood: "", city: "", state: "",
  notes: "", is_active: true,
};

export default function SupplierManager() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => base44.entities.Supplier.list("-name", 500),
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Supplier.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["suppliers"] }); setDialogOpen(false); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Supplier.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["suppliers"] }); setDialogOpen(false); },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Supplier.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["suppliers"] }),
  });

  const filtered = suppliers.filter(s =>
    !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.document?.toLowerCase().includes(search.toLowerCase()) || (s.fantasy_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => { setEditing(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (s) => { setEditing(s); setForm({ ...EMPTY, ...s, is_active: s.is_active !== false }); setDialogOpen(true); };
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const handleSubmit = (e) => {
    e.preventDefault();
    if (editing) updateMut.mutate({ id: editing.id, data: form });
    else createMut.mutate(form);
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, CNPJ ou fantasia..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Novo Fornecedor</Button>
      </div>

      <p className="text-xs text-muted-foreground mb-2">{filtered.length} de {suppliers.length} fornecedor(es)</p>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="Nenhum fornecedor" description="Cadastre seus fornecedores para usar nos pedidos de compra." />
      ) : (
        <div className="rounded-lg border max-h-[600px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0">
              <TableRow className="bg-muted/50">
                <TableHead>Nome / Fantasia</TableHead>
                <TableHead>CNPJ/CPF</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Cidade/UF</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-24 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(s => (
                <TableRow key={s.id} className={s.is_active === false ? "opacity-50" : ""}>
                  <TableCell>
                    <p className="font-medium text-sm">{s.name}</p>
                    {s.fantasy_name && <p className="text-xs text-muted-foreground">{s.fantasy_name}</p>}
                  </TableCell>
                  <TableCell className="text-sm font-mono">{s.document || "—"}</TableCell>
                  <TableCell className="text-sm">{s.contact_name || "—"}</TableCell>
                  <TableCell className="text-sm">{s.phone || "—"}</TableCell>
                  <TableCell className="text-sm">{s.city ? `${s.city}/${s.state || ""}` : "—"}</TableCell>
                  <TableCell>{s.is_active !== false ? <Badge variant="outline" className="text-[10px]">Ativo</Badge> : <Badge variant="outline" className="text-[10px] text-muted-foreground">Inativo</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Ativar/Inativar" onClick={() => updateMut.mutate({ id: s.id, data: { is_active: s.is_active === false } })}><Power className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMut.mutate(s.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar Fornecedor" : "Novo Fornecedor"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label className="text-xs">Razão Social / Nome *</Label>
                <Input required value={form.name} onChange={e => set("name", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Nome Fantasia</Label>
                <Input value={form.fantasy_name} onChange={e => set("fantasy_name", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">CNPJ/CPF</Label>
                <Input value={form.document} onChange={e => set("document", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Inscrição Estadual</Label>
                <Input value={form.state_registration} onChange={e => set("state_registration", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Pessoa de Contato</Label>
                <Input value={form.contact_name} onChange={e => set("contact_name", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Telefone</Label>
                <Input value={form.phone} onChange={e => set("phone", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">E-mail</Label>
                <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label className="text-xs">CEP</Label>
                <Input value={form.zip_code} onChange={e => set("zip_code", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Logradouro</Label>
                <Input value={form.street} onChange={e => set("street", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Número</Label>
                <Input value={form.number} onChange={e => set("number", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Bairro</Label>
                <Input value={form.neighborhood} onChange={e => set("neighborhood", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Cidade</Label>
                <Input value={form.city} onChange={e => set("city", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">UF</Label>
                <Input list="uf-list" value={form.state} onChange={e => set("state", e.target.value)} maxLength={2} />
                <datalist id="uf-list">{UFS.map(uf => <option key={uf} value={uf} />)}</datalist>
              </div>
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>{editing ? "Salvar" : "Cadastrar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}