import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

const numOrNull = (v) => (v === "" || v == null ? null : Number(v));

export default function ProductGroupFormDialog({ open, onOpenChange, group }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", prefix: "", height: "", width: "", length: "", weight: "" });

  useEffect(() => {
    setForm(group ? {
      name: group.name,
      prefix: group.prefix,
      height: group.height ?? "",
      width: group.width ?? "",
      length: group.length ?? "",
      weight: group.weight ?? "",
    } : { name: "", prefix: "", height: "", width: "", length: "", weight: "" });
  }, [group, open]);

  const { toast } = useToast();
  const isEditingGroup = !!group;

  const mutation = useMutation({
    mutationFn: async (data) => {
      const dims = {
        height: numOrNull(data.height),
        width: numOrNull(data.width),
        length: numOrNull(data.length),
        weight: numOrNull(data.weight),
      };
      if (!group) {
        return base44.entities.ProductGroup.create(data);
      }
      const updated = await base44.entities.ProductGroup.update(group.id, data);
      // Propagar dimensões aos subgrupos do grupo
      await base44.entities.ProductSubgroup.updateMany({ group_id: group.id }, { $set: dims });
      // Propagar dimensões aos produtos do grupo (height do grupo → depth no Product)
      const productDims = { depth: dims.height, width: dims.width, length: dims.length, weight: dims.weight };
      await base44.entities.Product.updateMany({ group_id: group.id }, { $set: productDims });
      // Se o nome mudou, cascatear para subgrupos e produtos
      if (data.name && data.name !== group.name) {
        await Promise.all([
          base44.entities.ProductSubgroup.updateMany({ group_id: group.id }, { $set: { group_name: data.name } }),
          base44.entities.Product.updateMany({ group_id: group.id }, { $set: { group_name: data.name } }),
        ]);
      }
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productGroups"] });
      queryClient.invalidateQueries({ queryKey: ["productSubgroups"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      if (isEditingGroup) {
        toast({ title: "Grupo atualizado", description: "As dimensões foram replicadas para os subgrupos e produtos deste grupo." });
      }
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{group ? "Editar Grupo" : "Novo Grupo"}</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
          <div>
            <Label>Nome do Grupo *</Label>
            <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Purificador de Água Gelada" required />
          </div>
          <div>
            <Label>Prefixo do Código *</Label>
            <Input value={form.prefix} onChange={e => setForm(p => ({ ...p, prefix: e.target.value.toUpperCase() }))} placeholder="Ex: P" maxLength={5} required />
          </div>
          <div className="border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Dimensões Padrão (frete)</p>
            <p className="text-xs text-muted-foreground mb-3">Usadas na cotação de frete dos produtos deste grupo. Podem ser sobrescritas individualmente em cada produto.</p>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <Label className="text-xs">Altura (cm)</Label>
                <Input type="number" value={form.height} onChange={e => setForm(p => ({ ...p, height: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <Label className="text-xs">Largura (cm)</Label>
                <Input type="number" value={form.width} onChange={e => setForm(p => ({ ...p, width: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <Label className="text-xs">Compr. (cm)</Label>
                <Input type="number" value={form.length} onChange={e => setForm(p => ({ ...p, length: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <Label className="text-xs">Peso (kg)</Label>
                <Input type="number" step="0.01" value={form.weight} onChange={e => setForm(p => ({ ...p, weight: e.target.value }))} placeholder="0" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Salvando..." : "Salvar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}