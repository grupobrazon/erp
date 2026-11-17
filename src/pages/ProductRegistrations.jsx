import React from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/ui/PageHeader";
import GroupsSubgroupsTab from "@/components/products/registrations/GroupsSubgroupsTab";
import SimpleListManager from "@/components/products/registrations/SimpleListManager";

export default function ProductRegistrations() {
  const navigate = useNavigate();

  const { data: groups = [] } = useQuery({
    queryKey: ["productGroups"],
    queryFn: () => base44.entities.ProductGroup.list("-created_date", 200),
  });
  const { data: subgroups = [] } = useQuery({
    queryKey: ["productSubgroups"],
    queryFn: () => base44.entities.ProductSubgroup.list("-created_date", 500),
  });
  const { data: stockUnits = [] } = useQuery({
    queryKey: ["stockUnits"],
    queryFn: () => base44.entities.StockUnit.list("-created_date", 200),
  });
  const { data: supplySources = [] } = useQuery({
    queryKey: ["supplySources"],
    queryFn: () => base44.entities.SupplySource.list("-created_date", 200),
  });
  const { data: productTypeOptions = [] } = useQuery({
    queryKey: ["productTypeOptions"],
    queryFn: () => base44.entities.ProductTypeOption.list("-created_date", 200),
  });

  const handleExport = () => {
    const wb = XLSX.utils.book_new();

    const groupsSheetData = [
      ["Tipo", "Nome", "Prefixo/Grupo"],
      ...groups.map(g => ["Grupo", g.name, g.prefix]),
      ...subgroups.map(s => ["Subgrupo", s.name, s.group_name]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(groupsSheetData), "Grupos e Subgrupos");

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["Nome"], ...stockUnits.map(u => [u.name])]),
      "Unidade de Estoque"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["Nome"], ...supplySources.map(s => [s.name])]),
      "Fonte de Fornecimento"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["Nome"], ...productTypeOptions.map(t => [t.name])]),
      "Tipo de Produto"
    );

    XLSX.writeFile(wb, "cadastros_gerais_produtos.xlsx");
  };

  return (
    <div>
      <PageHeader title="Cadastros Gerais > Produtos" description="Parametrize os cadastros usados no módulo de produtos">
        <Button variant="outline" onClick={handleExport} className="gap-2">
          <Download className="h-4 w-4" /> Exportar Relatório
        </Button>
        <Button variant="outline" onClick={() => navigate("/produtos")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar para Produtos
        </Button>
      </PageHeader>

      <Tabs defaultValue="grupos">
        <TabsList>
          <TabsTrigger value="grupos">Grupos e Subgrupos</TabsTrigger>
          <TabsTrigger value="unidades">Unidade de Estoque</TabsTrigger>
          <TabsTrigger value="fontes">Fonte de Fornecimento</TabsTrigger>
          <TabsTrigger value="tipos">Tipo de Produto</TabsTrigger>
        </TabsList>

        <TabsContent value="grupos" className="mt-6">
          <GroupsSubgroupsTab />
        </TabsContent>
        <TabsContent value="unidades" className="mt-6">
          <SimpleListManager entityName="StockUnit" queryKey="stockUnits" itemLabel="unidade" />
        </TabsContent>
        <TabsContent value="fontes" className="mt-6">
          <SimpleListManager entityName="SupplySource" queryKey="supplySources" itemLabel="fonte de fornecimento" />
        </TabsContent>
        <TabsContent value="tipos" className="mt-6">
          <SimpleListManager entityName="ProductTypeOption" queryKey="productTypeOptions" itemLabel="tipo de produto" />
        </TabsContent>
      </Tabs>
    </div>
  );
}