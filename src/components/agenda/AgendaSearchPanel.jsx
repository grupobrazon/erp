import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, CalendarDays, Bike, Car, AlertCircle, CheckCircle2, Users } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import MultiSelectFilter from "@/components/ui/MultiSelectFilter";
import { getColorClasses } from "@/lib/calendarColors";

/**
 * Painel de busca da Agenda de Rotas.
 * O vendedor digita o código ou nome do cliente, seleciona um calendário (região)
 * e clica em Buscar. O sistema mostra se já existem datas agendadas para a região
 * daquele cliente naquele calendário — permitindo consultar antes de lançar a venda.
 */
export default function AgendaSearchPanel() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [calendarIds, setCalendarIds] = useState([]);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState(null);

  const { data: calendars = [] } = useQuery({
    queryKey: ["calendarioRotas"],
    queryFn: () => base44.entities.CalendarioRota.list("-created_date", 200),
  });
  const activeCalendars = calendars.filter(c => c.is_active !== false);

  const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

  const countByVehiclePeriod = (appts) => {
    const c = { motoManha: 0, motoTarde: 0, carroManha: 0, carroTarde: 0, motoDia: 0, carroDia: 0 };
    for (const a of appts) {
      const isMoto = a.vehicle_type === "Moto";
      if (a.time_type === "Manhã") isMoto ? c.motoManha++ : c.carroManha++;
      else if (a.time_type === "Tarde") isMoto ? c.motoTarde++ : c.carroTarde++;
      else isMoto ? c.motoDia++ : c.carroDia++;
    }
    return c;
  };

  const handleSearch = async () => {
    if (!query.trim()) { toast({ title: "Informe o código do cliente, pedido ou OS", variant: "destructive" }); return; }
    if (calendarIds.length === 0) { toast({ title: "Selecione ao menos um calendário", variant: "destructive" }); return; }
    setSearching(true);
    setResult(null);
    try {
      const q = query.trim();
      let clients = await base44.entities.Client.filter({ new_code: q }, "-created_date", 5);
      if (clients.length === 0) clients = await base44.entities.Client.filter({ old_code: q }, "-created_date", 5);
      if (clients.length === 0) {
        try {
          clients = await base44.entities.Client.filter({ name: { $regex: q, $options: "i" } }, "-created_date", 10);
        } catch { clients = []; }
      }
      // Try by order number (Sale) → get client
      if (clients.length === 0) {
        const sales = await base44.entities.Sale.filter({ order_number: q }, "-created_date", 5);
        if (sales.length > 0 && sales[0].client_id) {
          const client = await base44.entities.Client.get(sales[0].client_id);
          if (client) clients = [client];
        }
      }
      // Try by OS code (ServiceOrder) → get client
      if (clients.length === 0) {
        const os = await base44.entities.ServiceOrder.filter({ code: q }, "-created_date", 5);
        if (os.length > 0 && os[0].client_id) {
          const client = await base44.entities.Client.get(os[0].client_id);
          if (client) clients = [client];
        }
      }
      if (clients.length === 0) {
        setResult({ notFound: true, query });
        setSearching(false);
        return;
      }
      const client = clients[0];
      const regional = client.regional || "";
      const calResults = [];
      for (const calId of calendarIds) {
        const appts = await base44.entities.AgendamentoRota.filter({ calendar_id: calId }, "date", 500);
        const regionalAppts = appts.filter(a => a.status !== "Cancelado" && a.regional && a.regional === regional);
        const byDate = {};
        for (const a of regionalAppts) {
          if (!byDate[a.date]) byDate[a.date] = [];
          byDate[a.date].push(a);
        }
        const sortedDates = Object.keys(byDate).sort();
        const cal = activeCalendars.find(c => c.id === calId);
        calResults.push({ calendar: cal, dates: sortedDates, byDate });
      }
      setResult({ client, regional, calendars: calResults });
    } catch (e) {
      toast({ title: "Erro na busca", description: e?.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="border rounded-lg p-3 bg-card space-y-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <Search className="h-4 w-4 text-primary" /> Consultar Agenda por Cliente
        <span className="text-xs font-normal text-muted-foreground ml-1">— busque antes de lançar a venda para ver as datas já agendadas da região</span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[180px]">
          <Label className="text-xs">Código, Nome, Pedido ou OS</Label>
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="Ex: B000123, P001, OS000456 ou João Silva"
          />
        </div>
        <div className="w-[260px]">
          <Label className="text-xs">Calendários (Regiões)</Label>
          <MultiSelectFilter
            options={activeCalendars.map(c => ({ value: c.id, label: c.name }))}
            selected={calendarIds}
            onChange={setCalendarIds}
            placeholder="Selecione os calendários"
            allLabel="Todos os calendários"
          />
        </div>
        <Button className="gap-1.5" disabled={searching} onClick={handleSearch}>
          <Search className="h-4 w-4" /> {searching ? "Buscando..." : "Buscar"}
        </Button>
      </div>

      {result?.notFound && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm flex items-center gap-2 text-amber-800">
          <AlertCircle className="h-4 w-4" /> Cliente não encontrado com "{result.query}". Verifique o código/nome/pedido/OS.
        </div>
      )}

      {result && !result.notFound && (
        <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">{result.client.name}</span>
            {result.client.new_code && <span className="text-xs text-muted-foreground">{result.client.new_code}</span>}
            <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">
              <MapPin className="h-3 w-3" /> {result.regional || "Sem regional"}
            </span>
          </div>

          {result.calendars.map((calResult, idx) => {
            const cal = calResult.calendar;
            const colors = getColorClasses(cal?.color);
            return (
              <div key={cal?.id || idx} className="space-y-1.5 border-t pt-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                  {cal?.name || "—"}
                </div>
                {calResult.dates.length === 0 ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm flex items-center gap-2 text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" /> Nenhuma agenda para a região "{result.regional}" neste calendário. Primeira data livre.
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" /> Datas já agendadas ({calResult.dates.length}):
                    </p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {calResult.dates.map(d => {
                        const dayAppts = calResult.byDate[d];
                        const counts = countByVehiclePeriod(dayAppts);
                        const isPeriodos = cal?.period_mode === "Periodos";
                        const motoCap = isPeriodos ? `${cal?.capacity_moto_manha ?? 4}/${cal?.capacity_moto_tarde ?? 5}` : `${cal?.capacity_moto_manha ?? 9}`;
                        const carroCap = isPeriodos ? `${cal?.capacity_carro_manha ?? 4}/${cal?.capacity_carro_tarde ?? 5}` : `${cal?.capacity_carro_manha ?? 9}`;
                        return (
                          <div key={d} className="flex items-center gap-3 text-sm p-2 rounded-lg bg-white border">
                            <span className="font-medium w-20">{fmtDate(d)}</span>
                            <span className="text-xs text-muted-foreground">{dayAppts.length} agendamento(s)</span>
                            <div className="flex items-center gap-2 ml-auto text-xs">
                              {isPeriodos ? (
                                <>
                                  <span className="inline-flex items-center gap-1"><Bike className="h-3 w-3" /> {counts.motoManha}/{counts.motoTarde} <span className="text-muted-foreground">(cap {motoCap})</span></span>
                                  <span className="inline-flex items-center gap-1"><Car className="h-3 w-3" /> {counts.carroManha}/{counts.carroTarde} <span className="text-muted-foreground">(cap {carroCap})</span></span>
                                </>
                              ) : (
                                <>
                                  <span className="inline-flex items-center gap-1"><Bike className="h-3 w-3" /> {counts.motoDia} <span className="text-muted-foreground">/ {cal?.capacity_moto_manha ?? 9}</span></span>
                                  <span className="inline-flex items-center gap-1"><Car className="h-3 w-3" /> {counts.carroDia} <span className="text-muted-foreground">/ {cal?.capacity_carro_manha ?? 9}</span></span>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">Use estas datas ao lançar a venda para agrupar clientes da mesma região no mesmo dia.</p>
        </div>
      )}
    </div>
  );
}