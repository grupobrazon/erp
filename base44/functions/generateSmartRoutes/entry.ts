import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';
import {
  brazilCityCoords, toMinutes, minutesToHHMM, formatAddress,
  haversineKm, geocodeAddress, estimateTravelSeconds, getOptimizedRoute,
} from "../../shared/routeUtils.ts";

const dayNames = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const dayLabels = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const addDays = (dateStr, n) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const buildAddressString = (addr) => {
  if (!addr) return "";
  return [addr.street, addr.number, addr.neighborhood, addr.city, addr.state]
    .filter(Boolean).join(", ");
};

// Build estimated travel times for all legs, including departure → first stop
function buildEstimatedTravelTimes(orderedStops, depLat, depLng) {
  const depCoords = (depLat != null && depLng != null) ? { lat: depLat, lng: depLng } : null;
  return orderedStops.map((stop, i) => {
    const from = i === 0 ? depCoords : orderedStops[i - 1].coords;
    return estimateTravelSeconds(from, stop.coords);
  });
}

// Compute bearing from point1 to point2 (0-360 degrees, 0=north)
function bearingFrom(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Angular difference between two bearings (0-180)
function angularDiff(b1, b2) {
  if (b1 == null || b2 == null) return 0;
  const diff = Math.abs(b1 - b2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

// Check if a set of stops have opposite directions from departure point
function checkGeographicFeasibility(stopsCoords, depLat, depLng, maxAngular = 135, maxPairKm = 80) {
  if (!depLat || !depLng || stopsCoords.length < 2) {
    return { feasible: true, max_angular_diff: 0, max_pair_distance_km: 0, opposite_pairs: [] };
  }
  const bearings = stopsCoords.map(c => c ? bearingFrom(depLat, depLng, c.lat, c.lng) : null);
  let maxAng = 0;
  const oppPairs = [];
  for (let i = 0; i < stopsCoords.length; i++) {
    for (let j = i + 1; j < stopsCoords.length; j++) {
      if (bearings[i] == null || bearings[j] == null) continue;
      const diff = angularDiff(bearings[i], bearings[j]);
      if (diff > maxAng) maxAng = diff;
      if (diff > maxAngular) oppPairs.push({ i, j, angular_diff: Math.round(diff) });
    }
  }
  let maxDist = 0;
  for (let i = 0; i < stopsCoords.length; i++) {
    for (let j = i + 1; j < stopsCoords.length; j++) {
      if (!stopsCoords[i] || !stopsCoords[j]) continue;
      const d = haversineKm(stopsCoords[i].lat, stopsCoords[i].lng, stopsCoords[j].lat, stopsCoords[j].lng);
      if (d > maxDist) maxDist = d;
    }
  }
  return {
    feasible: maxAng <= maxAngular && maxDist <= maxPairKm,
    max_angular_diff: Math.round(maxAng),
    max_pair_distance_km: Math.round(maxDist),
    opposite_pairs: oppPairs,
  };
}

// Check if candidate is geographically compatible with existing stops
function isGeoCompatible(candCoords, existingCoords, depLat, depLng, maxDiff = 100) {
  if (!depLat || !depLng || !candCoords) return true;
  if (existingCoords.length === 0) return true;
  const candBearing = bearingFrom(depLat, depLng, candCoords.lat, candCoords.lng);
  if (candBearing == null) return true;
  for (const ec of existingCoords) {
    if (!ec) continue;
    const eb = bearingFrom(depLat, depLng, ec.lat, ec.lng);
    if (eb == null) continue;
    if (angularDiff(candBearing, eb) <= maxDiff) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Use auth.me() (documented pattern) instead of isAuthenticated() — more reliable
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (e) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { zone_id, date_to, test_mode } = body;

    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");

    // Fetch global config
    const configs = await base44.asServiceRole.entities.RouteConfig.list("-created_date", 10);
    const cfg = configs[0] || {};
    const workStart = toMinutes(cfg.work_start_time || "08:00");
    const workEnd = toMinutes(cfg.work_end_time || "18:00");
    const lunchStart = toMinutes(cfg.lunch_start_time || "12:00");
    const lunchDur = cfg.lunch_duration_minutes || 60;
    const svcEntrega = cfg.default_service_duration_entrega || 45;
    const svcInstalacao = cfg.default_service_duration_instalacao || 90;
    const svcManutencao = cfg.default_service_duration_manutencao || 60;
    const buffer = cfg.travel_buffer_minutes || 15;
    const preparation = cfg.preparation_minutes ?? 30;

    // Geocode departure address (cache in config)
    let departureStr = "";
    let departureLat = cfg.departure_lat;
    let departureLng = cfg.departure_lng;
    if (cfg.departure_street || cfg.departure_city) {
      departureStr = [cfg.departure_street, cfg.departure_number, cfg.departure_neighborhood, cfg.departure_city, cfg.departure_state]
        .filter(Boolean).join(", ");
      if (departureStr && (!departureLat || !departureLng)) {
        const geo = await geocodeAddress(departureStr, apiKey);
        if (geo) {
          departureLat = geo.lat;
          departureLng = geo.lng;
          // Cache it
          try {
            await base44.asServiceRole.entities.RouteConfig.update(cfg.id, { departure_lat: geo.lat, departure_lng: geo.lng });
          } catch (e) {}
        }
      }
    }
    const departureOrigin = departureLat && departureLng ? `${departureLat},${departureLng}` : departureStr;

    // Fetch OS — test mode brings ALL delivery OS, normal brings Agendamento/Rota
    let orders;
    if (test_mode) {
      orders = await base44.asServiceRole.entities.ServiceOrder.filter(
        {}, "-created_date", 500
      );
      orders = orders.filter(o => o.type === "Entrega" || o.type === "Entrega + Instalação");
    } else {
      orders = await base44.asServiceRole.entities.ServiceOrder.filter(
        { status: "Agendamento/Rota" }, "-created_date", 500
      );
    }

    // Fetch related sales for scheduling preferences (oldest first)
    const saleIds = [...new Set(orders.map(o => o.sale_id).filter(Boolean))];
    const saleMap = {};
    for (const sid of saleIds) {
      try {
        const sale = await base44.asServiceRole.entities.Sale.get(sid);
        saleMap[sid] = sale;
      } catch (e) {}
    }

    const zones = await base44.asServiceRole.entities.RouteZone.list("-created_date", 200);
    const technicians = await base44.asServiceRole.entities.Technician.list("-created_date", 200);
    const dayOverrides = await base44.asServiceRole.entities.ZoneDayOverride.list("-date", 500);

    // Fetch agendamentos to respect period (Manhã/Tarde) constraints from the agenda
    const agendamentos = await base44.asServiceRole.entities.AgendamentoRota.filter(
      { status: { $ne: "Cancelado" } }, "-created_date", 500
    );
    const apptByOsId: Record<string, any> = {};
    const apptBySaleId: Record<string, any> = {};
    for (const a of agendamentos) {
      if (a.os_id) apptByOsId[a.os_id] = a;
      if (a.sale_id && !apptBySaleId[a.sale_id]) apptBySaleId[a.sale_id] = a;
    }

    // Geocode zone centers for radius-based zones (cache in entity)
    for (const zone of zones) {
      if (zone.use_radius && zone.radius_km && zone.center_lat == null) {
        const centerStr = [zone.center_city, zone.center_state, "Brasil"].filter(Boolean).join(", ");
        if (centerStr) {
          const geo = await geocodeAddress(centerStr, apiKey);
          if (geo) {
            zone.center_lat = geo.lat;
            zone.center_lng = geo.lng;
            try {
              await base44.asServiceRole.entities.RouteZone.update(zone.id, { center_lat: geo.lat, center_lng: geo.lng });
            } catch (e) {}
          }
        }
      }
    }

    // Geocode all unique OS delivery cities (needed for radius zones AND geographic feasibility checks)
    // Parallelized for speed — sequential geocoding caused frontend timeouts
    const cityGeoCache = {};
    {
      const uniqueCities = [...new Set(orders.map(o => o.delivery_address?.city).filter(Boolean).map(c => c.toLowerCase()))];
      const citySamples = uniqueCities.map(city => {
        const sample = orders.find(o => o.delivery_address?.city?.toLowerCase() === city);
        const state = sample?.delivery_address?.state;
        const cityStr = [city, state, "Brasil"].filter(Boolean).join(", ");
        return { city, cityStr };
      });
      const results = await Promise.all(
        citySamples.map(async ({ city, cityStr }) => {
          // Check static cache FIRST — no API call needed for known cities
          if (brazilCityCoords[city]) return { city, coords: brazilCityCoords[city] };
          const coords = await geocodeAddress(cityStr, apiKey);
          return { city, coords };
        })
      );
      for (const { city, coords } of results) {
        cityGeoCache[city] = coords;
      }
    }

    // Planning window — always start today, end at date_to (default 60 days)
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = date_to ? new Date(date_to + "T00:00:00") : new Date(Date.now() + 60 * 86400000);
    end.setHours(0, 0, 0, 0);

    const days = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    const matchZoneByCity = (os, zone) => {
      if (!os.delivery_address?.city) return false;
      return (zone.cities || []).some(c =>
        c.toLowerCase() === os.delivery_address.city.toLowerCase()
      );
    };

    const matchZoneByRadius = (os, zone) => {
      if (!zone.use_radius || !zone.radius_km) return false;
      if (zone.center_lat == null || zone.center_lng == null) return false;
      if (!os.delivery_address?.city) return false;
      const coords = cityGeoCache[os.delivery_address.city.toLowerCase()];
      if (!coords) return false;
      const dist = haversineKm(zone.center_lat, zone.center_lng, coords.lat, coords.lng);
      return dist <= zone.radius_km;
    };

    const matchZone = (os, zone) => {
      if (os.route_zone_id === zone.id) return true;
      if (os.route_zone_id) return false;
      if (zone.use_radius) return matchZoneByRadius(os, zone);
      return matchZoneByCity(os, zone);
    };

    const isInTargetWeek = (day, weekStartStr) => {
      if (!weekStartStr) return true;
      const ws = new Date(weekStartStr + "T00:00:00");
      const we = new Date(ws);
      we.setDate(we.getDate() + 6);
      return day >= ws && day <= we;
    };

    const enrichOS = (os) => {
      const sale = os.sale_id ? saleMap[os.sale_id] : null;
      const city = os.delivery_address?.city || "";
      const neighborhood = os.delivery_address?.neighborhood || "";
      const appt = (os.id && apptByOsId[os.id]) || (os.sale_id && apptBySaleId[os.sale_id]) || null;
      return {
        os_id: os.id,
        os_code: os.code,
        client_name: os.client_name,
        address: formatAddress(os.delivery_address),
        address_string: buildAddressString(os.delivery_address),
        city,
        neighborhood,
        state: os.delivery_address?.state || "",
        type: os.type,
        has_payment: os.has_pending_payment,
        payment_amount: os.pending_payment_amount || 0,
        scheduling_type: sale?.cr_scheduling_type || "none",
        preferred_date: sale?.cr_preferred_date || null,
        week_start: sale?.cr_week_start || null,
        period: sale?.cr_period || null,
        cr_notes: sale?.cr_notes || "",
        created_date: os.created_date,
        pinned_date: os.pinned_date || null,
        pinned_reason: os.pinned_reason || null,
        proximity_group: city ? (neighborhood ? `${city} - ${neighborhood}` : city) : "Sem endereço",
        coords: cityGeoCache[city?.toLowerCase()] || null,
        appt_time_type: appt?.time_type || null,
        appt_duration: appt?.duration_minutes || 0,
      };
    };

    const getServiceDuration = (os, zone) => {
      if (os.appt_duration > 0) return os.appt_duration;
      const isInstalacao = os.type === "Entrega + Instalação";
      const isManutencao = os.type === "Manutenção";
      if (isManutencao) {
        return zone.service_duration_manutencao_override || svcManutencao;
      }
      if (isInstalacao) {
        return zone.service_duration_instalacao_override || svcInstalacao;
      }
      return zone.service_duration_entrega_override || svcEntrega;
    };

    // Compute time slots for a list of ordered stops
    // Returns array of { os, slot_index, period, arrival_time, departure_time, travel_from_prev_min }
    const computeSchedule = (orderedStops, travelTimes, serviceTimes, vehicleFactor = 1) => {
      const schedule = [];
      let currentTime = workStart + preparation;
      const lunchEnd = lunchStart + lunchDur;
      for (let i = 0; i < orderedStops.length; i++) {
        const rawTravel = travelTimes[i] || 0;
        const travel = rawTravel * vehicleFactor;
        const svc = serviceTimes[i];
        let arrival = currentTime + Math.round(travel / 60); // travel in seconds -> minutes
        // Enforce period: "Tarde" stops can't start before lunch
        if (orderedStops[i].appt_time_type === "Tarde" && arrival < lunchEnd) {
          currentTime = lunchEnd;
          arrival = currentTime + Math.round(travel / 60);
        }
        // Lunch break
        let serviceStart = arrival;
        if (serviceStart < lunchEnd && serviceStart + svc > lunchStart) {
          serviceStart = lunchEnd;
        }
        if (serviceStart + svc > workEnd) {
          // doesn't fit, still include but flag
        }
        const departure = serviceStart + svc;
        const period = serviceStart < lunchStart ? "Manhã" : "Tarde";
        schedule.push({
          ...orderedStops[i],
          slot_index: i + 1,
          period,
          arrival_time: minutesToHHMM(arrival),
          service_time: minutesToHHMM(serviceStart),
          departure_time: minutesToHHMM(departure),
          travel_from_prev_min: Math.round(travel / 60),
          service_duration_min: svc,
        });
        currentTime = departure + buffer;
      }
      return schedule;
    };

    const zoneResults = [];

    for (const zone of zones) {
      if (zone_id && zone.id !== zone_id) continue;

      const zoneOSs = orders.filter(o => matchZone(o, zone));
      // Technician attends this zone if: specific zone_id matches, OR no specific zone but calendar matches the zone's calendar
      const zoneTechs = technicians.filter(t =>
        t.zone_id === zone.id ||
        (!t.zone_id && t.calendar_ids?.length && t.calendar_ids.includes(zone.calendar_id))
      );
      const activeDays = zone.active_days?.length ? zone.active_days : ["seg", "ter", "qua", "qui", "sex"];
      const defaultCapacity = zone.daily_capacity || 1;

      // Day overrides for this zone
      const zoneOverrides = {};
      for (const ov of dayOverrides) {
        if (ov.zone_id === zone.id) {
          zoneOverrides[ov.date] = ov.technician_count;
        }
      }

      const pinnedOSs = [];
      const fixedOSs = [];
      const flexibleOSs = [];
      const freeOSs = [];

      for (const os of zoneOSs) {
        const enriched = enrichOS(os);
        if (enriched.pinned_date) {
          pinnedOSs.push(enriched);
        } else if (enriched.scheduling_type === "Data Específica" && enriched.preferred_date) {
          fixedOSs.push(enriched);
        } else if (enriched.scheduling_type === "Flexível") {
          flexibleOSs.push(enriched);
        } else {
          freeOSs.push(enriched);
        }
      }

      // Sort free OSs oldest to newest (by created_date)
      freeOSs.sort((a, b) => (a.created_date || "").localeCompare(b.created_date || ""));

      const assignedIds = new Set();
      const dayPlans = [];

      for (const day of days) {
        const dow = dayNames[day.getDay()];
        if (!activeDays.includes(dow)) continue;

        const dateStr = day.toISOString().slice(0, 10);
        const capacity = zoneOverrides[dateStr] || defaultCapacity;
        const dayStops = [];

        // 0. Pinned OSs (manually fixed to this date — highest priority)
        for (const os of pinnedOSs) {
          if (assignedIds.has(os.os_id)) continue;
          if (os.pinned_date === dateStr) {
            dayStops.push(os);
            assignedIds.add(os.os_id);
          }
        }

        // 1. Fixed-date OSs (relationship)
        for (const os of fixedOSs) {
          if (assignedIds.has(os.os_id)) continue;
          if (os.preferred_date === dateStr) {
            dayStops.push(os);
            assignedIds.add(os.os_id);
          }
        }

        // 2. Flexible OSs in target week
        for (const os of flexibleOSs) {
          if (assignedIds.has(os.os_id)) continue;
          if (isInTargetWeek(day, os.week_start)) {
            dayStops.push(os);
            assignedIds.add(os.os_id);
          }
        }

        // 3. Free OSs — fill remaining time, prioritize proximity AND geographic compatibility
        const workMinutesPerTech = workEnd - workStart - lunchDur;
        const maxMinutesPerDay = workMinutesPerTech * capacity;
        let usedMinutes = dayStops.reduce((s, os) => s + getServiceDuration(os, zone) + buffer, 0);
        if (usedMinutes < maxMinutesPerDay) {
          const existingCities = new Set(dayStops.map(s => s.city));
          const existingCoords = dayStops.map(s => s.coords);
          // Group free OSs by city, prioritize matching existing stops AND same direction
          const freeByCity = {};
          for (const os of freeOSs) {
            if (assignedIds.has(os.os_id)) continue;
            const key = os.city || "outros";
            if (!freeByCity[key]) freeByCity[key] = [];
            freeByCity[key].push(os);
          }
          const sortedCities = Object.entries(freeByCity).sort((a, b) => {
            const aMatch = existingCities.has(a[0]) ? 1 : 0;
            const bMatch = existingCities.has(b[0]) ? 1 : 0;
            if (aMatch !== bMatch) return bMatch - aMatch;
            return 0;
          });
          for (const [, cityOSs] of sortedCities) {
            for (const os of cityOSs) {
              if (usedMinutes + getServiceDuration(os, zone) + buffer > maxMinutesPerDay) break;
              if (assignedIds.has(os.os_id)) continue;
              // Skip if geographically incompatible (opposite direction from all existing stops)
              if (!isGeoCompatible(os.coords, existingCoords, departureLat, departureLng)) continue;
              dayStops.push(os);
              usedMinutes += getServiceDuration(os, zone) + buffer;
              assignedIds.add(os.os_id);
              existingCoords.push(os.coords);
            }
          }
        }

        if (dayStops.length === 0) {
          const availableTechs = zoneTechs.filter(t =>
            !t.available_days?.length || t.available_days.includes(dow)
          ).map(t => ({ id: t.id, name: t.name, vehicle_type: t.vehicle_type || "Carro" }));
          dayPlans.push({
            date: dateStr,
            day_label: dayLabels[day.getDay()],
            capacity,
            technician_count: capacity,
            assigned_count: 0,
            available_techs: availableTechs,
            technician_routes: [],
            geographic_warning: null,
          });
          continue;
        }

        // Split into route groups (one per technician) by proximity
        // Simple: group by city, then distribute
        const routeGroups = [];
        if (capacity === 1) {
          routeGroups.push(dayStops);
        } else {
          // Sort by city/neighborhood and split into `capacity` groups
          const sorted = [...dayStops].sort((a, b) =>
            (a.city + a.neighborhood).localeCompare(b.city + b.neighborhood)
          );
          for (let t = 0; t < capacity; t++) routeGroups.push([]);
          sorted.forEach((os, i) => routeGroups[i % capacity].push(os));
        }

        // Geographic feasibility check — detect opposite-direction destinations
        const dayStopCoords = dayStops.map(s => s.coords);
        const geoCheck = checkGeographicFeasibility(dayStopCoords, departureLat, departureLng);
        const hasFixedDateStops = dayStops.some(s => s.pinned_date || (s.scheduling_type === "Data Específica" && s.preferred_date === dateStr));
        const geographic_warning = !geoCheck.feasible ? {
          feasible: false,
          max_angular_diff: geoCheck.max_angular_diff,
          max_pair_distance_km: geoCheck.max_pair_distance_km,
          opposite_pair_count: geoCheck.opposite_pairs.length,
          has_fixed_date_stops: hasFixedDateStops,
          message: geoCheck.max_angular_diff > 135
            ? `Rota com destinos opostos (dispersão angular ${geoCheck.max_angular_diff}°). Reorganize manualmente.`
            : `Rota muito dispersa (par mais distante ${geoCheck.max_pair_distance_km} km). Reorganize manualmente.`,
        } : null;

        const technicianRoutes = [];
        const availableTechs = zoneTechs.filter(t =>
          !t.available_days?.length || t.available_days.includes(dow)
        ).map(t => ({ id: t.id, name: t.name, vehicle_type: t.vehicle_type || "Carro" }));

        for (let g = 0; g < routeGroups.length; g++) {
          const groupStops = routeGroups[g];
          if (groupStops.length === 0) continue;

          // Optimize route via Google Maps
          let orderedStops = groupStops;
          let travelTimes = groupStops.map(() => 0);
          let routeInfo = null;
          let totalDistanceM = 0;

          let usedGoogleMaps = false;
          if (apiKey && departureOrigin) {
            const waypointStrs = groupStops.map(s => s.address_string).filter(Boolean);
            if (waypointStrs.length > 0) {
              const optimized = await getOptimizedRoute(departureOrigin, waypointStrs, apiKey);
              if (optimized) {
                orderedStops = optimized.order.map(idx => groupStops[idx]);
                travelTimes = (optimized.legs || []).map(l => l.duration_sec);
                totalDistanceM = (optimized.legs || []).reduce((s, l) => s + (l.distance_m || 0), 0);
                routeInfo = optimized;
                usedGoogleMaps = true;
              }
            }
          }

          // Fallback: sort by proximity + estimate travel times via Haversine (when Google Maps is unavailable or fails)
          if (!usedGoogleMaps) {
            orderedStops = [...groupStops].sort((a, b) =>
              (a.neighborhood + a.city).localeCompare(b.neighborhood + b.city)
            );
            travelTimes = buildEstimatedTravelTimes(orderedStops, departureLat, departureLng);
            const depCoords = (departureLat != null && departureLng != null) ? { lat: departureLat, lng: departureLng } : null;
            let estDistM = 0;
            for (let i = 0; i < orderedStops.length; i++) {
              const from = i === 0 ? depCoords : orderedStops[i - 1].coords;
              if (from && orderedStops[i].coords) {
                estDistM += haversineKm(from.lat, from.lng, orderedStops[i].coords.lat, orderedStops[i].coords.lng) * 1000;
              }
            }
            totalDistanceM = estDistM;
          }

          // Sort by period: Manhã first, then Dia Inteiro/null, then Tarde
          // Ensures morning stops are optimized together and afternoon stops come after lunch
          const hasTarde = orderedStops.some(s => s.appt_time_type === "Tarde");
          if (hasTarde) {
            const periodOrder = (tt: string | null) => tt === "Manhã" ? 0 : tt === "Tarde" ? 2 : 1;
            orderedStops = [...orderedStops].sort((a, b) => periodOrder(a.appt_time_type) - periodOrder(b.appt_time_type));
            travelTimes = buildEstimatedTravelTimes(orderedStops, departureLat, departureLng);
            let estDistM = 0;
            const depCoords = (departureLat != null && departureLng != null) ? { lat: departureLat, lng: departureLng } : null;
            for (let i = 0; i < orderedStops.length; i++) {
              const from = i === 0 ? depCoords : orderedStops[i - 1].coords;
              if (from && orderedStops[i].coords) {
                estDistM += haversineKm(from.lat, from.lng, orderedStops[i].coords!.lat, orderedStops[i].coords!.lng) * 1000;
              }
            }
            totalDistanceM = estDistM;
          }

          const suggestedTech = availableTechs[g] || null;
          const vehicleFactor = suggestedTech?.vehicle_type === "Moto" ? 0.75 : 1.0;
          const serviceTimes = orderedStops.map(os => getServiceDuration(os, zone));
          const schedule = computeSchedule(orderedStops, travelTimes, serviceTimes, vehicleFactor);

          technicianRoutes.push({
            tech_index: g,
            suggested_tech: suggestedTech,
            stops: schedule,
            total_travel_min: Math.round(travelTimes.reduce((s, t) => s + t, 0) / 60 * vehicleFactor),
            total_distance_km: Math.round(totalDistanceM / 1000 * 10) / 10,
            optimized: routeInfo != null,
            vehicle_type: suggestedTech?.vehicle_type || "Carro",
          });
        }

        dayPlans.push({
          date: dateStr,
          day_label: dayLabels[day.getDay()],
          capacity,
          technician_count: capacity,
          assigned_count: dayStops.length,
          available_techs: availableTechs,
          technician_routes: technicianRoutes,
          geographic_warning,
        });
      }

      // Alerts
      const alerts = [];
      // Geographic feasibility alerts
      for (const dp of dayPlans) {
        if (dp.geographic_warning) {
          const stopNames = (dp.technician_routes || []).flatMap(tr => tr.stops || []).map(s => `${s.os_code} (${s.city || "?"})`);
          alerts.push({
            type: "geographic_conflict",
            severity: "error",
            message: `${dp.day_label} ${dp.date}: ${dp.geographic_warning.message} Atendimentos: ${stopNames.join(", ")}`,
            os_ids: (dp.technician_routes || []).flatMap(tr => tr.stops || []).map(s => s.os_id),
            date: dp.date,
          });
        }
      }
      for (const os of pinnedOSs) {
        if (!assignedIds.has(os.os_id)) {
          alerts.push({
            type: "pinned_conflict",
            severity: "warning",
            message: `${os.os_code} — ${os.client_name} fixada para ${os.pinned_date} mas sem dia ativo. ${os.pinned_reason || ""}`.trim(),
            os_ids: [os.os_id]
          });
        }
      }
      for (const os of fixedOSs) {
        if (!assignedIds.has(os.os_id)) {
          alerts.push({
            type: "capacity_conflict",
            severity: "warning",
            message: `${os.os_code} — ${os.client_name} solicitou ${os.preferred_date} mas não há capacidade. Conversar com cliente sobre data alternativa.`,
            os_ids: [os.os_id]
          });
        }
      }
      // Consolidation alerts
      const groupDates = {};
      for (const dp of dayPlans) {
        for (const tr of dp.technician_routes || []) {
          for (const stop of tr.stops) {
            if (!groupDates[stop.proximity_group]) groupDates[stop.proximity_group] = new Set();
            groupDates[stop.proximity_group].add(dp.date);
          }
        }
      }
      for (const [group, dates] of Object.entries(groupDates)) {
        if (dates.size > 1) {
          alerts.push({
            type: "consolidation",
            severity: "info",
            message: `"${group}" tem atendimentos em ${dates.size} dias diferentes. Considere consolidar em menos dias para otimizar.`,
            os_ids: []
          });
        }
      }
      for (const os of flexibleOSs) {
        if (!assignedIds.has(os.os_id)) {
          alerts.push({
            type: "unassigned_flexible",
            severity: "warning",
            message: `${os.os_code} — ${os.client_name} (${os.city}) sem capacidade na semana preferida. Ampliar janela ou reagendar.`,
            os_ids: [os.os_id]
          });
        }
      }

      const unassigned = zoneOSs.filter(os => !assignedIds.has(os.id)).map(os => {
        const e = enrichOS(os);
        return {
          os_id: e.os_id, os_code: e.os_code, client_name: e.client_name,
          address: e.address, address_string: e.address_string,
          city: e.city, neighborhood: e.neighborhood,
          type: e.type, has_payment: e.has_payment, payment_amount: e.payment_amount,
          scheduling_type: e.scheduling_type, preferred_date: e.preferred_date,
          pinned_date: e.pinned_date,
          reason: e.pinned_date ? "Fixada mas sem dia ativo" : (e.scheduling_type === "Data Específica" ? "Sem capacidade na data solicitada" : "Sem capacidade na janela")
        };
      });

      zoneResults.push({
        zone_id: zone.id,
        zone_name: zone.name,
        region_name: zone.region_name || "",
        state: zone.state || "",
        color: zone.color || "blue",
        daily_capacity: defaultCapacity,
        active_days: activeDays,
        technician_count: zoneTechs.length,
        total_os: zoneOSs.length,
        assigned: [...assignedIds].length,
        days: dayPlans,
        alerts,
        unassigned
      });
    }

    const unzoned = orders.filter(o =>
      !zones.some(z => matchZone(o, z))
    ).map(os => {
      const e = enrichOS(os);
      return { ...e, reason: "Sem zona para esta cidade — cadastre a zona" };
    });

    return Response.json({
      test_mode: !!test_mode,
      has_google_maps: !!apiKey,
      has_departure: !!departureOrigin,
      debug: {
        total_orders_fetched: orders.length,
        total_zones: zones.length,
        total_technicians: technicians.length,
        zone_id_filter: zone_id || null,
      },
      config: {
        work_start: cfg.work_start_time || "08:00",
        work_end: cfg.work_end_time || "18:00",
        departure_address: departureStr || "",
        departure_lat: departureLat || null,
        departure_lng: departureLng || null,
      },
      zones: zoneResults,
      unzoned,
      planning_window: { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
      total_assigned: zoneResults.reduce((s, z) => s + z.assigned, 0),
      total_unassigned: zoneResults.reduce((s, z) => s + z.unassigned.length, 0) + unzoned.length,
      total_alerts: zoneResults.reduce((s, z) => s + z.alerts.length, 0),
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});