import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

export default function TechnicianChecklistManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(null);
  const [newOption, setNewOption] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["technicianChecklistItems"],
    queryFn: () => base44.entities.TechnicianChecklistItem.list("order", 100),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.TechnicianChecklistItem.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["technicianChecklistItems"] }); toast({ title: "Item criado" }); setEditing(null); },
    onError: (err) => toast({ title: "Erro", description: err?.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TechnicianChecklistItem.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["technicianChecklistItems"] }); toast({ title: "Item atualizado" }); setEditing(null); },
    onError: (err) => toast({ title: "Erro", description: err?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TechnicianChecklistItem.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["technicianChecklistItems"] }); toast({ title: "Item excluído" }); },
  });

  const handleSave = () => {
    if (!editing.name) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    const payload = { ...editing };
    delete payload.id;
    if (editing.id) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  };

  const moveOrder = (item, direction) => {
    const sorted = [...items].sort((a, b) => (a.order || 0) - (b.order || 0));
    const idx = sorted.findIndex(i => i.id === item.id);
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    const target = sorted[targetIdx];
    updateMutation.mutate({ id: item.id, data: { order: target.order || 0 } });
    updateMutation.mutate({ id: target.id, data: { order: item.order || 0 } });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Parametrize os itens de checklist que o técnico preenche no atendimento.</p>
        <Button size="sm" onClick={() => setEditing({ name: "", description: "", options: [], is_active: true, order: items.length, applies_to: "Todos" })}>
          <Plus className="h-4 w-4" /> Novo Item
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : items.length === 0 ? (
        <EmptyState title="Nenhum item de checklist" description="Crie itens para o técnico preencher no atendimento." icon="list" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">Ordem</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Opções</TableHead>
              <TableHead>Aplica-se a</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...items].sort((a, b) => (a.order || 0) - (b.order || 0)).map((item, i) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveOrder(item, -1)} disabled={i === 0}><ChevronUp className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveOrder(item, 1)} disabled={i === items.length - 1}><ChevronDown className="h-3 w-3" /></Button>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{item.name}</div>
                  {item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {item.options?.map((opt, j) => <Badge key={j} variant="secondary" className="text-xs">{opt}</Badge>)}
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{item.applies_to || "Todos"}</Badge></TableCell>
                <TableCell>
                  <Badge variant={item.is_active ? "default" : "secondary"} className="text-xs">{item.is_active ? "Ativo" : "Inativo"}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing({ ...item })}>Editar</Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm("Excluir este item?")) deleteMutation.mutate(item.id); }}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-background rounded-md border p-4 w-full max-w-lg space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold">{editing.id ? "Editar Item" : "Novo Item de Checklist"}</h3>
            <div>
              <Label className="text-xs">Nome *</Label>
              <Input value={editing.name || ""} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Adesivação do produto" />
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea rows={2} value={editing.description || ""} onChange={e => setEditing(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Opções de Resposta</Label>
              <div className="flex gap-2">
                <Input value={newOption} onChange={e => setNewOption(e.target.value)} placeholder="Ex: Adesivação Brazon" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (newOption.trim()) { setEditing(p => ({ ...p, options: [...(p.options || []), newOption.trim()] })); setNewOption(""); } } }} />
                <Button type="button" variant="outline" onClick={() => { if (newOption.trim()) { setEditing(p => ({ ...p, options: [...(p.options || []), newOption.trim()] })); setNewOption(""); } }}><Plus className="h-3 w-3" /></Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {(editing.options || []).map((opt, j) => (
                  <Badge key={j} variant="secondary" className="gap-1">{opt}
                    <button onClick={() => setEditing(p => ({ ...p, options: p.options.filter((_, k) => k !== j) }))}><Trash2 className="h-2.5 w-2.5" /></button>
                  </Badge>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Aplica-se a</Label>
                <Select value={editing.applies_to || "Todos"} onValueChange={v => setEditing(p => ({ ...p, applies_to: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Todos os tipos</SelectItem>
                    <SelectItem value="Entrega">Entrega</SelectItem>
                    <SelectItem value="Entrega + Instalação">Entrega + Instalação</SelectItem>
                    <SelectItem value="Manutenção/Garantia">Manutenção/Garantia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={editing.is_active ? "true" : "false"} onValueChange={v => setEditing(p => ({ ...p, is_active: v === "true" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Ativo</SelectItem>
                    <SelectItem value="false">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>Salvar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}