import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fmtPct } from "@/lib/pricingCalc";

const LEVELS = [
  { value: "grupo", label: "Grupo" },
  { value: "subgrupo", label: "Subgrupo" },
  { value: "produto", label: "Produto" },
];

export default function MarginLaunchDialog({ open, onOpenChange, groups = [], subgroups = [], products = [] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [level, setLevel] = useState("grupo");
  const [targetId, setTargetId] = useState("");
  const [margin, setMargin] = useState("");

  useEffect(() => {
    if (open) {
      setLevel("grupo");
      setTargetId("");
      setMargin("");
    }
  }, [open]);

  const targetLabel =
    level === "grupo" ? groups.find(g => g.id === targetId)?.name
    : level === "subgrupo" ? subgroups.find(s => s.id === targetId)?.name
    : products.find(p => p.id === targetId)?.name;

  const mutation = useMutation({
    mutationFn: async () => {
      const marginVal = Number(margin) || 0;
      if (level === "grupo") {
        await base44.entities.ProductGroup.update(targetId, { target_margin_percent: marginVal });
        await base44.entities.ProductSubgroup.updateMany({ group_id: targetId }, { $set: { target_margin_percent: marginVal } });
        await base44.entities.Product.updateMany({ group_id: targetId }, { $set: { target_margin_percent: marginVal } });
        return { tipo: "grupo", nome: targetLabel, valor: marginVal };
      }
      if (level === "subgrupo") {
        await base44.entities.ProductSubgroup.update(targetId, { target_margin_percent: marginVal });
        await base44.entities.Product.updateMany({ subgroup_id: targetId }, { $set: { target_margin_percent: marginVal } });
        return { tipo: "subgrupo", nome: targetLabel, valor: marginVal };
      }
      await base44.entities.Product.update(targetId, { target_margin_percent: marginVal });
      return { tipo: "produto", nome: targetLabel, valor: marginVal };
    },
    onSuccess: (info) => {
      queryClient.invalidateQueries({ queryKey: ["productGroups"] });
      queryClient.invalidateQueries({ queryKey: ["productSubgroups"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["pricingConfig"] });
      toast({
        title: "Margem lançada",
        description: `${info.tipo === "grupo" ? "Grupo" : info.tipo === "subgrupo" ? "Subgrupo" : "Produto"} "${info.nome}" → ${fmtPct(info.valor)}${info.tipo !== "produto" ? " (replicada)" : ""}.`,
      });
      onOpenChange(false);
    },
  });

  const targetOptions =
    level === "grupo" ? groups
    : level === "subgrupo" ? subgroups
    : products;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Lançar Margem</DialogTitle>
          <DialogDescription>
            Margem de lucro sobre o preço final de venda (%) — ex: 50% significa que metade do preço de venda é lucro líquido. Lançar por grupo, subgrupo ou produto. Ao lançar por grupo, a margem é replicada para todos os subgrupos e produtos do grupo. Ao lançar por subgrupo, replica para os produtos do subgrupo. A margem específica sobrescreve a margem global da configuração de precificação.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
          <div>
            <Label>Nível</Label>
            <Select value={level} onValueChange={v => { setLevel(v); setTargetId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{level === "grupo" ? "Grupo" : level === "subgrupo" ? "Subgrupo" : "Produto"} *</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger><SelectValue placeholder={`Selecione o ${level}`} /></SelectTrigger>
              <SelectContent>
                {targetOptions.map(o => (
                  <SelectItem key={o.id} value={o.id}>
                    {level === "subgrupo" ? `${o.name} (${o.group_name || "-"})` : (o.name || o.code || "-")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Margem sobre o Preço Final (%) *</Label>
            <Input type="number" step="0.01" min="0" value={margin} onChange={e => setMargin(e.target.value)} placeholder="0,00" required />
          </div>
          {level !== "produto" && targetId && (
            <p className="text-xs text-muted-foreground">
              A margem será replicada para todos os {level === "grupo" ? "subgrupos e produtos" : "produtos"} vinculados.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending || !targetId || margin === ""}>
              {mutation.isPending ? "Lançando..." : "Lançar Margem"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}