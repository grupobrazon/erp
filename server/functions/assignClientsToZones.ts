// Gerado de base44/functions/assignClientsToZones/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

// Haversine distance in km between two coordinates
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Geocode an address — tries Google Maps first, then Nominatim (free OpenStreetMap fallback)
async function geocodeAddress(address: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  if (!address) return null;
  if (apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&language=pt-BR&region=br&key=${apiKey}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          const loc = data.results[0].geometry.location;
          return { lat: loc.lat, lng: loc.lng };
        }
      }
    } catch (e) {}
  }
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=br`;
    const resp = await fetch(url, { headers: { "User-Agent": "BrazonERP/1.0" } });
    if (resp.ok) {
      const data = await resp.json();
      if (data && data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) {}
  return null;
}

// Build geocoding address and cache key from client data
function buildGeocodeAddress(client: any): { address: string; cacheKey: string } {
  const neighborhood = (client.neighborhood || "").trim();
  const street = (client.street || "").trim();
  const city = (client.city || "").trim();
  const state = (client.state || "").trim();

  if (neighborhood) {
    const address = [neighborhood, city, state, "Brasil"].filter(Boolean).join(", ");
    const cacheKey = `${neighborhood.toLowerCase()}|${city.toLowerCase()}|${state.toLowerCase()}`;
    return { address, cacheKey };
  }
  const address = [street, city, state, "Brasil"].filter(Boolean).join(", ");
  const cacheKey = `${street.toLowerCase()}|${city.toLowerCase()}|${state.toLowerCase()}`;
  return { address, cacheKey };
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body?.dry_run;
    const clientId = body?.client_id || null;

    // Auth: o recálculo de UM cliente (botão "Recalcular Zona" no cadastro do cliente)
    // é liberado para qualquer usuário autenticado. A varredura em massa da base
    // (sem client_id) continua restrita a administradores. Contexto de workflow
    // (sem usuário) também é permitido.
    let user = null;
    try { user = await base44.auth.me(); } catch (e) {}
    if (user && user.role !== "admin" && !clientId) {
      return Response.json({ error: "Apenas administradores" }, { status: 403 });
    }
    const onlyUnassigned = !!body?.only_unassigned;
    const filterCalendarId = body?.calendar_id || null;
    // Optional: scan only clients whose city matches one of these (used by the
    // zone-creation workflow to avoid a full timed-out scan). Case-insensitive
    // via case-variant $in (the DB filter is exact-match).
    const filterCities: string[] = Array.isArray(body?.cities)
      ? body.cities.map((c: any) => String(c).trim()).filter(Boolean)
      : [];

    // Load all zones and calendars
    const zones = await base44.asServiceRole.entities.RouteZone.list("-created_date", 500);
    const calendars = await base44.asServiceRole.entities.CalendarioRota.list("-created_date", 200);

    // Build lookups: city → [zones], calendar → zones, city → calendar
    const zonesByCity: Record<string, { zone: any; calendar: any }[]> = {};
    const zonesByCalendar: Record<string, any[]> = {};
    const calendarByCity: Record<string, any> = {};

    for (const z of zones) {
      const cal = calendars.find((c: any) => c.id === z.calendar_id);
      for (const c of (z.cities || [])) {
        const key = String(c).toLowerCase().trim();
        if (key) {
          if (!zonesByCity[key]) zonesByCity[key] = [];
          zonesByCity[key].push({ zone: z, calendar: cal });
        }
      }
      if (z.calendar_id) {
        if (!zonesByCalendar[z.calendar_id]) zonesByCalendar[z.calendar_id] = [];
        zonesByCalendar[z.calendar_id].push(z);
      }
    }

    for (const cal of calendars) {
      for (const c of (cal.coverage_cities || [])) {
        const key = String(c).toLowerCase().trim();
        if (key && !calendarByCity[key]) calendarByCity[key] = cal;
      }
      if (cal.center_city) {
        const key = cal.center_city.toLowerCase().trim();
        if (key && !calendarByCity[key]) calendarByCity[key] = cal;
      }
      if (cal.city) {
        const key = cal.city.toLowerCase().trim();
        if (key && !calendarByCity[key]) calendarByCity[key] = cal;
      }
    }

    // Load clients
    let allClients: any[] = [];
    if (clientId) {
      const client = await base44.asServiceRole.entities.Client.get(clientId);
      if (client) allClients = [client];
    } else if (filterCities.length > 0) {
      // Scan only clients whose city matches one of the provided cities.
      // The DB filter is exact-match, so include case variants to be safe.
      const variants = new Set<string>();
      for (const c of filterCities) {
        variants.add(c);
        variants.add(c.toUpperCase());
        variants.add(c.toLowerCase());
        variants.add(c.charAt(0).toUpperCase() + c.slice(1).toLowerCase());
      }
      const cityList = Array.from(variants);
      let lastDate: string | null = null;
      while (true) {
        const query = lastDate
          ? { $and: [{ city: { $in: cityList } }, { created_date: { $lt: lastDate } }] }
          : { city: { $in: cityList } };
        const batch = await base44.asServiceRole.entities.Client.filter(query, "-created_date", 1000);
        if (!batch || batch.length === 0) break;
        allClients = allClients.concat(batch);
        lastDate = batch[batch.length - 1].created_date;
        if (batch.length < 1000) break;
      }
    } else if (filterCalendarId) {
      let lastDate: string | null = null;
      while (true) {
        const query = lastDate
          ? { $and: [{ route_calendar_id: filterCalendarId }, { created_date: { $lt: lastDate } }] }
          : { route_calendar_id: filterCalendarId };
        const batch = await base44.asServiceRole.entities.Client.filter(query, "-created_date", 1000);
        if (!batch || batch.length === 0) break;
        allClients = allClients.concat(batch);
        lastDate = batch[batch.length - 1].created_date;
        if (batch.length < 1000) break;
      }
    } else if (onlyUnassigned) {
      let lastDate: string | null = null;
      while (true) {
        const query = lastDate
          ? { $and: [{ route_zone_id: "" }, { created_date: { $lt: lastDate } }] }
          : { route_zone_id: "" };
        const batch = await base44.asServiceRole.entities.Client.filter(query, "-created_date", 1000);
        if (!batch || batch.length === 0) break;
        allClients = allClients.concat(batch);
        lastDate = batch[batch.length - 1].created_date;
        if (batch.length < 1000) break;
      }
    } else {
      let lastDate: string | null = null;
      while (true) {
        const query = lastDate ? { created_date: { $lt: lastDate } } : {};
        const batch = await base44.asServiceRole.entities.Client.filter(query, "-created_date", 1000);
        if (!batch || batch.length === 0) break;
        allClients = allClients.concat(batch);
        lastDate = batch[batch.length - 1].created_date;
        if (batch.length < 1000) break;
      }
    }

    // First pass: match by city
    // - Single match → direct assignment (MET zones with unique city)
    // - Multiple matches → needsGeocoding (BH: all 9 zones share "Belo Horizonte")
    // - No zone match but calendar match → needsGeocoding (find nearest in calendar)
    // - No match at all → NÃO PARAMETRIZADA
    interface ClientResult {
      client: any;
      assignments: any[];
      needsGeocoding: boolean;
      candidateZones: { zone: any; calendar: any }[];
      notParametrized: boolean;
    }
    const clientResults: ClientResult[] = [];

    for (const client of allClients) {
      const city = (client.city || "").toLowerCase().trim();

      if (!city) {
        clientResults.push({ client, assignments: [], needsGeocoding: false, candidateZones: [], notParametrized: true });
        continue;
      }

      const cityMatches = zonesByCity[city] || [];

      if (cityMatches.length === 1) {
        // Single match → direct assignment
        const { zone, calendar } = cityMatches[0];
        clientResults.push({
          client,
          assignments: [{
            zone_id: zone.id,
            zone_name: zone.name,
            calendar_id: calendar?.id || zone.calendar_id || "",
            calendar_name: calendar?.name || zone.calendar_name || "",
          }],
          needsGeocoding: false,
          candidateZones: [],
          notParametrized: false,
        });
      } else if (cityMatches.length > 1) {
        // Multiple matches → geocode to find nearest
        clientResults.push({
          client,
          assignments: [],
          needsGeocoding: true,
          candidateZones: cityMatches,
          notParametrized: false,
        });
      } else {
        // No zone match → check calendar
        const calendarMatch = calendarByCity[city];
        if (calendarMatch) {
          const calZones = zonesByCalendar[calendarMatch.id] || [];
          const hasRadiusZones = calZones.some((z: any) => z.use_radius && z.center_lat && z.center_lng);
          clientResults.push({
            client,
            assignments: hasRadiusZones ? [] : [{
              zone_id: "",
              zone_name: "",
              calendar_id: calendarMatch.id,
              calendar_name: calendarMatch.name || "",
            }],
            needsGeocoding: hasRadiusZones,
            candidateZones: calZones.map((z: any) => ({ zone: z, calendar: calendarMatch })),
            notParametrized: false,
          });
        } else {
          // No match at all → NÃO PARAMETRIZADA
          clientResults.push({
            client,
            assignments: [],
            needsGeocoding: false,
            candidateZones: [],
            notParametrized: true,
          });
        }
      }
    }

    // Geocoding pass: geocode unique addresses, then find nearest zone among candidates
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const geocodeCache: Map<string, { lat: number; lng: number } | null> = new Map();
    let geocodedCount = 0;

    // Collect unique cache keys from clients needing geocoding
    const keysToGeocode: Map<string, string> = new Map();
    for (const cr of clientResults) {
      if (!cr.needsGeocoding) continue;
      // Only geocode if candidates have radius zones with coordinates
      if (!cr.candidateZones.some((c: any) => c.zone.use_radius && c.zone.center_lat && c.zone.center_lng)) continue;
      const { address, cacheKey } = buildGeocodeAddress(cr.client);
      if (!keysToGeocode.has(cacheKey)) {
        keysToGeocode.set(cacheKey, address);
      }
    }

    // Geocode unique addresses sequentially (Nominatim requires 1 req/s)
    const keysArray = Array.from(keysToGeocode.entries());
    const maxGeocodeCalls = clientId ? 1 : 50;
    const geocodeBatch = keysArray.slice(0, maxGeocodeCalls);

    for (const [key, address] of geocodeBatch) {
      const coords = await geocodeAddress(address, apiKey);
      geocodeCache.set(key, coords);
      if (!apiKey) await new Promise(r => setTimeout(r, 1000));
    }

    // Assign zones based on geocoded coordinates — nearest zone among candidates
    for (const cr of clientResults) {
      if (!cr.needsGeocoding) continue;
      if (!cr.candidateZones.some((c: any) => c.zone.use_radius && c.zone.center_lat && c.zone.center_lng)) continue;

      const { cacheKey } = buildGeocodeAddress(cr.client);
      const coords = geocodeCache.get(cacheKey);
      if (!coords) continue;

      let bestZone: any = null;
      let bestCalendar: any = null;
      let bestDist = Infinity;
      for (const { zone, calendar } of cr.candidateZones) {
        if (!zone.use_radius || !zone.center_lat || !zone.center_lng) continue;
        const dist = haversineKm(coords.lat, coords.lng, zone.center_lat, zone.center_lng);
        if (dist < bestDist) {
          bestDist = dist;
          bestZone = zone;
          bestCalendar = calendar;
        }
      }
      if (bestZone) {
        cr.assignments = [{
          zone_id: bestZone.id,
          zone_name: bestZone.name,
          calendar_id: bestCalendar?.id || bestZone.calendar_id || "",
          calendar_name: bestCalendar?.name || bestZone.calendar_name || "",
        }];
        cr.needsGeocoding = false;
        geocodedCount++;
      }
    }

    // AI classification fallback: for clients still needing geocoding (geocoding failed)
    const pendingByCalendar: Map<string, { zones: any[]; neighborhoods: Set<string> }> = new Map();
    for (const cr of clientResults) {
      if (!cr.needsGeocoding) continue;
      const neighborhood = (cr.client.neighborhood || "").trim();
      if (!neighborhood) continue;
      const calId = cr.candidateZones[0]?.calendar?.id || cr.candidateZones[0]?.zone?.calendar_id;
      if (!calId) continue;
      if (!pendingByCalendar.has(calId)) {
        pendingByCalendar.set(calId, { zones: zonesByCalendar[calId] || [], neighborhoods: new Set() });
      }
      pendingByCalendar.get(calId).neighborhoods.add(neighborhood);
    }

    const aiZoneByNeighborhood: Map<string, string> = new Map();

    for (const [calId, data] of pendingByCalendar) {
      if (!data.zones.length) continue;
      const cal = calendars.find((c: any) => c.id === calId);
      const calCity = cal?.center_city || cal?.city || "";
      const calState = cal?.state || "";
      const zoneNames = data.zones.map((z: any) => z.name);
      const neighborhoods = Array.from(data.neighborhoods);

      for (let i = 0; i < neighborhoods.length; i += 100) {
        const batch = neighborhoods.slice(i, i + 100);
        const prompt = `Você é um especialista em geografia urbana brasileira. Classifique cada bairro na zona de atendimento correspondente.

