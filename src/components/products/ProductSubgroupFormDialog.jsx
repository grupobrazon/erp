import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

const numOrNull = (v) => (v === "" || v == null ? null : Number(v));

export default function ProductSubgroupFormDialog({ open, onOpenChange, subgroup, groups }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", group_id: "", height: "", width: "", length: "", weight: "" });

  useEffect(() => {
    setForm(subgroup
      ? { name: subgroup.name, group_id: subgroup.group_id, height: subgroup.height ?? "", width: subgroup.width ?? "", length: subgroup.length ?? "", weight: subgroup.weight ?? "" }
      : { name: "", group_id: "", height: "", width: "", length: "", weight: "" });
  }, [subgroup, open]);

  const selectedGroup = groups.find(g => g.id === form.group_id);

  const mutation = useMutation({
    mutationFn: async (data) => {
      const group = groups.find(g => g.id === data.group_id);
      const dims = {
        height: numOrNull(data.height),
        width: numOrNull(data.width),
        length: numOrNull(data.length),
        weight: numOrNull(data.weight),
      };
      const payload = { name: data.name, group_id: data.group_id, group_name: group?.name || "", ...dims };
      let result;
      if (subgroup) {
        result = await base44.entities.ProductSubgroup.update(subgroup.id, payload);
        // Propagar dimensões aos produtos deste subgrupo (height → depth no Product)
        const productDims = { depth: dims.height, width: dims.width, length: dims.length, weight: dims.weight };
        await base44.entities.Product.updateMany({ subgroup_id: subgroup.id }, { $set: productDims });
      } else {
        result = await base44.entities.ProductSubgroup.create(payload);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productSubgroups"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      if (subgroup) {
        toast({ title: "Subgrupo atualizado", description: "As dimensões foram replicadas para os produtos deste subgrupo." });
      }
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{subgroup ? "Editar Subgrupo" : "Novo Subgrupo"}</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
          <div>
            <Label>Grupo *</Label>
            <Select value={form.group_id} onValueChange={v => setForm(p => ({ ...p, group_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione o grupo..." /></SelectTrigger>
              <SelectContent>
                {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nome do Subgrupo *</Label>
            <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: iPure" required />
          </div>
          <div className="border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Dimensões Padrão (frete)</p>
            <p className="text-xs text-muted-foreground mb-3">
              Sobrescrevem as dimensões do grupo para os produtos deste subgrupo. Ao salvar, serão replicadas aos produtos. Deixe em branco para herdar do grupo.
            </p>
            {selectedGroup && (
              <p className="text-xs text-muted-foreground mb-3 bg-muted/40 rounded p-2">
                Dimensões do grupo <strong>{selectedGroup.name}</strong>: {selectedGroup.height || 0}×{selectedGroup.width || 0}×{selectedGroup.length || 0} cm, {selectedGroup.weight || 0} kg
              </p>
            )}
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
            <Button type="submit" disabled={mutation.isPending || !form.group_id}>{mutation.isPending ? "Salvando..." : "Salvar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}