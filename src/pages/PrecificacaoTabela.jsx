import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Table2, MapPin, MapPinned, Filter, Droplet, Wand2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import MultiSelectFilter from "@/components/ui/MultiSelectFilter";
import { computePrice, getEffectiveCost, getEffectiveMargin, sumSellingCosts, salesTaxForScenario, fmtBRL, fmtPct, SCENARIOS } from "@/lib/pricingCalc";

export default function PrecificacaoTabela() {
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState([]);
  const [subgroupFilter, setSubgroupFilter] = useState([]);
  const [phFilter, setPhFilter] = useState([]);
  const [bulkPrice, setBulkPrice] = useState("");
  const queryClient = useQueryClient();

  const { data: products = [], isLoading: lp } = useQuery({
    queryKey: ["products"],
    queryFn: () => base44.entities.Product.list("-created_date", 1000),
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["productGroups"],
    queryFn: () => base44.entities.ProductGroup.list("-created_date", 200),
  });
  const { data: subgroups = [] } = useQuery({
    queryKey: ["productSubgroups"],
    queryFn: () => base44.entities.ProductSubgroup.list("-created_date", 500),
  });
  const { data: configs = [] } = useQuery({
    queryKey: ["pricingConfig"],
    queryFn: () => base44.entities.PricingConfig.list("-created_date", 10),
  });

  const config = configs.find(c => c.name === "default") || configs[0] || {};

  const priceMutation = useMutation({
    mutationFn: ({ id, sale_price }) => base44.entities.Product.update(id, { sale_price }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  const handleUpdatePrice = (id, value) => {
    const sale_price = Number(value) || 0;
    priceMutation.mutate({ id, sale_price });
  };

  const bulkPriceMutation = useMutation({
    mutationFn: async ({ ids, sale_price }) => {
      const updates = ids.map(id => ({ id, sale_price }));
      for (let i = 0; i < updates.length; i += 100) {
        await base44.entities.Product.bulkUpdate(updates.slice(i, i + 100));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setBulkPrice("");
    },
  });

  const handleBulkApply = () => {
    const sale_price = Number(bulkPrice) || 0;
    if (!sale_price || sale_price <= 0) return;
    const ids = filtered.map(p => p.id);
    if (ids.length === 0) return;
    bulkPriceMutation.mutate({ ids, sale_price });
  };

  const rows = useMemo(() => {
    return products.map(p => {
      const cost = getEffectiveCost(p, subgroups, groups);
      const margin = getEffectiveMargin(p, subgroups, groups, config);
      const costSource = Number(p.cost) > 0 ? "produto" : (p.subgroup_id && subgroups.find(s => s.id === p.subgroup_id && Number(s.cost) > 0) ? "subgrupo" : (p.group_id && groups.find(g => g.id === p.group_id && Number(g.cost) > 0) ? "grupo" : "nenhum"));
      const marginSource = Number(p.target_margin_percent) > 0 ? "produto" : (p.subgroup_id && subgroups.find(s => s.id === p.subgroup_id && Number(s.target_margin_percent) > 0) ? "subgrupo" : (p.group_id && groups.find(g => g.id === p.group_id && Number(g.target_margin_percent) > 0) ? "grupo" : "global"));
      const hasDirectPrice = Number(p.sale_price) > 0;
      return {
        ...p,
        cost,
        margin,
        costSource,
        marginSource,
        hasDirectPrice,
        // Preço sugerido pela margem (fórmula, sem preço direto)
        suggestedVistaMG: computePrice(cost, config, 1, "mg", margin, null),
        suggestedVistaFora: computePrice(cost, config, 1, "fora_mg", margin, null),
        // Preço à vista efetivo: definido (manual) se houver, senão sugerido
        priceVistaMG: hasDirectPrice ? Number(p.sale_price) : computePrice(cost, config, 1, "mg", margin, null),
        priceVistaFora: hasDirectPrice ? Number(p.sale_price) : computePrice(cost, config, 1, "fora_mg", margin, null),
        // Preço 6x: sempre derivado do à vista (à vista ÷ (1 - taxa financeira 6x))
        price6xMG: computePrice(cost, config, 6, "mg", margin, hasDirectPrice ? p.sale_price : null),
        price6xFora: computePrice(cost, config, 6, "fora_mg", margin, hasDirectPrice ? p.sale_price : null),
        // Preço 12x: sempre derivado do à vista (à vista ÷ (1 - taxa financeira 12x))
        price12xMG: computePrice(cost, config, 12, "mg", margin, hasDirectPrice ? p.sale_price : null),
        price12xFora: computePrice(cost, config, 12, "fora_mg", margin, hasDirectPrice ? p.sale_price : null),
      };
    });
  }, [products, groups, subgroups, config]);

  const filtered = rows.filter(p =>
    (!search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.code?.toLowerCase().includes(search.toLowerCase())) &&
    (groupFilter.length === 0 || groupFilter.includes(p.group_id)) &&
    (subgroupFilter.length === 0 || subgroupFilter.includes(p.subgroup_id)) &&
    (phFilter.length === 0 || phFilter.includes(p.ph_category))
  );

  const subgroupsFiltered = subgroups.filter(s => groupFilter.length === 0 || groupFilter.includes(s.group_id));

  const avgVistaMG = filtered.length ? filtered.reduce((s, p) => s + p.priceVistaMG, 0) / filtered.length : 0;
  const avg6xMG = filtered.length ? filtered.reduce((s, p) => s + p.price6xMG, 0) / filtered.length : 0;
  const avg12xMG = filtered.length ? filtered.reduce((s, p) => s + p.price12xMG, 0) / filtered.length : 0;
  const avgVistaFora = filtered.length ? filtered.reduce((s, p) => s + p.priceVistaFora, 0) / filtered.length : 0;
  const noCost = filtered.filter(p => p.cost === 0).length;

  return (
    <div>
      <PageHeader title="Tabela de Preços" description="Preço de venda calculado a partir do custo + impostos + custos de venda + margem (sobre o preço final). A margem mostrada é o % do preço de venda que é lucro líquido.">
        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary">Margem global: {fmtPct(config.target_margin_percent)}</Badge>
          <Badge variant="outline">Impostos MG: {fmtPct(salesTaxForScenario(config, "mg"))}</Badge>
          <Badge variant="outline">Impostos Fora MG: {fmtPct(salesTaxForScenario(config, "fora_mg"))}</Badge>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Produtos" value={filtered.length} />
        <StatCard label="Preço médio à vista (MG)" value={fmtBRL(avgVistaMG)} />
        <StatCard label="Preço médio 6x (MG)" value={fmtBRL(avg6xMG)} />
        <StatCard label="Preço médio 12x (MG)" value={fmtBRL(avg12xMG)} />
        <StatCard label="Preço médio à vista (Fora MG)" value={fmtBRL(avgVistaFora)} />
      </div>

      <div className="mb-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar produto por nome ou código..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <MultiSelectFilter
          icon={Filter}
          options={groups.map(g => ({ value: g.id, label: g.name }))}
          selected={groupFilter}
          onChange={(v) => { setGroupFilter(v); setSubgroupFilter([]); }}
          allLabel="Todos os grupos"
          className="w-[220px]"
        />
        <MultiSelectFilter
          options={subgroupsFiltered.map(s => ({ value: s.id, label: s.name }))}
          selected={subgroupFilter}
          onChange={setSubgroupFilter}
          allLabel="Todos os subgrupos"
          className="w-[220px]"
        />
        <MultiSelectFilter
          icon={Droplet}
          options={[{ value: "Neutro", label: "Neutro" }, { value: "Alcalino", label: "Alcalino" }]}
          selected={phFilter}
          onChange={setPhFilter}
          allLabel="Todas as categorias"
          className="w-[200px]"
        />
      </div>

      {filtered.length > 0 && (
        <div className="mb-6 rounded-xl border bg-amber-50/40 border-amber-200 p-4 flex flex-wrap items-center gap-3">
          <Wand2 className="h-5 w-5 text-amber-600" />
          <div className="flex-1 min-w-[200px]">
            <p className="text-sm font-medium text-amber-900">
              Aplicar preço à vista para todos os {filtered.length} produtos{groupFilter.length > 0 ? " do grupo selecionado" : ""}{phFilter.length > 0 ? ` (${phFilter.join(", ")})` : ""}
            </p>
            <p className="text-xs text-amber-700">Define o "Preço Definido (à vista)" em massa. O preço 12x é calculado automaticamente.</p>
          </div>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="Preço à vista (R$)"
            value={bulkPrice}
            onChange={e => setBulkPrice(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleBulkApply(); }}
            className="w-44"
          />
          <Button
            onClick={handleBulkApply}
            disabled={!bulkPrice || Number(bulkPrice) <= 0 || bulkPriceMutation.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {bulkPriceMutation.isPending ? "Aplicando..." : "Aplicar a todos"}
          </Button>
        </div>
      )}

      {lp ? <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div> : (
        filtered.length === 0 ? <EmptyState icon={Table2} title="Sem produtos" description="Cadastre produtos e custos para gerar a tabela." /> :
        <Tabs defaultValue="mg">
          <TabsList>
            <TabsTrigger value="mg" className="gap-2"><MapPin className="h-4 w-4" /> Dentro de MG</TabsTrigger>
            <TabsTrigger value="fora_mg" className="gap-2"><MapPinned className="h-4 w-4" /> Fora de MG (TTS)</TabsTrigger>
          </TabsList>
          <TabsContent value="mg">
            <PriceTable rows={filtered} config={config} scenario="mg" onUpdatePrice={handleUpdatePrice} />
          </TabsContent>
          <TabsContent value="fora_mg">
            <PriceTable rows={filtered} config={config} scenario="fora_mg" onUpdatePrice={handleUpdatePrice} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function PriceTable({ rows, config, scenario, onUpdatePrice }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Table>
        <TableHeader><TableRow className="bg-muted/50">
          <TableHead>Código</TableHead><TableHead>Nome</TableHead>
          <TableHead>Grupo</TableHead>
          <TableHead className="text-right">Custo</TableHead>
          <TableHead className="text-right">Custos de Venda</TableHead>
          <TableHead className="text-right text-muted-foreground">Preço Sugerido (margem)</TableHead>
          <TableHead className="text-right bg-amber-50">Preço Definido (à vista)</TableHead>
          <TableHead className="text-right bg-primary/5">Preço à Vista</TableHead>
          <TableHead className="text-right bg-primary/5">Preço 6x</TableHead>
          <TableHead className="text-right bg-primary/5">Preço 12x</TableHead>
          <TableHead className="text-right">Margem s/ Venda · Markup s/ Custo</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map(p => {
            const suggestedVista = scenario === "mg" ? p.suggestedVistaMG : p.suggestedVistaFora;
            const priceVista = scenario === "mg" ? p.priceVistaMG : p.priceVistaFora;
            const price6x = scenario === "mg" ? p.price6xMG : p.price6xFora;
            const price12x = scenario === "mg" ? p.price12xMG : p.price12xFora;
            const sellingCosts = sumSellingCosts(config, 1, scenario);
            const margin = priceVista - p.cost - (priceVista * sellingCosts / 100);
            return (
              <TableRow key={p.id} className={p.cost === 0 ? "opacity-50" : ""}>
                <TableCell className="font-mono text-xs">{p.code || "-"}</TableCell>
                <TableCell className="font-medium">
                  {p.name}
                  {p.hasDirectPrice && <Badge variant="outline" className="ml-2 text-[10px] bg-amber-50 text-amber-700 border-amber-200">Preço direto</Badge>}
                </TableCell>
                <TableCell>{p.group_name ? <Badge variant="secondary">{p.group_name}</Badge> : "-"}</TableCell>
                <TableCell className="text-right">
                  <span>{fmtBRL(p.cost)}</span>
                  {p.costSource !== "produto" && p.costSource !== "nenhum" && (
                    <span className="block text-[10px] text-muted-foreground">herdado do {p.costSource}</span>
                  )}
                  {p.costSource === "nenhum" && <span className="block text-[10px] text-destructive">sem custo</span>}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">{fmtPct(sellingCosts)}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {suggestedVista > 0 ? fmtBRL(suggestedVista) : <span className="text-destructive text-xs">inválido</span>}
                </TableCell>
                <TableCell className="text-right bg-amber-50/50">
                  <DirectPriceInput productId={p.id} value={p.sale_price} onSave={onUpdatePrice} />
                </TableCell>
                <TableCell className="text-right font-bold bg-primary/5">{fmtBRL(priceVista)}</TableCell>
                <TableCell className="text-right font-bold bg-primary/5">{fmtBRL(price6x)}</TableCell>
                <TableCell className="text-right font-bold bg-primary/5">{fmtBRL(price12x)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-col items-end">
                    <span className={margin > 0 ? "text-emerald-600 font-medium" : "text-destructive"}>{fmtBRL(margin)}</span>
                    <span className="text-[10px] text-muted-foreground">
                      margem {fmtPct(priceVista > 0 ? (margin / priceVista) * 100 : 0)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      markup {fmtPct(p.cost > 0 ? ((priceVista - p.cost) / p.cost) * 100 : 0)}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function DirectPriceInput({ productId, value, onSave }) {
  const [local, setLocal] = useState(value || "");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setLocal(value || "");
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const num = Number(local) || 0;
    if (num !== (value || 0)) onSave(productId, num);
  };

  return (
    <Input
      type="number"
      step="0.01"
      min="0"
      placeholder="auto"
      value={local}
      onChange={e => { setLocal(e.target.value); setEditing(true); }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className="h-8 w-28 text-right ml-auto"
    />
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
    </div>
  );
}