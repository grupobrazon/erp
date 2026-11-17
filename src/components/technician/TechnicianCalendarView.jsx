import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronDown, MapPin, Calendar as CalIcon, Wrench, Truck, DollarSign } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import TechnicianOSExecutionDialog from "./TechnicianOSExecutionDialog";
import TechnicianOSForm from "@/components/serviceorders/technician-os/TechnicianOSForm";
import RouteExecutionPanel from "@/components/routing/RouteExecutionPanel";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const osStatusColors = {
  "Liberado para Técnico": "bg-blue-100 text-blue-700",
  "Em Execução": "bg-purple-100 text-purple-700",
  "Concluída pelo Técnico": "bg-emerald-100 text-emerald-700",
  "Agendamento/Rota": "bg-amber-100 text-amber-700",
};

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TechnicianCalendarView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedOS, setSelectedOS] = useState(null);
  const [openTOS, setOpenTOS] = useState(null); // { tosId, stop }

  const { data: technician } = useQuery({
    queryKey: ["technician", user?.technician_id],
    queryFn: () => base44.entities.Technician.get(user.technician_id),
    enabled: !!user?.technician_id,
  });

  const techName = technician?.name;

  const { data: routes = [] } = useQuery({
    queryKey: ["techRoutes", user?.technician_id],
    queryFn: () => base44.entities.TechnicianRoute.filter({ technician_id: user.technician_id }, "-created_date", 200),
    enabled: !!user?.technician_id,
    refetchInterval: 10000, // Polling — reflete check-ins e conclusões do técnico em tempo real
  });

  const routeByDate = useMemo(() => {
    const m = {};
    routes.forEach(r => {
      if (r.released_to_app || r.status === "Em Andamento" || r.status === "Concluída") {
        m[r.date] = r;
      }
    });
    return m;
  }, [routes]);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["techOS", techName],
    queryFn: () => base44.entities.ServiceOrder.filter({ technician: techName }, "-created_date", 500),
    enabled: !!techName,
  });

  const routeDateMap = useMemo(() => {
    const m = {};
    routes.forEach(r => { if (r.id) m[r.id] = r.date; });
    return m;
  }, [routes]);

  const osByDate = useMemo(() => {
    const m = {};
    orders.forEach(o => {
      if (o.route_id && routeDateMap[o.route_id]) {
        const date = routeDateMap[o.route_id];
        if (!m[date]) m[date] = [];
        m[date].push(o);
      }
    });
    Object.values(m).forEach(list => list.sort((a, b) => (a.route_order || 0) - (b.route_order || 0)));
    return m;
  }, [orders, routeDateMap]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarCells = [];
  for (let i = 0; i < firstWeekday; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push({ day: d, dateStr: formatDate(new Date(year, month, d)) });
  }

  const todayStr = formatDate(new Date());
  const selectedOSs = selectedDate ? (osByDate[selectedDate] || []) : [];

  const handleOSClose = () => {
    queryClient.invalidateQueries({ queryKey: ["techOS"] });
    setSelectedOS(null);
  };

  if (!user?.technician_id) {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-4">Minhas Rotas</h2>
        <EmptyState
          title="Técnico não vinculado"
          description="Seu usuário não está vinculado a um técnico cadastrado. Solicite ao administrador o vínculo do seu perfil a um técnico do sistema."
        />
      </div>
    );
  }

  const isToday = selectedDate === todayStr;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-0.5">Minhas Rotas</h2>
      <p className="text-sm text-muted-foreground mb-3">{technician?.name}</p>

      {/* Route for selected date (shown first — defaults to today) */}
      <div className="mb-4">
        <h3 className="font-medium mb-2 flex items-center gap-2 text-sm">
          <CalIcon className="h-4 w-4 text-primary" />
          {isToday
            ? "Hoje — "
            : ""}
          {new Date(selectedDate + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
        </h3>
        {routeByDate[selectedDate] ? (
          <RouteExecutionPanel
            route={routeByDate[selectedDate]}
            onStopCheckin={(stop) => stop.tos_id && setOpenTOS({ tosId: stop.tos_id, stop })}
          />
        ) : isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : selectedOSs.length === 0 ? (
          <EmptyState title={isToday ? "Sem rotas para hoje" : "Nenhuma OS neste dia"} description={isToday ? "Você não tem ordens de serviço designadas para hoje." : "Não há ordens de serviço designadas para esta data."} />
        ) : (
          <div className="space-y-2">
            {selectedOSs.map((o, i) => {
              const addr = o.delivery_address || {};
              return (
                <Card key={o.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedOS(o)}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-mono text-xs font-semibold">{o.code}</span>
                          <span className="font-medium text-sm">{o.client_name}</span>
                          <Badge variant="outline" className="text-xs gap-1">
                            {o.type === "Entrega + Instalação" ? <Wrench className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
                            {o.type}
                          </Badge>
                          <Badge className={osStatusColors[o.status] || "bg-muted text-muted-foreground"}>
                            {o.status}
                          </Badge>
                        </div>
                        {addr.street && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {addr.street}, {addr.number} — {addr.neighborhood}, {addr.city}/{addr.state}
                          </p>
                        )}
                        {o.has_pending_payment && (
                          <p className="text-xs text-amber-700 flex items-center gap-1 mt-1">
                            <DollarSign className="h-3 w-3" /> Pagamento pendente: R$ {o.pending_payment_amount?.toFixed(2)} ({o.pending_payment_moment})
                          </p>
                        )}
                        {o.technician_notes && (
                          <p className="text-xs text-amber-700 mt-1">⚠ {o.technician_notes}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Collapsible calendar — to navigate to other dates */}
      <Card>
        <button
          onClick={() => setShowCalendar(s => !s)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <CalIcon className="h-4 w-4" /> Ver outras datas
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showCalendar ? "rotate-180" : ""}`} />
        </button>
        {showCalendar && (
          <CardContent className="pt-0">
            <div className="flex items-center justify-between mb-3">
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h3 className="font-semibold text-sm">{MONTHS[month]} {year}</h3>
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map(d => (
                <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((cell, i) => {
                if (!cell) return <div key={i} className="h-10" />;
                const dayOS = osByDate[cell.dateStr] || [];
                const cellIsToday = cell.dateStr === todayStr;
                const isSelected = cell.dateStr === selectedDate;
                return (
                  <button
                    key={i}
                    onClick={() => { setSelectedDate(cell.dateStr); setShowCalendar(false); }}
                    className={`h-10 rounded-lg border text-xs transition-all flex flex-col items-center justify-center gap-0.5
                      ${isSelected ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}
                      ${cellIsToday && !isSelected ? "ring-1 ring-primary" : ""}
                      ${dayOS.length > 0 ? "font-semibold" : "text-muted-foreground"}`}
                  >
                    <span>{cell.day}</span>
                    {dayOS.length > 0 && (
                      <span className="text-[9px] bg-primary text-primary-foreground rounded-full px-1 leading-none">
                        {dayOS.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        )}
      </Card>

      {selectedOS && (
        <TechnicianOSExecutionDialog
          serviceOrder={selectedOS}
          onClose={handleOSClose}
        />
      )}

      {openTOS && (
        <TechnicianOSForm
          open={true}
          onOpenChange={(o) => {
            if (!o) {
              setOpenTOS(null);
              // Força refetch imediato do status das TOS e da rota ao fechar o diálogo
              queryClient.invalidateQueries({ queryKey: ["route-tos-status"] });
              queryClient.invalidateQueries({ queryKey: ["techRoutes"] });
            }
          }}
          tosId={openTOS.tosId}
        />
      )}
    </div>
  );
}