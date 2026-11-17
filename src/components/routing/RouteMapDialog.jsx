import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, Download, Copy, ExternalLink, Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import RouteLeafletMap from "@/components/routing/RouteLeafletMap";

const LOGO_URL = "https://media.base44.com/images/public/6a1f6fc98b44d834e281aa51/851be8c4e_logobrazon.jpg";
const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—");

export default function RouteMapDialog({ open, onOpenChange, route }) {
  const { toast } = useToast();

  const { data: mapData, isLoading, error } = useQuery({
    queryKey: ["route-map-data", route?.id],
    queryFn: async () => {
      const res = await base44.functions.invoke("getRouteMapData", { route_id: route.id });
      return res.data;
    },
    enabled: !!open && !!route?.id,
    retry: false,
  });

  const handleCopyLink = () => {
    if (!mapData?.navigation_url) return;
    navigator.clipboard
      .writeText(mapData.navigation_url)
      .then(() => toast({ title: "Link copiado!", description: "Cole no navegador ou app do Google Maps." }))
      .catch(() =>
        toast({ title: "Erro ao copiar", description: "Copie manualmente o link de navegação.", variant: "destructive" })
      );
  };

  const handleNavigate = () => {
    if (!mapData?.navigation_url) return;
    window.open(mapData.navigation_url, "_blank");
  };

  const handleDownloadPdf = () => {
    if (!mapData?.static_map_url || !route) return;
    const stops = [...(route.stops || [])].sort((a, b) => (a.order || 0) - (b.order || 0));

    const stopRows = stops
      .map(
        (s, idx) => `
      <tr style="${idx % 2 === 0 ? "background:#f8fafc" : "background:#fff"}">
        <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;">${s.order || idx + 1}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-weight:600;">${s.os_code || "—"}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;">${s.client_name || "—"}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;">${s.service_type || "—"}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;">${s.address || "—"}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${s.arrival_time || "—"}</td>
      </tr>`
      )
      .join("");

    const win = window.open("", "_blank");
    if (!win) {
      toast({ title: "Permita pop-ups", description: "Habilite pop-ups para baixar o PDF.", variant: "destructive" });
      return;
    }
    win.document.write(`
<!DOCTYPE html><html><head><meta charset="utf-8"><title>Mapa da Rota ${route.code}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  body { font-family: 'Inter', Arial, sans-serif; padding: 20px; color: #1e293b; }
  .header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; border-bottom: 2px solid #0ea5e9; padding-bottom: 8px; }
  .header img { height: 40px; }
  .header h1 { font-size: 16px; margin: 0; }
  .header .subtitle { font-size: 11px; color: #64748b; }
  .route-info { display: flex; gap: 20px; font-size: 12px; margin-bottom: 12px; background: #f8fafc; padding: 8px 14px; border-radius: 6px; flex-wrap: wrap; }
  .route-info span { display: flex; gap: 4px; }
  .route-info strong { color: #0369a1; }
  .map-container { text-align: center; margin-bottom: 16px; page-break-inside: avoid; }
  .map-container img { max-width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: #0ea5e9; color: #fff; padding: 6px 8px; font-size: 11px; text-align: left; }
  td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
  .no-print { position: fixed; top: 16px; right: 16px; display: flex; gap: 8px; }
  .no-print button { border: none; padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-print { background: #0ea5e9; color: #fff; }
  .btn-close { background: #f1f5f9; color: #374151; border: 1px solid #e2e8f0; }
  @media print { .no-print { display: none; } }
</style></head><body>
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Salvar PDF</button>
    <button class="btn-close" onclick="window.close()">Fechar</button>
  </div>
  <div class="header">
    <img src="${LOGO_URL}" alt="Brazon" />
    <div>
      <h1>MAPA DA ROTA — ${route.code}</h1>
      <div class="subtitle">Técnico: ${route.technician || "—"} · ${fmtDate(route.date)} · ${route.total_distance_km || 0} km</div>
    </div>
  </div>
  <div class="route-info">
    <span><strong>Técnico:</strong> ${route.technician || "—"}</span>
    <span><strong>Data:</strong> ${fmtDate(route.date)}</span>
    <span><strong>Período:</strong> ${route.period || "—"}</span>
    <span><strong>Distância:</strong> ${route.total_distance_km || 0} km</span>
    <span><strong>Paradas:</strong> ${stops.length}</span>
  </div>
  <div class="map-container">
    <img src="${mapData.static_map_url}" alt="Mapa da rota" onerror="this.style.display='none';this.nextElementSibling.style.display='block';" />
    <p style="display:none;color:#94a3b8;font-size:12px;">Mapa indisponível — verifique a API Key do Google Maps.</p>
  </div>
  <h2 style="font-size:13px;color:#0369a1;margin:10px 0 6px;">📋 Paradas da Rota</h2>
  <table>
    <thead><tr><th>#</th><th>OS</th><th>Cliente</th><th>Tipo</th><th>Endereço</th><th>Chegada</th></tr></thead>
    <tbody>${stopRows}</tbody>
  </table>
  <div style="margin-top:16px;font-size:10px;color:#94a3b8;text-align:center;">
    Grupo Brazon · Mapa gerado em ${new Date().toLocaleString("pt-BR")}
  </div>
</body></html>`);
    win.document.close();
    win.focus();
  };

  if (!route) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Mapa da Rota — {route.code}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Carregando mapa...</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 rounded p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error.message || "Erro ao carregar o mapa da rota."}</span>
          </div>
        )}

        {mapData && (
          <div className="space-y-3">
            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
              <Button onClick={handleNavigate} className="gap-2">
                <Navigation className="h-4 w-4" /> Navegar no GPS
              </Button>
              <Button onClick={handleDownloadPdf} variant="outline" className="gap-2">
                <Download className="h-4 w-4" /> Baixar PDF
              </Button>
              <Button onClick={handleCopyLink} variant="ghost" className="gap-2">
                <Copy className="h-4 w-4" /> Copiar Link
              </Button>
            </div>

            {/* Interactive map (OpenStreetMap — no API key required) */}
            <div className="rounded-lg overflow-hidden border">
              <RouteLeafletMap points={mapData.points} endPointType={route.end_point_type} />
            </div>

            {/* Stop list with markers */}
            <div className="space-y-1.5">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                {mapData.total_points || 0} pontos na rota
              </h4>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {mapData.points?.map((pt, i) => {
                  const isDeparture = pt.type === "departure";
                  const isArrival = pt.type === "arrival";
                  const markerLabel = isDeparture
                    ? "E"
                    : isArrival
                    ? route.end_point_type === "empresa" ? "E" : "C"
                    : String(pt.order || i);
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30">
                      <span
                        className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold shrink-0 ${
                          isDeparture
                            ? "bg-green-500 text-white"
                            : isArrival
                            ? "bg-red-500 text-white"
                            : "bg-primary text-primary-foreground"
                        }`}
                      >
                        {markerLabel}
                      </span>
                      <span className="font-medium truncate flex-1">
                        {pt.label || (isDeparture ? "Empresa (Partida)" : isArrival ? "Chegada" : `Parada ${i}`)}
                      </span>
                      <span className="text-muted-foreground text-[10px]">
                        {pt.lat?.toFixed(5)}, {pt.lng?.toFixed(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* External link */}
            <a
              href={mapData.navigation_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Abrir no Google Maps
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}