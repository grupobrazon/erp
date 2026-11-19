// Cópia de base44/shared/routeUtils.ts gerada por tools/port_function.py.
// Shared geocoding and route optimization utilities.
// Used by generateSmartRoutes and generateTechnicianRoute backend functions.

export const brazilCityCoords = {
  "belo horizonte": { lat: -19.9167, lng: -43.9345 },
  "são paulo": { lat: -23.5505, lng: -46.6333 }, "sao paulo": { lat: -23.5505, lng: -46.6333 },
  "rio de janeiro": { lat: -22.9068, lng: -43.1729 },
  "brasília": { lat: -15.7939, lng: -47.8828 }, "brasilia": { lat: -15.7939, lng: -47.8828 },
  "contagem": { lat: -19.9318, lng: -44.0544 },
  "betim": { lat: -19.9685, lng: -44.2053 },
  "ribeirão das neves": { lat: -19.7660, lng: -44.0866 },
  "sabará": { lat: -19.8894, lng: -43.8931 }, "sabara": { lat: -19.8894, lng: -43.8931 },
  "nova lima": { lat: -19.9825, lng: -43.8496 },
  "ibirité": { lat: -20.0263, lng: -44.0633 }, "ibirite": { lat: -20.0263, lng: -44.0633 },
  "santa luzia": { lat: -19.7723, lng: -43.8523 },
  "pedro leopoldo": { lat: -19.6188, lng: -44.0500 },
  "vespasiano": { lat: -19.6956, lng: -43.9222 },
  "lagoa santa": { lat: -19.6267, lng: -43.8872 },
  "confins": { lat: -19.5228, lng: -43.9764 },
  "itaúna": { lat: -20.0477, lng: -44.3547 }, "itauna": { lat: -20.0477, lng: -44.3547 },
  "matozinhos": { lat: -19.5556, lng: -44.0056 },
  "itabirito": { lat: -20.2439, lng: -43.8133 },
  "ouro branco": { lat: -20.5261, lng: -43.6944 },
  "guarulhos": { lat: -23.4543, lng: -46.5337 },
  "osasco": { lat: -23.5325, lng: -46.7917 },
  "santo andré": { lat: -23.6616, lng: -46.5347 }, "sao andre": { lat: -23.6616, lng: -46.5347 },
  "são bernardo do campo": { lat: -23.6944, lng: -46.5653 }, "sao bernardo do campo": { lat: -23.6944, lng: -46.5653 },
  "diadema": { lat: -23.6864, lng: -46.6228 },
  "barueri": { lat: -23.5148, lng: -46.8822 },
  "campinas": { lat: -22.9099, lng: -47.0626 },
  "curitiba": { lat: -25.4284, lng: -49.2733 },
  "porto alegre": { lat: -30.0346, lng: -51.2177 },
};

export const toMinutes = (hhmm) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const minutesToHHMM = (mins) => {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export const formatAddress = (addr) => {
  if (!addr) return "";
  const parts = [addr.street, addr.number];
  if (addr.complement) parts.push(addr.complement);
  parts.push(addr.neighborhood, addr.city, addr.state);
  return parts.filter(Boolean).join(", ");
};

export const haversineKm = (lat1, lng1, lat2, lng2) => {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Geocode an address — tries Google Maps first (precise), then Nominatim (free, precise),
// then static city-center cache as last-resort fallback (imprecise — city center only).
// The static cache matches ONLY the city field (second-to-last part of "street, num, bairro, city, state")
// to avoid matching street names that happen to coincide with city names.
export async function geocodeAddress(addressString, apiKey) {
  if (!addressString) return null;
  // 1. Google Maps Geocoding API — most precise
  if (apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressString)}&key=${apiKey}&region=br`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === "OK" && data.results?.[0]) return data.results[0].geometry.location;
    } catch (e) {}
  }
  // 2. Nominatim (OpenStreetMap) — free, good precision for Brazilian addresses
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressString)}&format=json&limit=1&countrycodes=br`;
    const res = await fetch(url, { headers: { "User-Agent": "BrazonERP/1.0" } });
    const data = await res.json();
    if (data?.[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (e) {}
  // 3. Static city-center cache — last resort. Match ONLY the city field to avoid
  // matching street names that coincide with city names (e.g. "Rua Belo Horizonte" in São Paulo).
  const parts = addressString.split(",").map(p => p.trim().toLowerCase());
  // Address format: "street, number, [complement,] neighborhood, city, state"
  // City is typically the second-to-last part.
  const cityPart = parts.length >= 2 ? parts[parts.length - 2] : "";
  if (cityPart && brazilCityCoords[cityPart]) return brazilCityCoords[cityPart];
  // Fallback: check last part (might be just "city, state" without street)
  const lastPart = parts[parts.length - 1] || "";
  if (brazilCityCoords[lastPart]) return brazilCityCoords[lastPart];
  return null;
}

// Estimate travel time in seconds between two coordinate points (fallback when Google Maps is unavailable)
export function estimateTravelSeconds(fromCoords, toCoords, avgSpeedKmh = 40) {
  if (!fromCoords || !toCoords) return 0;
  const distKm = haversineKm(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng);
  if (distKm === Infinity) return 0;
  const minutes = Math.max(5, Math.round((distKm / avgSpeedKmh) * 60));
  return minutes * 60;
}

// Get route following the given waypoint order (NO optimization — stops visited in sequence)
// Returns { order: [0,1,2,...], legs: [{duration_sec, distance_m}] }
export async function getRouteInOrder(originStr, waypointStrs, destinationStr, apiKey) {
  if (!apiKey || waypointStrs.length === 0) return null;
  try {
    const params = new URLSearchParams({ origin: originStr, destination: destinationStr, key: apiKey });
    if (waypointStrs.length === 1) {
      params.set("waypoints", waypointStrs[0]);
    } else if (waypointStrs.length > 1) {
      params.set("waypoints", waypointStrs.join("|")); // no optimize:true — visit in order
    }
    const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === "OK" && data.routes?.[0]) {
      const route = data.routes[0];
      const visitOrder = waypointStrs.map((_, i) => i);
      const legs = (route.legs || []).map(l => ({
        duration_sec: l.duration?.value || 0,
        distance_m: l.distance?.value || 0,
      }));
      return { order: visitOrder, legs };
    }
  } catch (e) {}
  return null;
}

// Get optimized route via Google Maps Directions API with optimize:true
// Returns { order: [indices into waypointStrs], legs: [{duration_sec, distance_m}] }
export async function getOptimizedRoute(originStr, waypointStrs, destinationStr, apiKey) {
  if (!apiKey || waypointStrs.length === 0) return null;
  try {
    const params = new URLSearchParams({ origin: originStr, destination: destinationStr, key: apiKey });
    // Pass ALL waypoints to Google Maps for true optimization (optimize:true reorders them all)
    if (waypointStrs.length === 1) {
      params.set("waypoints", waypointStrs[0]);
    } else if (waypointStrs.length > 1) {
      params.set("waypoints", "optimize:true|" + waypointStrs.join("|"));
    }
    const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === "OK" && data.routes?.[0]) {
      const route = data.routes[0];
      const waypointOrder = route.waypoint_order || [];
      // Google's waypoint_order gives the optimized sequence of ALL waypoints.
      // For a single waypoint (no optimize), the order is just [0].
      const visitOrder = waypointStrs.length > 1 ? [...waypointOrder] : [0];
      const legs = (route.legs || []).map(l => ({
        duration_sec: l.duration?.value || 0,
        distance_m: l.distance?.value || 0,
      }));
      return { order: visitOrder, legs };
    }
  } catch (e) {}
  return null;
}