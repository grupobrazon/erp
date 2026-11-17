import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import EmptyState from "@/components/ui/EmptyState";

const emptyForm = { name: "", description: "", duration_minutes: 60, is_active: true, order: 0 };

export default function ServiceTypeManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const { data: serviceTypes = [], isLoading } = useQuery({
    queryKey: ["serviceTypes"],
    queryFn: () => base44.entities.ServiceType.list("order", 500),
  });

  const openNew = () => { setForm(emptyForm); setEditingId(null); setOpen(true); };
  const openEdit = (s) => {
    setForm({
      name: s.name || "",
      description: s.description || "",
      duration_minutes: s.duration_minutes ?? 60,
      is_active: s.is_active !== false,
      order: s.order || 0,
    });
    setEditingId(s.id);
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        duration_minutes: Number(form.duration_minutes) || 60,
        is_active: form.is_active,
        order: Number(form.order) || 0,
      };
      if (editingId) return base44.entities.ServiceType.update(editingId, payload);
      return base44.entities.ServiceType.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["serviceTypes"] });
      setOpen(false);
      toast({ title: editingId ? "Tipo de serviço atualizado" : "Tipo de serviço cadastrado" });
    },
    onError: (e) => toast({ variant: "destructive", title: "Erro ao salvar", description: e?.message || "Falha desconhecida" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ServiceType.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["serviceTypes"] });
      toast({ title: "Tipo de serviço removido" });
    },
  });

  const sorted = [...serviceTypes].sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Cadastre os tipos de serviço que o vendedor deve detalhar ao agendar entregas e instalações na casa do cliente.
        </p>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Adicionar Tipo</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : sorted.length === 0 ? (
        <EmptyState title="Nenhum tipo de serviço cadastrado" description="Cadastre os tipos de serviço para detalhar o que será feito na casa do cliente (instalação, troca de refil, assistência técnica, etc.)." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Ordem</TableHead>
              <TableHead>Tipo de Serviço</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-28">Duração</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(s => (
              <TableRow key={s.id}>
                <TableCell className="text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <GripVertical className="h-3 w-3" />
                    {s.order || 0}
                  </div>
                </TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-md">{s.description || "—"}</TableCell>
                <TableCell className="text-sm">{s.duration_minutes || 60} min</TableCell>
                <TableCell>{s.is_active !== false ? <Badge variant="secondary">Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Tipo de Serviço" : "Novo Tipo de Serviço"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nome do Serviço *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Instalação de purificador de água" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Detalhes do serviço (opcional)" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Duração Média (min)</Label>
                <Input type="number" value={form.duration_minutes} onChange={e => setForm(p => ({ ...p, duration_minutes: parseInt(e.target.value) || 60 }))} />
                <p className="text-xs text-muted-foreground mt-1">Tempo que o serviço leva.</p>
              </div>
              <div>
                <Label>Ordem de Exibição</Label>
                <Input type="number" value={form.order} onChange={e => setForm(p => ({ ...p, order: parseInt(e.target.value) || 0 }))} />
                <p className="text-xs text-muted-foreground mt-1">Menor número primeiro.</p>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
                  <span className="text-sm">Serviço ativo</span>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={saveMutation.isPending || !form.name.trim()} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}