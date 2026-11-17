import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Package, Wrench, LogOut, RefreshCw, CheckCircle2, Clock } from "lucide-react";
import TechnicianServiceOrderCard from "@/components/technician/TechnicianServiceOrderCard";
import GoogleCalendarSync from "@/components/technician/GoogleCalendarSync";
import EmptyState from "@/components/ui/EmptyState";

export default function TechnicianApp() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("ativas");

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["techServiceOrders", user?.full_name],
    queryFn: () => base44.entities.ServiceOrder.filter({ technician: user?.full_name || "__none__" }, "-created_date", 200),
    enabled: !!user?.full_name,
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["techSales"],
    queryFn: () => base44.entities.Sale.list("-created_date", 200),
  });

  const saleMap = {};
  for (const s of sales) saleMap[s.id] = s;

  const activeOrders = orders.filter(o =>
    o.status === "Liberado para Técnico" || o.status === "Em Execução"
  );
  const doneOrders = orders.filter(o =>
    o.status === "Concluída pelo Técnico" || o.status === "Concluída" || o.status === "Cancelada"
  );

  const displayOrders = tab === "ativas" ? activeOrders : doneOrders;

  const filtered = displayOrders.filter(o => {
    if (!search) return true;
    return o.code?.toLowerCase().includes(search.toLowerCase()) ||
      o.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      o.sale_order_number?.toLowerCase().includes(search.toLowerCase());
  });

  const handleLogout = async () => {
    await base44.auth.logout();
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <Wrench className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-sm">App do Técnico</h1>
              <p className="text-[10px] text-sidebar-foreground/70">{user?.full_name || "—"}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-sidebar-foreground hover:bg-sidebar-accent" onClick={handleLogout}>
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Pendentes</span>
            </div>
            <p className="text-xl font-bold">{activeOrders.length}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Concluídas</span>
            </div>
            <p className="text-xl font-bold">{doneOrders.length}</p>
          </Card>
        </div>

        {/* Google Calendar Sync */}
        <GoogleCalendarSync />

        {/* Tabs + Search */}
        <div className="flex items-center gap-2 flex-wrap">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="ativas">Ativas ({activeOrders.length})</TabsTrigger>
              <TabsTrigger value="concluidas">Concluídas ({doneOrders.length})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative flex-1 min-w-[150px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-9" />
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title={tab === "ativas" ? "Nenhuma OS ativa" : "Nenhuma OS concluída"}
            description={tab === "ativas" ? "Você não tem ordens de serviço aguardando execução." : "Suas OS concluídas aparecerão aqui."}
          />
        ) : (
          <div className="space-y-3">
            {filtered.map(order => (
              <TechnicianServiceOrderCard
                key={order.id}
                order={order}
                sale={saleMap[order.sale_id]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}