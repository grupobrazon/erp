import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Wrench, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/ui/PageHeader";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Agenda() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  const { data: equipment = [] } = useQuery({
    queryKey: ["equipment"],
    queryFn: () => base44.entities.Equipment.list("-created_date", 1000),
  });

  const { data: maintenances = [] } = useQuery({
    queryKey: ["maintenances"],
    queryFn: () => base44.entities.Maintenance.list("-date", 500),
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDay = monthStart.getDay();

  const getEventsForDate = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const scheduledMaint = equipment.filter(e => e.next_maintenance_date === dateStr);
    const doneMaint = maintenances.filter(m => m.date === dateStr);
    return { scheduled: scheduledMaint, done: doneMaint };
  };

  const selectedEvents = selectedDate ? getEventsForDate(selectedDate) : null;
  const todayStr = format(new Date(), "yyyy-MM-dd");

  return (
    <div>
      <PageHeader title="Agenda" description="Calendário de manutenções" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <h2 className="text-lg font-heading font-semibold capitalize">
                  {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
                </h2>
                <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-2">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: startDay }).map((_, i) => <div key={`empty-${i}`} />)}
                {days.map(day => {
                  const events = getEventsForDate(day);
                  const hasEvents = events.scheduled.length > 0 || events.done.length > 0;
                  const hasOverdue = events.scheduled.some(e => e.next_maintenance_date < todayStr);
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(day)}
                      className={`p-2 rounded-lg text-sm transition-all hover:bg-primary/10 relative
                        ${isToday(day) ? "bg-primary text-primary-foreground font-bold" : ""}
                        ${selectedDate && isSameDay(day, selectedDate) && !isToday(day) ? "bg-primary/20 ring-2 ring-primary" : ""}
                      `}
                    >
                      {format(day, "d")}
                      {hasEvents && (
                        <div className="flex justify-center gap-0.5 mt-0.5">
                          {events.scheduled.length > 0 && <div className={`w-1.5 h-1.5 rounded-full ${hasOverdue ? "bg-destructive" : "bg-primary"}`} />}
                          {events.done.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="h-full">
            <CardContent className="p-6">
              <h3 className="font-heading font-semibold mb-4">
                {selectedDate ? format(selectedDate, "dd/MM/yyyy") : "Selecione um dia"}
              </h3>
              {selectedEvents ? (
                <div className="space-y-4">
                  {selectedEvents.scheduled.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2 uppercase">Manutenções Agendadas</p>
                      {selectedEvents.scheduled.map(eq => (
                        <div key={eq.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 mb-2">
                          <Wrench className="h-4 w-4 text-primary" />
                          <div>
                            <p className="text-sm font-medium">{eq.client_name}</p>
                            <p className="text-xs text-muted-foreground">{eq.code} - {eq.product_name}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedEvents.done.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2 uppercase">Manutenções Realizadas</p>
                      {selectedEvents.done.map(m => (
                        <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 mb-2">
                          <Wrench className="h-4 w-4 text-emerald-600" />
                          <div>
                            <p className="text-sm font-medium">{m.client_name}</p>
                            <p className="text-xs text-muted-foreground">{m.type} - {m.technician}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedEvents.scheduled.length === 0 && selectedEvents.done.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhum evento neste dia.</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Clique em um dia para ver os detalhes.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}