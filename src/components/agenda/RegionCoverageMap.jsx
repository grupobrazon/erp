import React from "react";
import { MapContainer, TileLayer, Circle, CircleMarker, Tooltip, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Centros aproximados dos estados brasileiros (lat, lng, zoom inicial)
export const STATE_CENTERS = {
  AC: { lat: -8.77, lng: -70.55, zoom: 6 },
  AL: { lat: -9.71, lng: -35.73, zoom: 7 },
  AP: { lat: 1.41, lng: -51.91, zoom: 7 },
  AM: { lat: -3.47, lng: -62.22, zoom: 5 },
  BA: { lat: -12.96, lng: -41.39, zoom: 6 },
  CE: { lat: -5.20, lng: -39.53, zoom: 7 },
  DF: { lat: -15.83, lng: -47.86, zoom: 9 },
  ES: { lat: -19.18, lng: -40.34, zoom: 7 },
  GO: { lat: -15.98, lng: -49.86, zoom: 6 },
  MA: { lat: -5.42, lng: -45.44, zoom: 6 },
  MT: { lat: -12.64, lng: -55.50, zoom: 5 },
  MS: { lat: -19.37, lng: -54.62, zoom: 6 },
  MG: { lat: -18.50, lng: -44.30, zoom: 6 },
  PA: { lat: -4.04, lng: -52.90, zoom: 5 },
  PB: { lat: -7.28, lng: -36.72, zoom: 7 },
  PR: { lat: -24.50, lng: -51.00, zoom: 6 },
  PE: { lat: -8.38, lng: -37.86, zoom: 7 },
  PI: { lat: -6.76, lng: -42.83, zoom: 6 },
  RJ: { lat: -22.91, lng: -43.17, zoom: 8 },
  RN: { lat: -5.81, lng: -36.59, zoom: 7 },
  RS: { lat: -29.76, lng: -53.30, zoom: 6 },
  RO: { lat: -10.83, lng: -63.34, zoom: 6 },
  RR: { lat: 1.99, lng: -61.33, zoom: 6 },
  SC: { lat: -27.33, lng: -50.61, zoom: 6 },
  SP: { lat: -22.50, lng: -48.50, zoom: 6 },
  SE: { lat: -10.21, lng: -37.43, zoom: 8 },
  TO: { lat: -9.39, lng: -48.30, zoom: 6 },
};

const ZONE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#6366f1"];

function MapClickHandler({ onClick }) {
  useMapEvents({
    click(e) {
      onClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export default function RegionCoverageMap({ state, centerLat, centerLng, radiusKm, zones = [], onCenterChange }) {
  const stateCenter = STATE_CENTERS[state] || STATE_CENTERS.MG;
  const hasCenter = centerLat != null && centerLng != null;
  const initialCenter = hasCenter ? [centerLat, centerLng] : [stateCenter.lat, stateCenter.lng];

  return (
    <div className="rounded-lg border overflow-hidden relative">
      <MapContainer
        key={state || "default"}
        center={initialCenter}
        zoom={stateCenter.zoom}
        style={{ height: "320px", width: "100%" }}
        className="z-0"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap"
        />
        <MapClickHandler onClick={onCenterChange} />

        {/* Círculo de raio de atuação do calendário */}
        {hasCenter && radiusKm > 0 && (
          <Circle
            center={[centerLat, centerLng]}
            radius={radiusKm * 1000}
            pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.08, weight: 2 }}
          />
        )}

        {/* Marcador do centro da região */}
        {hasCenter && (
          <CircleMarker
            center={[centerLat, centerLng]}
            radius={7}
            pathOptions={{ color: "#1e40af", fillColor: "#3b82f6", fillOpacity: 1, weight: 2 }}
          >
            <Tooltip sticky>Centro da região</Tooltip>
          </CircleMarker>
        )}

        {/* Zonas de atuação geradas */}
        {zones.map((z, i) => {
          if (z.center_lat == null || z.center_lng == null) return null;
          const color = ZONE_COLORS[i % ZONE_COLORS.length];
          return (
            <React.Fragment key={i}>
              <Circle
                center={[z.center_lat, z.center_lng]}
                radius={(z.radius_km || 5) * 1000}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.12, weight: 2 }}
              />
              <CircleMarker
                center={[z.center_lat, z.center_lng]}
                radius={5}
                pathOptions={{ color, fillColor: color, fillOpacity: 1, weight: 2 }}
              >
                <Tooltip sticky>{z.name}</Tooltip>
              </CircleMarker>
            </React.Fragment>
          );
        })}
      </MapContainer>
      <div className="absolute bottom-1 right-2 bg-white/90 backdrop-blur-sm rounded px-2 py-0.5 text-[10px] text-muted-foreground pointer-events-none">
        Clique no mapa para definir o centro da região
      </div>
    </div>
  );
}