import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { format, addMonths, addWeeks, addDays, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Eye, EyeOff, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/ui/PageHeader";
import CalendarView from "@/components/agenda/CalendarView";
import CalendarManager from "@/components/agenda/CalendarManager";
import AppointmentDialog from "@/components/agenda/AppointmentDialog";
import AgendaSearchPanel from "@/components/agenda/AgendaSearchPanel";
import DayRouteInfoBar from "@/components/agenda/DayRouteInfoBar";
import BlockDayDialog from "@/components/agenda/BlockDayDialog";
import SendToRouteDialog from "@/components/agenda/SendToRouteDialog";
import { Navigation } from "lucide-react";
import { getColorClasses } from "@/lib/calendarColors";
import { usePermissions } from "@/lib/permissions";
import ErrorBoundary from "@/components/ui/ErrorBoundary";

const VIEW_OPTIONS = [
  { value: "month", label: "Mês" },
  { value: "week", label: "Semana" },
  { value: "day", label: "Dia" },
];

export default function AgendaRotas({ testMode = false }) {
  const { canManageRoutes } = usePermissions();
  const [view, setView] = useState("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [visibleCalendars, setVisibleCalendars] = useState({}); // { id: true/false }
  const [showFilters, setShowFilters] = useState(false);
  const [apptDialog, setApptDialog] = useState({ open: false, prefillDate: null, editAppt: null });
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [blockDialog, setBlockDialog] = useState({ open: false, prefillDate: null });
  const [sendToRouteDialog, setSendToRouteDialog] = useState({ open: false });

  const { data: calendars = [] } = useQuery({
    queryKey: ["calendarioRotas"],
    queryFn: () => base44.entities.CalendarioRota.list("-created_date", 200),
  });

  const { data: allAppointments = [] } = useQuery({
    queryKey: ["agendamentoRotas"],
    queryFn: () => base44.entities.AgendamentoRota.list("-created_date", 500),
  });

  // Initialize all calendars visible by default
  useEffect(() => {
    setVisibleCalendars(prev => {
      const next = { ...prev };
      calendars.forEach(c => { if (!(c.id in next)) next[c.id] = true; });
      return next;
    });
  }, [calendars]);

  // Filter appointments by visible calendars
  const appointments = useMemo(() => {
    return allAppointments.filter(a => visibleCalendars[a.calendar_id] !== false);
  }, [allAppointments, visibleCalendars]);

  const navigate = (direction) => {
    if (view === "month") setCurrentDate(d => addMonths(d, direction));
    else if (view === "week") setCurrentDate(d => addWeeks(d, direction));
    else setCurrentDate(d => addDays(d, direction));
  };

  const goToday = () => setCurrentDate(new Date());

  const headerLabel = useMemo(() => {
    if (view === "month") return format(currentDate, "MMMM 'de' yyyy", { locale: ptBR });
    if (view === "week") {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
      const we = addDays(ws, 6);
      return `${format(ws, "dd/MM", { locale: ptBR })} — ${format(we, "dd/MM/yyyy", { locale: ptBR })}`;
    }
    return format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR });
  }, [view, currentDate]);

  const handleDayClick = (day) => {
    setCurrentDate(day);
    setView("day");
  };

  const handleSlotClick = () => {
    // Adding appointments from calendar is prohibited — use "Novo Agendamento" button
  };

  const handleApptClick = (appt) => {
    setSelectedAppt(appt);
    setApptDialog({ open: true, prefillDate: null, editAppt: appt });
  };

  const toggleCalendar = (id) => {
    setVisibleCalendars(prev => ({ ...prev, [id]: prev[id] === false }));
  };

  const showAll = () => {
    const next = {};
    calendars.forEach(c => { next[c.id] = true; });
    setVisibleCalendars(next);
  };

  const hideAll = () => {
    const next = {};
    calendars.forEach(c => { next[c.id] = false; });
    setVisibleCalendars(next);
  };

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-[1400px] mx-auto">
      <PageHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">
              {testMode ? "Agenda de Rotas (Teste)" : "Agenda de Rotas"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {canManageRoutes && (
              <Button
                size="sm"
                className="gap-2"
                onClick={() => setApptDialog({ open: true, prefillDate: currentDate, editAppt: null })}
              >
                <Plus className="h-4 w-4" /> Novo Agendamento
              </Button>
            )}
            {canManageRoutes && view === "day" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setBlockDialog({ open: true, prefillDate: currentDate })}
              >
                <Ban className="h-4 w-4" /> Bloquear Dia
              </Button>
            )}
            {canManageRoutes && view === "day" && (
              <Button
                size="sm"
                className="gap-2"
                onClick={() => setSendToRouteDialog({ open: true })}
              >
                <Navigation className="h-4 w-4" /> Enviar para Rota
              </Button>
            )}
            <ErrorBoundary>
              <CalendarManager />
            </ErrorBoundary>
          </div>
        </div>
      </PageHeader>

      {calendars.length === 0 && (
        <div className="border border-amber-300 bg-amber-50 text-amber-800 rounded-lg p-4 text-sm">
          Nenhum calendário criado ainda. Clique em <strong>Gerenciar Calendários</strong> para criar seu primeiro calendário (ex: um por cidade).
        </div>
      )}

      {/* Busca de cliente na agenda */}
      <AgendaSearchPanel />

      {/* Toolbar: navigation + view toggle + filters */}
      <div className="flex items-center justify-between flex-wrap gap-3 border rounded-lg p-3 bg-muted/30">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>Hoje</Button>
          <Button variant="outline" size="icon" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="font-medium text-sm ml-2 capitalize">{headerLabel}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Calendar filter toggles */}
          {calendars.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowFilters(s => !s)}
            >
              {showFilters ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              Calendários ({calendars.filter(c => visibleCalendars[c.id] !== false).length}/{calendars.length})
            </Button>
          )}

          {/* View toggle */}
          <Select value={view} onValueChange={setView}>
            <SelectTrigger className="w-28 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIEW_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Calendar filter chips */}
      {showFilters && calendars.length > 0 && (
        <div className="border rounded-lg p-3 bg-card space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Filtrar calendários (visão unificada ou por calendário)</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={showAll}>Mostrar todos</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={hideAll}>Ocultar todos</Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {calendars.map(cal => {
              const colors = getColorClasses(cal.color);
              const visible = visibleCalendars[cal.id] !== false;
              return (
                <button
                  key={cal.id}
                  onClick={() => toggleCalendar(cal.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 text-xs font-medium transition ${visible ? "border-foreground/20 bg-muted/50" : "border-transparent bg-muted/20 opacity-50"}`}
                >
                  <span className={`w-3 h-3 rounded-full ${colors.dot}`} />
                  {cal.name}
                  {cal.city && <span className="text-muted-foreground">({cal.city})</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Calendar grid */}
      <CalendarView
        view={view}
        currentDate={currentDate}
        appointments={appointments}
        calendars={calendars}
        onDayClick={handleDayClick}
        onSlotClick={handleSlotClick}
        onAppointmentClick={handleApptClick}
      />

      {/* Route info bar below calendar */}
      <DayRouteInfoBar
        currentDate={currentDate}
        appointments={appointments}
        calendars={calendars}
        selectedAppt={selectedAppt}
      />

      {/* Block day dialog */}
      <BlockDayDialog
        open={blockDialog.open}
        onOpenChange={(o) => setBlockDialog({ open: o, prefillDate: null })}
        calendars={calendars}
        prefillDate={blockDialog.prefillDate}
      />

      {/* Appointment dialog */}
      <AppointmentDialog
        open={apptDialog.open}
        onOpenChange={(o) => setApptDialog({ open: o, prefillDate: null, editAppt: null })}
        calendars={calendars}
        prefillDate={apptDialog.prefillDate}
        editAppt={apptDialog.editAppt}
      />

      <SendToRouteDialog
        open={sendToRouteDialog.open}
        onOpenChange={(o) => setSendToRouteDialog({ open: o })}
        currentDate={currentDate}
        calendars={calendars}
        appointments={appointments}
      />
    </div>
  );
}