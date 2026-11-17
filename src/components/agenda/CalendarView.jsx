import React, { useMemo } from "react";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, addDays, parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { getColorClasses, WORK_HOURS } from "@/lib/calendarColors";
import { Clock, Sun, Sunset, Calendar as CalendarIcon, FileText, Lock, ClipboardCheck } from "lucide-react";

const PRE_SCHEDULE_SHORT = {
  "Dia Inteiro": "Dia Inteiro",
  "Meio Período": "Meio Período",
  "2 Horários": "2 Horários",
  "3 Horários": "3 Horários",
};

// Returns the list of distinct calendar/region names for a set of appointments
function getRegionsForDay(appts) {
  const seen = {};
  const list = [];
  for (const a of appts) {
    if (a.calendar_name && !seen[a.calendar_name]) {
      seen[a.calendar_name] = true;
      list.push(a.calendar_name);
    }
  }
  return list;
}

const hasOS = (appt) => Boolean(appt.os_code || appt.os_id);

function getApptBlockClass(appt, colors) {
  if (appt.status === "Bloqueado") return "bg-red-200 text-red-900 border-red-600";
  return hasOS(appt) ? colors.block : colors.blockLight;
}

function getApptBadgeClass(appt, colors) {
  if (appt.status === "Bloqueado") return "bg-red-200 text-red-900 border-red-400";
  return hasOS(appt) ? colors.block : colors.badge;
}

// Converts "HH:MM" to minutes from WORK_HOURS.start (for grid positioning)
function timeToGridMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(":").map(Number);
  return (h - WORK_HOURS.start) * 60 + m;
}

// Finds the primary calendar config for a day's appointments (most common calendar)
function getDayCalendarConfig(dayAppts, calendarsById) {
  const counts = {};
  for (const a of dayAppts) {
    if (a.calendar_id) counts[a.calendar_id] = (counts[a.calendar_id] || 0) + 1;
  }
  const primaryId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  return primaryId ? calendarsById[primaryId] : null;
}

// Assigns "Dia Inteiro" (flexible) appointments to specific time slots,
// using the calendar's configured service hours and lunch break.
// Slots are generated at 1-hour intervals from service_start_time.
function computeFlexibleSlots(dayAppts, calConfig) {
  const serviceStart = timeToGridMinutes(calConfig?.service_start_time) ?? 30; // default 08:30
  const serviceEnd = timeToGridMinutes(calConfig?.service_end_time) ?? 600;   // default 18:00
  const lunchStart = calConfig?.lunch_start_time ? timeToGridMinutes(calConfig.lunch_start_time) : null;
  const lunchEnd = calConfig?.lunch_end_time ? timeToGridMinutes(calConfig.lunch_end_time) : null;
  const slotDuration = 60;

  // Generate available slot start times (in grid minutes)
  const availableSlots = [];
  let t = serviceStart;
  while (t + slotDuration <= serviceEnd) {
    const slotEnd = t + slotDuration;
    const overlapsLunch = lunchStart !== null && lunchEnd !== null && t < lunchEnd && slotEnd > lunchStart;
    if (!overlapsLunch) availableSlots.push(t);
    t += slotDuration;
  }

  const occupied = new Set();

  // Fixed appointments occupy their slot
  for (const a of dayAppts) {
    if (a.time_type === "Horário Específico" && a.specific_time) {
      const start = timeToGridMinutes(a.specific_time) ?? 0;
      const slot = availableSlots.find(s => s <= start && s + slotDuration > start);
      if (slot !== undefined) occupied.add(slot);
    }
  }
  // Manhã blocks all morning slots
  if (dayAppts.some(a => a.time_type === "Manhã")) {
    for (const s of availableSlots) {
      if (lunchStart !== null ? s < lunchStart : s < 240) occupied.add(s);
    }
  }
  // Tarde blocks all afternoon slots
  if (dayAppts.some(a => a.time_type === "Tarde")) {
    for (const s of availableSlots) {
      if (lunchEnd !== null ? s >= lunchEnd : s >= 300) occupied.add(s);
    }
  }
  // Blocked Dia Inteiro blocks all slots
  if (dayAppts.some(a => a.time_type === "Dia Inteiro" && a.status === "Bloqueado")) {
    for (const s of availableSlots) occupied.add(s);
  }

  // Assign flexible (Dia Inteiro) appointments to first available slot
  const slotMap = {};
  for (const appt of dayAppts.filter(a => a.time_type === "Dia Inteiro")) {
    const duration = appt.duration_minutes || slotDuration;
    const freeSlot = availableSlots.find(s => !occupied.has(s));
    if (freeSlot !== undefined) {
      slotMap[appt.id] = { top: freeSlot, height: Math.max(40, duration) };
      occupied.add(freeSlot);
    } else {
      slotMap[appt.id] = { top: serviceStart, height: Math.max(40, duration) };
    }
  }
  return slotMap;
}

