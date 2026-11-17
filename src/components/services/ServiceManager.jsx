import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import EmptyState from "@/components/ui/EmptyState";

const emptyForm = { code: "", name: "", aliquot_iss: 0, municipal_service_code: "", is_active: true };

export default function ServiceManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["serviceCatalog"],
    queryFn: () => base44.entities.Service.list("-created_date", 500),
  });

  const openNew = () => { setForm(emptyForm); setEditingId(null); setOpen(true); };
  const openEdit = (s) => {
    setForm({
      code: s.code || "",
      name: s.name || "",
      aliquot_iss: s.aliquot_iss || 0,
      municipal_service_code: s.municipal_service_code || "",
      is_active: s.is_active !== false,
    });
    setEditingId(s.id);
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        aliquot_iss: Number(form.aliquot_iss) || 0,
        municipal_service_code: form.municipal_service_code.trim(),
        is_active: form.is_active,
      };
      if (editingId) return base44.entities.Service.update(editingId, payload);
      return base44.entities.Service.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["serviceCatalog"] });
      setOpen(false);
      toast({ title: editingId ? "Serviço atualizado" : "Serviço cadastrado" });
    },
    onError: (e) => toast({ variant: "destructive", title: "Erro ao salvar", description: e?.message || "Falha desconhecida" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Service.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["serviceCatalog"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Adicionar Serviço</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : services.length === 0 ? (
        <EmptyState title="Nenhum serviço cadastrado" description="Cadastre os serviços da lista LC 116/2003 para usar nos pedidos de venda." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Código</TableHead>
              <TableHead>Serviço</TableHead>
              <TableHead className="w-28">Alíquota ISS</TableHead>
              <TableHead className="w-40">Cód. Municipal</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-xs">{s.code}</TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-sm">{(s.aliquot_iss || 0).toFixed(2)}%</TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.municipal_service_code || "—"}</TableCell>
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
            <DialogTitle>{editingId ? "Editar Serviço" : "Novo Serviço"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Código LC 116 *</Label>
              <Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="Ex: 1.01, 7.01" />
              <p className="text-xs text-muted-foreground mt-1">Item da lista de serviços da Lei Complementar 116/2003.</p>
            </div>
            <div>
              <Label>Descrição do Serviço *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Instalação e montagem de produtos" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Alíquota ISS (%)</Label>
                <Input type="number" step="0.01" value={form.aliquot_iss} onChange={e => setForm(p => ({ ...p, aliquot_iss: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <Label>Código Municipal</Label>
                <Input value={form.municipal_service_code} onChange={e => setForm(p => ({ ...p, municipal_service_code: e.target.value }))} placeholder="Override da prefeitura" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} id="svc_active" />
              <Label htmlFor="svc_active" className="text-sm cursor-pointer">Serviço ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={saveMutation.isPending || !form.code.trim() || !form.name.trim()} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}