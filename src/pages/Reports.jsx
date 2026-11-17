import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/ui/PageHeader";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, subMonths } from "date-fns";

export default function Reports() {
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => base44.entities.Client.list("-created_date", 500) });
  const { data: equipment = [] } = useQuery({ queryKey: ["equipment"], queryFn: () => base44.entities.Equipment.list("-created_date", 1000) });
  const { data: maintenances = [] } = useQuery({ queryKey: ["maintenances"], queryFn: () => base44.entities.Maintenance.list("-date", 500) });
  const { data: sales = [] } = useQuery({ queryKey: ["sales"], queryFn: () => base44.entities.Sale.list("-date", 500) });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => base44.entities.Product.list("-created_date", 200) });

  const today = format(new Date(), "yyyy-MM-dd");

  const activeClients = clients.filter(c => c.status === "Ativo");
  const inactiveClients = clients.filter(c => c.status !== "Ativo");

  const equipByCity = equipment.reduce((acc, eq) => {
    const city = eq.address_label || "Não informado";
    acc[city] = (acc[city] || 0) + 1;
    return acc;
  }, {});

  const overdueMaint = equipment.filter(e => e.next_maintenance_date && e.next_maintenance_date < today);
  const completedMaint = maintenances.filter(m => m.result === "Realizada");

  const lowStockProducts = products.filter(p => (p.current_stock || 0) <= (p.min_stock || 0) && p.min_stock > 0);

  const salesByVendor = sales.filter(s => s.status !== "Cancelada").reduce((acc, s) => {
    const seller = s.seller || "Não informado";
    acc[seller] = (acc[seller] || 0) + (s.total || 0);
    return acc;
  }, {});

  const salesByMonth = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(new Date(), 5 - i);
    const m = format(d, "yyyy-MM");
    const label = format(d, "MMM/yy");
    const ms = sales.filter(s => s.date?.startsWith(m) && s.status !== "Cancelada");
    return { name: label, total: ms.reduce((s, v) => s + (v.total || 0), 0), qtd: ms.length };
  });

  const totalSales = sales.filter(s => s.status !== "Cancelada");
  const avgTicket = totalSales.length > 0 ? totalSales.reduce((s, v) => s + (v.total || 0), 0) / totalSales.length : 0;

  return (
    <div>
      <PageHeader title="Relatórios" description="Análises e indicadores da operação" />

      <Tabs defaultValue="clients">
        <TabsList className="flex-wrap">
          <TabsTrigger value="clients">Clientes</TabsTrigger>
          <TabsTrigger value="equipment">Equipamentos</TabsTrigger>
          <TabsTrigger value="maintenance">Manutenções</TabsTrigger>
          <TabsTrigger value="stock">Estoque</TabsTrigger>
          <TabsTrigger value="commercial">Comercial</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Clientes Ativos</p><p className="text-3xl font-bold text-primary">{activeClients.length}</p></CardContent></Card>
            <Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Clientes Inativos</p><p className="text-3xl font-bold">{inactiveClients.length}</p></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="equipment" className="mt-6 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Total Equipamentos</p><p className="text-3xl font-bold">{equipment.length}</p></CardContent></Card>
            <Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Ativos</p><p className="text-3xl font-bold text-primary">{equipment.filter(e => e.status === "Ativo").length}</p></CardContent></Card>
            <Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Em Manutenção</p><p className="text-3xl font-bold text-amber-600">{equipment.filter(e => e.status === "Em manutenção").length}</p></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="maintenance" className="mt-6 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Vencidas</p><p className="text-3xl font-bold text-destructive">{overdueMaint.length}</p></CardContent></Card>
            <Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Realizadas</p><p className="text-3xl font-bold text-emerald-600">{completedMaint.length}</p></CardContent></Card>
            <Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Total Registradas</p><p className="text-3xl font-bold">{maintenances.length}</p></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="stock" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Produtos com Estoque Baixo</CardTitle></CardHeader>
            <CardContent>
              {lowStockProducts.length === 0 ? (
                <p className="text-muted-foreground text-sm">Todos os produtos estão com estoque adequado.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-right">Atual</TableHead><TableHead className="text-right">Mínimo</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {lowStockProducts.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right text-destructive font-semibold">{p.current_stock || 0}</TableCell>
                        <TableCell className="text-right">{p.min_stock}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commercial" className="mt-6 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Total de Vendas</p><p className="text-3xl font-bold">{totalSales.length}</p></CardContent></Card>
            <Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Faturamento Total</p><p className="text-3xl font-bold text-primary">R$ {totalSales.reduce((s, v) => s + (v.total || 0), 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></CardContent></Card>
            <Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Ticket Médio</p><p className="text-3xl font-bold">R$ {avgTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle>Vendas por Período</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={salesByMonth}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(val) => [`R$ ${val.toLocaleString("pt-BR")}`, "Total"]} />
                  <Bar dataKey="total" fill="hsl(199,89%,38%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}