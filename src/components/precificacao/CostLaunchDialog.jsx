import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { fmtBRL } from "@/lib/pricingCalc";
import { Droplet, Wand2 } from "lucide-react";

const LEVELS = [
  { value: "grupo", label: "Grupo" },
  { value: "subgrupo", label: "Subgrupo" },
  { value: "produto", label: "Produto" },
  { value: "lote", label: "Lote (com filtros)" },
];

export default function CostLaunchDialog({ open, onOpenChange, groups = [], subgroups = [], products = [] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [level, setLevel] = useState("grupo");
  const [targetId, setTargetId] = useState("");
  const [cost, setCost] = useState("");

  // Batch mode filters
  const [batchGroup, setBatchGroup] = useState("all");
  const [batchSubgroup, setBatchSubgroup] = useState("all");
  const [batchPh, setBatchPh] = useState("all");
  const [bulkCost, setBulkCost] = useState("");
  const [inlineEdits, setInlineEdits] = useState({});

  useEffect(() => {
    if (open) {
      setLevel("grupo");
      setTargetId("");
      setCost("");
      setBatchGroup("all");
      setBatchSubgroup("all");
      setBatchPh("all");
      setBulkCost("");
      setInlineEdits({});
    }
  }, [open]);

  const targetLabel =
    level === "grupo" ? groups.find(g => g.id === targetId)?.name
    : level === "subgrupo" ? subgroups.find(s => s.id === targetId)?.name
    : products.find(p => p.id === targetId)?.name;

  const mutation = useMutation({
    mutationFn: async () => {
      const costVal = Number(cost) || 0;
      if (level === "grupo") {
        await base44.entities.ProductGroup.update(targetId, { cost: costVal });
        await base44.entities.ProductSubgroup.updateMany({ group_id: targetId }, { $set: { cost: costVal } });
        await base44.entities.Product.updateMany({ group_id: targetId }, { $set: { cost: costVal } });
        return { tipo: "grupo", nome: targetLabel, valor: costVal };
      }
      if (level === "subgrupo") {
        await base44.entities.ProductSubgroup.update(targetId, { cost: costVal });
        await base44.entities.Product.updateMany({ subgroup_id: targetId }, { $set: { cost: costVal } });
        return { tipo: "subgrupo", nome: targetLabel, valor: costVal };
      }
      await base44.entities.Product.update(targetId, { cost: costVal });
      return { tipo: "produto", nome: targetLabel, valor: costVal };
    },
    onSuccess: (info) => {
      queryClient.invalidateQueries({ queryKey: ["productGroups"] });
      queryClient.invalidateQueries({ queryKey: ["productSubgroups"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({
        title: "Custo lançado",
        description: `${info.tipo === "grupo" ? "Grupo" : info.tipo === "subgrupo" ? "Subgrupo" : "Produto"} "${info.nome}" → ${fmtBRL(info.valor)}${info.tipo !== "produto" ? " (replicado)" : ""}.`,
      });
      onOpenChange(false);
    },
  });

  // Batch mode: filtered products
  const batchFiltered = useMemo(() => {
    return products.filter(p =>
      (batchGroup === "all" || p.group_id === batchGroup) &&
      (batchSubgroup === "all" || p.subgroup_id === batchSubgroup) &&
      (batchPh === "all" || p.ph_category === batchPh)
    );
  }, [products, batchGroup, batchSubgroup, batchPh]);

  const batchSubgroups = subgroups.filter(s => batchGroup === "all" || s.group_id === batchGroup);

  const batchMutation = useMutation({
    mutationFn: async () => {
      const costVal = Number(bulkCost) || 0;
      const ids = batchFiltered.map(p => p.id);
      if (ids.length === 0) return { count: 0, valor: costVal };
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        await base44.entities.Product.bulkUpdate(chunk.map(id => ({ id, cost: costVal })));
      }
      return { count: ids.length, valor: costVal };
    },
    onSuccess: (info) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["productGroups"] });
      queryClient.invalidateQueries({ queryKey: ["productSubgroups"] });
      toast({
        title: "Custo lançado em lote",
        description: `${info.count} produtos atualizados → ${fmtBRL(info.valor)} cada.`,
      });
      setBulkCost("");
      setInlineEdits({});
      onOpenChange(false);
    },
  });

  const inlineMutation = useMutation({
    mutationFn: async ({ id, cost }) => {
      await base44.entities.Product.update(id, { cost });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const handleInlineSave = (id, value) => {
    const costVal = Number(value) || 0;
    setInlineEdits(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const current = products.find(p => p.id === id)?.cost;
    if (costVal !== (current || 0)) {
      inlineMutation.mutate({ id, cost: costVal });
    }
  };

  const targetOptions =
    level === "grupo" ? groups
    : level === "subgrupo" ? subgroups
    : products;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={level === "lote" ? "max-w-4xl" : "max-w-md"}>
        <DialogHeader>
          <DialogTitle>Lançar Custo</DialogTitle>
          <DialogDescription>
            {level === "lote"
              ? "Filtre os produtos por grupo, subgrupo e categoria de pH, e lance o custo em lote. Você também pode editar o custo individualmente na tabela."
              : "Lançar custo por grupo, subgrupo ou produto. Ao lançar por grupo, o custo é replicado para todos os subgrupos e produtos do grupo. Ao lançar por subgrupo, replica para os produtos do subgrupo."}
          </DialogDescription>
        </DialogHeader>

        {level !== "lote" ? (
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
              <Label>Custo (R$) *</Label>
              <Input type="number" step="0.01" min="0" value={cost} onChange={e => setCost(e.target.value)} placeholder="0,00" required />
            </div>
            {level !== "produto" && targetId && (
              <p className="text-xs text-muted-foreground">
                O custo será replicado para todos os {level === "grupo" ? "subgrupos e produtos" : "produtos"} vinculados.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={mutation.isPending || !targetId || cost === ""}>
                {mutation.isPending ? "Lançando..." : "Lançar Custo"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
              <Select value={batchGroup} onValueChange={(v) => { setBatchGroup(v); setBatchSubgroup("all"); }}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Todos os grupos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os grupos</SelectItem>
                  {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={batchSubgroup} onValueChange={setBatchSubgroup}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Todos os subgrupos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os subgrupos</SelectItem>
                  {batchSubgroups.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Droplet className="h-4 w-4 text-muted-foreground" />
                <Select value={batchPh} onValueChange={setBatchPh}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Categoria de pH" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as categorias</SelectItem>
                    <SelectItem value="Neutro">Neutro</SelectItem>
                    <SelectItem value="Alcalino">Alcalino</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Bulk apply */}
            <div className="rounded-xl border bg-amber-50/40 border-amber-200 p-4 flex flex-wrap items-center gap-3">
              <Wand2 className="h-5 w-5 text-amber-600" />
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm font-medium text-amber-900">
                  Aplicar custo para todos os {batchFiltered.length} produtos filtrados
                </p>
                <p className="text-xs text-amber-700">O custo será definido em massa para todos os produtos abaixo.</p>
              </div>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Custo (R$)"
                value={bulkCost}
                onChange={e => setBulkCost(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && bulkCost) batchMutation.mutate(); }}
                className="w-40"
              />
              <Button
                onClick={() => batchMutation.mutate()}
                disabled={!bulkCost || Number(bulkCost) <= 0 || batchMutation.isPending || batchFiltered.length === 0}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {batchMutation.isPending ? "Aplicando..." : "Aplicar a todos"}
              </Button>
            </div>

            {/* Products table with inline cost editing */}
            <div className="rounded-xl border max-h-[400px] overflow-auto">
              <Table>
                <TableHeader><TableRow className="bg-muted/50 sticky top-0">
                  <TableHead>Código</TableHead><TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Custo Atual</TableHead>
                  <TableHead className="text-right bg-amber-50">Novo Custo</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {batchFiltered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum produto encontrado com os filtros selecionados.</TableCell></TableRow>
                  ) : batchFiltered.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.code || "-"}</TableCell>
                      <TableCell className="font-medium text-sm">{p.name}</TableCell>
                      <TableCell>{p.ph_category ? <Badge variant="outline" className={p.ph_category === "Alcalino" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-50 text-gray-700 border-gray-200"}>{p.ph_category}</Badge> : <span className="text-muted-foreground text-xs">-</span>}</TableCell>
                      <TableCell className="text-right">{fmtBRL(p.cost || 0)}</TableCell>
                      <TableCell className="text-right bg-amber-50/50">
                        <InlineCostInput
                          productId={p.id}
                          value={inlineEdits[p.id] !== undefined ? inlineEdits[p.id] : p.cost}
                          onEdit={(id, val) => setInlineEdits(prev => ({ ...prev, [id]: val }))}
                          onSave={handleInlineSave}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InlineCostInput({ productId, value, onEdit, onSave }) {
  const [local, setLocal] = useState(value || "");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setLocal(value || "");
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const num = Number(local) || 0;
    if (num !== (Number(value) || 0)) onSave(productId, num);
  };

  return (
    <Input
      type="number"
      step="0.01"
      min="0"
      placeholder="0,00"
      value={local}
      onChange={e => { setLocal(e.target.value); setEditing(true); onEdit(productId, e.target.value); }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className="h-8 w-28 text-right ml-auto"
    />
  );
}