Cidade/Região: ${calCity}${calState ? ` - ${calState}` : ""}

Bairros a classificar:
${batch.map((n, idx) => `${idx + 1}. ${n}`).join('\n')}

Zonas disponíveis:
${zoneNames.map((z, idx) => `${idx + 1}. ${z}`).join('\n')}

Regras:
- Classifique pelo nome do bairro e sua localização geográfica conhecida na cidade.
- Mesmo que o nome esteja em maiúsculas, abreviado ou com erro de digitação, identifique o bairro correto.
- Se o bairro não existir ou não se encaixar em nenhuma zona, use "SEM ZONA".

Retorne um JSON onde:
- A chave é o bairro EXATAMENTE como escrito na lista acima (incluindo maiúsculas/acentos)
- O valor é o nome da zona correspondente (exatamente como escrito na lista de zonas) ou "SEM ZONA"`;

        try {
          const resultStr = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt,
            model: "claude-sonnet-5"
          });
          const clean = String(resultStr).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const result = JSON.parse(clean);
          for (const [neighborhood, zoneName] of Object.entries(result)) {
            if (zoneName && zoneName !== "SEM ZONA") {
              const zone = data.zones.find((z: any) => z.name === zoneName);
              if (zone) {
                aiZoneByNeighborhood.set(`${neighborhood.toLowerCase().trim()}|${calId}`, zone.id);
              }
            }
          }
        } catch (e) {}
      }
    }

    // Apply AI classifications
    for (const cr of clientResults) {
      if (!cr.needsGeocoding) continue;
      const neighborhoodKey = (cr.client.neighborhood || "").toLowerCase().trim();
      if (!neighborhoodKey) continue;
      const calId = cr.candidateZones[0]?.calendar?.id || cr.candidateZones[0]?.zone?.calendar_id;
      if (!calId) continue;
      const zoneId = aiZoneByNeighborhood.get(`${neighborhoodKey}|${calId}`);
      if (zoneId) {
        const zone = zones.find((z: any) => z.id === zoneId);
        const cal = calendars.find((c: any) => c.id === calId);
        if (zone) {
          cr.assignments = [{
            zone_id: zone.id,
            zone_name: zone.name,
            calendar_id: calId,
            calendar_name: cal?.name || "",
          }];
          cr.needsGeocoding = false;
        }
      }
    }

    // Build stats and updates
    const stats = {
      total: allClients.length,
      withZone: 0,
      withCalendarOnly: 0,
      notParametrized: 0,
      noCity: 0,
      geocoded: geocodedCount,
      aiClassified: 0,
    };
    const updates: any[] = [];

    for (const cr of clientResults) {
      const client = cr.client;

      // NÃO PARAMETRIZADA: no city, no match, or geocoding/AI both failed
      if (cr.notParametrized || cr.assignments.length === 0) {
        stats.notParametrized++;
        if (!client.city) stats.noCity++;
        if (!dryRun) {
          updates.push({
            id: client.id,
            route_assignments: [],
            route_zone_id: "",
            route_zone_name: "NÃO PARAMETRIZADA",
            route_calendar_id: "",
            route_calendar_name: "",
          });
        }
        continue;
      }

      const primary = cr.assignments[0];
      if (primary.zone_id) {
        stats.withZone++;
      } else {
        stats.withCalendarOnly++;
      }

      if (!dryRun) {
        updates.push({
          id: client.id,
          route_assignments: cr.assignments,
          route_zone_id: primary.zone_id || "",
          route_zone_name: primary.zone_name || "",
          route_calendar_id: primary.calendar_id || "",
          route_calendar_name: primary.calendar_name || "",
        });
      }
    }

    // Bulk update in batches of 500
    if (!dryRun && updates.length > 0) {
      for (let i = 0; i < updates.length; i += 500) {
        const batch = updates.slice(i, i + 500);
        await base44.asServiceRole.entities.Client.bulkUpdate(batch);
      }
    }

    return Response.json({
      dry_run: dryRun,
      client_id: clientId,
      stats,
      updates_count: updates.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}