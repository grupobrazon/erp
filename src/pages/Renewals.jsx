import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, CalendarX, RefreshCw, ArrowUpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import StatCard from "@/components/ui/StatCard";
import { format, addDays, subMonths } from "date-fns";

export default function Renewals() {
  const { data: equipment = [] } = useQuery({
    queryKey: ["equipment"],
    queryFn: () => base44.entities.Equipment.list("-created_date", 1000),
  });

  const today = format(new Date(), "yyyy-MM-dd");
  const next30 = format(addDays(new Date(), 30), "yyyy-MM-dd");
  const twelveMonthsAgo = format(subMonths(new Date(), 12), "yyyy-MM-dd");

  const activeEquip = equipment.filter(e => e.status === "Ativo");
  const overdue = activeEquip.filter(e => e.next_maintenance_date && e.next_maintenance_date < today);
  const upcoming = activeEquip.filter(e => e.next_maintenance_date && e.next_maintenance_date >= today && e.next_maintenance_date <= next30);
  const noMaintenanceLong = activeEquip.filter(e => {
    if (!e.last_maintenance_date && e.installation_date) return e.installation_date < twelveMonthsAgo;
    return e.last_maintenance_date && e.last_maintenance_date < twelveMonthsAgo;
  });
  const refillEligible = activeEquip.filter(e =>
    e.category === "Purificador" || e.category === "Bebedouro"
  ).filter(e => e.next_maintenance_date && e.next_maintenance_date <= next30);

  const renderTable = (items, emptyMsg) => {
    if (items.length === 0) return <EmptyState title={emptyMsg} />;
    return (
      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Equipamento</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Últ. Manutenção</TableHead>
              <TableHead>Próx. Manutenção</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(eq => {
              const isOverdue = eq.next_maintenance_date && eq.next_maintenance_date < today;
              return (
                <TableRow key={eq.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono text-xs">{eq.code}</TableCell>
                  <TableCell className="font-medium">{eq.client_name}</TableCell>
                  <TableCell>{eq.product_name || eq.model || "-"}</TableCell>
                  <TableCell>{eq.last_maintenance_date || "-"}</TableCell>
                  <TableCell className={isOverdue ? "text-destructive font-semibold" : ""}>{eq.next_maintenance_date || "-"}</TableCell>
                  <TableCell>
                    {isOverdue ? (
                      <Badge variant="destructive">Vencida</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-700">Próxima</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="Central de Renovações" description="Oportunidades comerciais e manutenções pendentes" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard title="Manutenções Vencidas" value={overdue.length} icon={AlertTriangle} />
        <StatCard title="Próximos 30 dias" value={upcoming.length} icon={Clock} />
        <StatCard title="Sem Manutenção > 12m" value={noMaintenanceLong.length} icon={CalendarX} />
        <StatCard title="Elegíveis p/ Refil" value={refillEligible.length} icon={RefreshCw} />
      </div>

      <Tabs defaultValue="overdue">
        <TabsList>
          <TabsTrigger value="overdue">Vencidas ({overdue.length})</TabsTrigger>
          <TabsTrigger value="upcoming">Próximas ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="long">Sem Manutenção ({noMaintenanceLong.length})</TabsTrigger>
          <TabsTrigger value="refill">Elegíveis Refil ({refillEligible.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overdue" className="mt-4">{renderTable(overdue, "Nenhuma manutenção vencida")}</TabsContent>
        <TabsContent value="upcoming" className="mt-4">{renderTable(upcoming, "Nenhuma manutenção nos próximos 30 dias")}</TabsContent>
        <TabsContent value="long" className="mt-4">{renderTable(noMaintenanceLong, "Nenhum equipamento sem manutenção há mais de 12 meses")}</TabsContent>
        <TabsContent value="refill" className="mt-4">{renderTable(refillEligible, "Nenhum equipamento elegível")}</TabsContent>
      </Tabs>
    </div>
  );
}