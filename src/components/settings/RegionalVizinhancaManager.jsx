import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Upload, MapPin } from "lucide-react";

const AREAS = ["BH Capital", "Grande BH", "SP Capital", "Grande SP"];

const SP_DEFAULTS = [
  { regional: "SP – Centro", area: "SP Capital", vizinhas: ["SP – Oeste", "SP – Sul 1", "SP – Leste 1", "SP – Norte 1"], limite_ideal_km: 8, limite_aceitavel_km: 15, limite_bloqueio_km: 15 },
  { regional: "SP – Oeste", area: "SP Capital", vizinhas: ["SP – Centro", "SP – Norte 1", "SP – Sul 1", "MET – Osasco", "MET – Barueri"], limite_ideal_km: 8, limite_aceitavel_km: 15, limite_bloqueio_km: 15 },
  { regional: "SP – Norte 1", area: "SP Capital", vizinhas: ["SP – Centro", "SP – Oeste", "SP – Norte 2", "SP – Leste 1", "MET – Guarulhos"], limite_ideal_km: 8, limite_aceitavel_km: 15, limite_bloqueio_km: 15 },
  { regional: "SP – Norte 2", area: "SP Capital", vizinhas: ["SP – Norte 1", "SP – Oeste", "SP – Leste 1", "MET – Guarulhos"], limite_ideal_km: 8, limite_aceitavel_km: 15, limite_bloqueio_km: 15 },
  { regional: "SP – Sul 1", area: "SP Capital", vizinhas: ["SP – Centro", "SP – Oeste", "SP – Sul 2", "SP – Leste 1"], limite_ideal_km: 8, limite_aceitavel_km: 15, limite_bloqueio_km: 15 },
  { regional: "SP – Sul 2", area: "SP Capital", vizinhas: ["SP – Sul 1", "SP – Leste 2", "MET – ABC", "MET – Sudoeste", "MET – Cotia/Taboão"], limite_ideal_km: 8, limite_aceitavel_km: 15, limite_bloqueio_km: 15 },
  { regional: "SP – Leste 1", area: "SP Capital", vizinhas: ["SP – Centro", "SP – Norte 1", "SP – Sul 1", "SP – Leste 2", "MET – Guarulhos"], limite_ideal_km: 8, limite_aceitavel_km: 15, limite_bloqueio_km: 15 },
  { regional: "SP – Leste 2", area: "SP Capital", vizinhas: ["SP – Leste 1", "SP – Sul 2", "MET – Alto Tietê 1", "MET – Mauá/Ribeirão Pires"], limite_ideal_km: 8, limite_aceitavel_km: 15, limite_bloqueio_km: 15 },
  { regional: "MET – Guarulhos", area: "Grande SP", vizinhas: ["SP – Norte 1", "SP – Norte 2", "SP – Leste 1", "MET – Norte"], limite_ideal_km: 15, limite_aceitavel_km: 25, limite_bloqueio_km: 25 },
  { regional: "MET – Norte", area: "Grande SP", vizinhas: ["MET – Guarulhos", "MET – Alto Tietê 1", "MET – Barueri"], limite_ideal_km: 15, limite_aceitavel_km: 25, limite_bloqueio_km: 25 },
  { regional: "MET – Osasco", area: "Grande SP", vizinhas: ["SP – Oeste", "MET – Barueri", "MET – Cotia/Taboão"], limite_ideal_km: 15, limite_aceitavel_km: 25, limite_bloqueio_km: 25 },
  { regional: "MET – Barueri", area: "Grande SP", vizinhas: ["SP – Oeste", "MET – Osasco", "MET – Cotia/Taboão", "MET – Norte"], limite_ideal_km: 15, limite_aceitavel_km: 25, limite_bloqueio_km: 25 },
  { regional: "MET – Cotia/Taboão", area: "Grande SP", vizinhas: ["SP – Oeste", "SP – Sul 2", "MET – Osasco", "MET – Barueri", "MET – Sudoeste"], limite_ideal_km: 15, limite_aceitavel_km: 25, limite_bloqueio_km: 25 },
  { regional: "MET – Sudoeste", area: "Grande SP", vizinhas: ["SP – Sul 2", "MET – Cotia/Taboão", "MET – ABC"], limite_ideal_km: 15, limite_aceitavel_km: 25, limite_bloqueio_km: 25 },
  { regional: "MET – ABC", area: "Grande SP", vizinhas: ["SP – Sul 2", "SP – Leste 2", "MET – Sudoeste", "MET – Mauá/Ribeirão Pires"], limite_ideal_km: 15, limite_aceitavel_km: 25, limite_bloqueio_km: 25 },
  { regional: "MET – Mauá/Ribeirão Pires", area: "Grande SP", vizinhas: ["SP – Leste 2", "MET – ABC", "MET – Alto Tietê 1"], limite_ideal_km: 15, limite_aceitavel_km: 25, limite_bloqueio_km: 25 },
  { regional: "MET – Alto Tietê 1", area: "Grande SP", vizinhas: ["SP – Leste 2", "MET – Alto Tietê 2", "MET – Mauá/Ribeirão Pires", "MET – Norte"], limite_ideal_km: 15, limite_aceitavel_km: 25, limite_bloqueio_km: 25 },
  { regional: "MET – Alto Tietê 2", area: "Grande SP", vizinhas: ["MET – Alto Tietê 1", "MET – Norte"], limite_ideal_km: 15, limite_aceitavel_km: 25, limite_bloqueio_km: 25 },
];

