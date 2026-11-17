import React, { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MapPin, FileText, ClipboardCheck, User, Phone, Clock, Sun, Sunset, Calendar as CalendarIcon, Truck } from "lucide-react";
import { getColorClasses } from "@/lib/calendarColors";
import { Badge } from "@/components/ui/badge";

export default function DayRouteInfoBar({ currentDate, appointments, calendars, selectedAppt }) {
  const key = format(currentDate, "yyyy-MM-dd");

  const dayAppts = useMemo(() => {
    return appointments.filter(a => {
      try { return format(parseISO(a.date), "yyyy-MM-dd") === key; } catch { return false; }
    });
  }, [appointments, key]);

  const regionsOnDay = useMemo(() => {
    const map = {};
    for (const a of dayAppts) {
      if (a.calendar_id && !map[a.calendar_id]) {
        map[a.calendar_id] = { name: a.calendar_name || calendars.find(c => c.id === a.calendar_id)?.name || "—", color: a.calendar_color || calendars.find(c => c.id === a.calendar_id)?.color || "blue", count: 0 };
      }
      if (a.calendar_id) map[a.calendar_id].count++;
    }
    return Object.values(map);
  }, [dayAppts, calendars]);

  const osCount = dayAppts.filter(a => a.os_code || a.os_id).length;

  return (
    <div className="border rounded-lg bg-card p-4 space-y-3">
      {/* Day summary: regions on that day */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Regiões com atendimento em {format(currentDate, "dd 'de' MMMM", { locale: ptBR })}</div>
          {regionsOnDay.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum agendamento neste dia.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {regionsOnDay.map((r, i) => {
                const colors = getColorClasses(r.color);
                return (
                  <span key={i} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colors.badge} border`}>
                    <MapPin className="h-3 w-3" />
                    {r.name}
                    <span className="opacity-60">({r.count})</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
        {dayAppts.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline">{dayAppts.length} agendamento(s)</Badge>
            {osCount > 0 && (
              <Badge variant="outline" className="bg-cyan-50 text-cyan-700 border-cyan-200">
                <ClipboardCheck className="h-3 w-3 mr-1" /> {osCount} com OS
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Selected appointment details */}
      {selectedAppt && (
        <div className="border-t pt-3">
          <div className="flex items-center gap-2 mb-2">
            {(() => {
              const colors = getColorClasses(selectedAppt.calendar_color);
              return <span className={`w-3 h-3 rounded-full ${colors.dot}`} />;
            })()}
            <span className="text-sm font-semibold">{selectedAppt.calendar_name || "Calendário"}</span>
            {selectedAppt.os_code && (
              <Badge className="bg-cyan-600 text-white">
                <ClipboardCheck className="h-3 w-3 mr-1" /> OS {selectedAppt.os_code}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{selectedAppt.client_name || selectedAppt.title}</span>
            </div>
            {selectedAppt.client_phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{selectedAppt.client_phone}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              {selectedAppt.time_type === "Horário Específico" ? (
                <><Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> {selectedAppt.specific_time}</>
              ) : selectedAppt.time_type === "Manhã" ? (
                <><Sun className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> Manhã</>
              ) : selectedAppt.time_type === "Tarde" ? (
                <><Sunset className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> Tarde</>
              ) : (
                <><CalendarIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> Dia Inteiro</>
              )}
            </div>
            {selectedAppt.vehicle_type && (
              <div className="flex items-center gap-2">
                <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>{selectedAppt.vehicle_type}</span>
              </div>
            )}
            {selectedAppt.address && (
              <div className="flex items-center gap-2 md:col-span-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{selectedAppt.address}{selectedAppt.city ? ` — ${selectedAppt.city}` : ""}</span>
              </div>
            )}
            {selectedAppt.sale_order_number && (
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>Pedido {selectedAppt.sale_order_number}</span>
              </div>
            )}
            {selectedAppt.regional && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>Regional: {selectedAppt.regional}</span>
              </div>
            )}
          </div>
          {selectedAppt.notes && (
            <div className="mt-2 text-xs text-muted-foreground bg-muted/40 rounded p-2">
              {selectedAppt.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}