import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Route, MapPin, Clock, Calendar, ArrowUp, ArrowDown, ArrowUpDown, X, Printer, CheckCircle2, Navigation2, Map as MapIcon } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/use-toast";
import { createWithCode } from "@/lib/codeGeneration";
import { usePermissions } from "@/lib/permissions";
import { useAuth } from "@/lib/AuthContext";
import { useTabs } from "@/lib/TabsContext";
import TechnicianCalendarView from "@/components/technician/TechnicianCalendarView";
import RouteTimeline from "@/components/routing/RouteTimeline";
import RouteRomaneioDialog from "@/components/routing/RouteRomaneioDialog";
import RouteMapDialog from "@/components/routing/RouteMapDialog";
import ReorderStopsDialog from "@/components/routing/ReorderStopsDialog";
import AddRouteStopsDialog from "@/components/routing/AddRouteStopsDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const WEEKDAYS_SHORT = { "Segunda": "Seg", "Terça": "Ter", "Quarta": "Qua", "Quinta": "Qui", "Sexta": "Sex", "Sábado": "Sáb", "Domingo": "Dom" };

const periodColors = { "Manhã": "bg-amber-100 text-amber-700", "Tarde": "bg-blue-100 text-blue-700", "Dia Inteiro": "bg-violet-100 text-violet-700" };
const routeStatusColors = { "Planejada": "bg-blue-100 text-blue-700", "Em Andamento": "bg-purple-100 text-purple-700", "Concluída": "bg-emerald-100 text-emerald-700", "Cancelada": "bg-red-100 text-red-700" };

// Status de OS que já foram enviadas para rota e aguardam definição de rota
const ROUTE_READY_STATUSES = ["Agendamento/Rota", "Rota Enviada", "Aguardando Rota"];

