import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Plus, Search, AlertTriangle, Loader2, Navigation, Sparkles, CheckCircle2, XCircle, Scan } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const COLORS = [
  { value: "blue", label: "Azul" }, { value: "green", label: "Verde" }, { value: "amber", label: "Âmbar" },
  { value: "purple", label: "Roxo" }, { value: "rose", label: "Rosa" }, { value: "cyan", label: "Ciano" },
  { value: "orange", label: "Laranja" }, { value: "indigo", label: "Índigo" },
];

export default function ManualZoneAssignmentDialog({ open, onOpenChange, client, onAssigned }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState("existing");
  const [search, setSearch] = useState("");
  const [selectedCalendarId, setSelectedCalendarId] = useState("");
  const [selectedZoneId, setSelectedZoneId] = useState("");
  const [addCityToZone, setAddCityToZone] = useState(true);
  const [saving, setSaving] = useState(false);

  // New zone form
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneNameTouched, setNewZoneNameTouched] = useState(false);
  const [newZoneCalendarId, setNewZoneCalendarId] = useState("");
  const [newZoneCities, setNewZoneCities] = useState([]);
  const [newCityInput, setNewCityInput] = useState("");
  const [newZoneColor, setNewZoneColor] = useState("blue");

  // AI states
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiChecking, setAiChecking] = useState(false);
  const [aiCheckResult, setAiCheckResult] = useState(null); // { compatible: bool, reason: string }
  const [scanning, setScanning] = useState(false);

  const { data: calendars = [] } = useQuery({
    queryKey: ["calendarioRotas"],
    queryFn: () => base44.entities.CalendarioRota.filter({ is_active: true }, "-created_date", 200),
    enabled: open,
  });

  const { data: zones = [] } = useQuery({
    queryKey: ["routeZones"],
    queryFn: () => base44.entities.RouteZone.list("-created_date", 500),
    enabled: open,
  });

  const clientCity = (client?.city || "").trim();
  const clientNeighborhood = (client?.neighborhood || "").trim();
  const clientState = (client?.state || "").trim();

  // Auto-generate zone name following the naming convention
  // BH city → "BH – <Region>" | Metropolitan city → "MET – <City>"
  const generateZoneName = (city) => {
    if (!city) return "";
    const normalized = city.toLowerCase().trim();
    if (normalized === "belo horizonte") return "BH – ";
    return `MET – ${city}`;
  };

  // Pre-fill new zone cities and auto-name when opening
  useEffect(() => {
    if (open && clientCity && newZoneCities.length === 0) {
      setNewZoneCities([clientCity]);
    }
    if (open && clientCity && !newZoneNameTouched) {
      setNewZoneName(generateZoneName(clientCity));
    }
    if (open && calendars.length > 0 && !newZoneCalendarId) {
      const matchCal = client?.route_calendar_id
        ? calendars.find(c => c.id === client.route_calendar_id)
        : null;
      setNewZoneCalendarId(matchCal?.id || calendars[0]?.id || "");
    }
    if (!open) {
      setTab("existing");
      setSearch("");
      setSelectedCalendarId("");
      setSelectedZoneId("");
      setAddCityToZone(true);
      setNewZoneName("");
      setNewZoneNameTouched(false);
      setNewZoneCities([]);
      setNewCityInput("");
      setNewZoneColor("blue");
      setAiCheckResult(null);
    }
  }, [open, clientCity, calendars, client?.route_calendar_id]);

  // Filter zones by search
  const filteredZones = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return zones;
    return zones.filter(z => {
      const name = (z.name || "").toLowerCase();
      const cities = (z.cities || []).join(" ").toLowerCase();
      const calendar = (z.calendar_name || "").toLowerCase();
      return name.includes(q) || cities.includes(q) || calendar.includes(q);
    });
  }, [zones, search]);

  // Group zones by calendar
  const zonesByCalendar = useMemo(() => {
    const map = {};
    for (const z of filteredZones) {
      const calId = z.calendar_id || "_sem_calendario";
      if (!map[calId]) map[calId] = [];
      map[calId].push(z);
    }
    return map;
  }, [filteredZones]);

  const selectedZone = zones.find(z => z.id === selectedZoneId);
  const selectedZoneHasCity = selectedZone?.cities?.some(
    c => c.toLowerCase().trim() === clientCity.toLowerCase()
  );

  // Cities already covered by OTHER zones in the same calendar as the new zone
  // Key: normalized city name → zone name that already covers it
  const citiesInOtherZones = useMemo(() => {
    const map = {};
    if (!newZoneCalendarId) return map;
    for (const z of zones) {
      if (z.calendar_id !== newZoneCalendarId) continue;
      for (const c of (z.cities || [])) {
        const key = c.toLowerCase().trim();
        if (key) map[key] = z.name;
      }
    }
    return map;
  }, [zones, newZoneCalendarId]);

  const buildAssignment = (zone, calendar) => ({
    zone_id: zone.id,
    zone_name: zone.name,
    calendar_id: calendar?.id || zone.calendar_id || "",
    calendar_name: calendar?.name || zone.calendar_name || "",
  });

  // Scan clients for a specific calendar after zone changes
  const scanClientsForCalendar = async (calendarId) => {
    if (!calendarId) return;
    setScanning(true);
    try {
      await base44.functions.invoke("assignClientsToZones", { calendar_id: calendarId });
      queryClient.invalidateQueries({ queryKey: ["routeZones"] });
    } catch (e) {
      // Scan failure is non-blocking — zone was still saved
    } finally {
      setScanning(false);
    }
  };

  const assignExisting = async () => {
    if (!selectedZoneId) {
      toast({ title: "Selecione uma zona", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const zone = zones.find(z => z.id === selectedZoneId);
      const calendar = calendars.find(c => c.id === zone?.calendar_id);
      let cityAdded = false;

      // If checkbox is checked and zone doesn't already have the city, add it
      if (addCityToZone && clientCity && !selectedZoneHasCity) {
        const updatedCities = [...(zone.cities || []), clientCity];
        await base44.entities.RouteZone.update(zone.id, { cities: updatedCities });
        cityAdded = true;
      }

      // Assign client to this zone
      const assignment = buildAssignment(zone, calendar);
      await base44.entities.Client.update(client.id, {
        route_assignments: [assignment],
        route_zone_id: assignment.zone_id,
        route_zone_name: assignment.zone_name,
        route_calendar_id: assignment.calendar_id,
        route_calendar_name: assignment.calendar_name,
      });

      queryClient.invalidateQueries({ queryKey: ["client", client.id] });

      // Auto-scan: if city was added to the zone, scan clients in this calendar to assign others
      if (cityAdded) {
        toast({
          title: "Cliente atribuído — varrendo sistema...",
          description: `${clientCity} adicionada à zona "${zone.name}". Buscando outros clientes da região...`,
        });
        await scanClientsForCalendar(zone.calendar_id);
        toast({
          title: "Varredura concluída",
          description: "Clientes da região foram reatribuídos às zonas atualizadas.",
        });
      } else {
        toast({
          title: "Cliente atribuído à zona",
          description: `Cliente atribuído à zona "${zone.name}".`,
        });
      }

      onAssigned?.();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro ao atribuir zona", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const createAndAssign = async () => {
    if (!newZoneName.trim()) {
      toast({ title: "Informe o nome da zona", variant: "destructive" });
      return;
    }
    if (!newZoneCalendarId) {
      toast({ title: "Selecione um calendário", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const calendar = calendars.find(c => c.id === newZoneCalendarId);

      // Create the zone
      const zone = await base44.entities.RouteZone.create({
        name: newZoneName.trim(),
        calendar_id: newZoneCalendarId,
        calendar_name: calendar?.name || "",
        state: clientState || calendar?.state || "",
        cities: newZoneCities,
        daily_capacity: 1,
        active_days: ["seg", "ter", "qua", "qui", "sex"],
        color: newZoneColor,
      });

      queryClient.invalidateQueries({ queryKey: ["routeZones"] });

      // Assign client to the new zone
      const assignment = buildAssignment(zone, calendar);
      await base44.entities.Client.update(client.id, {
        route_assignments: [assignment],
        route_zone_id: assignment.zone_id,
        route_zone_name: assignment.zone_name,
        route_calendar_id: assignment.calendar_id,
        route_calendar_name: assignment.calendar_name,
      });

      queryClient.invalidateQueries({ queryKey: ["client", client.id] });

      // Auto-scan: the workflow "Atribuir Zonas na Nova Zona" fires on create,
      // but we also scan this calendar to catch any other clients in the same cities
      toast({
        title: "Zona criada — varrendo sistema...",
        description: `Zona "${zone.name}" criada. Buscando clientes para atribuir...`,
      });
      await scanClientsForCalendar(newZoneCalendarId);
      toast({
        title: "Zona criada e varredura concluída",
        description: `Zona "${zone.name}" criada no calendário ${calendar?.name || ""}. Cliente atribuído e sistema varrido.`,
      });

      onAssigned?.();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro ao criar zona", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addNewCity = () => {
    const c = newCityInput.trim();
    if (!c || newZoneCities.includes(c)) return;
    setNewZoneCities([...newZoneCities, c]);
    setNewCityInput("");
  };

  // AI: suggest nearby metropolitan cities for the new zone
  const suggestNearbyCities = async () => {
    if (!clientCity) {
      toast({ title: "Cliente sem cidade", variant: "destructive" });
      return;
    }
    setAiSuggesting(true);
    try {
      const existingCities = newZoneCities.join(", ");
      const prompt = `Você é um especialista em geografia da Região Metropolitana de Belo Horizonte (RMBH) e Minas Gerais.

O usuário está criando uma zona de atendimento de rota com a cidade principal: ${clientCity}${clientState ? ` - ${clientState}` : ""}.

Cidades já incluídas na zona: ${existingCities || "nenhuma além da principal"}

Liste até 8 cidades próximas à cidade principal que fariam sentido serem atendidas pela MESMA zona de rota (mesmo técnico, mesma região geográfica). Considere:
- Cidades vizinhas que ficam a uma distância curta (até ~25km) da cidade principal
- Cidades que compartilham a mesma direção/região geográfica
- Cidades que NÃO já estão na lista acima

NÃO inclua a cidade principal na lista (ela já está incluída).

Retorne APENAS um JSON válido (sem markdown, sem comentários) no formato:
{"cidades": ["Cidade1", "Cidade2", ...]}

Se a cidade principal for Belo Horizonte, retorne uma lista vazia (bairros de BH são classificados por região, não por cidade vizinha).`;

      const resultStr = await base44.integrations.Core.InvokeLLM({
        prompt,
        model: "claude-sonnet-5",
      });

      const clean = String(resultStr).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const result = JSON.parse(clean);
      const suggested = result.cidades || [];

      if (suggested.length === 0) {
        toast({ title: "Sem sugestões", description: "A IA não encontrou cidades próximas adicionais para esta zona." });
      } else {
        const newCities = suggested.filter(c => !newZoneCities.includes(c));
        if (newCities.length > 0) {
          setNewZoneCities([...newZoneCities, ...newCities]);
          toast({
            title: "Cidades sugeridas pela IA",
            description: `${newCities.length} cidade(s) adicionada(s): ${newCities.join(", ")}`,
          });
        } else {
          toast({ title: "Cidades já incluídas", description: "Todas as cidades sugeridas já estão na lista." });
        }
      }
    } catch (err) {
      toast({ title: "Erro na busca por IA", description: err?.message, variant: "destructive" });
    } finally {
      setAiSuggesting(false);
    }
  };

  // AI: check if the client's city makes sense in the selected existing zone
  const checkZoneCompatibility = async () => {
    if (!selectedZone || !clientCity) return;
    setAiChecking(true);
    setAiCheckResult(null);
    try {
      const zoneCities = (selectedZone.cities || []).join(", ");
      const zoneCalendar = selectedZone.calendar_name || "";
      const prompt = `Você é um especialista em geografia da Região Metropolitana de Belo Horizonte (RMBH) e Minas Gerais.

Um usuário quer adicionar a cidade "${clientCity}" à zona de rota "${selectedZone.name}" (calendário: ${zoneCalendar}).

Cidades atualmente nesta zona: ${zoneCities || "nenhuma"}

Analise se a cidade "${clientCity}" faz sentido geográfico ser atendida pela MESMA zona de rota que as cidades acima. Considere:
- Proximidade geográfica (estão na mesma região/direção?)
- Se a cidade "${clientCity}" está naturalmente agrupada com as cidades já incluídas
- Se um técnico conseguiria atender todas essas cidades em um mesmo dia de rota

Retorne APENAS um JSON válido (sem markdown) no formato:
{"compativel": true/false, "motivo": "explicação curta em português"}`;

      const resultStr = await base44.integrations.Core.InvokeLLM({
        prompt,
        model: "claude-sonnet-5",
      });

      const clean = String(resultStr).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const result = JSON.parse(clean);
      setAiCheckResult(result);
    } catch (err) {
      toast({ title: "Erro na verificação por IA", description: err?.message, variant: "destructive" });
    } finally {
      setAiChecking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            Atribuir Zona de Rota Manualmente
          </DialogTitle>
          <DialogDescription>
            Cliente: <strong>{client?.name}</strong> — {clientNeighborhood ? `${clientNeighborhood}, ` : ""}{clientCity || "sem cidade"}/{client?.state || "—"}
          </DialogDescription>
        </DialogHeader>

        {(!clientCity) && (
          <div className="flex items-center gap-2 text-amber-600 bg-amber-50/50 border border-amber-200 rounded-lg p-3 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Cliente sem cidade informada. Preencha a cidade no cadastro antes de atribuir uma zona.</span>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="existing">Zona Existente</TabsTrigger>
            <TabsTrigger value="new">Criar Nova Zona</TabsTrigger>
          </TabsList>

          {/* Tab 1: Assign to existing zone */}
          <TabsContent value="existing" className="space-y-3">
            <div>
              <Label>Buscar zona por nome, cidade ou calendário</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Ex: Norte, Esmeraldas, Grande BH..."
                  className="pl-9"
                />
              </div>
            </div>

            <div className="border rounded-lg max-h-[260px] overflow-y-auto divide-y">
              {filteredZones.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Nenhuma zona encontrada. Tente criar uma nova zona na aba "Criar Nova Zona".
                </div>
              ) : (
                Object.entries(zonesByCalendar).map(([calId, calZones]) => {
                  const calendar = calendars.find(c => c.id === calId);
                  return (
                    <div key={calId} className="p-2">
                      <div className="text-xs font-semibold text-muted-foreground px-1 py-1 sticky top-0 bg-background">
                        {calendar?.name || "Sem calendário"}
                      </div>
                      {calZones.map(zone => (
                        <button
                          key={zone.id}
                          type="button"
                          onClick={() => { setSelectedZoneId(zone.id); setAiCheckResult(null); }}
                          className={`w-full text-left p-2 rounded-md flex items-center justify-between gap-2 transition-colors ${
                            selectedZoneId === zone.id
                              ? "bg-primary/10 border border-primary/30"
                              : "hover:bg-muted/50 border border-transparent"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{zone.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {(zone.cities || []).slice(0, 5).join(", ")}
                              {(zone.cities?.length || 0) > 5 && ` +${zone.cities.length - 5}`}
                            </div>
                          </div>
                          {zone.cities?.some(c => c.toLowerCase().trim() === clientCity.toLowerCase()) && (
                            <Badge variant="secondary" className="text-xs shrink-0">cidade já incluída</Badge>
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })
              )}
            </div>

            {/* AI compatibility check */}
            {selectedZone && clientCity && !selectedZoneHasCity && (
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={checkZoneCompatibility}
                  disabled={aiChecking}
                  className="gap-1.5"
                >
                  {aiChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-primary" />}
                  Verificar compatibilidade com IA
                </Button>
                {aiCheckResult && (
                  <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                    aiCheckResult.compativel
                      ? "bg-green-50/50 border border-green-200 text-green-700"
                      : "bg-red-50/50 border border-red-200 text-red-700"
                  }`}>
                    {aiCheckResult.compativel
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                      : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                    <div>
                      <strong>{aiCheckResult.compativel ? "Compatível" : "Não recomendado"}</strong>
                      <p className="text-xs mt-0.5">{aiCheckResult.motivo}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedZone && clientCity && !selectedZoneHasCity && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50/50 border border-blue-200">
                <Checkbox
                  id="addCityToZone"
                  checked={addCityToZone}
                  onCheckedChange={setAddCityToZone}
                  className="mt-0.5"
                />
                <Label htmlFor="addCityToZone" className="text-sm cursor-pointer">
                  Adicionar <strong>{clientCity}</strong> à lista de cidades da zona "{selectedZone.name}"
                  {clientNeighborhood && ` (bairro: ${clientNeighborhood})`}
                </Label>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={assignExisting} disabled={!selectedZoneId || saving || scanning} className="gap-1.5">
                {saving || scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                {saving ? "Atribuindo..." : scanning ? "Varrendo sistema..." : "Atribuir e Varrer Sistema"}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Tab 2: Create new zone */}
          <TabsContent value="new" className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome da Zona *</Label>
                <Input
                  value={newZoneName}
                  onChange={e => { setNewZoneName(e.target.value); setNewZoneNameTouched(true); }}
                  placeholder="Ex: MET – Esmeraldas"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Gerado automaticamente (MET – Cidade). Edite se necessário.
                </p>
              </div>
              <div>
                <Label>Calendário *</Label>
                <Select value={newZoneCalendarId} onValueChange={setNewZoneCalendarId}>
                  <SelectTrigger><span className={!newZoneCalendarId ? "text-muted-foreground" : ""}>{calendars.find(c => c.id === newZoneCalendarId)?.name || "Selecione..."}</span></SelectTrigger>
                  <SelectContent>
                    {calendars.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Cidades da Zona</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={suggestNearbyCities}
                  disabled={aiSuggesting || !clientCity}
                  className="gap-1.5 h-7"
                >
                  {aiSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
                  Buscar cidades próximas com IA
                </Button>
              </div>
              <div className="flex gap-2 mb-2">
                <Input
                  value={newCityInput}
                  onChange={e => setNewCityInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addNewCity(); } }}
                  placeholder="Nome da cidade"
                />
                <Button type="button" variant="outline" onClick={addNewCity} className="gap-1.5 shrink-0">
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </div>
              {newZoneCities.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {newZoneCities.map(c => {
                    const alreadyInZone = citiesInOtherZones[c.toLowerCase().trim()];
                    if (alreadyInZone) {
                      return (
                        <Badge key={c} variant="outline" className="gap-1 py-1.5 pl-3 border-amber-400 bg-amber-50 text-amber-700" title={`Já atendida pela zona: ${alreadyInZone}`}>
                          <AlertTriangle className="h-3 w-3" /> {c}
                          <span className="text-xs font-normal opacity-70">já em: {alreadyInZone}</span>
                          <button type="button" onClick={() => setNewZoneCities(newZoneCities.filter(x => x !== c))} className="ml-1 hover:text-destructive">×</button>
                        </Badge>
                      );
                    }
                    return (
                      <Badge key={c} variant="secondary" className="gap-1 py-1.5 pl-3">
                        <MapPin className="h-3 w-3" /> {c}
                        <button type="button" onClick={() => setNewZoneCities(newZoneCities.filter(x => x !== c))} className="ml-1 hover:text-destructive">×</button>
                      </Badge>
                    );
                  })}
                </div>
              )}
              {Object.keys(citiesInOtherZones).length > 0 && newZoneCities.some(c => citiesInOtherZones[c.toLowerCase().trim()]) && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Cidades em amarelo já estão atribuídas a outra zona deste calendário — clique no × para remover e evitar duplicidade.
                </p>
              )}
              {clientCity && newZoneCities.includes(clientCity) && (
                <p className="text-xs text-muted-foreground mt-1">
                  ✓ {clientCity} foi pré-adicionada automaticamente (cidade do cliente)
                </p>
              )}
            </div>

            <div>
              <Label>Cor de Identificação</Label>
              <Select value={newZoneColor} onValueChange={setNewZoneColor}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLORS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50/50 border border-blue-200 text-sm">
              <Scan className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
              <span>Ao salvar, o sistema fará uma varredura automática para atribuir todos os clientes das cidades desta zona.</span>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={createAndAssign} disabled={saving || scanning || !newZoneName.trim()} className="gap-1.5">
                {saving || scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {saving ? "Criando..." : scanning ? "Varrendo sistema..." : "Criar Zona e Varrer Sistema"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}