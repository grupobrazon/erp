import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Plus, X, MapPin, Building2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function CoverageCitiesPanel({ state, centerCity, radiusKm, cities, onCitiesChange }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [newCity, setNewCity] = useState("");

  const canSuggest = state && centerCity && radiusKm > 0;

  const suggestCities = async () => {
    setLoading(true);
    try {
      const prompt = `Liste todos os municípios do estado de ${state}, Brasil, que estão dentro de um raio de ${radiusKm}km a partir da cidade de ${centerCity}. Inclua a própria cidade de ${centerCity} na lista. Retorne apenas nomes reais de municípios brasileiros próximos, sem repetição, ordenados por proximidade.`;

      const res = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true,
        model: "gemini_3_flash",
        response_json_schema: {
          type: "object",
          properties: {
            cities: { type: "array", items: { type: "string" } },
          },
        },
      });

      const suggested = (res?.cities || []).filter(Boolean);
      if (suggested.length === 0) {
        toast({ title: "Nenhuma cidade encontrada", variant: "destructive" });
        return;
      }
      // Merge with existing (avoid duplicates)
      const existing = new Set((cities || []).map(c => c.toLowerCase()));
      const merged = [...(cities || [])];
      for (const c of suggested) {
        if (!existing.has(c.toLowerCase())) {
          merged.push(c);
          existing.add(c.toLowerCase());
        }
      }
      onCitiesChange(merged);
      toast({ title: `${suggested.length} cidade(s) sugerida(s)`, description: merged.length + " no total." });
    } catch (err) {
      toast({ title: "Erro ao sugerir cidades", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const addCity = () => {
    const trimmed = newCity.trim();
    if (!trimmed) return;
    const existing = new Set((cities || []).map(c => c.toLowerCase()));
    if (existing.has(trimmed.toLowerCase())) {
      setNewCity("");
      return;
    }
    onCitiesChange([...(cities || []), trimmed]);
    setNewCity("");
  };

  const removeCity = (idx) => {
    onCitiesChange((cities || []).filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" /> Cidades na Região ({cities?.length || 0})
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={suggestCities}
          disabled={loading || !canSuggest}
          className="gap-1.5 h-7 text-xs"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {loading ? "Buscando..." : "Sugerir com IA"}
        </Button>
      </div>

      {!canSuggest && (
        <p className="text-[11px] text-muted-foreground">
          Defina estado, cidade central e raio para sugerir cidades próximas.
        </p>
      )}

      {/* Lista de cidades */}
      {cities?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border bg-muted/20 min-h-[2rem]">
          {cities.map((city, idx) => (
            <Badge key={idx} variant="secondary" className="gap-1 pr-1">
              <MapPin className="h-3 w-3 text-muted-foreground" />
              {city}
              <button
                type="button"
                onClick={() => removeCity(idx)}
                className="ml-0.5 hover:bg-destructive/20 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Adicionar cidade manualmente */}
      <div className="flex gap-2">
        <Input
          value={newCity}
          onChange={(e) => setNewCity(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCity(); } }}
          placeholder="Adicionar cidade manualmente..."
          className="h-8 text-sm"
        />
        <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={addCity} disabled={!newCity.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}