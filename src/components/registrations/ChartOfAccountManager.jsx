import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Pencil, Trash2, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import EmptyState from "@/components/ui/EmptyState";

const NATURES = ["Receita", "Dedução", "Custo", "Despesa", "Ativo", "Imposto s/ Lucro", "Antecipação"];
const NATURE_COLORS = {
  "Receita": "bg-emerald-100 text-emerald-700",
  "Dedução": "bg-amber-100 text-amber-700",
  "Custo": "bg-blue-100 text-blue-700",
  "Despesa": "bg-rose-100 text-rose-700",
  "Ativo": "bg-purple-100 text-purple-700",
  "Imposto s/ Lucro": "bg-orange-100 text-orange-700",
  "Antecipação": "bg-cyan-100 text-cyan-700",
};

export default function ChartOfAccountManager() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [natureFilter, setNatureFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ code: "", name: "", detail: "", nature: "Despesa", group_name: "", subgroup_name: "", notes: "", is_active: true });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["chartOfAccounts"],
    queryFn: () => base44.entities.ChartOfAccount.list("-code", 500),
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.ChartOfAccount.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["chartOfAccounts"] }); setDialogOpen(false); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ChartOfAccount.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["chartOfAccounts"] }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.ChartOfAccount.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chartOfAccounts"] }),
  });

  const filtered = accounts.filter(a =>
    (!natureFilter || a.nature === natureFilter) &&
    (!search || a.code?.toLowerCase().includes(search.toLowerCase()) || a.name?.toLowerCase().includes(search.toLowerCase()))
  );

  const openNew = () => {
    setEditing(null);
    setForm({ code: "", name: "", detail: "", nature: "Despesa", group_name: "", subgroup_name: "", notes: "", is_active: true });
    setDialogOpen(true);
  };
  const openEdit = (acc) => {
    setEditing(acc);
    setForm({
      code: acc.code || "", name: acc.name || "", detail: acc.detail || "",
      nature: acc.nature || "Despesa", group_name: acc.group_name || "",
      subgroup_name: acc.subgroup_name || "", notes: acc.notes || "",
      is_active: acc.is_active !== false,
    });
    setDialogOpen(true);
  };
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...form, code: form.code.trim() };
    if (editing) { updateMut.mutate({ id: editing.id, data }); setDialogOpen(false); }
    else createMut.mutate(data);
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="w-52">
          <Select value={natureFilter || "all"} onValueChange={v => setNatureFilter(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todas as naturezas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as naturezas</SelectItem>
              {NATURES.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por código ou nome..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Nova Conta</Button>
      </div>

      <p className="text-xs text-muted-foreground mb-2">{filtered.length} de {accounts.length} contas</p>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="Nenhuma conta" description="Ajuste os filtros ou cadastre uma nova conta." />
      ) : (
        <div className="rounded-lg border max-h-[600px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0">
              <TableRow className="bg-muted/50">
                <TableHead className="w-24">Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-56">Grupo / Subgrupo</TableHead>
                <TableHead className="w-36">Natureza</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-24 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(a => (
                <TableRow key={a.id} className={a.is_active === false ? "opacity-50" : ""}>
                  <TableCell className="font-mono text-xs font-medium">{a.code}</TableCell>
                  <TableCell>
                    <p className="font-medium text-sm">{a.name}</p>
                    {a.detail && a.detail !== a.name && <p className="text-xs text-muted-foreground truncate max-w-md">{a.detail}</p>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <p>{a.group_name || "—"}</p>
                    <p className="truncate">{a.subgroup_name || ""}</p>
                  </TableCell>
                  <TableCell><Badge className={`${NATURE_COLORS[a.nature] || "bg-muted"} border-transparent text-[10px]`}>{a.nature}</Badge></TableCell>
                  <TableCell>
                    {a.is_active !== false
                      ? <Badge variant="outline" className="text-[10px]">Ativa</Badge>
                      : <Badge variant="outline" className="text-[10px] text-muted-foreground">Inativa</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Ativar/Inativar" onClick={() => updateMut.mutate({ id: a.id, data: { is_active: a.is_active === false } })}>
                        <Power className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMut.mutate(a.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Editar Conta" : "Nova Conta do Plano"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Código *</Label>
                <Input required value={form.code} onChange={e => set("code", e.target.value)} placeholder="8301" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Descrição *</Label>
                <Input required value={form.name} onChange={e => set("name", e.target.value)} placeholder="Nome da conta" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Natureza *</Label>
                <Select value={form.nature} onValueChange={v => set("nature", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{NATURES.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Grupo</Label>
                <Input value={form.group_name} onChange={e => set("group_name", e.target.value)} placeholder="Ex: Despesas" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Subgrupo</Label>
              <Input value={form.subgroup_name} onChange={e => set("subgroup_name", e.target.value)} placeholder="Ex: Despesas com Pessoal" />
            </div>
            <div>
              <Label className="text-xs">Detalhamento</Label>
              <Textarea rows={2} value={form.detail} onChange={e => set("detail", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Input value={form.notes} onChange={e => set("notes", e.target.value)} />
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