export default function RegionalVizinhancaManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newRegional, setNewRegional] = useState({ regional: "", area: "SP Capital", vizinhasText: "", limite_ideal_km: 8, limite_aceitavel_km: 15, limite_bloqueio_km: 15 });

  const { data: matrix = [], isLoading } = useQuery({
    queryKey: ["regionalVizinhanca"],
    queryFn: () => base44.entities.RegionalVizinhanca.list("-created_date", 500),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.RegionalVizinhanca.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["regionalVizinhanca"] });
      toast({ title: "Regional adicionada" });
      setNewRegional(p => ({ ...p, regional: "", vizinhasText: "" }));
    },
    onError: (e) => toast({ title: "Erro", description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.RegionalVizinhanca.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["regionalVizinhanca"] });
      toast({ title: "Regional removida" });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async (defaults) => {
      const existing = new Set(matrix.map((m) => m.regional));
      const toCreate = defaults.filter(d => !existing.has(d.regional));
      if (toCreate.length === 0) return [];
      return base44.entities.RegionalVizinhanca.bulkCreate(toCreate);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["regionalVizinhanca"] });
      const n = Array.isArray(res) ? res.length : 0;
      toast({ title: n > 0 ? `${n} regionais carregadas` : "Matriz já está completa" });
    },
    onError: (e) => toast({ title: "Erro ao carregar", description: e?.message, variant: "destructive" }),
  });

  const handleAdd = () => {
    if (!newRegional.regional.trim()) {
      toast({ title: "Informe o nome da Regional", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      regional: newRegional.regional.trim(),
      area: newRegional.area,
      vizinhas: newRegional.vizinhasText.split(",").map(s => s.trim()).filter(Boolean),
      limite_ideal_km: Number(newRegional.limite_ideal_km) || 0,
      limite_aceitavel_km: Number(newRegional.limite_aceitavel_km) || 0,
      limite_bloqueio_km: Number(newRegional.limite_bloqueio_km) || 0,
    });
  };

  const grouped = AREAS.map(area => ({
    area,
    items: matrix.filter((m) => m.area === area),
  })).filter(g => g.items.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          Matriz de Regionais Vizinhas
        </CardTitle>
        <CardDescription>
          Define quais Regionais são compatíveis entre si no mesmo período (manhã/tarde) e os limites de distância por área. Usada na validação de pré-agendamento comercial.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => bulkMutation.mutate(SP_DEFAULTS)} disabled={bulkMutation.isPending}>
            <Upload className="h-4 w-4 mr-1" /> Carregar defaults SP (18 regionais)
          </Button>
        </div>

        <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
          <p className="text-xs font-medium">Adicionar Regional</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Input placeholder="Nome da Regional (ex: SP – Centro)" value={newRegional.regional} onChange={e => setNewRegional(p => ({ ...p, regional: e.target.value }))} />
            <Select value={newRegional.area} onValueChange={v => setNewRegional(p => ({ ...p, area: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Input placeholder="Vizinhas (separadas por vírgula)" value={newRegional.vizinhasText} onChange={e => setNewRegional(p => ({ ...p, vizinhasText: e.target.value }))} />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Ideal (km)</Label>
              <Input type="number" value={newRegional.limite_ideal_km} onChange={e => setNewRegional(p => ({ ...p, limite_ideal_km: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Aceitável (km)</Label>
              <Input type="number" value={newRegional.limite_aceitavel_km} onChange={e => setNewRegional(p => ({ ...p, limite_aceitavel_km: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Bloqueio (km)</Label>
              <Input type="number" value={newRegional.limite_bloqueio_km} onChange={e => setNewRegional(p => ({ ...p, limite_bloqueio_km: e.target.value }))} />
            </div>
          </div>
          <Button size="sm" onClick={handleAdd} disabled={createMutation.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma regional cadastrada. Clique em "Carregar defaults" para começar.</p>
        ) : (
          <div className="space-y-3">
            {grouped.map(g => (
              <div key={g.area}>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="secondary">{g.area}</Badge>
                  <span className="text-xs text-muted-foreground">{g.items.length} regionais</span>
                </div>
                <div className="space-y-1.5">
                  {g.items.map((m) => (
                    <div key={m.id} className="flex items-start gap-2 p-2 rounded-lg border bg-card text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{m.regional}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Vizinhas: {m.vizinhas?.length ? m.vizinhas.join(", ") : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Limites: ideal {m.limite_ideal_km}km · aceitável {m.limite_aceitavel_km}km · bloqueio {m.limite_bloqueio_km}km
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => deleteMutation.mutate(m.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}