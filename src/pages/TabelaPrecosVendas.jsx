import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Search, Table2, Filter, Droplet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import MultiSelectFilter from "@/components/ui/MultiSelectFilter";
import { computePrice, getEffectiveCost, getEffectiveMargin, fmtBRL, fmtPct, salesTaxForScenario } from "@/lib/pricingCalc";

export default function TabelaPrecosVendas() {
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState([]);
  const [subgroupFilter, setSubgroupFilter] = useState([]);
  const [phFilter, setPhFilter] = useState([]);

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

  const rows = useMemo(() => {
    return products.map(p => {
      const cost = getEffectiveCost(p, subgroups, groups);
      const margin = getEffectiveMargin(p, subgroups, groups, config);
      const hasDirectPrice = Number(p.sale_price) > 0;
      const priceVista = computePrice(cost, config, 1, "mg", margin, p.sale_price);
      return {
        ...p,
        cost,
        margin,
        hasDirectPrice,
        priceVistaMG: priceVista,
        price6xMG: computePrice(cost, config, 6, "mg", margin, p.sale_price),
        price12xMG: computePrice(cost, config, 12, "mg", margin, p.sale_price),
      };
    });
  }, [products, groups, subgroups, config]);

  const filtered = useMemo(() => {
    const result = rows.filter(p =>
      (!search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.code?.toLowerCase().includes(search.toLowerCase())) &&
      (groupFilter.length === 0 || groupFilter.includes(p.group_id)) &&
      (subgroupFilter.length === 0 || subgroupFilter.includes(p.subgroup_id)) &&
      (phFilter.length === 0 || phFilter.includes(p.ph_category))
    );
    // Ordena: produtos com valor primeiro, zerados ao final; dentro de cada grupo, por nome
    const hasValue = (p) => (p.hasDirectPrice || p.cost > 0) && p.priceVistaMG > 0;
    return result.sort((a, b) => {
      const aHas = hasValue(a) ? 0 : 1;
      const bHas = hasValue(b) ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      const ga = (a.group_name || "").toLowerCase();
      const gb = (b.group_name || "").toLowerCase();
      if (ga !== gb) return ga.localeCompare(gb);
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [rows, search, groupFilter, subgroupFilter, phFilter]);

  const subgroupsFiltered = subgroups.filter(s => groupFilter.length === 0 || groupFilter.includes(s.group_id));

  return (
    <div>
      <PageHeader title="Tabela de Preços" description="Tabela única de preços de venda para consulta na venda. Preços calculados com impostos e margem configurados.">
        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary">Margem alvo: {fmtPct(config.target_margin_percent)}</Badge>
          <Badge variant="outline">Impostos: {fmtPct(salesTaxForScenario(config, "mg"))}</Badge>
        </div>
      </PageHeader>

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

      {lp ? <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div> : (
        filtered.length === 0 ? <EmptyState icon={Table2} title="Sem produtos" description="Cadastre produtos para gerar a tabela." /> :
        <SalesPriceTable rows={filtered} />
      )}
    </div>
  );
}

function SalesPriceTable({ rows }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Table>
        <TableHeader><TableRow className="bg-muted/50">
          <TableHead>Código</TableHead>
          <TableHead>Nome</TableHead>
          <TableHead>Grupo</TableHead>
          <TableHead className="text-right bg-primary/5">Preço à Vista</TableHead>
          <TableHead className="text-right bg-primary/5">Preço 6x</TableHead>
          <TableHead className="text-right bg-primary/5">Preço 12x</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map(p => {
            const hasValue = (p.hasDirectPrice || p.cost > 0) && p.priceVistaMG > 0;
            return (
              <TableRow key={p.id} className={hasValue ? "" : "opacity-50"}>
                <TableCell className="font-mono text-xs">{p.code || "-"}</TableCell>
                <TableCell className="font-medium">
                  {p.name}
                  {p.hasDirectPrice && <Badge variant="outline" className="ml-2 text-[10px] bg-amber-50 text-amber-700 border-amber-200">Preço direto</Badge>}
                  {!hasValue && <Badge variant="outline" className="ml-2 text-[10px] bg-muted text-muted-foreground">Sem preço</Badge>}
                </TableCell>
                <TableCell>{p.group_name ? <Badge variant="secondary">{p.group_name}</Badge> : "-"}</TableCell>
                <TableCell className="text-right font-bold bg-primary/5">{fmtBRL(p.priceVistaMG)}</TableCell>
                <TableCell className="text-right font-bold bg-primary/5">{fmtBRL(p.price6xMG)}</TableCell>
                <TableCell className="text-right font-bold bg-primary/5">{fmtBRL(p.price12xMG)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}