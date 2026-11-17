import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Plus, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import CostLaunchDialog from "@/components/precificacao/CostLaunchDialog";
import MarginLaunchDialog from "@/components/precificacao/MarginLaunchDialog";
import CostImportCard from "@/components/precificacao/CostImportCard";
import { fmtBRL, fmtPct } from "@/lib/pricingCalc";

export default function PrecificacaoCustos() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [marginDialogOpen, setMarginDialogOpen] = useState(false);

  const { data: groups = [], isLoading: lg } = useQuery({
    queryKey: ["productGroups"],
    queryFn: () => base44.entities.ProductGroup.list("-created_date", 200),
  });
  const { data: subgroups = [], isLoading: ls } = useQuery({
    queryKey: ["productSubgroups"],
    queryFn: () => base44.entities.ProductSubgroup.list("-created_date", 500),
  });
  const { data: products = [], isLoading: lp } = useQuery({
    queryKey: ["products"],
    queryFn: () => base44.entities.Product.list("-created_date", 1000),
  });

  return (
    <div>
      <PageHeader title="Lançar Custos" description="Cadastre o custo de aquisição e a margem alvo por grupo, subgrupo ou produto, com replicação automática.">
        <div className="flex gap-2">
          <Button onClick={() => setMarginDialogOpen(true)} variant="outline" className="gap-2">
            <Percent className="h-4 w-4" /> Lançar Margem
          </Button>
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Lançar Custo
          </Button>
        </div>
      </PageHeader>

      <Tabs defaultValue="produtos">
        <TabsList>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="grupos">Grupos</TabsTrigger>
          <TabsTrigger value="subgrupos">Subgrupos</TabsTrigger>
          <TabsTrigger value="importar">Importar Excel</TabsTrigger>
        </TabsList>

        <TabsContent value="produtos">
          {lp ? <Loading /> : (
            products.length === 0 ? <EmptyState title="Sem produtos" description="Cadastre produtos para lançar custos." /> :
            <div className="rounded-xl border bg-card overflow-hidden">
              <Table>
                <TableHeader><TableRow className="bg-muted/50">
                  <TableHead>Código</TableHead><TableHead>Nome</TableHead>
                  <TableHead>Grupo</TableHead><TableHead>Subgrupo</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="text-right">Margem Alvo</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {products.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.code || "-"}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.group_name ? <Badge variant="secondary">{p.group_name}</Badge> : "-"}</TableCell>
                      <TableCell>{p.subgroup_name ? <Badge variant="outline">{p.subgroup_name}</Badge> : "-"}</TableCell>
                      <TableCell className="text-right font-medium">{fmtBRL(p.cost)}</TableCell>
                      <TableCell className="text-right">
                        {Number(p.target_margin_percent) > 0
                          ? <Badge className="bg-primary/15 text-primary">{fmtPct(p.target_margin_percent)}</Badge>
                          : <span className="text-muted-foreground text-xs">herdada</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="grupos">
          {lg ? <Loading /> : (
            groups.length === 0 ? <EmptyState title="Sem grupos" /> :
            <div className="rounded-xl border bg-card overflow-hidden">
              <Table>
                <TableHeader><TableRow className="bg-muted/50">
                  <TableHead>Nome</TableHead><TableHead>Prefixo</TableHead>
                  <TableHead className="text-right">Custo Padrão</TableHead>
                  <TableHead className="text-right">Margem Alvo</TableHead>
                  <TableHead className="text-right">Produtos</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {groups.map(g => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.name}</TableCell>
                      <TableCell><Badge variant="outline" className="font-mono">{g.prefix}</Badge></TableCell>
                      <TableCell className="text-right font-medium">{fmtBRL(g.cost)}</TableCell>
                      <TableCell className="text-right">
                        {Number(g.target_margin_percent) > 0
                          ? <Badge className="bg-primary/15 text-primary">{fmtPct(g.target_margin_percent)}</Badge>
                          : <span className="text-muted-foreground text-xs">global</span>}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{products.filter(p => p.group_id === g.id).length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="subgrupos">
          {ls ? <Loading /> : (
            subgroups.length === 0 ? <EmptyState title="Sem subgrupos" /> :
            <div className="rounded-xl border bg-card overflow-hidden">
              <Table>
                <TableHeader><TableRow className="bg-muted/50">
                  <TableHead>Nome</TableHead><TableHead>Grupo</TableHead>
                  <TableHead className="text-right">Custo Padrão</TableHead>
                  <TableHead className="text-right">Margem Alvo</TableHead>
                  <TableHead className="text-right">Produtos</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {subgroups.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-muted-foreground">{s.group_name || "-"}</TableCell>
                      <TableCell className="text-right font-medium">{fmtBRL(s.cost)}</TableCell>
                      <TableCell className="text-right">
                        {Number(s.target_margin_percent) > 0
                          ? <Badge className="bg-primary/15 text-primary">{fmtPct(s.target_margin_percent)}</Badge>
                          : <span className="text-muted-foreground text-xs">herdada</span>}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{products.filter(p => p.subgroup_id === s.id).length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="importar">
          <CostImportCard products={products} />
        </TabsContent>
      </Tabs>

      <CostLaunchDialog open={dialogOpen} onOpenChange={setDialogOpen} groups={groups} subgroups={subgroups} products={products} />
      <MarginLaunchDialog open={marginDialogOpen} onOpenChange={setMarginDialogOpen} groups={groups} subgroups={subgroups} products={products} />
    </div>
  );
}

function Loading() {
  return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
}