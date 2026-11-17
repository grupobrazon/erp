import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, AlertCircle, Info, AlertTriangle, MapPin, Loader2, ChevronDown, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import ZoneDayGrid from "@/components/routing/ZoneDayGrid";
import RouteConfigPanel from "@/components/routing/RouteConfigPanel";

const alertIcon = (type) => {
  if (type === "capacity_conflict") return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
  if (type === "consolidation") return <Info className="h-3.5 w-3.5 text-blue-500" />;
  if (type === "unassigned_flexible") return <AlertCircle className="h-3.5 w-3.5 text-orange-500" />;
  return <Info className="h-3.5 w-3.5" />;
};

export default function SmartRoutesPanel({ testMode = false }) {
  const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const [dateTo, setDateTo] = useState(twoWeeks);
  const [zoneFilter, setZoneFilter] = useState("all");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const { data: zones = [] } = useQuery({
    queryKey: ["routeZones"],
    queryFn: () => base44.entities.RouteZone.list("-created_date", 200),
  });

  const generate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const payload = { date_to: dateTo, test_mode: testMode };
      if (zoneFilter !== "all") payload.zone_id = zoneFilter;
      const res = await base44.functions.invoke("generateSmartRoutes", payload);
      if (res.data?.error) {
        setError(res.data.error);
      } else {
        setResult(res.data);
      }
    } catch (e) {
      console.error(e);
      setError(e.response?.data?.error || e.message || "Erro ao gerar rotas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {testMode && (
        <div className="border border-amber-300 bg-amber-50 text-amber-800 rounded-lg p-3 text-sm font-medium">
          ⚙ MODO TESTE — todas as OS de Entrega/Instalação são tratadas como disponíveis para roteirização, independente do status.
        </div>
      )}

      {/* Controls */}
      <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Motor de Roteirização Inteligente</span>
          <span className="text-xs text-muted-foreground ml-2 flex-1">Prioriza datas do relacionamento, ordena do pedido mais antigo ao mais novo, otimiza rota no Google Maps</span>
          <RouteConfigPanel />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <Label className="text-xs">Abrir agenda até</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Zona</Label>
            <Select value={zoneFilter} onValueChange={setZoneFilter}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as zonas</SelectItem>
                {zones.map(z => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={generate} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Gerando..." : "Gerar Rotas"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Deixe as datas vazias para trazer todos os pedidos em aberto (janela padrão de 60 dias).</p>
      </div>

      {/* Debug info */}
      {result && (
        <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-2 text-xs text-blue-700 font-mono overflow-auto max-h-40">
          <div className="font-bold mb-1">Resposta da função:</div>
          <div>test_mode: {String(result.test_mode)}</div>
          <div>total_assigned: {result.total_assigned}</div>
          <div>total_unassigned: {result.total_unassigned}</div>
          <div>zones: {result.zones?.length}</div>
          {result.debug && <div>debug: {JSON.stringify(result.debug)}</div>}
          {result.error && <div className="text-red-600">error: {result.error}</div>}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="border border-red-300 bg-red-50 text-red-800 rounded-lg p-3 text-sm flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Erro ao gerar rotas</div>
            <div className="text-xs mt-1 font-mono">{error}</div>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Config warnings */}
          {result.has_google_maps === false && (
            <div className="border border-amber-300 bg-amber-50 text-amber-800 rounded-lg p-3 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" /> Google Maps API não configurada. As rotas serão agrupadas por proximidade de bairro, sem otimização de trajeto real.
            </div>
          )}
          {result.has_google_maps && result.has_departure === false && (
            <div className="border border-amber-300 bg-amber-50 text-amber-800 rounded-lg p-3 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" /> Configure o endereço de partida (escritório) na engrenagem de Parametrização para ativar a otimização de trajeto no Google Maps.
            </div>
          )}
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-primary">{result.total_assigned}</div>
              <div className="text-xs text-muted-foreground">OSs Atribuídas</div>
            </div>
            <div className="border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-orange-500">{result.total_unassigned}</div>
              <div className="text-xs text-muted-foreground">Não Atribuídas</div>
            </div>
            <div className="border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-amber-500">{result.total_alerts}</div>
              <div className="text-xs text-muted-foreground">Alertas</div>
            </div>
            <div className="border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-muted-foreground">{result.zones.length}</div>
              <div className="text-xs text-muted-foreground">Zonas Ativas</div>
            </div>
          </div>

          {/* Unzoned warning */}
          {result.unzoned?.length > 0 && (
            <div className="border border-orange-200 bg-orange-50/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-orange-700 mb-1">
                <MapPin className="h-4 w-4" /> {result.unzoned.length} OS(s) sem zona cadastrada
              </div>
              <p className="text-xs text-muted-foreground">Cadastre zonas que incluem estas cidades para que o motor possa roteirizá-las:</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {result.unzoned.map(u => <Badge key={u.os_id} variant="outline" className="text-xs">{u.os_code} — {u.city || "Sem cidade"}</Badge>)}
              </div>
            </div>
          )}

          {/* Zone accordions */}
          {result.zones.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              Nenhuma zona cadastrada. Vá na aba "Zonas & Capacidade" para criar zonas.
            </div>
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {result.zones.map(zone => (
                <AccordionItem key={zone.zone_id} value={zone.zone_id} className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="font-medium">{zone.zone_name}</span>
                      <span className="text-xs text-muted-foreground">{zone.region_name}</span>
                      <Badge variant="secondary" className="text-xs">{zone.assigned}/{zone.total_os} atribuídas</Badge>
                      {zone.alerts.length > 0 && <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">{zone.alerts.length} alertas</Badge>}
                      <span className="text-xs text-muted-foreground ml-auto mr-2">{zone.daily_capacity}/dia • {zone.technician_count} técnico(s)</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-3">
                    {/* Alerts */}
                    {zone.alerts.length > 0 && (
                      <div className="space-y-1.5">
                        {zone.alerts.map((alert, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs bg-muted/50 rounded p-2">
                            {alertIcon(alert.type)}
                            <span>{alert.message}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Day plans */}
                    {zone.days.length === 0 ? (
                      <div className="text-xs text-muted-foreground py-3 text-center">Nenhuma rota sugerida para esta zona no período.</div>
                    ) : (
                      <ZoneDayGrid zone={zone} allUnassigned={[...(result.unzoned || []), ...zone.unassigned]} departureAddress={result.config?.departure_address || ""} departureLat={result.config?.departure_lat} departureLng={result.config?.departure_lng} />
                    )}

                    {/* Unassigned */}
                    {zone.unassigned.length > 0 && (
                      <div className="border-t pt-2 mt-2">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Não atribuídas ({zone.unassigned.length})</div>
                        <div className="flex flex-wrap gap-1">
                          {zone.unassigned.map(u => (
                            <Badge key={u.os_id} variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                              {u.os_code} — {u.client_name} ({u.city || "Sem cidade"})
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      )}
    </div>
  );
}