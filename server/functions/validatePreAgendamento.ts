// Gerado de base44/functions/validatePreAgendamento/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { secrets } from "../runtime.ts";

function normalize(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// Haversine distance in km
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeNominatim(address: string): Promise<{ lat: number, lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=br`;
  try {
    const resp = await fetch(url, { headers: { "User-Agent": "BrazonERP/1.0" } });
    const data = await resp.json();
    if (Array.isArray(data) && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) {}
  return null;
}

// Google Maps Distance Matrix — road distance + duration
async function roadDistance(origin: string, destinations: string[], apiKey: string): Promise<{ km: number, duration_s: number }[] | null> {
  if (!apiKey || destinations.length === 0) return null;
  const destStr = destinations.join("|");
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destStr)}&key=${apiKey}&units=metric`;
  try {
    const resp = await fetch(url);
    const data: any = await resp.json();
    if (data.status === "OK" && data.rows && data.rows[0]) {
      return data.rows[0].elements.map((el: any) =>
        el.status === "OK" ? { km: el.distance.value / 1000, duration_s: el.duration.value } : null
      );
    }
  } catch (e) {}
  return null;
}

const DEFAULT_LIMITS: Record<string, { ideal: number, aceitavel: number, max: number }> = {
  "SP Capital": { ideal: 8, aceitavel: 15, max: 15 },
  "Grande SP": { ideal: 15, aceitavel: 25, max: 25 },
  "BH Capital": { ideal: 10, aceitavel: 15, max: 15 },
  "Grande BH": { ideal: 15, aceitavel: 25, max: 25 },
};

function inferArea(regional: string): string {
  const r = normalize(regional);
  if (r.startsWith("sp ")) return "SP Capital";
  if (r.startsWith("bh ")) return "BH Capital";
  if (r.startsWith("met ")) {
    const spMets = ["guarulhos", "osasco", "barueri", "cotia", "taboao", "sudoeste", "abc", "maua", "ribeirao", "alto tiete", "norte"];
    const bhMets = ["contagem", "betim", "nova lima", "ibirite", "ibirité"];
    if (spMets.some(m => r.includes(m))) return "Grande SP";
    if (bhMets.some(m => r.includes(m))) return "Grande BH";
  }
  return "";
}

function isBusinessDay(d: Date): boolean {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let count = 0;
  while (count < days) {
    d.setDate(d.getDate() + 1);
    if (isBusinessDay(d)) count++;
  }
  return d;
}

function formatDateBR(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}/${m}/${y}`;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Não autorizado" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const clientId = body?.client_id;
    const date = body?.date;
    const timeType = body?.time_type;
    const calendarId = body?.calendar_id || null;
    const vehicleType = body?.vehicle_type || null;
    const preScheduleType = body?.pre_schedule_type || "Normal";
    const addressOverride = body?.address || null;

    if (!clientId || !date || !timeType) {
      return Response.json({ error: "client_id, date e time_type são obrigatórios" }, { status: 400 });
    }

    const client = await base44.asServiceRole.entities.Client.get(clientId);
    if (!client) return Response.json({ error: "Cliente não encontrado" }, { status: 404 });

    // Load regional mapping for city-based regional inference
    const regionalMappings = await base44.asServiceRole.entities.RegionalMapping.list("-created_date", 500);
    const regionalByCity: Record<string, string> = {};
    for (const rm of regionalMappings) {
      regionalByCity[normalize(rm.municipality)] = rm.regional;
    }
    // Infer client regional from city if not set or "NÃO PARAMETRIZADA"
    let clientRegional = (client.regional || "").trim();
    if ((!clientRegional || normalize(clientRegional) === "nao parametrizada") && client.city) {
      clientRegional = regionalByCity[normalize(client.city)] || "";
    }
    const clientAddress = addressOverride || [
      client.street, client.number, client.neighborhood, client.city, client.state
    ].filter(Boolean).join(", ");

    // Load neighbor matrix
    const matrix = await base44.asServiceRole.entities.RegionalVizinhanca.list("-created_date", 500);
    const matrixByRegional: Record<string, any> = {};
    for (const m of matrix) {
      matrixByRegional[normalize(m.regional)] = m;
    }

    // Determine area + limits
    const clientEntry = clientRegional ? matrixByRegional[normalize(clientRegional)] : null;
    const area = clientEntry?.area || inferArea(clientRegional);
    const dl = DEFAULT_LIMITS[area] || { ideal: 10, aceitavel: 15, max: 15 };
    const limits = {
      ideal: clientEntry?.limite_ideal_km ?? dl.ideal,
      aceitavel: clientEntry?.limite_aceitavel_km ?? dl.aceitavel,
      max: clientEntry?.limite_bloqueio_km ?? dl.max,
    };

    // Build period filter
    const baseConditions: any[] = [{ date }, { status: { $ne: "Cancelado" } }];
    if (calendarId) baseConditions.push({ calendar_id: calendarId });
    let periodFilter: any;
    if (timeType === "Dia Inteiro") {
      periodFilter = { $and: baseConditions };
    } else {
      periodFilter = { $and: [...baseConditions, { $or: [{ time_type: timeType }, { time_type: "Dia Inteiro" }] }] };
    }
    const existing = await base44.asServiceRole.entities.AgendamentoRota.filter(periodFilter, "created_date", 100);

    // Verifica se o período está bloqueado (status "Bloqueado" criado pelo BlockDayDialog).
    // Um bloqueio impede novos agendamentos no período/dia — independente de regional ou capacidade.
    const blockedEntries = existing.filter((a: any) => a.status === "Bloqueado");
    if (blockedEntries.length > 0) {
      const block = blockedEntries[0];
      const blockTech = block.technician_name ? ` (Técnico: ${block.technician_name})` : "";
      const blockNotes = block.notes ? ` — Motivo: ${block.notes}` : "";
      return Response.json({
        status: "bloqueado",
        level: "red",
        is_day_block: true,
        message: `Este período está bloqueado para agendamentos${blockTech}${blockNotes}. Selecione outra data ou período.`,
        regional_base: null,
        client_regional: clientRegional,
        area,
        existing_count: existing.length,
        can_override: false,
      });
    }

    // Load calendar for advance check, capacity, and car-first rule
    const calendar = calendarId ? await base44.asServiceRole.entities.CalendarioRota.get(calendarId) : null;

    // Calendar-region check: verify client's regional matches the calendar's configured period_regions.
    // Match logic: (1) exact name match, or (2) the calendar's region_name equals the client regional's area
    // (e.g. calendar configured with RouteRegion "Grande BH" covers all RegionalVizinhanca entries with area "Grande BH").
    if (calendar && clientRegional && !calendar.allow_any_region) {
      const periodRegions = Array.isArray(calendar.period_regions) ? calendar.period_regions : [];
      if (periodRegions.length > 0) {
        const clientArea = clientEntry?.area || "";
        const anyMatch = periodRegions.some(pr => {
          const prName = normalize(pr.region_name || "");
          return prName === normalize(clientRegional) || (clientArea && prName === normalize(clientArea));
        });
        // Fallback: if the client has a route_assignment with a zone in this calendar,
        // they are covered by the calendar's zones even if their area doesn't match the
        // period_regions region_name (e.g. SP Capital client in a "Grande SP" calendar
        // that has zones for both capital and metropolitan area).
        const clientRouteAssignments = Array.isArray(client.route_assignments) ? client.route_assignments : [];
        const hasZoneInThisCalendar = clientRouteAssignments.some(
          (a: any) => a.calendar_id === calendarId && a.zone_id
        );
        if (!anyMatch && !hasZoneInThisCalendar) {
          return Response.json({
            status: "bloqueado",
            level: "red",
            message: `A regional "${clientRegional}" não é atendida por este calendário (${calendar.name}). Selecione um calendário que atenda a região do cliente.`,
            regional_base: null,
            client_regional: clientRegional,
            area,
            existing_count: 0,
            can_override: ["admin", "supervisor", "logistica"].includes(user.role),
          });
        }
      }
    }

    // Business days advance check — only for vendedores.
    // Admin, supervisor and logística can schedule on the same day or day before (they organize the agenda).
    const isManagerRole = ["admin", "supervisor", "logistica"].includes(user.role);
    if (calendar && (calendar.min_advance_business_days ?? 2) > 0 && !isManagerRole) {
      const minDays = calendar.min_advance_business_days ?? 2;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const serviceDate = new Date(date + "T00:00:00");
      const minDate = addBusinessDays(today, minDays);
      if (serviceDate < minDate) {
        return Response.json({
          status: "bloqueado",
          level: "red",
          message: `Antecedência mínima de ${minDays} dias úteis. A data mais próxima disponível é ${formatDateBR(minDate)}. A logística precisa de pelo menos ${minDays} dias úteis para organizar as agendas.`,
          regional_base: null,
          client_regional: clientRegional,
          area,
          existing_count: existing.length,
          min_bookable_date: minDate.toISOString().split("T")[0],
          can_override: ["admin", "supervisor", "logistica"].includes(user.role),
        });
      }
    }

    // Vehicle capacity + car-priority check
    // Rule: The car technician's agenda is OPEN to moto clients when there are no car clients.
    //       When a car client shows up, they have PRIORITY — moto clients in car slots must be relocated by pós-venda.
    // Capacity scaling: the per-technician capacity (capacity_moto_manha etc.) is multiplied by the
    // number of technicians of that vehicle type in the calendar's group, so adding technicians
    // automatically increases the available slots.
    let vehicleCapacity: any = null;
    let relocationRequired = false;
    let relocationNote = "";
    if (vehicleType && calendar) {
      const periodMode = calendar.period_mode || "Dia Inteiro";
      const useTarde = timeType === "Tarde" && periodMode === "Periodos";
      // Count technicians by vehicle type from the calendar's technicians array (mirror of the group pool)
      const techs = Array.isArray(calendar.technicians) ? calendar.technicians : [];
      const motoTechCount = techs.filter((t: any) => (t.vehicle_type || "").toLowerCase() === "moto").length;
      const carroTechCount = techs.filter((t: any) => (t.vehicle_type || "").toLowerCase() === "carro").length;
      // Per-technician capacity from calendar config
      const baseCapMoto = useTarde ? (calendar.capacity_moto_tarde ?? 5) : (calendar.capacity_moto_manha ?? 4);
      const baseCapCarro = useTarde ? (calendar.capacity_carro_tarde ?? 4) : (calendar.capacity_carro_manha ?? 3);
      // Total capacity = per-technician × number of technicians of that vehicle type
      // (fallback to 1 when no technicians registered — keeps legacy behavior)
      const capMoto = baseCapMoto * (motoTechCount || 1);
      const capCarro = baseCapCarro * (carroTechCount || 1);
      // Slot weight: quantos slots de capacidade um atendimento consome baseado no pre_schedule_type.
      // Normal = 1 slot | 2 Horários = 2 | 3 Horários = 3 | Meio Período/Dia Inteiro = 1 técnico inteiro
      const slotWeight = (a: any) => {
        const pst = a.pre_schedule_type || "Normal";
        const baseCap = (a.vehicle_type || "").toLowerCase() === "carro" ? baseCapCarro : baseCapMoto;
        if (pst === "2 Horários") return 2;
        if (pst === "3 Horários") return 3;
        if (pst === "Meio Período" || pst === "Dia Inteiro") return baseCap; // consome 1 técnico inteiro do período/dia
        return 1;
      };
      const existingMoto = existing.filter((a: any) => a.vehicle_type === "Moto").reduce((s, a) => s + slotWeight(a), 0);
      const existingCarro = existing.filter((a: any) => a.vehicle_type === "Carro").reduce((s, a) => s + slotWeight(a), 0);
      const newWeight = slotWeight({ pre_schedule_type: preScheduleType, vehicle_type: vehicleType });
      const motoCanOverflow = calendar.moto_can_use_car_slots !== false;
      const motoOverflow = motoCanOverflow ? Math.max(0, existingMoto - capMoto) : 0;
      const carroSlotsUsed = existingCarro + motoOverflow;
      vehicleCapacity = { existingMoto, existingCarro, capMoto, capCarro, motoOverflow, carroSlotsUsed, useTarde, motoTechCount, carroTechCount, baseCapMoto, baseCapCarro, newWeight };

      let capacityBlocked = false;
      let capacityMessage = "";
      if (vehicleType === "Carro") {
        // Car clients always have priority for car slots
        if (existingCarro + newWeight > capCarro) {
          // All car slots taken by actual car clients — truly full
          capacityBlocked = true;
          capacityMessage = `Capacidade de carro esgotada: ${existingCarro}/${capCarro} slots de carro ocupados por clientes de carro. Não há vaga para mais este atendimento de carro.`;
        } else if (motoOverflow > 0 && carroSlotsUsed + newWeight > capCarro) {
          // Moto overflow is using car slots — car client has priority, moto needs relocation
          relocationRequired = true;
          relocationNote = `Cliente de CARRO priorizado. ${motoOverflow} slot(s) de moto em overflow estão ocupando slots de carro neste período e precisam ser remanejados pelo pós-venda para outra data.`;
        }
      } else if (vehicleType === "Moto") {
        const motoTotal = existingMoto + newWeight;
        if (motoTotal > capMoto) {
          if (!motoCanOverflow) {
            capacityBlocked = true;
            capacityMessage = `Slots de moto cheios (${existingMoto}/${capMoto}) e overflow para carro está desativado neste calendário. Não há vaga para mais este atendimento de moto.`;
          } else {
            const totalMotoOverflow = Math.max(0, motoTotal - capMoto);
            if (existingCarro + totalMotoOverflow > capCarro) {
              capacityBlocked = true;
              capacityMessage = `Capacidade esgotada neste período: slots de moto cheios (${existingMoto}/${capMoto}) e slots de carro ocupados (${existingCarro + motoOverflow}/${capCarro}). Não há vaga para mais este atendimento de moto.`;
            }
          }
        }
        // If moto fits in car overflow slots, it's allowed — the car tech's agenda is open to moto
        // when there are no car clients. A future car client will have priority and this moto may be relocated.
      }
      if (capacityBlocked) {
        return Response.json({
          status: "bloqueado",
          level: "red",
          message: capacityMessage,
          regional_base: null,
          client_regional: clientRegional,
          area,
          existing_count: existing.length,
          vehicle_capacity: vehicleCapacity,
          can_override: ["admin", "supervisor", "logistica"].includes(user.role),
        });
      }
    }

    // Empty period → check cross-calendar conflicts, then anchor
    if (existing.length === 0) {
      // Cross-calendar check: look at appointments for the day to detect regional conflicts.
      // Only compare with calendars in the SAME calendar group (same technician pool).
      // Calendars in different groups (e.g. Grande SP vs Grande BH) have separate technicians
      // and therefore never conflict with each other.
      if (clientRegional && !(calendar?.allow_any_region)) {
        const allDayFilter: any = { $and: [{ date }, { status: { $ne: "Cancelado" } }] };
        const allDayAppts = await base44.asServiceRole.entities.AgendamentoRota.filter(allDayFilter, "created_date", 100);
        let conflictAppts = allDayAppts;
        if (calendar?.group_id) {
          const allCalendars = await base44.asServiceRole.entities.CalendarioRota.list("-created_date", 200);
          const sameGroupCalendarIds = new Set(
            allCalendars
              .filter((c: any) => c.group_id === calendar.group_id)
              .map((c: any) => c.id)
          );
          sameGroupCalendarIds.add(calendar.id);
          conflictAppts = allDayAppts.filter((a: any) => sameGroupCalendarIds.has(a.calendar_id));
        } else if (calendarId) {
          conflictAppts = allDayAppts.filter((a: any) => a.calendar_id === calendarId);
        }
        const periodAppts = conflictAppts.filter(a =>
          a.time_type === timeType || a.time_type === "Dia Inteiro" || timeType === "Dia Inteiro"
        );
        for (const a of periodAppts) {
          let aRegional = (a.regional || "").trim();
          if ((!aRegional || normalize(aRegional) === "nao parametrizada") && a.city) aRegional = regionalByCity[normalize(a.city)] || "";
          if (aRegional && normalize(aRegional) !== normalize(clientRegional)) {
            const aEntry = matrixByRegional[normalize(aRegional)];
            const areNeighbors = aEntry && Array.isArray(aEntry.vizinhas) &&
              aEntry.vizinhas.some((v: string) => normalize(v) === normalize(clientRegional));
            if (!areNeighbors) {
              return Response.json({
                status: "bloqueado",
                level: "red",
                message: `Período vazio neste calendário, mas existe agendamento na regional "${aRegional}" no mesmo período em outro calendário. Regionais incompatíveis — selecione outro período/data.`,
                regional_base: aRegional,
                client_regional: clientRegional,
                area,
                existing_count: 0,
                can_override: ["admin", "supervisor", "logistica"].includes(user.role),
              });
            }
          }
        }
      }
      return Response.json({
        status: "recomendado",
        level: "green",
        message: "Período vazio — este cliente será a âncora do período. Regional livre.",
        regional_base: null,
        client_regional: clientRegional,
        area,
        existing_count: 0,
        limits,
        vehicle_capacity: vehicleCapacity,
        relocation_required: relocationRequired,
        relocation_note: relocationNote,
      });
    }

    // For "Dia Inteiro" (flexible) appointments, the client is available all day.
    // Check compatibility with BOTH periods — the client can be placed in whichever period
    // is compatible. Only block if NEITHER period is compatible.
    // This allows flexible clients to coexist with fixed-period appointments of different regions.
    if (timeType === "Dia Inteiro" && clientRegional) {
      // Determine regional base per period from existing appointments
      const periodBases: Record<string, string> = {};
      for (const a of existing) {
        const tt = a.time_type;
        let r = (a.regional || "").trim();
        if ((!r || normalize(r) === "nao parametrizada") && a.city) r = regionalByCity[normalize(a.city)] || "";
        if (tt === "Manhã" && !periodBases["Manhã"]) periodBases["Manhã"] = r;
        if (tt === "Tarde" && !periodBases["Tarde"]) periodBases["Tarde"] = r;
        if (tt === "Dia Inteiro") {
          if (!periodBases["Manhã"]) periodBases["Manhã"] = r;
          if (!periodBases["Tarde"]) periodBases["Tarde"] = r;
        }
      }

      const checkCompat = (base: string) => {
        if (!base || !clientRegional) return true;
        if (normalize(base) === normalize(clientRegional)) return true;
        const entry = matrixByRegional[normalize(base)];
        return entry && Array.isArray(entry.vizinhas) && entry.vizinhas.some((v: string) => normalize(v) === normalize(clientRegional));
      };

      const manhaCompatible = !periodBases["Manhã"] || checkCompat(periodBases["Manhã"]);
      const tardeCompatible = !periodBases["Tarde"] || checkCompat(periodBases["Tarde"]);

      if (!manhaCompatible && !tardeCompatible) {
        return Response.json({
          status: "bloqueado",
          level: "red",
          message: `Nenhum período disponível para a regional "${clientRegional}" neste dia. Manhã e tarde ocupadas com regionais incompatíveis ("${periodBases["Manhã"]}" e "${periodBases["Tarde"]}"). Selecione outra data.`,
          regional_base: periodBases["Manhã"] || periodBases["Tarde"] || null,
          client_regional: clientRegional,
          area,
          existing_count: existing.length,
          limits,
          vehicle_capacity: vehicleCapacity,
          can_override: ["admin", "supervisor", "logistica"].includes(user.role),
        });
      }

      // At least one period is compatible — but "Dia Inteiro" occupies BOTH periods.
      // If one period is incompatible, "Dia Inteiro" would place the client in the
      // incompatible period too, mixing incompatibles regionais on the same day.
      // Block "Dia Inteiro" and require the user to select the compatible period.
      // This automatically "closes" the incompatible regional in the other period:
      // once the compatible period is anchored, any new appointment in that period
      // with the incompatible regional will be blocked by the normal regional check.
      if (manhaCompatible && !tardeCompatible) {
        return Response.json({
          status: "bloqueado",
          level: "red",
          message: `A manhã é compatível com a regional "${clientRegional}", mas a tarde está ocupada com a regional "${periodBases["Tarde"]}" (incompatível). O cliente de Dia Inteiro ocuparia os dois períodos, misturando regionais incompatíveis. Selecione o período da MANHÃ para agendar — a tarde permanecerá fechada para a regional "${clientRegional}".`,
          regional_base: periodBases["Tarde"] || null,
          suggested_period: "Manhã",
          client_regional: clientRegional,
          area,
          existing_count: existing.length,
          limits,
          vehicle_capacity: vehicleCapacity,
          can_override: ["admin", "supervisor", "logistica"].includes(user.role),
        });
      }
      if (tardeCompatible && !manhaCompatible) {
        return Response.json({
          status: "bloqueado",
          level: "red",
          message: `A tarde é compatível com a regional "${clientRegional}", mas a manhã está ocupada com a regional "${periodBases["Manhã"]}" (incompatível). O cliente de Dia Inteiro ocuparia os dois períodos, misturando regionais incompatíveis. Selecione o período da TARDE para agendar — a manhã permanecerá fechada para a regional "${clientRegional}".`,
          regional_base: periodBases["Manhã"] || null,
          suggested_period: "Tarde",
          client_regional: clientRegional,
          area,
          existing_count: existing.length,
          limits,
          vehicle_capacity: vehicleCapacity,
          can_override: ["admin", "supervisor", "logistica"].includes(user.role),
        });
      }

      // Both periods compatible — Dia Inteiro is fine
      return Response.json({
        status: "recomendado",
        level: "green",
        message: "Cliente de Dia Inteiro (flexível) — ambos os períodos (manhã e tarde) são compatíveis com a regional do cliente.",
        regional_base: periodBases["Manhã"] || periodBases["Tarde"] || null,
        client_regional: clientRegional,
        area,
        existing_count: existing.length,
        limits,
        vehicle_capacity: vehicleCapacity,
        relocation_required: relocationRequired,
        relocation_note: relocationNote,
        can_override: ["admin", "supervisor", "logistica"].includes(user.role),
      });
    }

    // Regional base = earliest agendamento (anchor)
    const anchor = existing[0];
    let regionalBase = (anchor.regional || "").trim();
    if ((!regionalBase || normalize(regionalBase) === "nao parametrizada") && anchor.city) {
      regionalBase = regionalByCity[normalize(anchor.city)] || "";
    }

    // Regional compatibility check
    let regionalCompatible = false;
    let regionalReason = "";
    if (!clientRegional || !regionalBase) {
      regionalCompatible = true;
    } else if (normalize(clientRegional) === normalize(regionalBase)) {
      regionalCompatible = true;
    } else {
      const baseEntry = matrixByRegional[normalize(regionalBase)];
      if (baseEntry && Array.isArray(baseEntry.vizinhas)) {
        regionalCompatible = baseEntry.vizinhas.some((v: string) => normalize(v) === normalize(clientRegional));
      }
      if (!regionalCompatible) {
        regionalReason = `Regional "${clientRegional}" não é vizinha da Regional Base do período ("${regionalBase}").`;
      }
    }

    if (!regionalCompatible) {
      // Query all appointments for the day to suggest an available period
      const allDayFilter: any = { $and: [{ date }, { status: { $ne: "Cancelado" } }] };
      if (calendarId) allDayFilter.$and.push({ calendar_id: calendarId });
      const allDayAppts = await base44.asServiceRole.entities.AgendamentoRota.filter(allDayFilter, "created_date", 100);

      // Determine regional base per period (Manhã, Tarde)
      const periodBases: Record<string, string> = {};
      for (const a of allDayAppts) {
        const tt = a.time_type;
        let r = (a.regional || "").trim();
        if ((!r || normalize(r) === "nao parametrizada") && a.city) r = regionalByCity[normalize(a.city)] || "";
        if (tt === "Manhã" && !periodBases["Manhã"]) periodBases["Manhã"] = r;
        if (tt === "Tarde" && !periodBases["Tarde"]) periodBases["Tarde"] = r;
        if (tt === "Dia Inteiro") {
          if (!periodBases["Manhã"]) periodBases["Manhã"] = r;
          if (!periodBases["Tarde"]) periodBases["Tarde"] = r;
        }
      }

      const checkCompat = (base: string) => {
        if (!base || !clientRegional) return true;
        if (normalize(base) === normalize(clientRegional)) return true;
        const entry = matrixByRegional[normalize(base)];
        return entry && Array.isArray(entry.vizinhas) && entry.vizinhas.some((v: string) => normalize(v) === normalize(clientRegional));
      };

      const manhaFree = !periodBases["Manhã"] || checkCompat(periodBases["Manhã"]);
      const tardeFree = !periodBases["Tarde"] || checkCompat(periodBases["Tarde"]);

      let suggestion = "";
      if (manhaFree && !tardeFree) {
        suggestion = ` A MANHÃ está disponível para a região "${clientRegional}" — selecione Manhã para agendar.`;
      } else if (tardeFree && !manhaFree) {
        suggestion = ` A TARDE está disponível para a região "${clientRegional}" — selecione Tarde para agendar.`;
      } else if (!manhaFree && !tardeFree) {
        suggestion = ` Nenhum período disponível para a região "${clientRegional}" neste dia. Selecione outra data.`;
      }

      return Response.json({
        status: "bloqueado",
        level: "red",
        message: `Este endereço não é compatível com a região programada para este período. ${regionalReason}${suggestion}`,
        regional_base: regionalBase,
        client_regional: clientRegional,
        area,
        existing_count: existing.length,
        limits,
        can_override: ["admin", "supervisor", "logistica"].includes(user.role),
      });
    }

    // Distance check: min road/haversine distance to any existing
    const existingAddresses = existing
      .map((a: any) => [a.address, a.city].filter(Boolean).join(", "))
      .filter(Boolean);

    let minDistKm: number | null = null;
    let minDurationS: number | null = null;
    let distanceMethod = "none";

    if (clientAddress && existingAddresses.length > 0) {
      const apiKey = secrets.get("GOOGLE_MAPS_API_KEY");
      const roadResults = await roadDistance(clientAddress, existingAddresses, apiKey);
      if (roadResults) {
        const valid = roadResults.filter((r): r is { km: number, duration_s: number } => r !== null);
        if (valid.length > 0) {
          minDistKm = Math.min(...valid.map(r => r.km));
          minDurationS = Math.min(...valid.map(r => r.duration_s));
          distanceMethod = "google_maps_road";
        }
      }
      // Fallback: Nominatim geocode + haversine
      if (minDistKm === null) {
        const originGeo = await geocodeNominatim(clientAddress);
        if (originGeo) {
          const dists: number[] = [];
          for (const addr of existingAddresses) {
            const geo = await geocodeNominatim(addr);
            if (geo) dists.push(haversineKm(originGeo.lat, originGeo.lng, geo.lat, geo.lng));
            await new Promise(r => setTimeout(r, 1100));
          }
          if (dists.length > 0) {
            minDistKm = Math.min(...dists);
            distanceMethod = "haversine_nominatim";
          }
        }
      }
    }

    const roundKm = (v: number) => Math.round(v * 10) / 10;
    const base = {
      regional_base: regionalBase,
      client_regional: clientRegional,
      area,
      existing_count: existing.length,
      limits,
      vehicle_capacity: vehicleCapacity,
      relocation_required: relocationRequired,
      relocation_note: relocationNote,
    };

    // If relocation is required (car client prioritized over moto overflow), return as "atencao"
    if (relocationRequired) {
      return Response.json({
        ...base,
        status: "atencao",
        level: "yellow",
        message: `${relocationNote} Agendamento do cliente de carro liberado — o pós-venda deve remanejar o(s) cliente(s) de moto para outra data.`,
        min_distance_km: minDistKm !== null ? roundKm(minDistKm) : null,
        min_duration_s: minDurationS,
        distance_method: minDistKm !== null ? distanceMethod : "none",
        can_override: ["admin", "supervisor", "logistica"].includes(user.role),
      });
    }

    if (minDistKm === null) {
      // Distance couldn't be calculated — check if regionals are clearly different
      if (clientRegional && regionalBase && normalize(clientRegional) !== normalize(regionalBase)) {
        const baseEntry2 = matrixByRegional[normalize(regionalBase)];
        const areNeighbors = baseEntry2 && Array.isArray(baseEntry2.vizinhas) &&
          baseEntry2.vizinhas.some((v: string) => normalize(v) === normalize(clientRegional));
        if (!areNeighbors) {
          return Response.json({
            ...base,
            status: "bloqueado",
            level: "red",
            message: `Não foi possível calcular a distância, mas a regional do cliente ("${clientRegional}") é diferente da regional base do período ("${regionalBase}"). Selecione outro período/data ou calendário que atenda a região do cliente.`,
            min_distance_km: null,
            min_duration_s: null,
            distance_method: "none",
            can_override: ["admin", "supervisor", "logistica"].includes(user.role),
          });
        }
      }
      return Response.json({
        ...base,
        status: "atencao",
        level: "yellow",
        message: "Não foi possível calcular a distância entre os endereços. Verifique se a regional do cliente é compatível com a regional base do período.",
        min_distance_km: null,
        min_duration_s: null,
        distance_method: "none",
      });
    }

    if (minDistKm <= limits.ideal) {
      return Response.json({
        ...base,
        status: "recomendado",
        level: "green",
        message: "Agendamento compatível com a região do período.",
        min_distance_km: roundKm(minDistKm),
        min_duration_s: minDurationS,
        distance_method: distanceMethod,
      });
    } else if (minDistKm <= limits.max) {
      return Response.json({
        ...base,
        status: "atencao",
        level: "yellow",
        message: `Atenção: este cliente está a ${roundKm(minDistKm)} km dos demais atendimentos deste período.`,
        min_distance_km: roundKm(minDistKm),
        min_duration_s: minDurationS,
        distance_method: distanceMethod,
      });
    } else {
      return Response.json({
        ...base,
        status: "bloqueado",
        level: "red",
        message: `Este endereço está a ${roundKm(minDistKm)} km dos demais atendimentos do período — acima do limite máximo de ${limits.max} km. Selecione outro período/data.`,
        min_distance_km: roundKm(minDistKm),
        min_duration_s: minDurationS,
        distance_method: distanceMethod,
        can_override: ["admin", "supervisor", "logistica"].includes(user.role),
      });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}