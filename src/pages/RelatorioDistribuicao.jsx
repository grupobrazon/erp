import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Users, FileSpreadsheet, Wrench, TrendingUp } from "lucide-react";
import { exportClientDistribution } from "@/lib/excelExport";
import { buildConversionMap } from "@/lib/distributionConversion";
import DistribuicaoEquipamentosTab from "@/components/distribuicao/DistribuicaoEquipamentosTab";
import ConversaoVendasTab from "@/components/distribuicao/ConversaoVendasTab";

const PHONE_FIELDS = [
  "phone1", "phone2", "phone3", "phone4", "phone5",
  "zoox_phone1", "zoox_phone2", "zoox_phone3", "zoox_phone4", "zoox_phone5", "zoox_phone6", "zoox_phone7",
];

export default function RelatorioDistribuicao() {
  const [sellerFilter, setSellerFilter] = useState("all");
  const [batchFilter, setBatchFilter] = useState("all");

  const clientsQ = useQuery({
    queryKey: ["relDistribuicaoClients"],
    queryFn: async () => {
      const map = new Map();
      for (const r of await base44.entities.Client.list("-created_date", 5000)) map.set(r.id, r);
      for (const r of await base44.entities.Client.list("created_date", 5000)) map.set(r.id, r);
      return [...map.values()];
    },
  });
  const sellersQ = useQuery({
    queryKey: ["relDistribuicaoSellers"],
    queryFn: () => base44.entities.Seller.list("-created_date", 500),
  });
  const batchesQ = useQuery({
    queryKey: ["relDistribuicaoBatches"],
    queryFn: () => base44.entities.DistributionBatch.list("-date", 500),
  });
  const equipQ = useQuery({
    queryKey: ["relDistribuicaoEquipment"],
    queryFn: async () => {
      const map = new Map();
      for (const r of await base44.entities.Equipment.list("-created_date", 5000)) map.set(r.id, r);
      for (const r of await base44.entities.Equipment.list("created_date", 5000)) map.set(r.id, r);
      return [...map.values()];
    },
  });
  const productsQ = useQuery({
    queryKey: ["relDistribuicaoProducts"],
    queryFn: () => base44.entities.Product.list("-created_date", 5000),
  });
  // Mesma chave da aba Conversão de Vendas — o cache é compartilhado.
  const salesQ = useQuery({
    queryKey: ["conversaoVendasSales"],
    queryFn: async () => {
      const map = new Map();
      for (const r of await base44.entities.Sale.list("-created_date", 5000)) map.set(r.id, r);
      for (const r of await base44.entities.Sale.list("created_date", 5000)) map.set(r.id, r);
      return [...map.values()];
    },
  });

  const sales = salesQ.data || [];
  const clients = clientsQ.data || [];
  const sellers = sellersQ.data || [];
  const batches = batchesQ.data || [];
  const equipment = equipQ.data || [];
  const products = productsQ.data || [];

  const sellerMap = useMemo(() => new Map(sellers.map((s) => [s.id, s.name])), [sellers]);
  const clientCodeMap = useMemo(
    () => new Map(clients.map((c) => [c.id, c.new_code || c.old_code || ""])),
    [clients]
  );
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const scope = useMemo(() => {
    let list = clients.filter((c) => c.seller_id);
    if (batchFilter !== "all") list = list.filter((c) => c.distribution_batch_id === batchFilter);
    if (sellerFilter !== "all") list = list.filter((c) => c.seller_id === sellerFilter);
    return list;
  }, [clients, batchFilter, sellerFilter]);

  const getPhones = (c) => PHONE_FIELDS.map((f) => c[f]).filter(Boolean);

  // Status da venda de cada cliente no escopo (venda lançada a partir da distribuição).
  const batchMap = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);
  const conversionMap = useMemo(() => buildConversionMap(scope, sales, batchMap), [scope, sales, batchMap]);

  const handleExport = () => {
    if (scope.length === 0) return;
    exportClientDistribution(scope, sellers, conversionMap);
  };

  const loading = clientsQ.isLoading || sellersQ.isLoading;
  const activeBatches = batches.filter((b) => !b.reversed);

  return (
    <div>
      <PageHeader
        title="Relatório de Distribuição"
        description="Carteira de clientes por lote/vendedora com telefones e previsão de equipamentos e refis"
      >
        <Button onClick={handleExport} disabled={scope.length === 0} className="gap-1">
          <Download className="h-4 w-4" /> Exportar Clientes
        </Button>
      </PageHeader>

      <Card className="mb-4">
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground">Lote de distribuição</span>
            <Select value={batchFilter} onValueChange={setBatchFilter}>
              <SelectTrigger className="w-72 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os distribuídos</SelectItem>
                {activeBatches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.protocol} — {b.client_count} clientes
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground">Vendedora</span>
            <Select value={sellerFilter} onValueChange={setSellerFilter}>
              <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as vendedoras</SelectItem>
                {sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-2 h-9">
            <Users className="h-4 w-4" />
            {scope.length} cliente(s) no escopo
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="distribuicao">
        <TabsList>
          <TabsTrigger value="distribuicao" className="gap-1">
            <FileSpreadsheet className="h-4 w-4" /> Distribuição
          </TabsTrigger>
          <TabsTrigger value="equipamentos" className="gap-1">
            <Wrench className="h-4 w-4" /> Equipamentos & Refis
          </TabsTrigger>
          <TabsTrigger value="conversao" className="gap-1">
            <TrendingUp className="h-4 w-4" /> Conversão de Vendas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="distribuicao">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                </div>
              ) : scope.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  Nenhum cliente distribuído no filtro selecionado.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>CPF/CNPJ</TableHead>
                      <TableHead>Cidade/UF</TableHead>
                      <TableHead>Vendedora</TableHead>
                      <TableHead>Telefones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scope.slice(0, 100).map((c) => {
                      const phones = getPhones(c);
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium text-sm">{c.name}</TableCell>
                          <TableCell className="font-mono text-sm">{c.new_code || c.old_code || "—"}</TableCell>
                          <TableCell className="font-mono text-sm">{c.document || "—"}</TableCell>
                          <TableCell className="text-sm">{[c.city, c.state].filter(Boolean).join(" - ") || "—"}</TableCell>
                          <TableCell className="text-sm">{sellerMap.get(c.seller_id) || c.seller_name || "—"}</TableCell>
                          <TableCell className="text-sm">
                            {phones.length > 0 ? (
                              <span className="text-xs">{phones.join(" · ")}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">Sem telefone</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              {scope.length > 100 && (
                <div className="p-3 text-xs text-muted-foreground text-center border-t">
                  Mostrando 100 de {scope.length} clientes. Exporte o Excel para a lista completa.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="equipamentos">
          <DistribuicaoEquipamentosTab
            scope={scope}
            equipment={equipment}
            clientCodeMap={clientCodeMap}
            productMap={productMap}
          />
        </TabsContent>

        <TabsContent value="conversao">
          <ConversaoVendasTab
            clients={scope}
            batches={batches}
            sellers={sellers}
            batchFilter={batchFilter}
            sellerFilter={sellerFilter}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}