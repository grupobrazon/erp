import React, { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icons (Leaflet's CSS-based icons break with bundlers)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Build a colored pin marker with a label (single char)
function buildLabelIcon(label, color) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 9.5 14 26 14 26s14-16.5 14-26C28 6.27 21.73 0 14 0z" fill="${color}"/>
      <circle cx="14" cy="14" r="9" fill="white"/>
      <text x="14" y="18" text-anchor="middle" font-size="11" font-weight="700" fill="${color}" font-family="Arial,sans-serif">${label}</text>
    </svg>`;
  return L.divIcon({
    html: svg,
    iconSize: [28, 40],
    iconAnchor: [14, 40],
    popupAnchor: [0, -38],
    className: "route-label-marker",
  });
}

// Component that fits the map bounds to all points
function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [points, map]);
  return null;
}

export default function RouteLeafletMap({ points, endPointType }) {
  const validPoints = useMemo(
    () => (points || []).filter((p) => p.lat != null && p.lng != null),
    [points]
  );

  const polylinePositions = useMemo(
    () => validPoints.map((p) => [p.lat, p.lng]),
    [validPoints]
  );

  if (validPoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] bg-muted/30 rounded-lg text-sm text-muted-foreground">
        Sem coordenadas para exibir o mapa
      </div>
    );
  }

  return (
    <MapContainer
      center={[validPoints[0].lat, validPoints[0].lng]}
      zoom={12}
      style={{ height: "400px", width: "100%", borderRadius: "0.5rem", zIndex: 0 }}
      scrollWheelZoom
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <Polyline positions={polylinePositions} pathOptions={{ color: "#0ea5e9", weight: 4, opacity: 0.7 }} />

      {validPoints.map((pt, i) => {
        const isDeparture = pt.type === "departure";
        const isArrival = pt.type === "arrival";
        const label = isDeparture
          ? "E"
          : isArrival
          ? endPointType === "empresa" ? "E" : "C"
          : String(pt.order || i);
        const color = isDeparture ? "#16a34a" : isArrival ? "#dc2626" : "#0ea5e9";
        return (
          <Marker key={i} position={[pt.lat, pt.lng]} icon={buildLabelIcon(label, color)}>
            <Popup>
              <div style={{ minWidth: "160px" }}>
                <strong>{pt.label || `Parada ${i + 1}`}</strong>
                {pt.address && <div style={{ fontSize: "11px", marginTop: "4px", color: "#555" }}>{pt.address}</div>}
                {pt.arrival_time && <div style={{ fontSize: "11px", marginTop: "2px" }}>Chegada: {pt.arrival_time}</div>}
                {pt.service_type && <div style={{ fontSize: "11px", marginTop: "2px" }}>{pt.service_type}</div>}
              </div>
            </Popup>
          </Marker>
        );
      })}

      <FitBounds points={validPoints} />
    </MapContainer>
  );
}