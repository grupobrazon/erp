import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { Settings, Clock, MapPin, Plus, Trash2, Loader2, Building2, CalendarPlus } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from "@/components/ui/table";

const DEFAULT_CONFIG = {
  name: "Configuração Padrão",
  work_start_time: "08:00",
  work_end_time: "18:00",
  lunch_start_time: "12:00",
  lunch_duration_minutes: 60,
  default_service_duration_entrega: 45,
  default_service_duration_instalacao: 90,
  default_service_duration_manutencao: 60,
  travel_buffer_minutes: 15,
  preparation_minutes: 30,
  departure_street: "",
  departure_number: "",
  departure_neighborhood: "",
  departure_city: "",
  departure_state: "",
  departure_zip: "",
};

export default function RouteConfigPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["routeConfig"],
    queryFn: () => base44.entities.RouteConfig.list("-created_date", 50),
    enabled: open,
  });

  const { data: zones = [] } = useQuery({
    queryKey: ["routeZones"],
    queryFn: () => base44.entities.RouteZone.list("-created_date", 200),
    enabled: open,
  });

  const { data: overrides = [] } = useQuery({
    queryKey: ["zoneDayOverrides"],
    queryFn: () => base44.entities.ZoneDayOverride.list("-date", 200),
    enabled: open,
  });

  React.useEffect(() => {
    if (open && configs.length > 0 && !config) {
      setConfig({ ...DEFAULT_CONFIG, ...configs[0] });
    } else if (open && configs.length === 0 && !config) {
      setConfig({ ...DEFAULT_CONFIG });
    }
  }, [open, configs]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const existing = configs[0];
      const { id, created_date, updated_date, created_by_id, ...rest } = config;
      const payload = { ...rest };
      Object.keys(payload).forEach(k => {
        if (payload[k] === "") delete payload[k];
      });
      if (existing) {
        await base44.entities.RouteConfig.update(existing.id, payload);
      } else {
        await base44.entities.RouteConfig.create(payload);
      }
      queryClient.invalidateQueries({ queryKey: ["routeConfig"] });
      toast({ title: "Configuração salva" });
    } catch (e) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateZone = async (zoneId, field, value) => {
    try {
      await base44.entities.RouteZone.update(zoneId, { [field]: value ? Number(value) : null });
      queryClient.invalidateQueries({ queryKey: ["routeZones"] });
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Settings className="h-4 w-4" /> Parametrização
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> Parametrização de Rotas</DialogTitle>
          <DialogDescription>Configure horários, tempos de atendimento e ponto de partida. Por zona: técnicos por dia e dias extras.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <Tabs defaultValue="global">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="global" className="gap-1.5 text-xs"><Clock className="h-3.5 w-3.5" /> Global</TabsTrigger>
              <TabsTrigger value="zones" className="gap-1.5 text-xs"><Building2 className="h-3.5 w-3.5" /> Por Zona</TabsTrigger>
              <TabsTrigger value="days" className="gap-1.5 text-xs"><CalendarPlus className="h-3.5 w-3.5" /> Dias Extras</TabsTrigger>
            </TabsList>

            {/* GLOBAL */}
            <TabsContent value="global" className="space-y-4 mt-4">
              {config && (
                <>
                  <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                    <div className="flex items-center gap-2 text-sm font-medium"><Clock className="h-4 w-4 text-primary" /> Expediente</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <Label className="text-xs">Início</Label>
                        <Input type="time" value={config.work_start_time} onChange={e => setConfig(p => ({ ...p, work_start_time: e.target.value }))} className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Fim</Label>
                        <Input type="time" value={config.work_end_time} onChange={e => setConfig(p => ({ ...p, work_end_time: e.target.value }))} className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Almoço (início)</Label>
                        <Input type="time" value={config.lunch_start_time} onChange={e => setConfig(p => ({ ...p, lunch_start_time: e.target.value }))} className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Almoço (min)</Label>
                        <Input type="number" value={config.lunch_duration_minutes} onChange={e => setConfig(p => ({ ...p, lunch_duration_minutes: Number(e.target.value) || 0 }))} className="h-8 text-sm" />
                      </div>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                    <div className="flex items-center gap-2 text-sm font-medium"><Clock className="h-4 w-4 text-primary" /> Tempo de Atendimento</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <Label className="text-xs">Entrega (min)</Label>
                        <Input type="number" value={config.default_service_duration_entrega} onChange={e => setConfig(p => ({ ...p, default_service_duration_entrega: Number(e.target.value) || 0 }))} className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Entrega+Instal. (min)</Label>
                        <Input type="number" value={config.default_service_duration_instalacao} onChange={e => setConfig(p => ({ ...p, default_service_duration_instalacao: Number(e.target.value) || 0 }))} className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Manutenção (min)</Label>
                        <Input type="number" value={config.default_service_duration_manutencao} onChange={e => setConfig(p => ({ ...p, default_service_duration_manutencao: Number(e.target.value) || 0 }))} className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Margem entre (min)</Label>
                        <Input type="number" value={config.travel_buffer_minutes} onChange={e => setConfig(p => ({ ...p, travel_buffer_minutes: Number(e.target.value) || 0 }))} className="h-8 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                      <div>
                        <Label className="text-xs">Preparação na empresa (min)</Label>
                        <Input type="number" value={config.preparation_minutes ?? 30} onChange={e => setConfig(p => ({ ...p, preparation_minutes: Number(e.target.value) || 0 }))} className="h-8 text-sm" />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Tempo que o técnico gasta na empresa organizando produtos/equipamentos antes de sair para a primeira parada. O sistema encaixa o máximo de atendimentos possível dentro do expediente — não há limite fixo de paradas.</p>
                  </div>

                  <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                    <div className="flex items-center gap-2 text-sm font-medium"><MapPin className="h-4 w-4 text-primary" /> Ponto de Partida (Escritório)</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <Label className="text-xs">Logradouro</Label>
                        <Input value={config.departure_street} onChange={e => setConfig(p => ({ ...p, departure_street: e.target.value }))} placeholder="Rua / Av." className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Número</Label>
                        <Input value={config.departure_number} onChange={e => setConfig(p => ({ ...p, departure_number: e.target.value }))} className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Bairro</Label>
                        <Input value={config.departure_neighborhood} onChange={e => setConfig(p => ({ ...p, departure_neighborhood: e.target.value }))} className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Cidade</Label>
                        <Input value={config.departure_city} onChange={e => setConfig(p => ({ ...p, departure_city: e.target.value }))} className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">UF</Label>
                        <Input value={config.departure_state} onChange={e => setConfig(p => ({ ...p, departure_state: e.target.value }))} maxLength="2" className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">CEP</Label>
                        <Input value={config.departure_zip} onChange={e => setConfig(p => ({ ...p, departure_zip: e.target.value }))} className="h-8 text-sm" />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">A latitude/longitude é geocodificada automaticamente ao gerar rotas.</p>
                  </div>

                  <Button onClick={saveConfig} disabled={saving} className="gap-2 w-full">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />} Salvar Configuração Global
                  </Button>
                </>
              )}
            </TabsContent>

            {/* ZONES */}
            <TabsContent value="zones" className="space-y-3 mt-4">
              <p className="text-xs text-muted-foreground">Defina quantos técnicos por dia (padrão) e tempos de atendimento por zona. Deixe o tempo vazio para usar o global.</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zona</TableHead>
                    <TableHead className="w-24">Técnicos/dia</TableHead>
                    <TableHead className="w-32">Entrega (min)</TableHead>
                    <TableHead className="w-32">Instal. (min)</TableHead>
                    <TableHead className="w-32">Manut. (min)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zones.map(z => (
                    <TableRow key={z.id}>
                      <TableCell className="font-medium">{z.name}</TableCell>
                      <TableCell>
                        <Input type="number" min="1" max="10" defaultValue={z.daily_capacity || 1}
                          onBlur={e => base44.entities.RouteZone.update(z.id, { daily_capacity: Number(e.target.value) || 1 }).then(() => queryClient.invalidateQueries({ queryKey: ["routeZones"] }))}
                          className="h-8 text-sm w-20" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" placeholder="Global" defaultValue={z.service_duration_entrega_override ?? ""}
                          onBlur={e => updateZone(z.id, "service_duration_entrega_override", e.target.value)}
                          className="h-8 text-sm w-24" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" placeholder="Global" defaultValue={z.service_duration_instalacao_override ?? ""}
                          onBlur={e => updateZone(z.id, "service_duration_instalacao_override", e.target.value)}
                          className="h-8 text-sm w-24" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" placeholder="Global" defaultValue={z.service_duration_manutencao_override ?? ""}
                          onBlur={e => updateZone(z.id, "service_duration_manutencao_override", e.target.value)}
                          className="h-8 text-sm w-24" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            {/* DAY OVERRIDES */}
            <TabsContent value="days" className="space-y-3 mt-4">
              <DayOverridesTab zones={zones} overrides={overrides} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DayOverridesTab({ zones, overrides }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ zone_id: "", date: "", technician_count: 1, reason: "" });

  const addOverride = async () => {
    if (!form.zone_id || !form.date) { toast({ title: "Preencha zona e data", variant: "destructive" }); return; }
    const zone = zones.find(z => z.id === form.zone_id);
    try {
      await base44.entities.ZoneDayOverride.create({
        ...form,
        technician_count: Number(form.technician_count) || 1,
        zone_name: zone?.name || "",
      });
      queryClient.invalidateQueries({ queryKey: ["zoneDayOverrides"] });
      setForm({ zone_id: "", date: "", technician_count: 1, reason: "" });
      toast({ title: "Dia extra adicionado" });
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const removeOverride = async (id) => {
    await base44.entities.ZoneDayOverride.delete(id);
    queryClient.invalidateQueries({ queryKey: ["zoneDayOverrides"] });
  };

  return (
    <>
      <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
        <div className="flex items-center gap-2 text-sm font-medium"><CalendarPlus className="h-4 w-4 text-primary" /> Abrir agenda com técnicos extras em dia específico</div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <Label className="text-xs">Zona</Label>
            <Select value={form.zone_id} onValueChange={v => setForm(p => ({ ...p, zone_id: v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>{zones.map(z => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Data</Label>
            <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Técnicos neste dia</Label>
            <Input type="number" min="1" max="10" value={form.technician_count} onChange={e => setForm(p => ({ ...p, technician_count: e.target.value }))} className="h-8 text-sm" />
          </div>
          <Button onClick={addOverride} className="gap-2"><Plus className="h-4 w-4" /> Adicionar</Button>
        </div>
        <div>
          <Label className="text-xs">Motivo (opcional)</Label>
          <Input value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="Ex: pico de demanda, técnico extra" className="h-8 text-sm" />
        </div>
      </div>

      {overrides.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zona</TableHead><TableHead>Data</TableHead><TableHead>Técnicos</TableHead><TableHead>Motivo</TableHead><TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {overrides.map(o => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.zone_name || "—"}</TableCell>
                <TableCell>{o.date}</TableCell>
                <TableCell><Badge variant="secondary">{o.technician_count}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{o.reason || "—"}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => removeOverride(o.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-4">Nenhum dia extra cadastrado.</p>
      )}
    </>
  );
}