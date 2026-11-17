import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  toMinutes, minutesToHHMM, formatAddress, haversineKm,
  geocodeAddress, getOptimizedRoute, getRouteInOrder,
} from "../../shared/routeUtils.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch (e) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const {
      date, calendar_id, technician_id, technician_name, appointment_ids,
      end_point_preference = "auto",
      start_point_preference = "empresa",
      custom_start_address = "",
      intermediate_stops = [],
      target_first_stop_arrival = "",
      custom_end_address = "",
    } = body;
    if (!date) return Response.json({ error: 'date é obrigatório' }, { status: 400 });
    if (!calendar_id) return Response.json({ error: 'calendar_id é obrigatório' }, { status: 400 });
    if (!technician_id) return Response.json({ error: 'technician_id é obrigatório' }, { status: 400 });

    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");

    // Get calendar config
    const calendar = await base44.asServiceRole.entities.CalendarioRota.get(calendar_id);
    if (!calendar) return Response.json({ error: 'Calendário não encontrado' }, { status: 404 });

    // Build service duration map from calendar services (duration informed when scheduling)
    const serviceDurationMap = {};
    for (const cs of (calendar.calendar_services || [])) {
      if (cs.service_id) serviceDurationMap[cs.service_id] = cs.duration_minutes;
    }

    // Get global route config for defaults
    const configs = await base44.asServiceRole.entities.RouteConfig.list("-created_date", 10);
    const cfg = configs[0] || {};
    const workStart = toMinutes(calendar.service_start_time || cfg.work_start_time || "08:00");
    const workEnd = toMinutes(calendar.service_end_time || cfg.work_end_time || "18:00");
    const lunchStart = toMinutes(calendar.lunch_start_time || cfg.lunch_start_time || "12:00");
    const lunchDur = cfg.lunch_duration_minutes || 60;
    const svcEntrega = cfg.default_service_duration_entrega || 45;
    const svcInstalacao = cfg.default_service_duration_instalacao || 90;
    const svcManutencao = cfg.default_service_duration_manutencao || 60;
    const buffer = cfg.travel_buffer_minutes || 15;
    const preparation = cfg.preparation_minutes ?? 30;

    // Departure point (company) — from calendar or global config (default)
    let companyStr = "";
    let companyLat = calendar.departure_lat;
    let companyLng = calendar.departure_lng;
    if (calendar.departure_street || calendar.departure_city) {
      companyStr = [calendar.departure_street, calendar.departure_number, calendar.departure_neighborhood, calendar.departure_city, calendar.departure_state]
        .filter(Boolean).join(", ");
    } else if (cfg.departure_street || cfg.departure_city) {
      companyStr = [cfg.departure_street, cfg.departure_number, cfg.departure_neighborhood, cfg.departure_city, cfg.departure_state]
        .filter(Boolean).join(", ");
      companyLat = cfg.departure_lat;
      companyLng = cfg.departure_lng;
    }
    // Geocode company if needed
    if (companyStr && (!companyLat || !companyLng)) {
      const geo = await geocodeAddress(companyStr, apiKey);
      if (geo) {
        companyLat = geo.lat;
        companyLng = geo.lng;
        try { await base44.asServiceRole.entities.CalendarioRota.update(calendar.id, { departure_lat: geo.lat, departure_lng: geo.lng }); } catch (e) {}
      }
    }

    // Get technician (for home address — start/end point)
    const technician = await base44.asServiceRole.entities.Technician.get(technician_id);
    if (!technician) return Response.json({ error: 'Técnico não encontrado' }, { status: 404 });

    let homeStr = "";
    let homeLat = technician.home_lat;
    let homeLng = technician.home_lng;
    if (technician.home_street || technician.home_city) {
      homeStr = [technician.home_street, technician.home_number, technician.home_neighborhood, technician.home_city, technician.home_state]
        .filter(Boolean).join(", ");
    }
    if (homeStr && (!homeLat || !homeLng)) {
      const geo = await geocodeAddress(homeStr, apiKey);
      if (geo) {
        homeLat = geo.lat;
        homeLng = geo.lng;
        try { await base44.asServiceRole.entities.Technician.update(technician.id, { home_lat: geo.lat, home_lng: geo.lng }); } catch (e) {}
      }
    }

    // Resolve the actual departure (start) point based on preference
    // start_point_preference: "empresa" (default) | "casa" (technician home) | "custom"
    let departureStr = companyStr;
    let departureLat = companyLat;
    let departureLng = companyLng;
    if (start_point_preference === "casa") {
      if (!homeStr) {
        return Response.json({ error: 'Técnico não possui endereço de casa cadastrado. Cadastre o endereço residencial do técnico ou use a empresa como ponto de partida.' }, { status: 400 });
      }
      departureStr = homeStr;
      departureLat = homeLat;
      departureLng = homeLng;
    } else if (start_point_preference === "custom") {
      if (!custom_start_address || !custom_start_address.trim()) {
        return Response.json({ error: 'Endereço de partida personalizado não informado.' }, { status: 400 });
      }
      departureStr = custom_start_address.trim();
      const geo = await geocodeAddress(departureStr, apiKey);
      if (geo) {
        departureLat = geo.lat;
        departureLng = geo.lng;
      } else {
        return Response.json({ error: `Não foi possível geocodificar o endereço de partida: "${departureStr}". Verifique o endereço informado.` }, { status: 400 });
      }
    }
    const departureOrigin = (departureLat && departureLng) ? `${departureLat},${departureLng}` : departureStr;

    // Get appointments for this date
    // When appointment_ids are provided (multi-calendar route), fetch ALL appointments
    // for the date (any calendar) and filter by IDs — so clients from different calendars
    // can be combined in the same route.
    let appointments;
    if (appointment_ids && Array.isArray(appointment_ids) && appointment_ids.length > 0) {
      appointments = await base44.asServiceRole.entities.AgendamentoRota.filter({
        date, status: { $in: ["Agendado", "Confirmado"] }
      }, "-date", 500);
      appointments = appointments.filter(a => appointment_ids.includes(a.id));
    } else {
      appointments = await base44.asServiceRole.entities.AgendamentoRota.filter({
        calendar_id, date, status: { $in: ["Agendado", "Confirmado"] }
      }, "-date", 200);
    }

    // Auto-generate OS for appointments that have a sale_id but no os_id
    for (const appt of appointments) {
      if (!appt.os_id) {
        try {
          let sale = null;
          if (appt.sale_id) {
            sale = await base44.asServiceRole.entities.Sale.get(appt.sale_id);
          }
          // Only proceed with sale-based OS creation if sale exists and is not Orçamento
          if (sale && sale.stage !== 'Orçamento') {
            // Use the same idempotent generator as sales; never create a second OS here.
            const response = await base44.functions.invoke('generateServiceOrder', { sale_id: sale.id });
            const linkedOS = response.data?.service_order;
            if (!linkedOS) throw new Error(response.data?.error || 'Não foi possível vincular a OS do pedido.');
            await base44.asServiceRole.entities.AgendamentoRota.update(appt.id, { os_id: linkedOS.id, os_code: linkedOS.code });
            appt.os_id = linkedOS.id;
            appt.os_code = linkedOS.code;
          }
          // Fallback: no sale_id (or sale is Orçamento) — try to find an existing OS
          // by client_id so appointments without a linked sale can still be routed.
          if (!appt.os_id && appt.client_id) {
            try {
              const osByClient = await base44.asServiceRole.entities.ServiceOrder.filter(
                { client_id: appt.client_id }, "-created_date", 10
              );
              // Pick the most recent OS that is not yet routed and not cancelled
              const ROUTED = ["Rota Enviada", "Em Rota", "Concluída pelo Técnico", "Atendimento Interrompido", "Aguardando Faturamento - Pós", "Concluída", "Cancelada"];
              const candidate = osByClient.find(o => !o.route_id && !ROUTED.includes(o.status));
              if (candidate) {
                await base44.asServiceRole.entities.AgendamentoRota.update(appt.id, { os_id: candidate.id, os_code: candidate.code });
                appt.os_id = candidate.id;
                appt.os_code = candidate.code;
              }
            } catch (e2) { /* skip */ }
          }
        } catch (e) { /* skip this appointment on error */ }
      }
    }

    // Check for appointments still without OS — block route generation and list them
    const apptsWithoutOS = appointments.filter(a => !a.os_id);
    if (apptsWithoutOS.length > 0) {
      const list = apptsWithoutOS.map(a => {
        const saleRef = a.sale_order_number ? ` (Pedido ${a.sale_order_number})` : "";
        return `${a.title || a.client_name || "Sem nome"}${saleRef}`;
      }).join(", ");
      return Response.json({
        error: `Não é possível gerar a rota: ${apptsWithoutOS.length} agendamento(s) sem Ordem de Serviço: ${list}. Gere as OSs antes de enviar para a rota.`,
      }, { status: 400 });
    }

    // Filter to appointments that have an OS linked (os_id)
    const validAppts = appointments.filter(a => a.os_id);
    if (validAppts.length === 0) {
      return Response.json({ error: 'Nenhum agendamento com OS vinculada encontrada para esta data e calendário. Gere as OSs antes de criar a rota.' }, { status: 400 });
    }

    // Get linked OSs
    let osIds = [...new Set(validAppts.map(a => a.os_id).filter(Boolean))];
    const osMap = {};
    for (const osId of osIds) {
      try {
        const os = await base44.asServiceRole.entities.ServiceOrder.get(osId);
        if (os) osMap[osId] = os;
      } catch (e) {}
    }

    // OS.date is its creation date, not the appointment date. A different route date
    // must NEVER create a copy of the commercial OS or discard its production history.
    const preparedOS = new Set();
    for (const appt of validAppts) {
      let os = osMap[appt.os_id];
      if (!os && appt.sale_id) {
        const response = await base44.functions.invoke('generateServiceOrder', { sale_id: appt.sale_id });
        os = response.data?.service_order;
        if (!os) return Response.json({ error: response.data?.error || 'Não foi possível recuperar a OS do pedido.' }, { status: 400 });
        await base44.asServiceRole.entities.AgendamentoRota.update(appt.id, { os_id: os.id, os_code: os.code });
        appt.os_id = os.id;
        appt.os_code = os.code;
        osMap[os.id] = os;
      }
      if (!os) return Response.json({ error: `OS vinculada ao agendamento ${appt.title || appt.id} não encontrada. Corrija o vínculo antes de gerar a rota.` }, { status: 400 });
      if (preparedOS.has(os.id)) continue;
      preparedOS.add(os.id);
      if (['Concluída', 'Entregue', 'Cancelada'].includes(os.status)) {
        return Response.json({ error: `${os.code} está ${os.status} e não pode ser reenviada para uma rota.` }, { status: 400 });
      }
      // Bloqueio: pedidos que ainda não passaram pela produção (ou não estão aguardando rota)
      // não podem ser enviados para a rota pelo pós-vendas.
      const ROUTE_READY_STATUSES = ['Produção Liberada', 'Aguardando Rota', 'Rota Enviada', 'Agendamento/Rota'];
      if (os.type !== 'Expedição' && !ROUTE_READY_STATUSES.includes(os.status)) {
        return Response.json({
          error: `${os.code} está em "${os.status}" — somente pedidos com produção liberada (ou aguardando rota) podem ser enviados para a rota.`,
        }, { status: 400 });
      }
      // Preserve prior active routes instead of cloning their OS or resetting execution.
      if (os.route_id) {
        const oldRoute = await base44.asServiceRole.entities.TechnicianRoute.filter(
          { id: os.route_id, status: { $ne: 'Cancelada' } }, { limit: 1 }
        );
        const activeRoute = oldRoute.items[0];
        if (activeRoute && (activeRoute.date !== date || activeRoute.technician_id !== technician_id || activeRoute.status === 'Em Andamento' || activeRoute.status === 'Concluída')) {
          return Response.json({ error: `${os.code} já está vinculada à rota ${activeRoute.code}. Remova ou remaneje esse atendimento antes de gerar outra rota.` }, { status: 400 });
        }
      }
    }

    // Rebuild osIds after recovering any stale appointment links.
    osIds = [...new Set(validAppts.map(a => a.os_id).filter(Boolean))];
    for (const osId of osIds) {
      if (!osMap[osId]) {
        try {
          const os = await base44.asServiceRole.entities.ServiceOrder.get(osId);
          if (os) osMap[osId] = os;
        } catch (e) {}
      }
    }

    // Get linked TOSs (by parent_os_id) — auto-generate if missing, bringing all
    // appointment info (service detail, date/time, items, pending payments) into the TOS
    const tosMap = {};
    const allTOS = await base44.asServiceRole.entities.TechnicianServiceOrder.list("-created_date", 5000);
    let tosMaxNum = allTOS.reduce((max, t) => {
      const num = parseInt(t.code?.replace("TOS", "")) || 0;
      return num > max ? num : max;
    }, 0);

    const mapOSTypeToTOS = (osType) => {
      if (osType === "Manutenção") return "Manutenção/Garantia";
      if (osType === "Entrega + Instalação") return "Entrega + Instalação";
      return "Entrega";
    };

    for (const osId of osIds) {
      // Reuse existing TOS if already linked to this OS
      const existing = allTOS.filter(t => t.parent_os_id === osId);
      if (existing.length > 0) {
        tosMap[osId] = existing[0];
        continue;
      }

      const os = osMap[osId];
      if (!os) continue;
      const appt = validAppts.find(a => a.os_id === osId);
      if (!appt) continue;

      // Get sale if linked (for items and pending payments)
      let sale = null;
      if (os.sale_id) {
        try { sale = await base44.asServiceRole.entities.Sale.get(os.sale_id); } catch (e) {}
      }

      // Build items_to_deliver from sale
      const itemsToDeliver = (sale?.items || []).map(i => ({
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: i.quantity,
      }));

      // Pending payments (Na Entrega / Na Instalação)
      const pendingPayments = (sale?.payments || []).filter(p =>
        p.payment_status === "Pendente" &&
        (p.payment_moment === "Na Entrega" || p.payment_moment === "Na Instalação")
      );
      const pendingAmount = pendingPayments.reduce((s, p) => s + (p.amount || 0), 0);

      // Service detail — priority: sale → appointment → OS
      const serviceDetailTypes = sale?.service_detail_types || appt.service_detail_types || os.service_detail_types || [];
      const serviceDetailNotes = sale?.service_detail_notes || appt.service_detail_notes || os.service_detail_notes || "";

      // Generate TOS code
      tosMaxNum++;
      const tosCode = `TOS${String(tosMaxNum).padStart(6, "0")}`;

      try {
        const newTOS = await base44.asServiceRole.entities.TechnicianServiceOrder.create({
          code: tosCode,
          parent_os_id: os.id,
          parent_os_code: os.code,
          parent_os_type: mapOSTypeToTOS(os.type),
          client_id: os.client_id,
          client_name: os.client_name || "",
          sale_id: os.sale_id || "",
          sale_order_number: os.sale_order_number || "",
          appointment_id: appt.id,
          appointment_date: appt.date,
          appointment_time_type: appt.time_type,
          appointment_specific_time: appt.specific_time || "",
          technician_id: technician_id,
          technician_name: technician_name,
          status: "Pendente",
          items_to_deliver: itemsToDeliver,
          service_detail_types: serviceDetailTypes,
          service_detail_notes: serviceDetailNotes,
          pending_payment_amount: pendingAmount,
          checklist_results: [],
          technician_sale_items: [],
        });
        tosMap[osId] = newTOS;
        // Update OS with TOS code
        await base44.asServiceRole.entities.ServiceOrder.update(os.id, { technician_os_code: tosCode });
      } catch (e) {
        return Response.json({
          error: `Falha ao gerar OS do Técnico para ${os.code} (${os.client_name || ""}). A rota não pode ser criada sem a OS do Técnico. Verifique os dados da venda/agendamento e tente novamente. Detalhe: ${e.message || e}`,
        }, { status: 400 });
      }
    }

    // Block route generation if any OS is missing its TOS
    const missingTOS = osIds.filter(id => !tosMap[id]);
    if (missingTOS.length > 0) {
      const missingInfo = missingTOS.map(id => {
        const os = osMap[id];
        return `${os?.code || id} (${os?.client_name || ""})`;
      }).join(", ");
      return Response.json({
        error: `Não foi possível gerar a OS do Técnico para: ${missingInfo}. A rota não pode ser criada sem a OS do Técnico vinculada.`,
      }, { status: 400 });
    }

    // Build stops
    const stops = [];
    for (const appt of validAppts) {
      const os = osMap[appt.os_id];
      if (!os) continue;
      const addr = os.delivery_address || {};
      const addrStr = formatAddress(os.delivery_address);
      const apptDuration = appt.duration_minutes > 0 ? appt.duration_minutes : 0;
      const calServiceDuration = appt.service_id ? serviceDurationMap[appt.service_id] : null;
      const isInstalacao = os.type === "Entrega + Instalação";
      const isManutencao = os.type === "Manutenção";
      const svcDuration = apptDuration || calServiceDuration || (isManutencao ? svcManutencao : (isInstalacao ? svcInstalacao : svcEntrega));
      const tos = tosMap[appt.os_id];
      stops.push({
        os_id: os.id,
        os_code: os.code,
        tos_id: tos?.id || "",
        tos_code: tos?.code || "",
        client_name: os.client_name || appt.client_name || appt.title,
        address: addrStr,
        service_type: os.type,
        service_duration_min: svcDuration,
        appointment_id: appt.id,
        has_payment: os.has_pending_payment,
        payment_amount: os.pending_payment_amount || 0,
        coords: null, // will be geocoded
      });
    }

    if (stops.length === 0) {
      return Response.json({ error: 'Nenhuma OS com endereço de entrega encontrada.' }, { status: 400 });
    }

    // Safety check: every non-Expedição stop must have a TOS linked
    const stopsWithoutTOS = stops.filter(s => s.service_type !== "Expedição" && !s.tos_id);
    if (stopsWithoutTOS.length > 0) {
      const list = stopsWithoutTOS.map(s => `${s.os_code} (${s.client_name})`).join(", ");
      return Response.json({
        error: `Falha de integridade: TOS não vinculada para: ${list}. A rota não pode ser criada.`,
      }, { status: 400 });
    }

    // Build intermediate stops (paradas sem OS — apenas para contabilizar KM)
    // Format from UI: [{ address: "Rua XYZ, 123, BH, MG", label: "Fábrica Brazon" }]
    const intermediateStopObjs = (Array.isArray(intermediate_stops) ? intermediate_stops : [])
      .filter(s => s && s.address && s.address.trim())
      .map((s, idx) => ({
        stop_id: `parada-${idx + 1}`,
        os_id: "",
        os_code: "",
        tos_id: "",
        tos_code: "",
        client_name: s.label || "Parada intermediária",
        address: s.address.trim(),
        service_type: "Parada",
        service_duration_min: s.duration_minutes || 0,
        appointment_id: "",
        has_payment: false,
        payment_amount: 0,
        coords: null,
        stop_type: "parada",
      }));

    // All stops = intermediate (fixed order, first) + OS stops (optimized among themselves)
    const allStops = [...intermediateStopObjs, ...stops];
    const intermediateCount = intermediateStopObjs.length;

    // Geocode all stops in parallel
    const geoResults = await Promise.all(
      allStops.map(async (s) => {
        const coords = await geocodeAddress(s.address, apiKey);
        return { address: s.address, coords };
      })
    );
    allStops.forEach((s, i) => { s.coords = geoResults[i].coords; });

    // Split into intermediate (fixed) and OS stops (to optimize)
    const fixedStops = allStops.slice(0, intermediateCount);
    const osStops = allStops.slice(intermediateCount);

    // Build waypoint strings for Google Maps (OS stops only — these get optimized)
    const osWaypointStrs = osStops.map(s => s.address).filter(Boolean);
    if (osWaypointStrs.length === 0 && fixedStops.length === 0) {
      return Response.json({ error: 'Nenhum endereço válido encontrado nas OSs.' }, { status: 400 });
    }

    // Determine end point: try home first, fallback to company
    const homeOrigin = (homeLat && homeLng) ? `${homeLat},${homeLng}` : homeStr;
    const companyOrigin = (companyLat && companyLng) ? `${companyLat},${companyLng}` : companyStr;

    // Custom end point (retorno personalizado) — geocode and use as destination directly
    let customEndOrigin = "";
    let customEndLat = null, customEndLng = null;
    let customEndStr = "";
    if (end_point_preference === "custom") {
      if (!custom_end_address || !custom_end_address.trim()) {
        return Response.json({ error: 'Endereço de retorno personalizado não informado.' }, { status: 400 });
      }
      customEndStr = custom_end_address.trim();
      const geo = await geocodeAddress(customEndStr, apiKey);
      if (geo) {
        customEndLat = geo.lat;
        customEndLng = geo.lng;
        customEndOrigin = `${customEndLat},${customEndLng}`;
      } else {
        return Response.json({ error: `Não foi possível geocodificar o endereço de retorno: "${customEndStr}". Verifique o endereço informado.` }, { status: 400 });
      }
    }

    // End point resolution:
    // - "custom": custom return address informed by the user
    // - "casa": always go to the technician's home (regardless of end time)
    // - "empresa": always return to the company
    // - "auto": company by default; switch to home only if estimated arrival > 17:00
    let destination;
    let endPointType;
    if (customEndOrigin) {
      destination = customEndOrigin;
      endPointType = "custom";
    } else if (end_point_preference === "casa") {
      if (!homeOrigin) {
        return Response.json({ error: 'Técnico não possui endereço de casa cadastrado. Cadastre o endereço residencial do técnico ou use a empresa como retorno.' }, { status: 400 });
      }
      destination = homeOrigin;
      endPointType = "casa";
    } else {
      destination = companyOrigin || homeOrigin;
      endPointType = companyOrigin ? "empresa" : "casa";
    }

    // The "origin" for the OS-stops optimization is the last fixed stop (if any) or the departure point
    const lastFixedCoords = fixedStops.length > 0 ? fixedStops[fixedStops.length - 1].coords : null;
    const osOptimizationOrigin = lastFixedCoords
      ? `${lastFixedCoords.lat},${lastFixedCoords.lng}`
      : departureOrigin;

    let optimized = null;
    let intermediateRoute = null;
    if (apiKey && osOptimizationOrigin && destination && osWaypointStrs.length > 0) {
      optimized = await getOptimizedRoute(osOptimizationOrigin, osWaypointStrs, destination, apiKey);
    }
    // If there are fixed (intermediate) stops, get the route from departure → fixed stops (in order) → first OS stop
    if (fixedStops.length > 0 && apiKey && departureOrigin) {
      const fixedWaypointStrs = fixedStops.map(s => s.address).filter(Boolean);
      // Destination for this leg = first OS stop address (if we have the optimized order) or the osOptimizationOrigin
      const firstOsIdx = optimized ? optimized.order[0] : 0;
      const firstOsStop = osStops[firstOsIdx];
      const intermediateDestination = firstOsStop ? firstOsStop.address : osOptimizationOrigin;
      intermediateRoute = await getRouteInOrder(departureOrigin, fixedWaypointStrs, intermediateDestination, apiKey);
    }

    // Build the ordered stops and legs
    let orderedStops = [];
    let legs = [];
    let usedGoogleMaps = false;

    if (optimized || intermediateRoute) {
      usedGoogleMaps = true;
      // Fixed stops come first (in their given order)
      const fixedOrdered = fixedStops;
      // OS stops follow the optimized order
      const osOrdered = optimized ? optimized.order.map(idx => osStops[idx]) : osStops;
      orderedStops = [...fixedOrdered, ...osOrdered];

      // Build legs array: one leg per stop (travel from previous point)
      // Leg 0..fixedCount-1: from intermediateRoute (departure → fixed stops → first OS)
      // Leg fixedCount..end: from optimized (first OS → ... → destination)
      if (intermediateRoute && fixedStops.length > 0) {
        // intermediateRoute.legs = [dep→fix1, fix1→fix2, ..., lastFix→firstOS]
        //   = fixedStops.length + 1 legs (one per fixed stop + the connector lastFix→firstOS)
        // optimized.legs = [lastFix→firstOS, firstOS→secondOS, ..., lastOS→destination]
        //   = N+1 legs (N OS stops + final return)
        // The overlap: intermediateRoute.legs[last] == optimized.legs[0] (both are lastFix→firstOS).
        // Combined (deduplicated): [dep→fix1, ..., lastFix→firstOS, firstOS→secondOS, ..., lastOS→destination]
        //   = orderedStops.length + 1 legs (one per stop + final return)
        // Timeline uses the first orderedStops.length legs; the last leg (lastOS→destination) is the final return.
        const combinedLegs = [...intermediateRoute.legs];
        if (optimized) {
          combinedLegs.push(...optimized.legs.slice(1)); // skip duplicate lastFix→firstOS
        }
        legs = combinedLegs.slice(0, orderedStops.length);
      } else if (optimized) {
        // No intermediate stops — legs for each OS stop (exclude final return leg)
        legs = optimized.legs.slice(0, osOrdered.length);
      }
    } else {
      // Fallback: sort OS stops by city/neighborhood, estimate travel times via Haversine
      const sortedOsStops = [...osStops].sort((a, b) =>
        (a.address.split(",").pop() || "").localeCompare(b.address.split(",").pop() || "")
      );
      orderedStops = [...fixedStops, ...sortedOsStops];
      const depCoords = (departureLat != null && departureLng != null) ? { lat: departureLat, lng: departureLng } : null;
      legs = orderedStops.map((stop, i) => {
        const from = i === 0 ? depCoords : orderedStops[i - 1].coords;
        const to = stop.coords;
        if (!from || !to) return { duration_sec: 0, distance_m: 0 };
        const distKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
        const minutes = Math.max(5, Math.round((distKm / 40) * 60));
        return { duration_sec: minutes * 60, distance_m: distKm * 1000 };
      });
    }

    // Compute timeline — technician departs after preparation time
    let currentTime = workStart + preparation;
    let totalTravelSec = 0;
    let totalDistanceM = 0;
    let totalServiceMin = 0;

    const timeline = orderedStops.map((stop, i) => {
      const leg = legs[i] || { duration_sec: 0, distance_m: 0 };
      const travelMin = Math.round(leg.duration_sec / 60);
      const travelKm = Math.round(leg.distance_m / 1000 * 10) / 10;
      totalTravelSec += leg.duration_sec;
      totalDistanceM += leg.distance_m;
      totalServiceMin += stop.service_duration_min;

      const arrival = currentTime + travelMin;
      // Lunch break (only for OS stops — paradas don't have service time)
      let serviceStart = arrival;
      if (stop.service_duration_min > 0 && serviceStart < lunchStart + lunchDur && serviceStart + stop.service_duration_min > lunchStart) {
        serviceStart = lunchStart + lunchDur;
      }
      const departure = serviceStart + stop.service_duration_min;
      currentTime = departure + buffer;

      return {
        ...stop,
        order: i + 1,
        lat: stop.coords?.lat || null,
        lng: stop.coords?.lng || null,
        travel_from_prev_min: travelMin,
        distance_from_prev_km: travelKm,
        arrival_time: minutesToHHMM(arrival),
        service_start_time: stop.service_duration_min > 0 ? minutesToHHMM(serviceStart) : "",
        departure_time: stop.service_duration_min > 0 ? minutesToHHMM(departure) : minutesToHHMM(arrival),
        checked_in: false,
      };
    });

    // Add final leg: last stop → end point
    const lastStop = timeline[timeline.length - 1];
    let finalLeg = { duration_sec: 0, distance_m: 0 };
    if (usedGoogleMaps && optimized && optimized.legs) {
      // Last leg in Google response is last OS stop → destination
      finalLeg = optimized.legs[optimized.legs.length - 1] || finalLeg;
    } else if (lastStop?.coords) {
      const endCoords = endPointType === "casa" && homeLat != null
        ? { lat: homeLat, lng: homeLng }
        : endPointType === "custom" && customEndLat != null
          ? { lat: customEndLat, lng: customEndLng }
          : (companyLat != null ? { lat: companyLat, lng: companyLng } : null);
      if (endCoords) {
        const distKm = haversineKm(lastStop.coords.lat, lastStop.coords.lng, endCoords.lat, endCoords.lng);
        const minutes = Math.max(5, Math.round((distKm / 40) * 60));
        finalLeg = { duration_sec: minutes * 60, distance_m: distKm * 1000 };
      }
    }
    let finalTravelMin = Math.round(finalLeg.duration_sec / 60);
    totalTravelSec += finalLeg.duration_sec;
    totalDistanceM += finalLeg.distance_m;

    const lastServiceEnd = lastStop ? toMinutes(lastStop.departure_time) : workEnd;
    const estimatedEndMinutes = lastServiceEnd + finalTravelMin;
    let estimatedEndTime = minutesToHHMM(estimatedEndMinutes);

    // End-point logic: default is company. Only go home if the estimated arrival at company
    // would be after 17:00 (technician finishes late enough that going straight home makes sense).
    // "empresa" preference always stays at company. "casa" and "auto" apply this rule.
    const lateThreshold = workEnd - 60; // 17:00 by default (workEnd=18:00)
    if (end_point_preference === "auto" && endPointType === "empresa" && homeOrigin &&
        estimatedEndMinutes > lateThreshold) {
      endPointType = "casa";
      destination = homeOrigin;
      if (apiKey && osOptimizationOrigin && osWaypointStrs.length > 0) {
        const reOptimized = await getOptimizedRoute(osOptimizationOrigin, osWaypointStrs, destination, apiKey);
        if (reOptimized) {
          const osOrdered = reOptimized.order.map(idx => osStops[idx]);
          orderedStops = [...fixedStops, ...osOrdered];
          if (intermediateRoute && fixedStops.length > 0) {
            const combinedLegs = [...intermediateRoute.legs];
            combinedLegs.push(...reOptimized.legs.slice(1));
            legs = combinedLegs.slice(0, orderedStops.length);
          } else {
            legs = reOptimized.legs.slice(0, osOrdered.length);
          }
          usedGoogleMaps = true;
          currentTime = workStart + preparation;
          totalTravelSec = 0; totalDistanceM = 0; totalServiceMin = 0;
          const newTimeline = orderedStops.map((stop, i) => {
            const leg = legs[i] || { duration_sec: 0, distance_m: 0 };
            const travelMin = Math.round(leg.duration_sec / 60);
            const travelKm = Math.round(leg.distance_m / 1000 * 10) / 10;
            totalTravelSec += leg.duration_sec; totalDistanceM += leg.distance_m;
            totalServiceMin += stop.service_duration_min;
            const arrival = currentTime + travelMin;
            let serviceStart = arrival;
            if (stop.service_duration_min > 0 && serviceStart < lunchStart + lunchDur && serviceStart + stop.service_duration_min > lunchStart) {
              serviceStart = lunchStart + lunchDur;
            }
            const departure = serviceStart + stop.service_duration_min;
            currentTime = departure + buffer;
            return {
              ...stop, order: i + 1, lat: stop.coords?.lat || null, lng: stop.coords?.lng || null,
              travel_from_prev_min: travelMin, distance_from_prev_km: travelKm,
              arrival_time: minutesToHHMM(arrival),
              service_start_time: stop.service_duration_min > 0 ? minutesToHHMM(serviceStart) : "",
              departure_time: stop.service_duration_min > 0 ? minutesToHHMM(departure) : minutesToHHMM(arrival),
              checked_in: false,
            };
          });
          timeline.length = 0; timeline.push(...newTimeline);
          finalLeg = reOptimized.legs?.[reOptimized.legs.length - 1] || { duration_sec: 0, distance_m: 0 };
          finalTravelMin = Math.round(finalLeg.duration_sec / 60);
          totalTravelSec += finalLeg.duration_sec; totalDistanceM += finalLeg.distance_m;
          const newLastStop = timeline[timeline.length - 1];
          const newLastEnd = newLastStop ? toMinutes(newLastStop.departure_time) : workEnd;
          estimatedEndTime = minutesToHHMM(newLastEnd + finalTravelMin);
        }
      }
    }

    // If target first stop arrival time is provided, shift the entire timeline
    // so the first stop arrives at the requested time, and compute the departure time
    // (the time the technician needs to leave home/departure point).
    let departureTime = "";
    if (target_first_stop_arrival && timeline.length > 0) {
      const targetMin = toMinutes(target_first_stop_arrival);
      const firstArrival = toMinutes(timeline[0].arrival_time);
      const offset = targetMin - firstArrival;
      if (offset !== 0) {
        for (const stop of timeline) {
          if (stop.arrival_time) stop.arrival_time = minutesToHHMM(toMinutes(stop.arrival_time) + offset);
          if (stop.service_start_time) stop.service_start_time = minutesToHHMM(toMinutes(stop.service_start_time) + offset);
          if (stop.departure_time) stop.departure_time = minutesToHHMM(toMinutes(stop.departure_time) + offset);
        }
        // Recompute estimated end time
        const shiftedLastStop = timeline[timeline.length - 1];
        const shiftedLastEnd = shiftedLastStop ? toMinutes(shiftedLastStop.departure_time) : workEnd;
        estimatedEndTime = minutesToHHMM(shiftedLastEnd + finalTravelMin);
      }
      // Departure time = first stop arrival - travel time to first stop
      const firstTravelMin = timeline[0].travel_from_prev_min || 0;
      departureTime = minutesToHHMM(targetMin - firstTravelMin);
    }

    // Determine arrival address
    let arrivalAddress = "";
    let arrivalLat = null, arrivalLng = null;
    if (endPointType === "casa") {
      arrivalAddress = homeStr;
      arrivalLat = homeLat; arrivalLng = homeLng;
    } else if (endPointType === "custom") {
      arrivalAddress = customEndStr;
      arrivalLat = customEndLat; arrivalLng = customEndLng;
    } else {
      arrivalAddress = departureStr;
      arrivalLat = departureLat; arrivalLng = departureLng;
    }

    // Generate route code
    const allRoutes = await base44.asServiceRole.entities.TechnicianRoute.list("-created_date", 1000);
    const maxNum = allRoutes.reduce((max, r) => {
      const num = parseInt(r.code?.replace("R", "")) || 0;
      return num > max ? num : max;
    }, 0);
    const code = `R${String(maxNum + 1).padStart(6, "0")}`;

    // If a route already exists for this technician + date, delete it (and reset its OSs) so we can regenerate.
    const existing = allRoutes.find(r => r.technician_id === technician_id && r.date === date && r.status !== "Cancelada");
    if (existing) {
      // Reset OSs linked to the old route
      const oldStopOsIds = (existing.stops || []).map(s => s.os_id).filter(Boolean);
      for (const oldOsId of oldStopOsIds) {
        try {
          await base44.asServiceRole.entities.ServiceOrder.update(oldOsId, {
            route_id: null, route_order: 0, status: 'Aguardando Rota',
          });
        } catch (e) {}
      }
      // Reset TOS linked to the old route
      try {
        const oldTOSList = await base44.asServiceRole.entities.TechnicianServiceOrder.filter({ route_id: existing.id });
        for (const tos of oldTOSList) {
          await base44.asServiceRole.entities.TechnicianServiceOrder.update(tos.id, { status: 'Pendente' });
        }
      } catch (e) {}
      await base44.asServiceRole.entities.TechnicianRoute.delete(existing.id);
    }

    // Create the route
    const route = await base44.asServiceRole.entities.TechnicianRoute.create({
      code,
      technician: technician.name,
      technician_id,
      calendar_id,
      calendar_name: calendar.name,
      date,
      period: "Dia Inteiro",
      status: "Planejada",
      departure_address: departureStr,
      departure_lat: departureLat || null,
      departure_lng: departureLng || null,
      departure_time: departureTime,
      arrival_address: arrivalAddress,
      arrival_lat: arrivalLat || null,
      arrival_lng: arrivalLng || null,
      end_point_type: endPointType,
      stops: timeline,
      total_distance_km: Math.round(totalDistanceM / 1000 * 10) / 10,
      total_travel_min: Math.round(totalTravelSec / 60),
      total_service_min: totalServiceMin,
      estimated_end_time: estimatedEndTime,
      optimized: usedGoogleMaps,
      released_to_app: false,
    });

    // Link OSs to this route and update status to "Rota Enviada" (only for stops WITH an OS — skip paradas)
    // O histórico de status é gravado aqui: sem ele, a fila da Produção não detecta que
    // a OS saiu de produção por outro fluxo e ela simplesmente desaparece da tela.
    const osUpdates = timeline
      .filter(s => s.os_id)
      .map((s, i) => {
        const os = osMap[s.os_id];
        const history = Array.isArray(os?.status_history) ? [...os.status_history] : [];
        if (os && os.status !== "Rota Enviada") {
          history.push({
            date: new Date().toISOString(),
            actor: user?.full_name || "",
            source: "Geração de Rota",
            previous_status: os.status,
            new_status: "Rota Enviada",
          });
        }
        return {
          id: s.os_id,
          route_id: route.id,
          route_order: s.order,
          technician: technician.name,
          status: "Rota Enviada",
          status_history: history,
        };
      });
    if (osUpdates.length > 0) {
      await base44.asServiceRole.entities.ServiceOrder.bulkUpdate(osUpdates);
    }

    // Update TOS with km_displacement from route timeline
    const tosKmUpdates = timeline
      .filter(s => s.tos_id)
      .map(s => ({
        id: s.tos_id,
        km_displacement: s.distance_from_prev_km || 0,
      }));
    if (tosKmUpdates.length > 0) {
      try {
        await base44.asServiceRole.entities.TechnicianServiceOrder.bulkUpdate(tosKmUpdates);
      } catch (e) { /* não bloqueia a rota se a atualização do KM falhar */ }
    }

    return Response.json({
      success: true,
      route,
      stops_count: timeline.length,
      optimized: usedGoogleMaps,
      end_point_type: endPointType,
      estimated_end_time: estimatedEndTime,
      total_distance_km: Math.round(totalDistanceM / 1000 * 10) / 10,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}