import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from "@/components/ui/table";
import EmptyState from "@/components/ui/EmptyState";

export default function SimpleListManager({ entityName, queryKey, itemLabel }) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: () => base44.entities[entityName].list("-created_date", 200),
  });

  const createMutation = useMutation({
    mutationFn: (name) => base44.entities[entityName].create({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      setNewName("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }) => base44.entities[entityName].update(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities[entityName].delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
  });

  return (
    <div className="space-y-4">
      <form
        onSubmit={e => { e.preventDefault(); if (newName.trim()) createMutation.mutate(newName.trim()); }}
        className="flex gap-2"
      >
        <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder={`Novo ${itemLabel}...`} />
        <Button type="submit" disabled={createMutation.isPending || !newName.trim()} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </form>

      {isLoading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : items.length === 0 ? (
        <EmptyState title={`Nenhum(a) ${itemLabel} cadastrado(a)`} />
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id}>
                <TableCell>
                  {editingId === item.id ? (
                    <Input value={editingName} onChange={e => setEditingName(e.target.value)} className="max-w-xs" autoFocus />
                  ) : (
                    <span className="font-medium">{item.name}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {editingId === item.id ? (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button>
                      <Button size="sm" onClick={() => updateMutation.mutate({ id: item.id, name: editingName })}>Salvar</Button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditingId(item.id); setEditingName(item.name); }}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}