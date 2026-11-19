// Gerado de base44/functions/getRouteMapData/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

export default async function handler(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { route_id } = body;

    if (!route_id) return Response.json({ error: 'route_id é obrigatório' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const route = await base44.asServiceRole.entities.TechnicianRoute.get(route_id);
    if (!route) return Response.json({ error: 'Rota não encontrada' }, { status: 404 });

    const API_KEY = process.env.GOOGLE_MAPS_API_KEY; // Optional now — only used for legacy embed_url

    // Build point list: departure → stops (sorted by order) → arrival
    const points: any[] = [];
    if (route.departure_lat != null && route.departure_lng != null) {
      points.push({ lat: route.departure_lat, lng: route.departure_lng, type: 'departure', label: 'Empresa (Partida)' });
    }
    const sortedStops = [...(route.stops || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    for (const stop of sortedStops) {
      if (stop.lat != null && stop.lng != null) {
        points.push({
          lat: stop.lat, lng: stop.lng, type: 'stop',
          order: stop.order,
          label: `${stop.order || ''} — ${stop.client_name || stop.os_code || ''}`.trim(),
          os_code: stop.os_code,
          client_name: stop.client_name,
          address: stop.address,
          arrival_time: stop.arrival_time,
          service_type: stop.service_type,
        });
      }
    }
    if (route.arrival_lat != null && route.arrival_lng != null) {
      points.push({
        lat: route.arrival_lat, lng: route.arrival_lng, type: 'arrival',
        label: route.end_point_type === 'empresa' ? 'Empresa (Chegada)' : 'Casa do Técnico',
      });
    }

    if (points.length < 2) {
      return Response.json({ error: 'Rota sem coordenadas suficientes para exibir o mapa' }, { status: 400 });
    }

    const origin = `${points[0].lat},${points[0].lng}`;
    const lastPoint = points[points.length - 1];
    const destination = `${lastPoint.lat},${lastPoint.lng}`;
    const middlePoints = points.slice(1, -1);

    // --- Navigation URL (Google Maps, no API key needed, max 10 waypoints) ---
    const navWaypoints = middlePoints.slice(0, 10).map((p: any) => `${p.lat},${p.lng}`).join('|');
    const navigationUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${navWaypoints ? `&waypoints=${navWaypoints}` : ''}&travelmode=driving`;

    // --- Embed URL (legacy Google Maps Embed API — kept for compatibility, not used by frontend) ---
    const embedWaypoints = middlePoints.slice(0, 9).map((p: any) => `${p.lat},${p.lng}`).join('|');
    let embedUrl = API_KEY
      ? `https://www.google.com/maps/embed/v1/directions?key=${API_KEY}&origin=${origin}&destination=${destination}${embedWaypoints ? `&waypoints=${embedWaypoints}` : ''}&mode=driving`
      : '';

    // --- Static Map URL (OpenStreetMap static — no API key required) ---
    // Uses the OSM static map service with markers for all points.
    // Compute a bounding box to center the map on all points.
    const lats = points.map((p: any) => p.lat);
    const lngs = points.map((p: any) => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    // Build markers for the static map (limit to 26)
    const markerLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const staticMarkers: string[] = [];
    for (let i = 0; i < points.length && i < 26; i++) {
      let label: string;
      if (i === 0) label = 'E';
      else if (i === points.length - 1 && points[i].type === 'arrival') label = route.end_point_type === 'empresa' ? 'E' : 'C';
      else label = markerLabels[(i - 1) % 26] || String(i);
      staticMarkers.push(`${points[i].lat},${points[i].lng},red-pushpin`);
    }

    // Use staticmap.openstreetmap.de (free, no API key)
    const staticMapUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${centerLat.toFixed(5)},${centerLng.toFixed(5)}&zoom=11&size=800x600&maptype=mapnik&markers=${staticMarkers.join('|')}`;

    return Response.json({
      embed_url: embedUrl,
      static_map_url: staticMapUrl,
      navigation_url: navigationUrl,
      points,
      total_points: points.length,
      truncated_embed: middlePoints.length > 9,
      truncated_nav: middlePoints.length > 10,
    });
  } catch (err) {
    return Response.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
}
