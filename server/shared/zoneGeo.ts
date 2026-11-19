// Cópia de base44/shared/zoneGeo.ts gerada por tools/port_function.py.
// Shared zone geocoding utilities.
// Used by assignAddressZone and assignClientsToZones for matching addresses to route zones.

import { haversineKm, geocodeAddress } from "./routeUtils.ts";

export { haversineKm, geocodeAddress };

// Build a geocoding-friendly address string from an address-like object.
// Prefers neighborhood + city + state (more reliable for zone matching than street).
export function buildZoneGeocodeAddress(addr: any): string {
  const neighborhood = (addr?.neighborhood || "").trim();
  const street = (addr?.street || "").trim();
  const city = (addr?.city || "").trim();
  const state = (addr?.state || "").trim();
  if (neighborhood) return [neighborhood, city, state, "Brasil"].filter(Boolean).join(", ");
  return [street, city, state, "Brasil"].filter(Boolean).join(", ");
}