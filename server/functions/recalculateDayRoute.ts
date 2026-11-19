// Gerado de base44/functions/recalculateDayRoute/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

const toMinutes = (hhmm) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const minutesToHHMM = (mins) => {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const formatAddress = (addr) => {
  if (!addr) return "";
  return [addr.street, addr.number, addr.neighborhood, addr.city, addr.state]
    .filter(Boolean).join(", ");
};

const buildAddressString = (addr) => {
  if (!addr) return "";
  return [addr.street, addr.number, addr.neighborhood, addr.city, addr.state]
    .filter(Boolean).join(", ");
};

// Static cache of major Brazilian city coordinates (no API call needed)
const brazilCityCoords = {
  "belo horizonte": { lat: -19.9167, lng: -43.9345 },
  "são paulo": { lat: -23.5505, lng: -46.6333 }, "sao paulo": { lat: -23.5505, lng: -46.6333 },
  "rio de janeiro": { lat: -22.9068, lng: -43.1729 },
  "brasília": { lat: -15.7939, lng: -47.8828 }, "brasilia": { lat: -15.7939, lng: -47.8828 },
  "salvador": { lat: -12.9714, lng: -38.5014 }, "fortaleza": { lat: -3.7319, lng: -38.5267 },
  "curitiba": { lat: -25.4284, lng: -49.2733 }, "porto alegre": { lat: -30.0346, lng: -51.2177 },
  "recife": { lat: -8.0476, lng: -34.8770 }, "belém": { lat: -1.4558, lng: -48.5039 }, "belem": { lat: -1.4558, lng: -48.5039 },
  "goiânia": { lat: -16.6869, lng: -49.2648 }, "goiania": { lat: -16.6869, lng: -49.2648 },
  "campinas": { lat: -22.9099, lng: -47.0626 }, "contagem": { lat: -19.9318, lng: -44.0544 },
  "manaus": { lat: -3.1190, lng: -60.0217 },
  "vitória": { lat: -20.3155, lng: -40.3128 }, "vitoria": { lat: -20.3155, lng: -40.3128 },
  "florianópolis": { lat: -27.5949, lng: -48.5482 }, "florianopolis": { lat: -27.5949, lng: -48.5482 },
  "natal": { lat: -5.7945, lng: -35.2110 }, "maceió": { lat: -9.6498, lng: -35.7089 }, "maceio": { lat: -9.6498, lng: -35.7089 },
  "aracaju": { lat: -10.9472, lng: -37.0731 }, "joão pessoa": { lat: -7.1195, lng: -34.8450 }, "joao pessoa": { lat: -7.1195, lng: -34.8450 },
  "teresina": { lat: -5.0892, lng: -42.8019 }, "são luís": { lat: -2.5300, lng: -44.3060 }, "sao luis": { lat: -2.5300, lng: -44.3060 },
  "cuiabá": { lat: -15.6014, lng: -56.0979 }, "cuiaba": { lat: -15.6014, lng: -56.0979 },
  "campo grande": { lat: -20.4697, lng: -54.6201 }, "porto velho": { lat: -8.7619, lng: -63.9039 },
  "rio branco": { lat: -9.9747, lng: -67.8107 }, "macapá": { lat: 0.0349, lng: -51.0694 }, "macapa": { lat: 0.0349, lng: -51.0694 },
  "boa vista": { lat: 2.8235, lng: -60.6758 }, "palmas": { lat: -10.1689, lng: -48.3317 },
  "betim": { lat: -19.9685, lng: -44.2053 }, "ribeirão das neves": { lat: -19.7660, lng: -44.0866 },
  "sabará": { lat: -19.8894, lng: -43.8931 }, "nova lima": { lat: -19.9825, lng: -43.8496 },
  "ibirité": { lat: -20.0263, lng: -44.0633 }, "ibirite": { lat: -20.0263, lng: -44.0633 },
  "santa luzia": { lat: -19.7723, lng: -43.8523 }, "pedro leopoldo": { lat: -19.6188, lng: -44.0500 },
  "vespasiano": { lat: -19.6956, lng: -43.9222 }, "lagoa santa": { lat: -19.6267, lng: -43.8872 },
  "guarulhos": { lat: -23.4543, lng: -46.5337 }, "osasco": { lat: -23.5325, lng: -46.7917 },
  "santo andré": { lat: -23.6616, lng: -46.5347 }, "sao andre": { lat: -23.6616, lng: -46.5347 },
  "são bernardo do campo": { lat: -23.6944, lng: -46.5653 }, "sao bernardo do campo": { lat: -23.6944, lng: -46.5653 },
  "diadema": { lat: -23.6864, lng: -46.6228 }, "jandira": { lat: -23.5264, lng: -46.9028 },
  "barueri": { lat: -23.5148, lng: -46.8822 }, "carapicuíba": { lat: -23.5364, lng: -46.8353 }, "carapicuiba": { lat: -23.5364, lng: -46.8353 },
  "itapevi": { lat: -23.5489, lng: -46.9358 }, "sumaré": { lat: -22.8233, lng: -47.2664 }, "sumare": { lat: -22.8233, lng: -47.2664 },
  "hortolândia": { lat: -22.8422, lng: -47.2397 }, "hortolandia": { lat: -22.8422, lng: -47.2397 },
  "paulínia": { lat: -22.7614, lng: -47.1542 }, "paulinia": { lat: -22.7614, lng: -47.1542 },
};

async function geocodeAddress(addressString, apiKey) {
  if (!addressString) return null;
  // Check ALL parts of the address against static cache
  const parts = addressString.split(",").map(p => p.trim().toLowerCase());
  for (const part of parts) {
    if (brazilCityCoords[part]) return brazilCityCoords[part];
  }
  // Try Google Maps Geocoding API
  if (apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressString)}&key=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === "OK" && data.results?.[0]) return data.results[0].geometry.location;
    } catch (e) {}
  }
  // Fallback: Nominatim (free OpenStreetMap geocoding)
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressString)}&format=json&limit=1&countrycodes=br`;
    const res = await fetch(url, { headers: { "User-Agent": "BrazonERP/1.0" } });
    const data = await res.json();
    if (data?.[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (e) {}
  return null;
}

// Haversine distance in km between two lat/lng points
function haversineKm(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Estimate travel time in seconds between two coordinate points (fallback when Google Maps Directions is unavailable)
const AVG_TRAVEL_SPEED_KMH = 40;
function estimateTravelSeconds(fromCoords, toCoords) {
  if (!fromCoords || !toCoords) return 0;
  const distKm = haversineKm(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng);
  if (distKm === Infinity) return 0;
  const minutes = Math.max(5, Math.round((distKm / AVG_TRAVEL_SPEED_KMH) * 60));
  return minutes * 60;
}

function buildEstimatedTravelTimes(orderedStops, depLat, depLng) {
  const depCoords = (depLat != null && depLng != null) ? { lat: depLat, lng: depLng } : null;
  return orderedStops.map((stop, i) => {
    const from = i === 0 ? depCoords : orderedStops[i - 1].coords;
    return estimateTravelSeconds(from, stop.coords);
  });
}

async function getOptimizedRoute(originStr, waypointStrings, apiKey, destinationStr) {
  if (!apiKey || waypointStrings.length === 0) return null;
  try {
    const dest = destinationStr || waypointStrings[0];
    const params = new URLSearchParams({ origin: originStr, destination: dest, key: apiKey });
    if (destinationStr) {
      if (waypointStrings.length > 0) params.set("waypoints", "optimize:true|" + waypointStrings.join("|"));
    } else {
      const middle = waypointStrings.slice(1);
      if (middle.length > 0) params.set("waypoints", "optimize:true|" + middle.join("|"));
    }
    const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === "OK" && data.routes?.[0]) {
      const route = data.routes[0];
      const waypointOrder = route.waypoint_order || [];
      const visitOrder = [];
      if (middle.length > 0) for (const idx of waypointOrder) visitOrder.push(idx + 1);
      visitOrder.push(0);
      const legs = (route.legs || []).map(l => ({ duration_sec: l.duration?.value || 0, distance_m: l.distance?.value || 0 }));
      const total_distance_m = (route.legs || []).reduce((s, l) => s + (l.distance?.value || 0), 0);
      return { order: visitOrder, legs, total_distance_m };
    }
  } catch (e) {}
  return null;
}

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch (e) { return Response.json({ error: 'Unauthorized' }, { status: 401 }); }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { os_ids, date, zone_id, technician_id } = body;
    if (!date) return Response.json({ error: 'date obrigatorio' }, { status: 400 });

    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");

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

    let departureLat = cfg.departure_lat;
    let departureLng = cfg.departure_lng;
    let departureStr = "";
    if (cfg.departure_street || cfg.departure_city) {
      departureStr = [cfg.departure_street, cfg.departure_number, cfg.departure_neighborhood, cfg.departure_city, cfg.departure_state].filter(Boolean).join(", ");
      if (departureStr && (!departureLat || !departureLng)) {
        const geo = await geocodeAddress(departureStr, apiKey);
        if (geo) {
          departureLat = geo.lat; departureLng = geo.lng;
          try { await base44.asServiceRole.entities.RouteConfig.update(cfg.id, { departure_lat: geo.lat, departure_lng: geo.lng }); } catch (e) {}
        }
      }
    }
    const departureOrigin = departureLat && departureLng ? `${departureLat},${departureLng}` : departureStr;

    let zone = null;
    if (zone_id) {
      const zones = await base44.asServiceRole.entities.RouteZone.list("-created_date", 200);
      zone = zones.find(z => z.id === zone_id);
    }

    const orders = [];
    for (const id of os_ids) {
      try { orders.push(await base44.asServiceRole.entities.ServiceOrder.get(id)); } catch (e) {}
    }

    // Fetch appointments by os_id to get the service duration informed when scheduling
    const apptsByOsId = {};
    if (os_ids.length > 0) {
      const appts = await base44.asServiceRole.entities.AgendamentoRota.filter(
        { os_id: { $in: os_ids }, status: { $ne: "Cancelado" } }, "-created_date", 200
      );
      for (const a of appts) { if (a.os_id) apptsByOsId[a.os_id] = a; }
    }

    const saleIds = [...new Set(orders.map(o => o.sale_id).filter(Boolean))];
    const saleMap = {};
    for (const sid of saleIds) { try { saleMap[sid] = await base44.asServiceRole.entities.Sale.get(sid); } catch (e) {} }

    const technicians = zone_id ? (await base44.asServiceRole.entities.Technician.list("-created_date", 200)).filter(t =>
      t.zone_id === zone_id ||
      (!t.zone_id && t.calendar_ids?.length && t.calendar_ids.includes(zone?.calendar_id))
    ) : [];

    // Technician home address as route destination (end of day)
    let destinationStr = null;
    let suggestedTech = null;
    if (technician_id) {
      try { suggestedTech = await base44.asServiceRole.entities.Technician.get(technician_id); } catch (e) {}
    } else if (technicians.length > 0) {
      suggestedTech = technicians[0];
    }
    if (suggestedTech?.home_street || suggestedTech?.home_city) {
      destinationStr = [suggestedTech.home_street, suggestedTech.home_number, suggestedTech.home_neighborhood, suggestedTech.home_city, suggestedTech.home_state]
        .filter(Boolean).join(", ");
      if (!suggestedTech.home_lat || !suggestedTech.home_lng) {
        const geo = await geocodeAddress(destinationStr, apiKey);
        if (geo) {
          try { await base44.asServiceRole.entities.Technician.update(suggestedTech.id, { home_lat: geo.lat, home_lng: geo.lng }); } catch (e) {}
        }
      }
    }

    // Geocode unique delivery cities for travel estimation (fallback when Google Maps Directions is unavailable)
    const cityGeoCache = {};
    const uniqueCities = [...new Set(orders.map(o => o.delivery_address?.city).filter(Boolean).map(c => c.toLowerCase()))];
    for (const city of uniqueCities) {
      const sample = orders.find(o => o.delivery_address?.city?.toLowerCase() === city);
      const state = sample?.delivery_address?.state;
      const cityStr = [city, state, "Brasil"].filter(Boolean).join(", ");
      cityGeoCache[city] = await geocodeAddress(cityStr, apiKey);
    }

    const enrichedStops = orders.map(os => {
      const sale = os.sale_id ? saleMap[os.sale_id] : null;
      const appt = apptsByOsId[os.id];
      const apptDuration = appt?.duration_minutes > 0 ? appt.duration_minutes : 0;
      const isInstalacao = os.type === "Entrega + Instalação";
      const isManutencao = os.type === "Manutenção";
      const svcDuration = apptDuration || (isManutencao
        ? (zone?.service_duration_manutencao_override || svcManutencao)
        : (isInstalacao ? (zone?.service_duration_instalacao_override || svcInstalacao) : (zone?.service_duration_entrega_override || svcEntrega)));
      return {
        os_id: os.id, os_code: os.code, client_name: os.client_name,
        address: formatAddress(os.delivery_address), address_string: buildAddressString(os.delivery_address),
        city: os.delivery_address?.city || "", neighborhood: os.delivery_address?.neighborhood || "",
        type: os.type, has_payment: os.has_pending_payment, payment_amount: os.pending_payment_amount || 0,
        scheduling_type: sale?.cr_scheduling_type || "none", preferred_date: sale?.cr_preferred_date || null,
        period: sale?.cr_period || null, cr_notes: sale?.cr_notes || "",
        pinned_date: os.pinned_date || null, pinned_reason: os.pinned_reason || null,
        service_duration_min: svcDuration,
        coords: cityGeoCache[os.delivery_address?.city?.toLowerCase()] || null,
      };
    });

    let orderedStops = enrichedStops;
    let travelTimes = enrichedStops.map(() => 0);
    let totalDistanceM = 0;
    let optimized = false;

    if (apiKey && departureOrigin) {
      const waypointStrs = enrichedStops.map(s => s.address_string).filter(Boolean);
      if (waypointStrs.length > 0) {
        const result = await getOptimizedRoute(departureOrigin, waypointStrs, apiKey, destinationStr);
        if (result) {
          orderedStops = result.order.map(idx => enrichedStops[idx]);
          travelTimes = (result.legs || []).map(l => l.duration_sec);
          totalDistanceM = result.total_distance_m || 0;
          optimized = true;
        }
      }
    }

    // Fallback: sort by proximity + estimate travel times via Haversine (when Google Maps is unavailable or fails)
    if (!optimized) {
      orderedStops = [...enrichedStops].sort((a, b) => (a.neighborhood + a.city).localeCompare(b.neighborhood + b.city));
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

    const vehicleFactor = suggestedTech?.vehicle_type === "Moto" ? 0.75 : 1.0;

    const schedule = [];
    let currentTime = workStart + preparation;
    for (let i = 0; i < orderedStops.length; i++) {
      const rawTravel = travelTimes[i] || 0;
      const travel = rawTravel * vehicleFactor;
      const svc = orderedStops[i].service_duration_min;
      const arrival = currentTime + Math.round(travel / 60);
      let serviceStart = arrival;
      if (serviceStart < lunchStart + lunchDur && serviceStart + svc > lunchStart) serviceStart = lunchStart + lunchDur;
      const departure = serviceStart + svc;
      const period = serviceStart < lunchStart ? "Manhã" : "Tarde";
      schedule.push({
        ...orderedStops[i], slot_index: i + 1, period,
        arrival_time: minutesToHHMM(arrival), service_time: minutesToHHMM(serviceStart),
        departure_time: minutesToHHMM(departure), travel_from_prev_min: Math.round(travel / 60),
      });
      currentTime = departure + buffer;
    }

    return Response.json({
      date, stops: schedule,
      total_travel_min: Math.round(travelTimes.reduce((s, t) => s + t, 0) / 60 * vehicleFactor),
      total_distance_km: Math.round(totalDistanceM / 1000 * 10) / 10,
      optimized, vehicle_type: suggestedTech?.vehicle_type || "Carro",
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});