function slotTopToTime(topMinutes) {
  const total = WORK_HOURS.start * 60 + topMinutes;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Returns technician number (1, 2, 3...) based on position in calendar's technician list
function getTechnicianNumber(calConfig, appt) {
  if (!appt.technician_id) return null;
  const techs = calConfig?.technicians || [];
  const idx = techs.findIndex(t => t.technician_id === appt.technician_id);
  return idx >= 0 ? idx + 1 : null;
}

// Assigns side-by-side columns to appointments that overlap in time within the same column.
// Returns a map: apptId -> { colIndex, colCount }
function computeColumnLayout(appts, getApptStyleFn) {
  const positioned = appts.map(a => {
    const style = getApptStyleFn(a);
    const top = parseFloat(style.top) || 0;
    const height = parseFloat(style.height) || 60;
    return { id: a.id, top, bottom: top + height };
  });
  positioned.sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  const clusters = [];
  let cluster = [];
  let clusterBottom = -1;
  for (const p of positioned) {
    if (cluster.length === 0 || p.top < clusterBottom) {
      cluster.push(p);
      clusterBottom = Math.max(clusterBottom, p.bottom);
    } else {
      clusters.push(cluster);
      cluster = [p];
      clusterBottom = p.bottom;
    }
  }
  if (cluster.length > 0) clusters.push(cluster);

  const layout = {};
  for (const cl of clusters) {
    const columns = [];
    for (const p of cl) {
      let placed = false;
      for (let ci = 0; ci < columns.length; ci++) {
        if (columns[ci] <= p.top) {
          columns[ci] = p.bottom;
          layout[p.id] = { colIndex: ci, colCount: 0 };
          placed = true;
          break;
        }
      }
      if (!placed) {
        columns.push(p.bottom);
        layout[p.id] = { colIndex: columns.length - 1, colCount: 0 };
      }
    }
    for (const p of cl) layout[p.id].colCount = columns.length;
  }
  return layout;
}

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function AppointmentChip({ appt, onClick, compact }) {
  const colors = getColorClasses(appt.calendar_color);
  const timeLabel = appt.time_type === "Horário Específico"
    ? appt.specific_time
    : appt.time_type;

  if (compact) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onClick(appt); }}
        className={`w-full text-left text-xs px-1.5 py-0.5 rounded truncate ${getApptBadgeClass(appt, colors)} border`}
        title={`${hasOS(appt) ? "⚠ " : ""}${appt.title} — ${timeLabel}${appt.calendar_name ? ` · ${appt.calendar_name}` : ""}${hasOS(appt) ? ` · OS ${appt.os_code}` : ""}`}
      >
        {hasOS(appt) && <span className="text-cyan-600 font-bold mr-0.5" title="Possui Ordem de Serviço">*</span>}
        <span className="font-medium">{appt.title}</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => onClick(appt)}
      className={`w-full text-left text-xs px-2 py-1 rounded ${getApptBlockClass(appt, colors)} border-l-4`}
    >
      <div className="font-medium truncate flex items-center gap-1">
        {hasOS(appt) && <ClipboardCheck className="h-3 w-3 text-cyan-600 shrink-0" title="Possui OS" />}
        {appt.title}
      </div>
      <div className="flex items-center gap-1 text-[10px] opacity-70 mt-0.5">
        {appt.time_type === "Horário Específico" ? (
          <><Clock className="h-2.5 w-2.5" /> {appt.specific_time}</>
        ) : appt.time_type === "Manhã" ? (
          <><Sun className="h-2.5 w-2.5" /> Manhã</>
        ) : appt.time_type === "Tarde" ? (
          <><Sunset className="h-2.5 w-2.5" /> Tarde</>
        ) : (
          <><CalendarIcon className="h-2.5 w-2.5" /> Dia todo</>
        )}
      </div>
      {(appt.sale_order_number || appt.os_code) && (
        <div className="text-[10px] opacity-60 truncate flex items-center gap-0.5">
          <FileText className="h-2.5 w-2.5" />
          {appt.sale_order_number && `Ped. ${appt.sale_order_number}`}
          {appt.os_code && ` · ${appt.os_code}`}
        </div>
      )}
    </button>
  );
}

