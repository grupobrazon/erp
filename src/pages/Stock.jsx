import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import StockProductCombobox from "@/components/stock/StockProductCombobox";
import { format } from "date-fns";

export default function Stock() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [moveType, setMoveType] = useState("Entrada");
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [subgroupFilter, setSubgroupFilter] = useState("all");
  const [form, setForm] = useState({ product_id: "", quantity: 1, reason: "Compra", date: format(new Date(), "yyyy-MM-dd"), notes: "", stock_location_id: "" });
  const queryClient = useQueryClient();

  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => base44.entities.Product.list("-name", 2000) });
  const { data: movements = [], isLoading } = useQuery({ queryKey: ["stockMovements"], queryFn: () => base44.entities.StockMovement.list("-date", 200) });
  const { data: stockLocations = [] } = useQuery({ queryKey: ["stockLocations"], queryFn: () => base44.entities.StockLocation.list("-name", 100) });
  const { data: stockByLocation = [] } = useQuery({ queryKey: ["stockByLocation"], queryFn: () => base44.entities.StockByLocation.list("-created_date", 500) });
  const { data: groups = [] } = useQuery({ queryKey: ["productGroups"], queryFn: () => base44.entities.ProductGroup.list("-name", 500) });
  const { data: subgroups = [] } = useQuery({ queryKey: ["productSubgroups"], queryFn: () => base44.entities.ProductSubgroup.list("-name", 1000) });

  const availableSubgroups = groupFilter === "all" ? subgroups : subgroups.filter(s => s.group_id === groupFilter);

  const mutation = useMutation({
    mutationFn: async () => {
      const product = products.find(p => p.id === form.product_id);
      if (!product) return;
      const loc = stockLocations.find(l => l.id === form.stock_location_id);
      const locName = loc?.name || "";
      await base44.entities.StockMovement.create({
        ...form,
        product_name: product.name,
        type: moveType,
        stock_location_id: form.stock_location_id || null,
        stock_location_name: locName,
      });
      const newStock = moveType === "Entrada"
        ? (product.current_stock || 0) + form.quantity
        : Math.max(0, (product.current_stock || 0) - form.quantity);
      await base44.entities.Product.update(product.id, { current_stock: newStock });
      // Mantém saldo por local
      if (form.stock_location_id) {
        const existing = await base44.entities.StockByLocation.filter({
          product_id: product.id,
          stock_location_id: form.stock_location_id,
        });
        const unit = existing && existing[0];
        const delta = moveType === "Entrada" ? form.quantity : -form.quantity;
        if (unit) {
          await base44.entities.StockByLocation.update(unit.id, {
            quantity: Math.max(0, (unit.quantity || 0) + delta),
            product_name: product.name,
            stock_location_name: locName,
          });
        } else if (delta > 0) {
          await base44.entities.StockByLocation.create({
            product_id: product.id,
            product_name: product.name,
            stock_location_id: form.stock_location_id,
            stock_location_name: locName,
            quantity: delta,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stockMovements"] });
      queryClient.invalidateQueries({ queryKey: ["stockByLocation"] });
      setDialogOpen(false);
      setForm({ product_id: "", quantity: 1, reason: "Compra", date: format(new Date(), "yyyy-MM-dd"), notes: "", stock_location_id: "" });
    },
  });

  const entryReasons = ["Compra", "Ajuste", "Devolução"];
  const exitReasons = ["Venda", "Manutenção", "Troca em garantia", "Perda"];

  const filteredProducts = products.filter(p => {
    if (search && !p.name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (groupFilter !== "all" && p.group_id !== groupFilter) return false;
    if (subgroupFilter !== "all" && p.subgroup_id !== subgroupFilter) return false;
    return true;
  });
  const filteredMovements = movements.filter(m => !search || m.product_name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <PageHeader title="Estoque" description="Controle de entradas e saídas">
        <Button onClick={() => { setMoveType("Entrada"); setDialogOpen(true); }} variant="outline" className="gap-2">
          <ArrowDown className="h-4 w-4 text-emerald-600" /> Entrada
        </Button>
        <Button onClick={() => { setMoveType("Saída"); setDialogOpen(true); }} variant="outline" className="gap-2">
          <ArrowUp className="h-4 w-4 text-destructive" /> Saída
        </Button>
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select
          value={groupFilter}
          onValueChange={(v) => { setGroupFilter(v); setSubgroupFilter("all"); }}
        >
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Grupo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os grupos</SelectItem>
            {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={subgroupFilter}
          onValueChange={setSubgroupFilter}
          disabled={availableSubgroups.length === 0}
        >
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Subgrupo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os subgrupos</SelectItem>
            {availableSubgroups.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="products">
        <TabsList><TabsTrigger value="products">Saldos</TabsTrigger><TabsTrigger value="byLocation">Saldos por Local</TabsTrigger><TabsTrigger value="movements">Movimentações</TabsTrigger></TabsList>

        <TabsContent value="products">
          <div className="rounded-xl border bg-card overflow-hidden mt-4">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Código</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Estoque Atual</TableHead>
                  <TableHead className="text-right">Estoque Mínimo</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map(p => {
                  const isLow = (p.current_stock || 0) <= (p.min_stock || 0) && p.min_stock > 0;
                  return (
                    <TableRow key={p.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs">{p.code || "-"}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.category}</TableCell>
                      <TableCell className={`text-right font-semibold ${isLow ? "text-destructive" : ""}`}>{p.current_stock || 0}</TableCell>
                      <TableCell className="text-right">{p.min_stock || 0}</TableCell>
                      <TableCell>
                        {isLow ? <Badge variant="destructive">Baixo</Badge> : <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">OK</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="byLocation">
          <div className="rounded-xl border bg-card overflow-hidden mt-4">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Local de Estoque</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockByLocation.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum saldo por local. Receba uma compra ou faça uma entrada selecionando o local.</TableCell></TableRow>
                ) : stockByLocation
                  .filter(s => !search || s.product_name?.toLowerCase().includes(search.toLowerCase()) || s.stock_location_name?.toLowerCase().includes(search.toLowerCase()))
                  .map(s => {
                  const isLow = (s.min_stock || 0) > 0 && (s.quantity || 0) <= s.min_stock;
                  return (
                    <TableRow key={s.id} className="hover:bg-muted/30">
                      <TableCell><Badge variant="outline" className="bg-blue-50 text-blue-700">{s.stock_location_name || "—"}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{s.product_code || "-"}</TableCell>
                      <TableCell className="font-medium">{s.product_name}</TableCell>
                      <TableCell className={`text-right font-semibold ${isLow ? "text-destructive" : ""}`}>{s.quantity || 0}</TableCell>
                      <TableCell>{isLow ? <Badge variant="destructive">Baixo</Badge> : <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">OK</Badge>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="movements">
          {isLoading ? (
            <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
          ) : filteredMovements.length === 0 ? (
            <EmptyState title="Nenhuma movimentação" />
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden mt-4">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Data</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMovements.map(m => (
                    <TableRow key={m.id} className="hover:bg-muted/30">
                      <TableCell>{m.date}</TableCell>
                      <TableCell className="font-medium">{m.product_name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={m.type === "Entrada" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}>
                          {m.type}
                        </Badge>
                      </TableCell>
                      <TableCell>{m.reason}</TableCell>
                      <TableCell>{m.stock_location_name ? <Badge variant="outline" className="bg-blue-50 text-blue-700">{m.stock_location_name}</Badge> : "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{m.quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{moveType === "Entrada" ? "Entrada de Estoque" : "Saída de Estoque"}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
            <div>
              <Label>Produto *</Label>
              <StockProductCombobox value={form.product_id} onChange={(id) => setForm(p => ({ ...p, product_id: id }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Quantidade *</Label><Input type="number" min="1" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: parseInt(e.target.value) || 0 }))} /></div>
              <div>
                <Label>Motivo</Label>
                <Select value={form.reason} onValueChange={v => setForm(p => ({ ...p, reason: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(moveType === "Entrada" ? entryReasons : exitReasons).map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Local de Estoque *</Label>
              <Select value={form.stock_location_id || "none"} onValueChange={v => setForm(p => ({ ...p, stock_location_id: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o local" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {stockLocations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Data</Label><Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
            <div><Label>Observações</Label><Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={mutation.isPending || !form.product_id || !form.stock_location_id}>{mutation.isPending ? "Processando..." : "Confirmar"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}