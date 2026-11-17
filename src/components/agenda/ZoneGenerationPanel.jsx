import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Save, Trash2, MapPin, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function ZoneGenerationPanel({ calendar }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [generated, setGenerated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: existingZones = [] } = useQuery({
    queryKey: ["routeZones", "calendar", calendar?.id],
    queryFn: () => base44.entities.RouteZone.filter({ calendar_id: calendar.id }, "-created_date", 200),
    enabled: !!calendar?.id,
  });

  const generate = async () => {
    setLoading(true);
    setGenerated(null);
    try {
      const cityName = calendar.center_city || calendar.city || calendar.name;
      const stateName = calendar.state || "";
      const coverageCities = calendar.coverage_cities || [];
      const isInterior = coverageCities.length > 1;

      const coverageCitiesStr = isInterior
        ? `As cidades que esta região cobre são: ${coverageCities.join(", ")}.`
        : "";

      const instructions = isInterior
        ? `Esta é uma região INTERIORANA com múltiplas cidades próximas. Crie UMA zona para cada cidade listada acima. Cada zona deve ter:
- name: nome da cidade (ex: "Florestal", "Pará de Minas", "Juatuba")
- center_neighborhood: nome do centro/bairro principal da cidade
- center_lat e center_lng: coordenadas REAIS do centro da cidade
- radius_km: raio pequeno (entre 3 e 10km) cobrindo a área urbana da cidade
- description: breve descrição`
        : `Divida a cidade e sua região metropolitana em zonas geográficas coerentes (ex: Zona Sul, Zona Central/Centro, Zona Leste, Zona Oeste, Zona Norte, Região Metropolitana Norte, etc.), considerando a divisão administrativa real (prefeituras regionais, regionais do município, bairros de referência) e a região metropolitana (cidades vizinhas).

Para cada zona, forneça:
- name: nome da zona (ex: "Zona Sul", "Centro", "Zona Leste", "Região Metropolitana - Contagem")
- center_neighborhood: bairro ou marco de referência central da zona
- center_lat: latitude real do centro da zona (número decimal, ex: -19.92)
- center_lng: longitude real do centro da zona (número decimal, ex: -43.94)
- radius_km: raio de atuação em km a partir do centro (número, ex: 8)
- description: breve descrição dos bairros/áreas abrangidos

Gere entre 4 e 8 zonas.`;

      const prompt = `Você é um especialista em geografia urbana do Brasil. ${coverageCitiesStr}

Para a região de ${cityName}, estado ${stateName}:

${instructions}

Use coordenadas REAIS e precisas (não invente valores).`;

      const res = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true,
        model: "gemini_3_flash",
        response_json_schema: {
          type: "object",
          properties: {
            zones: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  center_neighborhood: { type: "string" },
                  center_lat: { type: "number" },
                  center_lng: { type: "number" },
                  radius_km: { type: "number" },
                  description: { type: "string" },
                },
              },
            },
          },
        },
      });

      setGenerated(res);
      toast({ title: "Regiões geradas", description: `${res?.zones?.length || 0} zona(s) sugerida(s) pela IA.` });
    } catch (err) {
      toast({ title: "Erro ao gerar regiões", description: err?.message || "Falha desconhecida", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const saveZones = async () => {
    if (!generated?.zones?.length) return;
    setSaving(true);
    try {
      const zonesToCreate = generated.zones.map((z) => ({
        name: z.name,
        calendar_id: calendar.id,
        calendar_name: calendar.name,
        state: calendar.state || "",
        center_city: z.center_neighborhood || calendar.center_city || "",
        center_state: calendar.state || "",
        use_radius: true,
        radius_km: z.radius_km || 8,
        center_lat: z.center_lat,
        center_lng: z.center_lng,
        cities: [],
        daily_capacity: 1,
        active_days: ["seg", "ter", "qua", "qui", "sex"],
      }));
      await base44.entities.RouteZone.bulkCreate(zonesToCreate);
      queryClient.invalidateQueries({ queryKey: ["routeZones"] });
      queryClient.invalidateQueries({ queryKey: ["routeZones", "calendar", calendar.id] });
      toast({ title: "Regiões salvas", description: `${zonesToCreate.length} zona(s) criada(s) e vinculada(s) ao calendário.` });
      setGenerated(null);
    } catch (err) {
      toast({ title: "Erro ao salvar regiões", description: err?.message || "Falha desconhecida", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteZone = async (zoneId) => {
    try {
      await base44.entities.RouteZone.delete(zoneId);
      queryClient.invalidateQueries({ queryKey: ["routeZones", "calendar", calendar.id] });
      queryClient.invalidateQueries({ queryKey: ["routeZones"] });
      toast({ title: "Zona removida" });
    } catch (err) {
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-semibold flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-primary" /> Regiões de Atuação (Zonas)
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gere as zonas da região metropolitana com IA para depois construir as regras de agendamento.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={generate} disabled={loading || saving} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? "Gerando..." : "Gerar com IA"}
        </Button>
      </div>

      {/* Zonas existentes */}
      {existingZones.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Zonas vinculadas ({existingZones.length}):</p>
          {existingZones.map((z) => (
            <div key={z.id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/20">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm">{z.name}</span>
                {z.center_city && <span className="text-xs text-muted-foreground ml-2">· {z.center_city}</span>}
                {z.radius_km && <Badge variant="outline" className="text-[10px] ml-2">{z.radius_km}km</Badge>}
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteZone(z.id)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Zonas geradas pela IA (preview) */}
      {generated?.zones?.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> {generated.zones.length} zona(s) sugerida(s):
            </p>
            <Button type="button" size="sm" onClick={saveZones} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? "Salvando..." : "Salvar zonas"}
            </Button>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {generated.zones.map((z, i) => (
              <div key={i} className="p-2 rounded-lg border bg-emerald-50/30">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{z.name}</span>
                  <Badge variant="outline" className="text-[10px]">{z.radius_km}km</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {z.center_neighborhood} · {z.center_lat?.toFixed(4)}, {z.center_lng?.toFixed(4)}
                </p>
                {z.description && <p className="text-xs text-muted-foreground mt-0.5">{z.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {existingZones.length === 0 && !generated && !loading && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Nenhuma zona criada ainda. Clique em "Gerar com IA" para sugerir as regiões de atuação.
        </p>
      )}
    </div>
  );
}