function RotasTecnicoAdmin({ testMode = false }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canManageRoutes, canDeleteRoute, canAddStopsToRoute } = usePermissions();
  const { activeTabId } = useTabs();
  const tabPath = testMode ? "/teste/rotas-tecnico" : "/rotas-tecnico";

  // Refetch routes when this tab becomes active (prevents stale cache from deleted/recreated routes)
  useEffect(() => {
    if (activeTabId === tabPath) {
      queryClient.invalidateQueries({ queryKey: ["technicianRoutes"] });
    }
  }, [activeTabId, tabPath, queryClient]);

  const [showForm, setShowForm] = useState(false);
  const [routeForm, setRouteForm] = useState({ technician: "", date: "", period: "Dia Inteiro", notes: "" });
  const [selectedOS, setSelectedOS] = useState([]);
  const [expandedRoute, setExpandedRoute] = useState(null);
  const [filterPeriod, setFilterPeriod] = useState("");
  const [filterSchedulingType, setFilterSchedulingType] = useState("");
  const [filterDate, setFilterDate] = useState("");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["serviceOrders"],
    queryFn: () => base44.entities.ServiceOrder.list("-created_date", 500),
  });
  const { data: sales = [] } = useQuery({
    queryKey: ["sales"],
    queryFn: () => base44.entities.Sale.list("-created_date", 500),
  });
  const { data: technicians = [] } = useQuery({
    queryKey: ["technicians"],
    queryFn: () => base44.entities.Technician.list("-created_date", 200),
  });
  const { data: routes = [] } = useQuery({
    queryKey: ["technicianRoutes"],
    queryFn: () => base44.entities.TechnicianRoute.list("-created_date", 200),
    refetchInterval: 10000, // Polling em tempo real — reflete check-ins e conclusões do técnico
  });

  // Busca TOS vinculadas às rotas para acompanhar conclusão em tempo real
  const allTosIds = useMemo(() => {
    const ids = new Set();
    routes.forEach(r => (r.stops || []).forEach(s => { if (s.tos_id) ids.add(s.tos_id); }));
    return [...ids];
  }, [routes]);

  const { data: tosMap = {} } = useQuery({
    queryKey: ["route-tos-status-all", allTosIds.join(",")],
    queryFn: async () => {
      if (allTosIds.length === 0) return {};
      const tosList = await base44.entities.TechnicianServiceOrder.filter({ id: { $in: allTosIds } });
      const map = {};
      for (const tos of tosList) map[tos.id] = tos;
      return map;
    },
    enabled: allTosIds.length > 0,
    refetchInterval: 10000,
  });

  const saleMap = useMemo(() => {
    const m = {};
    sales.forEach(s => { m[s.id] = s; });
    return m;
  }, [sales]);

  const { data: routeRegions = [] } = useQuery({
    queryKey: ["routeRegions"],
    queryFn: () => base44.entities.RouteRegion.list("-created_date", 200),
  });

  const [filterRegion, setFilterRegion] = useState("");
  const [romaneioRoute, setRomaneioRoute] = useState(null);
  const [mapRoute, setMapRoute] = useState(null);
  const [reorderRoute, setReorderRoute] = useState(null);
  const [addStopsRoute, setAddStopsRoute] = useState(null);
  const [deleteRouteTarget, setDeleteRouteTarget] = useState(null);

  // OS enviadas para rota e ainda sem rota definida (buscadas no servidor — não dependem da página carregada)
  const { data: routeReadyOrders = [] } = useQuery({
    queryKey: ["routeReadyOrders"],
    queryFn: async () => {
      const all = [];
      let cursor;
      for (let i = 0; i < 8; i++) {
        const page = await base44.entities.ServiceOrder.filter(
          {
            route_id: null,
            status: { $in: ROUTE_READY_STATUSES },
            type: { $in: ["Entrega", "Entrega + Instalação"] },
          },
          { limit: 500, sort: "-created_date", cursor }
        );
        all.push(...page.items);
        if (!page.has_more) break;
        cursor = page.next_cursor;
      }
      return all;
    },
  });

  // Atualização em tempo real: sempre que uma OS mudar de status (ex: liberada da produção e
  // enviada para rota), a lista de atendimentos disponíveis é recarregada automaticamente.
  useEffect(() => {
    let timer;
    const unsubscribe = base44.entities.ServiceOrder.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["routeReadyOrders"] });
        queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      }, 2000);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [queryClient]);

  // OS available for routing. Modo teste: todas as OS de Entrega/Instalação, independente de status.
  const availableOrders = testMode
    ? orders.filter(o => (o.type === "Entrega" || o.type === "Entrega + Instalação") && !o.route_id)
    : routeReadyOrders;

  // Apply scheduling filters for route planning
  const filteredAvailableOrders = availableOrders.filter(o => {
    const sale = saleMap[o.sale_id];
    if (!sale) return true;
    if (filterRegion && o.route_region_id !== filterRegion) return false;
    if (filterSchedulingType && sale.cr_scheduling_type !== filterSchedulingType) return false;
    if (filterPeriod && sale.cr_period !== filterPeriod) return false;
    if (filterDate) {
      if (sale.cr_scheduling_type === "Data Específica") {
        if (sale.cr_preferred_date !== filterDate) return false;
      } else if (sale.cr_scheduling_type === "Flexível" && sale.cr_week_start) {
        const ws = new Date(sale.cr_week_start + "T00:00:00");
        const fd = new Date(filterDate + "T00:00:00");
        const diff = Math.floor((fd - ws) / 86400000);
        if (diff < 0 || diff > 6) return false;
      }
    }
    return true;
  });

  // Orders already in routes
  const routedOrders = orders.filter(o => o.route_id);

  const createRouteMutation = useMutation({
    mutationFn: async () => {
      const route = (await createWithCode("route", { ...routeForm, status: "Planejada" })).record;
      // Assign selected OS to this route with sequence
      const updates = selectedOS.map((osId, i) => ({
        id: osId,
        route_id: route.id,
        route_order: i + 1,
        technician: routeForm.technician,
      }));
      await base44.entities.ServiceOrder.bulkUpdate(updates);
      return route;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["technicianRoutes"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["routeReadyOrders"] });
      toast({ title: "Rota criada", description: `${selectedOS.length} OS(s) atribuída(s) a ${routeForm.technician}` });
      setRouteForm({ technician: "", date: "", period: "Dia Inteiro", notes: "" });
      setSelectedOS([]);
      setShowForm(false);
    },
    onError: (err) => toast({ title: "Erro", description: err?.message, variant: "destructive" }),
  });

  const removeOSFromRoute = async (osId) => {
    try {
      await base44.entities.ServiceOrder.update(osId, { route_id: null, route_order: 0 });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["routeReadyOrders"] });
      toast({ title: "OS removida da rota" });
    } catch (err) {
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    }
  };

  const moveOSOrder = async (osId, direction, routeOrders) => {
    const sorted = [...routeOrders].sort((a, b) => (a.route_order || 0) - (b.route_order || 0));
    const idx = sorted.findIndex(o => o.id === osId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const os1 = sorted[idx];
    const os2 = sorted[swapIdx];
    await base44.entities.ServiceOrder.bulkUpdate([
      { id: os1.id, route_order: os2.route_order },
      { id: os2.id, route_order: os1.route_order },
    ]);
    queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["routeReadyOrders"] });
  };

  // Helper: detect "not found" errors (stale cache showing a deleted route)
  const isNotFound = (err) => {
    const msg = (err?.message || "").toLowerCase();
    return msg.includes("not found") || msg.includes("não encontrad") || msg.includes("404") || err?.status === 404;
  };

  const handleStaleRoute = () => {
    queryClient.invalidateQueries({ queryKey: ["technicianRoutes"] });
    queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["routeReadyOrders"] });
  };

  const releaseToApp = async (routeId) => {
    try {
      await base44.entities.TechnicianRoute.update(routeId, {
        released_to_app: true,
        released_at: new Date().toISOString(),
        status: "Liberada para App",
      });
      queryClient.invalidateQueries({ queryKey: ["technicianRoutes"] });
      toast({ title: "Rota liberada para o app do técnico" });
    } catch (err) {
      if (isNotFound(err)) {
        handleStaleRoute();
        toast({ title: "Rota não encontrada", description: "Esta rota foi excluída ou substituída. A lista foi atualizada — tente novamente.", variant: "destructive" });
        return;
      }
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    }
  };

  const updateRouteStatus = async (routeId, status) => {
    try {
      await base44.entities.TechnicianRoute.update(routeId, { status });
      if (status === "Em Andamento") {
        const routeOS = routedOrders.filter(o => o.route_id === routeId);
        if (routeOS.length > 0) {
          await base44.entities.ServiceOrder.bulkUpdate(
            routeOS.map(o => ({ id: o.id, status: "Em Andamento" }))
          );
        }
      }
      queryClient.invalidateQueries({ queryKey: ["technicianRoutes"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["routeReadyOrders"] });
    } catch (err) {
      if (isNotFound(err)) {
        handleStaleRoute();
        toast({ title: "Rota não encontrada", description: "Esta rota foi excluída ou substituída. A lista foi atualizada — tente novamente.", variant: "destructive" });
        return;
      }
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    }
  };

  const deleteRoute = async (route) => {
    if (route.checkin_at || route.status === "Em Andamento" || route.status === "Concluída") {
      toast({ title: "Não é possível excluir", description: "Esta rota já foi iniciada pelo técnico e não pode ser excluída.", variant: "destructive" });
      return;
    }
    try {
      const routeOS = routedOrders.filter(o => o.route_id === route.id);
      if (routeOS.length > 0) {
        await base44.entities.ServiceOrder.bulkUpdate(
          routeOS.map(o => ({ id: o.id, route_id: null, route_order: 0 }))
        );
      }
      await base44.entities.TechnicianRoute.delete(route.id);
      queryClient.invalidateQueries({ queryKey: ["technicianRoutes"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["routeReadyOrders"] });
      toast({ title: "Rota excluída" });
    } catch (err) {
      if (isNotFound(err)) {
        handleStaleRoute();
        toast({ title: "Rota já não existe", description: "A lista foi atualizada.", variant: "default" });
        return;
      }
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    }
  };

  const toggleSelectOS = (osId) => {
    setSelectedOS(prev => prev.includes(osId) ? prev.filter(id => id !== osId) : [...prev, osId]);
  };

  const renderSchedulingInfo = (sale) => {
    if (!sale) return <span className="text-muted-foreground text-xs">Sem preferências</span>;
    return (
      <div className="flex flex-wrap gap-1 items-center">
        {sale.cr_scheduling_type && (
          <Badge variant="outline" className="text-xs">{sale.cr_scheduling_type}</Badge>
        )}
        {sale.cr_week_start && (
          <Badge variant="outline" className="text-xs gap-1"><Calendar className="h-2.5 w-2.5" /> Semana de {sale.cr_week_start}</Badge>
        )}
        {sale.cr_preferred_date && (
          <Badge variant="outline" className="text-xs gap-1"><Calendar className="h-2.5 w-2.5" /> {sale.cr_preferred_date}</Badge>
        )}
        {sale.cr_period && (
          <Badge variant="outline" className={`text-xs ${periodColors[sale.cr_period] || ""}`}>{sale.cr_period}</Badge>
        )}
        {sale.cr_weekdays?.length > 0 && (
          <span className="text-xs text-muted-foreground">{sale.cr_weekdays.map(d => WEEKDAYS_SHORT[d] || d).join(", ")}</span>
        )}
        {sale.cr_time_range && (
          <Badge variant="outline" className="text-xs gap-1"><Clock className="h-2.5 w-2.5" /> {sale.cr_time_range}</Badge>
        )}
        {sale.cr_notes && (
          <span className="text-xs text-muted-foreground italic truncate max-w-xs" title={sale.cr_notes}>{sale.cr_notes}</span>
        )}
      </div>
    );
  };

  const routeOSByRoute = (routeId) => routedOrders
    .filter(o => o.route_id === routeId)
    .sort((a, b) => (a.route_order || 0) - (b.route_order || 0));

  return (
    <div>
      <PageHeader title={testMode ? "Rotas de Técnico (Teste)" : "Rotas de Técnico"} description={testMode ? "MODO TESTE — todas as OS de entrega/instalação tratadas como disponíveis para roteirização" : "Planeje rotas de entrega e instalação agrupando ordens de serviço por técnico, data e período"}>
        {canManageRoutes && (
          <Button onClick={() => setShowForm(!showForm)} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Rota
          </Button>
        )}
      </PageHeader>

      {/* Create route form */}
      {showForm && (
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-4">
            <h3 className="font-medium flex items-center gap-2"><Route className="h-4 w-4 text-primary" /> Nova Rota</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Técnico *</Label>
                <Select value={routeForm.technician} onValueChange={v => setRouteForm(p => ({ ...p, technician: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {technicians.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Data *</Label>
                <Input type="date" value={routeForm.date} onChange={e => setRouteForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Período</Label>
                <Select value={routeForm.period} onValueChange={v => setRouteForm(p => ({ ...p, period: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Manhã">Manhã</SelectItem>
                    <SelectItem value="Tarde">Tarde</SelectItem>
                    <SelectItem value="Dia Inteiro">Dia Inteiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Input value={routeForm.notes} onChange={e => setRouteForm(p => ({ ...p, notes: e.target.value }))} placeholder="Observações da rota..." />
            </div>

            {/* Available OS selection */}
            <div>
              <Label className="text-xs mb-2 block">Selecione as Ordens de Serviço para esta rota ({selectedOS.length} selecionada(s))</Label>

              {/* Scheduling filters for intelligent route planning */}
              <div className="flex flex-wrap gap-2 mb-2">
                <Select value={filterRegion || "all"} onValueChange={v => setFilterRegion(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Região" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as regiões</SelectItem>
                    {routeRegions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterSchedulingType || "all"} onValueChange={v => setFilterSchedulingType(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Tipo de Agendamento" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    <SelectItem value="Data Específica">Data Específica</SelectItem>
                    <SelectItem value="Flexível">Flexível</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterPeriod || "all"} onValueChange={v => setFilterPeriod(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Período" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="Manhã">Manhã</SelectItem>
                    <SelectItem value="Tarde">Tarde</SelectItem>
                    <SelectItem value="Dia Inteiro">Dia Inteiro</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="w-36 h-8 text-xs" />
                {(filterPeriod || filterSchedulingType || filterDate) && (
                  <Button variant="ghost" size="sm" className="h-8" onClick={() => { setFilterPeriod(""); setFilterSchedulingType(""); setFilterDate(""); setFilterRegion(""); }}>
                    <X className="h-3 w-3" /> Limpar
                  </Button>
                )}
              </div>

              {isLoading ? (
                <div className="flex justify-center py-6"><div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
              ) : filteredAvailableOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma OS disponível com esses filtros.</p>
              ) : (
                <div className="border rounded-lg max-h-72 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-8"></TableHead>
                        <TableHead className="w-20">OS</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Região</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Preferências do Cliente</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAvailableOrders.map(o => {
                        const sale = saleMap[o.sale_id];
                        return (
                          <TableRow key={o.id} className={selectedOS.includes(o.id) ? "bg-primary/5" : ""}>
                            <TableCell>
                              <Checkbox checked={selectedOS.includes(o.id)} onCheckedChange={() => toggleSelectOS(o.id)} />
                            </TableCell>
                            <TableCell className="font-mono text-xs">{o.code}</TableCell>
                            <TableCell className="font-medium text-sm">{o.client_name}</TableCell>
                            <TableCell className="text-xs">{o.route_region_name || "—"}</TableCell>
                            <TableCell className="text-xs">{o.type}</TableCell>
                            <TableCell>{renderSchedulingInfo(sale)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">A ordem de seleção define a sequência de visitas do técnico.</p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowForm(false); setSelectedOS([]); }}>Cancelar</Button>
              <Button
                disabled={!routeForm.technician || !routeForm.date || selectedOS.length === 0 || createRouteMutation.isPending}
                onClick={() => createRouteMutation.mutate()}
              >
                {createRouteMutation.isPending ? "Criando..." : "Criar Rota"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing routes */}
      <div className="space-y-4">
        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Rotas Planejadas ({routes.length})</h3>
        {routes.length === 0 ? (
          <EmptyState title="Nenhuma rota criada" description="Crie uma rota selecionando um técnico, uma data e as ordens de serviço de entrega/instalação disponíveis." />
        ) : (
          routes.map(route => {
            const routeOrders = routeOSByRoute(route.id);
            const isExpanded = expandedRoute === route.id;
            return (
              <Card key={route.id}>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Route className="h-4 w-4 text-primary" />
                        <span className="font-mono font-semibold">{route.code}</span>
                      </div>
                      <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" /> {route.technician}</Badge>
                      <Badge variant="outline" className="gap-1"><Calendar className="h-3 w-3" /> {route.date}</Badge>
                      {route.period && <Badge variant="outline" className={periodColors[route.period] || ""}>{route.period}</Badge>}
                      <Badge className={routeStatusColors[route.status] || "bg-muted text-muted-foreground"}>{route.status}</Badge>
                      <span className="text-xs text-muted-foreground">{routeOrders.length} OS(s)</span>
                      {/* Indicador de progresso em tempo real */}
                      {route.checkin_at && !route.checkout_at && (() => {
                        const stops = route.stops || [];
                        const completed = stops.filter(s => {
                          if (s.service_type === "Expedição") return s.checked_in;
                          if (!s.tos_id) return false;
                          const st = tosMap[s.tos_id]?.status;
                          return st === "Concluída" || st === "Não Concluída" || st === "Atendido Parcialmente" || st === "Cancelada";
                        }).length;
                        return (
                          <Badge className="gap-1 bg-purple-100 text-purple-700 animate-pulse">
                            <Navigation2 className="h-3 w-3" /> Em Andamento · {completed}/{stops.length}
                          </Badge>
                        );
                      })()}
                      {route.checkout_at && (
                        <Badge className="gap-1 bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> Concluída · {route.total_km_tracked || 0} km
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => setRomaneioRoute(route)} className="gap-1.5">
                        <Printer className="h-3.5 w-3.5" /> Romaneio
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setMapRoute(route)} className="gap-1.5">
                        <MapIcon className="h-3.5 w-3.5" /> Mapa
                      </Button>
                      {canManageRoutes && (route.status === "Liberada para App" || route.status === "Em Andamento") && (
                        <Button variant="outline" size="sm" onClick={() => setReorderRoute(route)} className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50">
                          <ArrowUpDown className="h-3.5 w-3.5" /> Reordenar
                        </Button>
                      )}
                      {canAddStopsToRoute && route.status !== "Concluída" && route.status !== "Cancelada" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            queryClient.invalidateQueries({ queryKey: ["routeReadyOrders"] });
                            setAddStopsRoute(route);
                          }}
                          className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        >
                          <Plus className="h-3.5 w-3.5" /> Adicionar Atendimentos
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setExpandedRoute(isExpanded ? null : route.id)}>
                        {isExpanded ? "Recolher" : "Detalhes"}
                      </Button>
                      {canManageRoutes && route.status === "Planejada" && (
                        <Button variant="default" size="sm" onClick={() => releaseToApp(route.id)}>Liberar para App</Button>
                      )}
                      {canManageRoutes && route.status === "Planejada" && (
                        <Button variant="outline" size="sm" onClick={() => updateRouteStatus(route.id, "Em Andamento")}>Iniciar</Button>
                      )}
                      {canManageRoutes && route.status === "Em Andamento" && (
                        <Button variant="outline" size="sm" onClick={() => updateRouteStatus(route.id, "Concluída")}>Concluir</Button>
                      )}
                      {canDeleteRoute && !route.checkin_at && route.status !== "Em Andamento" && route.status !== "Concluída" && (
                        <Button variant="ghost" size="icon" onClick={() => setDeleteRouteTarget(route)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      )}
                    </div>
                  </div>

                  {route.notes && <p className="text-sm text-muted-foreground mt-2">{route.notes}</p>}

                  {isExpanded && (
                    <div className="mt-4 border-t pt-3">
                      {route.stops?.length > 0 ? (
                        <RouteTimeline route={route} tosMap={tosMap} />
                      ) : routeOrders.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">Nenhuma OS nesta rota.</p>
                      ) : (
                        <div className="space-y-2">
                          {routeOrders.map((o, i) => {
                            const sale = saleMap[o.sale_id];
                            const addr = o.delivery_address || {};
                            return (
                              <div key={o.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                                <div className="flex flex-col items-center gap-1">
                                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">{i + 1}</span>
                                  {canManageRoutes && (
                                    <div className="flex flex-col">
                                      <button onClick={() => moveOSOrder(o.id, "up", routeOrders)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                                        <ArrowUp className="h-3 w-3" />
                                      </button>
                                      <button onClick={() => moveOSOrder(o.id, "down", routeOrders)} disabled={i === routeOrders.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                                        <ArrowDown className="h-3 w-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-xs font-semibold">{o.code}</span>
                                    <span className="font-medium text-sm">{o.client_name}</span>
                                    <Badge variant="outline" className="text-xs">{o.type}</Badge>
                                  </div>
                                  {addr.street && (
                                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                      <MapPin className="h-3 w-3" /> {addr.street}, {addr.number} — {addr.neighborhood}, {addr.city}/{addr.state}
                                    </p>
                                  )}
                                  <div className="mt-1">{renderSchedulingInfo(sale)}</div>
                                  {o.technician_notes && (
                                    <p className="text-xs text-amber-700 mt-1">⚠ {o.technician_notes}</p>
                                  )}
                                </div>
                                {canManageRoutes && route.status === "Planejada" && (
                                  <Button variant="ghost" size="icon" onClick={() => removeOSFromRoute(o.id)}>
                                    <X className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <AlertDialog open={!!deleteRouteTarget} onOpenChange={(v) => !v && setDeleteRouteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Certeza que deseja excluir a rota {deleteRouteTarget?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              A rota {deleteRouteTarget?.code} de {deleteRouteTarget?.technician} ({deleteRouteTarget?.date}) será
              excluída permanentemente.
              {deleteRouteTarget && routedOrders.filter(o => o.route_id === deleteRouteTarget.id).length > 0
                ? ` As ${routedOrders.filter(o => o.route_id === deleteRouteTarget.id).length} OS vinculadas serão desvinculadas da rota.`
                : ""}
              {" "}Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteRoute(deleteRouteTarget)}
            >
              Excluir rota
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RouteRomaneioDialog open={!!romaneioRoute} onOpenChange={(v) => !v && setRomaneioRoute(null)} route={romaneioRoute} />
      <RouteMapDialog open={!!mapRoute} onOpenChange={(v) => !v && setMapRoute(null)} route={mapRoute} />
      <ReorderStopsDialog open={!!reorderRoute} onOpenChange={(v) => !v && setReorderRoute(null)} route={reorderRoute} routeOrders={reorderRoute ? routeOSByRoute(reorderRoute.id) : []} tosMap={tosMap} />
      <AddRouteStopsDialog
        open={!!addStopsRoute}
        onOpenChange={(v) => !v && setAddStopsRoute(null)}
        route={addStopsRoute}
        availableOrders={availableOrders}
        saleMap={saleMap}
        onDone={() => {
          queryClient.invalidateQueries({ queryKey: ["technicianRoutes"] });
          queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["routeReadyOrders"] });
        }}
      />
    </div>
  );
}

export { RotasTecnicoAdmin };

export default function RotasTecnico() {
  const { user } = useAuth();
  if (user?.role === "tecnico") return <TechnicianCalendarView />;
  return <RotasTecnicoAdmin />;
}