function MonthView({ currentDate, appointments, onDayClick, onAppointmentClick }) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const apptsByDay = useMemo(() => {
    const map = {};
    for (const a of appointments) {
      try {
        const d = parseISO(a.date);
        const key = format(d, "yyyy-MM-dd");
        if (!map[key]) map[key] = [];
        map[key].push(a);
      } catch {}
    }
    return map;
  }, [appointments]);

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/50">
        {WEEKDAYS.map(d => (
          <div key={d} className="px-2 py-2 text-xs font-semibold text-muted-foreground text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map(day => {
          const key = format(day, "yyyy-MM-dd");
          const dayAppts = apptsByDay[key] || [];
          const inMonth = isSameMonth(day, currentDate);
          const today = isToday(day);
          const dayRegions = getRegionsForDay(dayAppts);
          const tooltip = dayAppts.length === 0
            ? format(day, "dd/MM/yyyy")
            : `${format(day, "dd/MM/yyyy")} — ${dayRegions.join(", ") || "Sem região"} (${dayAppts.length} agendamento(s))`;
          return (
            <div
              key={key}
              onClick={() => onDayClick(day)}
              title={tooltip}
              className={`min-h-[100px] border-b border-r p-1 cursor-pointer hover:bg-muted/30 ${!inMonth ? "opacity-40" : ""} ${today ? "bg-primary/5" : ""}`}
            >
              <div className={`text-xs font-medium mb-1 flex items-center justify-center w-6 h-6 rounded-full ${today ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                {format(day, "d")}
              </div>
              <div className="space-y-0.5">
                {dayAppts.slice(0, 3).map(a => (
                  <AppointmentChip key={a.id} appt={a} onClick={onAppointmentClick} compact />
                ))}
                {dayAppts.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1">+{dayAppts.length - 3} mais</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ currentDate, appointments, calendars, onSlotClick, onAppointmentClick }) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: WORK_HOURS.end - WORK_HOURS.start + 1 }, (_, i) => WORK_HOURS.start + i);

  const calendarsById = useMemo(() => {
    const map = {};
    for (const c of (calendars || [])) map[c.id] = c;
    return map;
  }, [calendars]);

  const apptsByDay = useMemo(() => {
    const map = {};
    for (const a of appointments) {
      try {
        const d = parseISO(a.date);
        const key = format(d, "yyyy-MM-dd");
        if (!map[key]) map[key] = [];
        map[key].push(a);
      } catch {}
    }
    return map;
  }, [appointments]);

  const flexibleSlotsByDay = useMemo(() => {
    const map = {};
    for (const [key, appts] of Object.entries(apptsByDay)) {
      map[key] = computeFlexibleSlots(appts, getDayCalendarConfig(appts, calendarsById));
    }
    return map;
  }, [apptsByDay, calendarsById]);

  const getApptStyle = (appt) => {
    const colors = getColorClasses(appt.calendar_color);
    if (appt.status === "Bloqueado") {
      if (appt.time_type === "Manhã") return { top: "0px", height: "240px", classes: getApptBlockClass(appt, colors) };
      if (appt.time_type === "Tarde") return { top: "300px", height: "300px", classes: getApptBlockClass(appt, colors) };
      return { top: "0px", height: "600px", classes: getApptBlockClass(appt, colors) };
    }
    if (appt.time_type === "Horário Específico" && appt.specific_time) {
      const [h, m] = appt.specific_time.split(":").map(Number);
      const top = ((h - WORK_HOURS.start) + m / 60) * 60;
      const height = Math.max(30, (appt.duration_minutes || 60) * 1);
      return { top: `${top}px`, height: `${height}px`, classes: getApptBlockClass(appt, colors) };
    }
    if (appt.time_type === "Manhã") {
      return { top: "0px", height: "240px", classes: getApptBlockClass(appt, colors) };
    }
    if (appt.time_type === "Tarde") {
      return { top: "300px", height: "300px", classes: getApptBlockClass(appt, colors) };
    }
    // Dia Inteiro
    return { top: "0px", height: "600px", classes: getApptBlockClass(appt, colors) };
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-card overflow-x-auto">
      <div className="min-w-[700px]">
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b bg-muted/50">
          <div className="px-1 py-2" />
          {days.map(d => {
            const today = isToday(d);
            const dKey = format(d, "yyyy-MM-dd");
            const dAppts = apptsByDay[dKey] || [];
            const dRegions = getRegionsForDay(dAppts);
            return (
              <div
                key={dKey}
                className="px-2 py-2 text-center border-l"
                title={dAppts.length === 0 ? format(d, "dd/MM/yyyy") : `${format(d, "dd/MM/yyyy")} — ${dRegions.join(", ") || "Sem região"} (${dAppts.length})`}
              >
                <div className="text-xs text-muted-foreground">{WEEKDAYS[(d.getDay() + 6) % 7]}</div>
                <div className={`text-lg font-semibold ${today ? "text-primary" : ""}`}>{format(d, "d")}</div>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-[60px_repeat(7,1fr)] relative">
          {/* Time column */}
          <div className="border-r">
            {hours.map(h => (
              <div key={h} className="h-[60px] border-b text-xs text-muted-foreground text-right pr-1 pt-0.5">
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {/* Day columns */}
          {days.map(day => {
            const key = format(day, "yyyy-MM-dd");
            const dayAppts = apptsByDay[key] || [];
            const dayCalConfig = getDayCalendarConfig(dayAppts, calendarsById);
            const today = isToday(day);
            const getFinalStyle = (appt) => {
              let s = getApptStyle(appt);
              const flexSlot = flexibleSlotsByDay[key]?.[appt.id];
              if (flexSlot && appt.status !== "Bloqueado") s = { ...s, top: `${flexSlot.top}px`, height: `${flexSlot.height}px` };
              return s;
            };
            const dayLayout = computeColumnLayout(dayAppts, getFinalStyle);
            return (
              <div
                key={key}
                className={`border-l border-b relative ${today ? "bg-primary/5" : ""}`}
                onClick={() => onSlotClick(day)}
              >
                {/* Hour grid lines */}
                {hours.map(h => (
                  <div key={h} className="h-[60px] border-b" />
                ))}
                {/* Appointments */}
                {dayAppts.map(appt => {
                  const style = getFinalStyle(appt);
                  const techNum = getTechnicianNumber(dayCalConfig, appt);
                  const colors = getColorClasses(appt.calendar_color);
                  const colInfo = dayLayout[appt.id] || { colIndex: 0, colCount: 1 };
                  const colCount = Math.max(colInfo.colCount, 1);
                  const leftStr = `calc(${(colInfo.colIndex / colCount) * 100}% + 4px)`;
                  const widthStr = `calc(${(1 / colCount) * 100}% - 6px)`;
                  return (
                    <div
                      key={appt.id}
                      className={`absolute rounded text-xs px-1.5 py-1 ${style.classes} border-l-4 cursor-pointer overflow-hidden`}
                      style={{ top: style.top, height: style.height, left: leftStr, width: widthStr }}
                      onClick={(e) => { e.stopPropagation(); onAppointmentClick(appt); }}
                    >
                      <div className="font-medium truncate flex items-center gap-1">
                        {hasOS(appt) && <span className="text-cyan-600 font-bold" title="Possui OS">*</span>}
                        {techNum && (
                          <span className={`w-4 h-4 rounded-full ${colors.dot} text-white text-[9px] font-bold flex items-center justify-center shrink-0`} title={`Técnico ${techNum}${appt.technician_name ? ": " + appt.technician_name : ""}`}>
                            {techNum}
                          </span>
                        )}
                        {appt.title}
                      </div>
                      <div className="text-[10px] opacity-70 truncate">
                        {appt.time_type === "Horário Específico" ? appt.specific_time : appt.time_type === "Dia Inteiro" ? `${slotTopToTime(flexibleSlotsByDay[key]?.[appt.id]?.top || 0)} · Flex` : appt.time_type}
                      </div>
                      {appt.pre_schedule_type && appt.pre_schedule_type !== "Normal" && (
                        <div className="text-[10px] truncate flex items-center gap-0.5 font-medium text-amber-700">
                          <Lock className="h-2.5 w-2.5" />
                          {PRE_SCHEDULE_SHORT[appt.pre_schedule_type] || appt.pre_schedule_type}
                          {appt.vehicle_type === "Carro" && " · Carro"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayView({ currentDate, appointments, calendars, onSlotClick, onAppointmentClick }) {
  const hours = Array.from({ length: WORK_HOURS.end - WORK_HOURS.start + 1 }, (_, i) => WORK_HOURS.start + i);
  const key = format(currentDate, "yyyy-MM-dd");
  const dayAppts = useMemo(() => {
    return appointments.filter(a => {
      try { return format(parseISO(a.date), "yyyy-MM-dd") === key; } catch { return false; }
    });
  }, [appointments, key]);

  const calendarsById = useMemo(() => {
    const map = {};
    for (const c of (calendars || [])) map[c.id] = c;
    return map;
  }, [calendars]);

  const dayCalConfig = useMemo(() => getDayCalendarConfig(dayAppts, calendarsById), [dayAppts, calendarsById]);

  // Build technician columns — always show all configured technicians,
  // auto-assigning appointments by vehicle_type when technician_id is not set
  const technicians = dayCalConfig?.technicians || [];
  const techColumns = useMemo(() => {
    const usedApptIds = new Set();
    const cols = technicians.map((t, i) => {
      const firstOfVehicle = technicians.findIndex(tt => tt.vehicle_type === t.vehicle_type);
      const appts = dayAppts.filter(a => {
        if (usedApptIds.has(a.id)) return false;
        if (a.technician_id === t.technician_id) { usedApptIds.add(a.id); return true; }
        // Auto-assign by vehicle type to the first technician of that type
        if (!a.technician_id && a.vehicle_type === t.vehicle_type && firstOfVehicle === i) {
          usedApptIds.add(a.id); return true;
        }
        return false;
      });
      return { key: t.technician_id, num: i + 1, label: `Técnico ${i + 1}`, name: t.technician_name, vehicle: t.vehicle_type, appts };
    });
    const unassigned = dayAppts.filter(a => !usedApptIds.has(a.id));
    if (unassigned.length > 0) {
      cols.push({ key: "__unassigned__", num: 0, label: "Sem Técnico", name: null, vehicle: null, appts: unassigned });
    }
    return cols;
  }, [dayAppts, technicians]);

  // Compute flexible slots per-column (each tech has own timeline — no cross-tech blocking)
  const flexibleSlots = useMemo(() => {
    const slotMap = {};
    for (const col of techColumns) {
      Object.assign(slotMap, computeFlexibleSlots(col.appts, dayCalConfig));
    }
    return slotMap;
  }, [techColumns, dayCalConfig]);

  const getApptStyle = (appt) => {
    const colors = getColorClasses(appt.calendar_color);
    if (appt.status === "Bloqueado") {
      if (appt.time_type === "Manhã") return { top: "0px", height: "240px", classes: getApptBlockClass(appt, colors) };
      if (appt.time_type === "Tarde") return { top: "300px", height: "300px", classes: getApptBlockClass(appt, colors) };
      return { top: "0px", height: "600px", classes: getApptBlockClass(appt, colors) };
    }
    if (appt.time_type === "Horário Específico" && appt.specific_time) {
      const [h, m] = appt.specific_time.split(":").map(Number);
      const top = ((h - WORK_HOURS.start) + m / 60) * 60;
      const height = Math.max(40, (appt.duration_minutes || 60) * 1);
      return { top: `${top}px`, height: `${height}px`, classes: getApptBlockClass(appt, colors) };
    }
    if (appt.time_type === "Manhã") return { top: "0px", height: "240px", classes: getApptBlockClass(appt, colors) };
    if (appt.time_type === "Tarde") return { top: "300px", height: "300px", classes: getApptBlockClass(appt, colors) };
    const slot = flexibleSlots[appt.id] || { top: 0, height: 60 };
    return { top: `${slot.top}px`, height: `${slot.height}px`, classes: getApptBlockClass(appt, colors) };
  };

  const renderAppt = (appt, colNum, layout = {}) => {
    const style = getApptStyle(appt);
    const techNum = colNum || getTechnicianNumber(dayCalConfig, appt);
    const colors = getColorClasses(appt.calendar_color);
    const colInfo = layout[appt.id] || { colIndex: 0, colCount: 1 };
    const colCount = Math.max(colInfo.colCount, 1);
    const leftStr = `calc(${(colInfo.colIndex / colCount) * 100}% + 4px)`;
    const widthStr = `calc(${(1 / colCount) * 100}% - 6px)`;
    return (
      <div
        key={appt.id}
        className={`absolute rounded text-sm px-2 py-1.5 ${style.classes} border-l-4 cursor-pointer overflow-hidden`}
        style={{ top: style.top, height: style.height, left: leftStr, width: widthStr }}
        onClick={(e) => { e.stopPropagation(); onAppointmentClick(appt); }}
      >
        <div className="font-medium truncate flex items-center gap-1">
          {hasOS(appt) && <ClipboardCheck className="h-3.5 w-3.5 text-cyan-600 shrink-0" title="Possui OS" />}
          {techNum && (
            <span className={`w-5 h-5 rounded-full ${colors.dot} text-white text-[10px] font-bold flex items-center justify-center shrink-0`} title={`Técnico ${techNum}${appt.technician_name ? ": " + appt.technician_name : ""}`}>
              {techNum}
            </span>
          )}
          {appt.title}
        </div>
        <div className="text-xs opacity-70 truncate flex items-center gap-1">
          {appt.time_type === "Horário Específico" ? (
            <><Clock className="h-3 w-3" /> {appt.specific_time}</>
          ) : appt.time_type === "Manhã" ? (
            <><Sun className="h-3 w-3" /> Manhã (08h-12h)</>
          ) : appt.time_type === "Tarde" ? (
            <><Sunset className="h-3 w-3" /> Tarde (13h-18h)</>
          ) : (
            <><Clock className="h-3 w-3" /> {slotTopToTime(flexibleSlots[appt.id]?.top || 0)} · Flexível</>
          )}
        </div>
        {appt.pre_schedule_type && appt.pre_schedule_type !== "Normal" && (
          <div className="text-xs truncate flex items-center gap-1 mt-0.5 font-medium text-amber-700">
            <Lock className="h-3 w-3" />
            {PRE_SCHEDULE_SHORT[appt.pre_schedule_type] || appt.pre_schedule_type}
            {appt.vehicle_type === "Carro" && " · Carro"}
          </div>
        )}
        {appt.vehicle_type && (!appt.pre_schedule_type || appt.pre_schedule_type === "Normal") && (
          <div className="text-[10px] opacity-60 truncate">Veículo: {appt.vehicle_type}</div>
        )}
        {appt.client_name && appt.client_name !== appt.title && (
          <div className="text-xs opacity-60 truncate mt-0.5">{appt.client_name}</div>
        )}
        {appt.address && <div className="text-xs opacity-60 truncate">{appt.address}</div>}
        {(appt.sale_order_number || appt.os_code) && (
          <div className="text-xs opacity-60 truncate flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {appt.sale_order_number && `Ped. ${appt.sale_order_number}`}
            {appt.os_code && ` · OS ${appt.os_code}`}
          </div>
        )}
      </div>
    );
  };

  const colColors = getColorClasses(dayCalConfig?.color);
  const dateLabel = format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR });
  const regionsLabel = dayAppts.length > 0 ? ` · ${getRegionsForDay(dayAppts).join(", ")}` : "";

  // Single column fallback (no technicians configured at all)
  if (technicians.length === 0) {
    return (
      <div className="border rounded-lg overflow-hidden bg-card">
        <div className="grid grid-cols-[80px_1fr] border-b bg-muted/50">
          <div className="px-2 py-3 text-xs font-semibold text-muted-foreground">Horário</div>
          <div className="px-3 py-3 border-l">
            <div className="text-sm font-semibold">{dateLabel}</div>
            <div className="text-xs text-muted-foreground">{dayAppts.length} agendamento(s){regionsLabel}</div>
          </div>
        </div>
        <div className="grid grid-cols-[80px_1fr] relative" onClick={() => onSlotClick(currentDate)}>
          <div className="border-r">
            {hours.map(h => (
              <div key={h} className="h-[60px] border-b text-xs text-muted-foreground text-right pr-2 pt-0.5">
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          <div className="border-l relative">
            {hours.map(h => <div key={h} className="h-[60px] border-b" />)}
            {dayAppts.map(a => renderAppt(a, null, computeColumnLayout(dayAppts, getApptStyle)))}
          </div>
        </div>
      </div>
    );
  }

  // Multi-column layout by technician (Excel-like)
  const colCount = techColumns.length;
  const gridTemplate = `80px repeat(${colCount}, minmax(180px, 1fr))`;

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      {/* Header with technician column titles */}
      <div className="grid border-b bg-muted/50" style={{ gridTemplateColumns: gridTemplate }}>
        <div className="px-2 py-3 text-xs font-semibold text-muted-foreground">Horário</div>
        {techColumns.map(col => (
          <div key={col.key} className="px-3 py-2 border-l">
            <div className="text-sm font-semibold flex items-center gap-1.5">
              {col.num > 0 ? (
                <span className={`w-5 h-5 rounded-full ${colColors.dot} text-white text-[10px] font-bold flex items-center justify-center shrink-0`}>
                  {col.num}
                </span>
              ) : (
                <span className="w-5 h-5 rounded-full bg-muted-foreground/30 text-white text-[10px] font-bold flex items-center justify-center shrink-0">?</span>
              )}
              {col.label}
            </div>
            {col.name && <div className="text-xs text-muted-foreground truncate">{col.name}</div>}
            {col.vehicle && <div className="text-[10px] text-muted-foreground">{col.vehicle}</div>}
          </div>
        ))}
      </div>
      {/* Date / count sub-header */}
      <div className="px-3 py-1.5 border-b bg-muted/30 text-xs text-muted-foreground">
        {dateLabel} · {dayAppts.length} agendamento(s){regionsLabel}
      </div>
      {/* Body: time axis + one column per technician */}
      <div className="overflow-x-auto">
        <div className="grid relative" style={{ gridTemplateColumns: gridTemplate }} onClick={() => onSlotClick(currentDate)}>
          <div className="border-r">
            {hours.map(h => (
              <div key={h} className="h-[60px] border-b text-xs text-muted-foreground text-right pr-2 pt-0.5">
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {techColumns.map((col, ci) => (
            <div key={col.key} className={`border-l relative ${ci % 2 === 0 ? "bg-muted/10" : ""}`}>
              {hours.map(h => <div key={h} className="h-[60px] border-b" />)}
              {col.appts.map(a => renderAppt(a, col.num, computeColumnLayout(col.appts, getApptStyle)))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CalendarView({ view, currentDate, appointments, calendars, onDayClick, onSlotClick, onAppointmentClick }) {
  if (view === "month") {
    return <MonthView currentDate={currentDate} appointments={appointments} onDayClick={onDayClick} onAppointmentClick={onAppointmentClick} />;
  }
  if (view === "week") {
    return <WeekView currentDate={currentDate} appointments={appointments} calendars={calendars} onSlotClick={onSlotClick} onAppointmentClick={onAppointmentClick} />;
  }
  return <DayView currentDate={currentDate} appointments={appointments} calendars={calendars} onSlotClick={onSlotClick} onAppointmentClick={onAppointmentClick} />;
}