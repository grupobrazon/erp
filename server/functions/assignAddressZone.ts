// Gerado de base44/functions/assignAddressZone/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { haversineKm, geocodeAddress, buildZoneGeocodeAddress } from '../shared/zoneGeo.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // Any authenticated user can use this (seller needs it when filling the sale form)
    let user = null;
    try { user = await base44.auth.me(); } catch (e) {}
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const address = body?.address;
    if (!address || !address.city) {
      return Response.json({ error: "Endereço sem cidade — não é possível atribuir zona" }, { status: 400 });
    }

    // Load all zones and calendars
    const zones = await base44.asServiceRole.entities.RouteZone.list("-created_date", 500);
    const calendars = await base44.asServiceRole.entities.CalendarioRota.list("-created_date", 200);

    // Build lookups
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

    const city = (address.city || "").toLowerCase().trim();
    const cityMatches = zonesByCity[city] || [];
    let assignments: any[] = [];
    let notParametrized = false;

    if (cityMatches.length === 1) {
      // Single match → direct assignment
      const { zone, calendar } = cityMatches[0];
      assignments = [{
        zone_id: zone.id,
        zone_name: zone.name,
        calendar_id: calendar?.id || zone.calendar_id || "",
        calendar_name: calendar?.name || zone.calendar_name || "",
      }];
    } else if (cityMatches.length > 1) {
      // Multiple matches → geocode to find nearest
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      const geocodeAddr = buildZoneGeocodeAddress(address);
      const coords = await geocodeAddress(geocodeAddr, apiKey);

      if (coords) {
        let bestZone: any = null;
        let bestCalendar: any = null;
        let bestDist = Infinity;
        for (const { zone, calendar } of cityMatches) {
          if (zone.use_radius && zone.center_lat && zone.center_lng) {
            const dist = haversineKm(coords.lat, coords.lng, zone.center_lat, zone.center_lng);
            if (dist < bestDist) {
              bestDist = dist;
              bestZone = zone;
              bestCalendar = calendar;
            }
          }
        }
        if (bestZone) {
          assignments = [{
            zone_id: bestZone.id,
            zone_name: bestZone.name,
            calendar_id: bestCalendar?.id || bestZone.calendar_id || "",
            calendar_name: bestCalendar?.name || bestZone.calendar_name || "",
          }];
        }
      }

      // AI fallback by neighborhood if geocoding didn't find a zone
      if (assignments.length === 0 && address.neighborhood) {
        const neighborhood = address.neighborhood.trim();
        const calId = cityMatches[0]?.calendar?.id || cityMatches[0]?.zone?.calendar_id;
        if (calId) {
          const calZones = zonesByCalendar[calId] || [];
          const cal = calendars.find((c: any) => c.id === calId);
          const calCity = cal?.center_city || cal?.city || "";
          const calState = cal?.state || "";
          const zoneNames = calZones.map((z: any) => z.name);

          if (zoneNames.length > 0) {
            const prompt = `Você é um especialista em geografia urbana brasileira. Classifique o bairro na zona de atendimento correspondente.

Cidade/Região: ${calCity}${calState ? ` - ${calState}` : ""}

Bairro a classificar:
${neighborhood}

Zonas disponíveis:
${zoneNames.map((z, idx) => `${idx + 1}. ${z}`).join('\n')}

Regras:
- Classifique pelo nome do bairro e sua localização geográfica conhecida na cidade.
- Mesmo que o nome esteja em maiúsculas, abreviado ou com erro de digitação, identifique o bairro correto.
- Se o bairro não existir ou não se encaixar em nenhuma zona, use "SEM ZONA".

Retorne apenas o nome da zona (exatamente como escrito na lista de zonas) ou "SEM ZONA".`;

            try {
              const resultStr = await base44.asServiceRole.integrations.Core.InvokeLLM({
                prompt,
                model: "claude-sonnet-5"
              });
              const clean = String(resultStr).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
              const zoneName = clean.replace(/^["']|["']$/g, '').trim();
              if (zoneName && zoneName !== "SEM ZONA") {
                const zone = calZones.find((z: any) => z.name === zoneName);
                if (zone) {
                  assignments = [{
                    zone_id: zone.id,
                    zone_name: zone.name,
                    calendar_id: calId,
                    calendar_name: cal?.name || "",
                  }];
                }
              }
            } catch (e) {}
          }
        }
      }
    } else {
      // No zone match → check calendar
      const calendarMatch = calendarByCity[city];
      if (calendarMatch) {
        const calZones = zonesByCalendar[calendarMatch.id] || [];
        const hasRadiusZones = calZones.some((z: any) => z.use_radius && z.center_lat && z.center_lng);

        if (hasRadiusZones) {
          // Geocode to find nearest zone
          const apiKey = process.env.GOOGLE_MAPS_API_KEY;
          const geocodeAddr = buildZoneGeocodeAddress(address);
          const coords = await geocodeAddress(geocodeAddr, apiKey);

          if (coords) {
            let bestZone: any = null;
            let bestDist = Infinity;
            for (const z of calZones) {
              if (z.use_radius && z.center_lat && z.center_lng) {
                const dist = haversineKm(coords.lat, coords.lng, z.center_lat, z.center_lng);
                if (dist < bestDist) {
                  bestDist = dist;
                  bestZone = z;
                }
              }
            }
            if (bestZone) {
              assignments = [{
                zone_id: bestZone.id,
                zone_name: bestZone.name,
                calendar_id: calendarMatch.id,
                calendar_name: calendarMatch.name || "",
              }];
            }
          }
        } else {
          assignments = [{
            zone_id: "",
            zone_name: "",
            calendar_id: calendarMatch.id,
            calendar_name: calendarMatch.name || "",
          }];
        }
      } else {
        notParametrized = true;
      }
    }

    return Response.json({
      assignments,
      not_parametrized: notParametrized,
      needs_manual: assignments.length === 0,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}