import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingDown, Package, Layers, GitBranch, Filter } from "lucide-react";

const fmtBRL = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v) => (Number(v) || 0).toFixed(1) + "%";
const fmtNum = (v) => (Number(v) || 0).toLocaleString("pt-BR");

const CLASS_STYLE = {
  A: { variant: "default", className: "bg-emerald-600 text-white" },
  B: { variant: "default", className: "bg-amber-500 text-white" },
  C: { variant: "default", className: "bg-slate-400 text-white" },
};

export default function CurvaABC() {
  const [dimension, setDimension] = useState("produto");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [excludeCancelled, setExcludeCancelled] = useState(true);

  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ["curvaABC_sales"],
    queryFn: async () => {
      const map = new Map();
      const b1 = await base44.entities.Sale.list("-created_date", 5000);
      for (const r of b1) map.set(r.id, r);
      const b2 = await base44.entities.Sale.list("created_date", 5000);
      for (const r of b2) map.set(r.id, r);
      return [...map.values()];
    },
  });

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["curvaABC_products"],
    queryFn: async () => {
      const map = new Map();
      const b1 = await base44.entities.Product.list("-created_date", 5000);
      for (const r of b1) map.set(r.id, r);
      const b2 = await base44.entities.Product.list("created_date", 5000);
      for (const r of b2) map.set(r.id, r);
      return [...map.values()];
    },
  });

  const productMap = useMemo(() => {
    const m = new Map();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const rows = useMemo(() => {
    const acc = {};
    for (const s of sales) {
      if (excludeCancelled && s.status === "Cancelada") continue;
      if (dateFrom && (!s.date || s.date < dateFrom)) continue;
      if (dateTo && (!s.date || s.date > dateTo)) continue;
      for (const item of (s.items || [])) {
        const p = productMap.get(item.product_id);
        let key, name, group, subgroup;
        if (dimension === "produto") {
          key = item.product_id || item.product_name || "—";
          name = item.product_name || "—";
          group = p?.group_name || "Sem grupo";
          subgroup = p?.subgroup_name || "Sem subgrupo";
        } else if (dimension === "grupo") {
          key = p?.group_name || "Sem grupo";
          name = key;
          group = key;
          subgroup = "—";
        } else {
          key = p?.subgroup_name || "Sem subgrupo";
          name = key;
          group = p?.group_name || "Sem grupo";
          subgroup = key;
        }
        if (!acc[key]) acc[key] = { key, name, group, subgroup, qty: 0, revenue: 0 };
        acc[key].qty += Number(item.quantity) || 0;
        acc[key].revenue += Number(item.total) || 0;
      }
    }
    const arr = Object.values(acc).sort((a, b) => b.revenue - a.revenue);
    const total = arr.reduce((s, r) => s + r.revenue, 0);
    let cum = 0;
    for (const r of arr) {
      const cumBefore = total ? (cum / total) * 100 : 0;
      cum += r.revenue;
      r.pct = total ? (r.revenue / total) * 100 : 0;
      r.cumPct = total ? (cum / total) * 100 : 0;
      r.class = cumBefore < 80 ? "A" : cumBefore < 95 ? "B" : "C";
    }
    return { arr, total };
  }, [sales, productMap, dimension, dateFrom, dateTo, excludeCancelled]);

  const { arr, total } = rows;
  const countA = arr.filter(r => r.class === "A").length;
  const countB = arr.filter(r => r.class === "B").length;
  const countC = arr.filter(r => r.class === "C").length;
  const totalQty = arr.reduce((s, r) => s + r.qty, 0);

  const chartData = arr.slice(0, 20).map((r, i) => ({
    name: dimension === "produto" ? (r.name.length > 18 ? r.name.slice(0, 16) + "…" : r.name) : r.name,
    faturamento: Math.round(r.revenue),
    acumulado: Number(r.cumPct.toFixed(1)),
  }));

  const loading = loadingSales || loadingProducts;

  return (
    <div>
      <PageHeader title="Curva ABC de Vendas" description="Análise de Pareto do faturamento por produto, grupo e subgrupo" />

      {/* Filtros */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Analisar por</Label>
              <Tabs value={dimension} onValueChange={setDimension}>
                <TabsList>
                  <TabsTrigger value="produto" className="gap-1"><Package className="h-3.5 w-3.5" /> Produto</TabsTrigger>
                  <TabsTrigger value="grupo" className="gap-1"><Layers className="h-3.5 w-3.5" /> Grupo</TabsTrigger>
                  <TabsTrigger value="subgrupo" className="gap-1"><GitBranch className="h-3.5 w-3.5" /> Subgrupo</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">De</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Até</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer h-9">
              <input type="checkbox" checked={excludeCancelled} onChange={e => setExcludeCancelled(e.target.checked)} className="h-4 w-4" />
              Ignorar vendas canceladas
            </label>
            {(dateFrom || dateTo || !excludeCancelled) && (
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => { setDateFrom(""); setDateTo(""); setExcludeCancelled(true); }}>
                <Filter className="h-3.5 w-3.5" /> Limpar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Faturamento total</p>
          <p className="text-xl font-bold text-primary">{fmtBRL(total)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Qtd. itens vendidos</p>
          <p className="text-xl font-bold">{fmtNum(totalQty)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Classe A (até 80%)</p>
          <p className="text-xl font-bold text-emerald-600">{countA} {dimension === "produto" ? "produtos" : dimension === "grupo" ? "grupos" : "subgrupos"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Classe B (80–95%)</p>
          <p className="text-xl font-bold text-amber-500">{countB}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Classe C (95–100%)</p>
          <p className="text-xl font-bold text-slate-400">{countC}</p>
        </CardContent></Card>
      </div>

      {/* Gráfico de Pareto (top 20) */}
      {chartData.length > 0 && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-sm">Curva de Pareto — Top 20</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 70 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" angle={-40} textAnchor="end" height={70} interval={0} tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tickFormatter={(v) => "R$ " + (v / 1000).toFixed(0) + "k"} tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => v + "%"} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(val, name) => name === "acumulado" ? [fmtPct(val), "% Acumulado"] : [fmtBRL(val), "Faturamento"]} />
                <Bar yAxisId="left" dataKey="faturamento" fill="hsl(199,89%,48%)" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="acumulado" stroke="hsl(35,92%,55%)" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : arr.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Nenhuma venda encontrada no período selecionado.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  {dimension === "produto" && <TableHead>Produto</TableHead>}
                  {dimension === "produto" && <TableHead>Grupo</TableHead>}
                  {dimension === "produto" && <TableHead>Subgrupo</TableHead>}
                  {dimension === "grupo" && <TableHead>Grupo</TableHead>}
                  {dimension === "subgrupo" && <TableHead>Subgrupo</TableHead>}
                  {dimension === "subgrupo" && <TableHead>Grupo</TableHead>}
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                  <TableHead className="text-right">% do total</TableHead>
                  <TableHead className="text-right">% Acum.</TableHead>
                  <TableHead className="text-center">Classe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {arr.map((r, i) => (
                  <TableRow key={r.key} className={r.class === "A" ? "bg-emerald-500/[0.04]" : ""}>
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    {dimension === "produto" && <TableCell className="font-medium text-sm">{r.name}</TableCell>}
                    {dimension === "produto" && <TableCell className="text-sm text-muted-foreground">{r.group}</TableCell>}
                    {dimension === "produto" && <TableCell className="text-sm text-muted-foreground">{r.subgroup}</TableCell>}
                    {dimension === "grupo" && <TableCell className="font-medium text-sm">{r.name}</TableCell>}
                    {dimension === "subgrupo" && <TableCell className="font-medium text-sm">{r.name}</TableCell>}
                    {dimension === "subgrupo" && <TableCell className="text-sm text-muted-foreground">{r.group}</TableCell>}
                    <TableCell className="text-right text-sm">{fmtNum(r.qty)}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{fmtBRL(r.revenue)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtPct(r.pct)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtPct(r.cumPct)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="default" className={CLASS_STYLE[r.class].className}>{r.class}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}