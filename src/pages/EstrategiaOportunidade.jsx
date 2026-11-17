import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { AlertTriangle, Droplets, TrendingUp, DollarSign, MapPin, Building2, Target, ChevronRight, ArrowLeft } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const COLORS = ["hsl(0,72%,51%)", "hsl(199,89%,38%)", "hsl(172,66%,40%)", "hsl(262,52%,55%)", "hsl(35,92%,55%)"];

const today = new Date();
today.setHours(0, 0, 0, 0);

function getStatus(equip) {
  if (!equip.next_maintenance_date) return { label: "Sem data", overdue: false, upcoming: false, days: null };
  const next = new Date(equip.next_maintenance_date + "T00:00:00");
  const diffDays = Math.ceil((next - today) / (1000 * 60 * 60 * 24));
  return {
    label: diffDays < 0 ? "Atrasada" : diffDays <= 30 ? "Próxima" : "Em dia",
    overdue: diffDays < 0,
    upcoming: diffDays >= 0 && diffDays <= 30,
    days: diffDays,
  };
}

const statusColors = {
  "Base Inativa LSOFT": "bg-slate-100 text-slate-600 border-slate-200",
  "Novo": "bg-amber-100 text-amber-700 border-amber-200",
  "Ótimo": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Ótimo - Cliente Brazon": "bg-blue-100 text-blue-700 border-blue-200",
  "Ótimo Recorrente": "bg-purple-100 text-purple-700 border-purple-200",
};

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <Card>
      <CardContent className="pt-6 flex items-center gap-4">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${color}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold font-heading truncate">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function EstrategiaOportunidade() {
  const [selectedBases, setSelectedBases] = useState(() => {
    try {
      const saved = localStorage.getItem("estrategia_selectedBases");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedState, setSelectedState] = useState("");

  useEffect(() => {
    try { localStorage.setItem("estrategia_selectedBases", JSON.stringify(selectedBases)); } catch {}
  }, [selectedBases]);

  const toggleBase = (b) => {
    setSelectedBases(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]);
    setSelectedCity(""); setSelectedState("");
  };

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ["maintenanceEquipment"],
    queryFn: async () => {
      const map = new Map();
      const b1 = await base44.entities.Equipment.list("-created_date", 5000);
      for (const r of b1) map.set(r.id, r);
      const b2 = await base44.entities.Equipment.list("created_date", 5000);
      for (const r of b2) map.set(r.id, r);
      return [...map.values()];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clientsForMaintenance"],
    queryFn: async () => {
      const map = new Map();
      const b1 = await base44.entities.Client.list("-created_date", 5000);
      for (const r of b1) map.set(r.id, r);
      const b2 = await base44.entities.Client.list("created_date", 5000);
      for (const r of b2) map.set(r.id, r);
      return [...map.values()];
    },
  });

  const avgPartPrice = 230;

  const clientMap = useMemo(() => {
    const m = new Map();
    for (const c of clients) {
      m.set(c.id, { city: c.city, state: c.state, neighborhood: c.neighborhood, base_type: c.base_type, status: c.status });
    }
    return m;
  }, [clients]);

  const baseFiltered = useMemo(() => {
    return equipment.filter(e => {
      if ((e.record_type || "equipamento") !== "equipamento") return false;
      if (e.status === "Inativo") return false;
      if (selectedBases.length > 0) {
        const c = clientMap.get(e.client_id);
        if (!c || !selectedBases.includes(c.base_type)) return false;
      }
      return true;
    });
  }, [equipment, clientMap, selectedBases]);

  const stats = useMemo(() => {
    let total = baseFiltered.length;
    let overdue = 0;
    let upcoming = 0;
    const overdueClients = new Set();
    for (const e of baseFiltered) {
      const st = getStatus(e);
      if (st.overdue) { overdue++; overdueClients.add(e.client_id); }
      if (st.upcoming) upcoming++;
    }
    return { total, overdue, upcoming, overdueClientCount: overdueClients.size };
  }, [baseFiltered]);

  const potentialBilling = stats.overdue * avgPartPrice;

  const byCity = useMemo(() => {
    const map = {};
    for (const e of baseFiltered) {
      const c = clientMap.get(e.client_id);
      if (!c || !c.city) continue;
      const key = `${c.city}|${c.state || ""}`;
      if (!map[key]) map[key] = { city: c.city, state: c.state || "", total: 0, overdue: 0, upcoming: 0, clients: new Set(), overdueClients: new Set() };
      const entry = map[key];
      entry.total++;
      entry.clients.add(e.client_id);
      const st = getStatus(e);
      if (st.overdue) { entry.overdue++; entry.overdueClients.add(e.client_id); }
      if (st.upcoming) entry.upcoming++;
    }
    return Object.values(map).map(e => ({
      ...e, clientCount: e.clients.size, overdueClientCount: e.overdueClients.size,
    })).sort((a, b) => b.overdue - a.overdue || b.total - a.total);
  }, [baseFiltered, clientMap]);

  const byNeighborhood = useMemo(() => {
    if (!selectedCity) return [];
    const map = {};
    for (const e of baseFiltered) {
      const c = clientMap.get(e.client_id);
      if (!c || c.city !== selectedCity) continue;
      const nb = c.neighborhood || "Sem bairro";
      if (!map[nb]) map[nb] = { neighborhood: nb, total: 0, overdue: 0, upcoming: 0, clients: new Set(), overdueClients: new Set() };
      const entry = map[nb];
      entry.total++;
      entry.clients.add(e.client_id);
      const st = getStatus(e);
      if (st.overdue) { entry.overdue++; entry.overdueClients.add(e.client_id); }
      if (st.upcoming) entry.upcoming++;
    }
    return Object.values(map).map(e => ({
      ...e, clientCount: e.clients.size, overdueClientCount: e.overdueClients.size,
    })).sort((a, b) => b.overdue - a.overdue || b.total - a.total);
  }, [baseFiltered, clientMap, selectedCity]);

  const byStatus = useMemo(() => {
    const map = {};
    for (const e of baseFiltered) {
      const c = clientMap.get(e.client_id);
      const status = c?.status || "Sem status";
      if (!map[status]) map[status] = { status, total: 0, overdue: 0, upcoming: 0, clients: new Set() };
      const entry = map[status];
      entry.total++;
      entry.clients.add(e.client_id);
      const st = getStatus(e);
      if (st.overdue) entry.overdue++;
      if (st.upcoming) entry.upcoming++;
    }
    return Object.values(map).map(e => ({
      ...e, clientCount: e.clients.size, potentialBilling: e.overdue * avgPartPrice,
    })).sort((a, b) => b.overdue - a.overdue || b.total - a.total);
  }, [baseFiltered, clientMap, avgPartPrice]);

  const chartData = byCity.slice(0, 10).map(c => ({ name: c.city.length > 15 ? c.city.slice(0, 12) + "…" : c.city, atrasadas: c.overdue, proximas: c.upcoming }));

  const fmtMoney = (v) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  return (
    <div>
      <PageHeader title="Estratégia & Oportunidade" description="Diagnóstico de oportunidades de troca de elementos filtrantes por região e base de clientes" />

      {/* Base de Trabalho selector */}
      <div className="mb-6 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-muted-foreground">Base de Trabalho:</span>
        <div className="flex gap-1">
          <Button size="sm" variant={selectedBases.length === 0 ? "default" : "outline"} onClick={() => { setSelectedBases([]); setSelectedCity(""); setSelectedState(""); }}>Todas</Button>
          <Button size="sm" variant={selectedBases.includes("Ótimo") ? "default" : "outline"} onClick={() => toggleBase("Ótimo")}>Ótimo</Button>
          <Button size="sm" variant={selectedBases.includes("Lsoft") ? "default" : "outline"} onClick={() => toggleBase("Lsoft")}>LSoft</Button>
          <Button size="sm" variant={selectedBases.includes("Novo") ? "default" : "outline"} onClick={() => toggleBase("Novo")}>Novo</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard icon={Droplets} label="Equipamentos na Base" value={stats.total} color="bg-primary/10 text-primary" />
            <StatCard icon={AlertTriangle} label="Trocas Atrasadas" value={stats.overdue} sub={`${stats.overdueClientCount} clientes`} color="bg-red-100 text-red-600" />
            <StatCard icon={TrendingUp} label="Próximas (30d)" value={stats.upcoming} color="bg-amber-100 text-amber-600" />
            <StatCard icon={DollarSign} label="Faturamento Potencial" value={fmtMoney(potentialBilling)} sub={`Ticket médio refil: ${fmtMoney(avgPartPrice)}`} color="bg-emerald-100 text-emerald-600" />
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base font-heading">Top 10 Cidades — Trocas Atrasadas e Próximas</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" className="text-xs" angle={-20} textAnchor="end" height={60} />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(214,18%,89%)" }} />
                    <Bar dataKey="atrasadas" fill="hsl(0,72%,51%)" radius={[4, 4, 0, 0]} name="Atrasadas" />
                    <Bar dataKey="proximas" fill="hsl(35,92%,55%)" radius={[4, 4, 0, 0]} name="Próximas" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By City / Neighborhood */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-heading flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  {selectedCity ? (
                    <span className="flex items-center gap-2">
                      <button onClick={() => setSelectedCity("")} className="hover:text-primary">
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      {selectedCity} — Por Bairro
                    </span>
                  ) : (
                    "Diagnóstico por Cidade"
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {selectedCity ? (
                  byNeighborhood.length === 0 ? (
                    <p className="py-8 text-center text-muted-foreground text-sm">Nenhum equipamento nesta cidade.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Bairro</TableHead>
                          <TableHead className="text-center">Equip.</TableHead>
                          <TableHead className="text-center">Clientes</TableHead>
                          <TableHead className="text-center">Atrasadas</TableHead>
                          <TableHead className="text-center">Cl. Atras.</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {byNeighborhood.map(n => (
                          <TableRow key={n.neighborhood} className={n.overdue > 0 ? "bg-destructive/5" : ""}>
                            <TableCell className="font-medium text-sm">{n.neighborhood}</TableCell>
                            <TableCell className="text-center text-sm">{n.total}</TableCell>
                            <TableCell className="text-center text-sm">{n.clientCount}</TableCell>
                            <TableCell className="text-center">
                              {n.overdue > 0 ? <Badge variant="destructive" className="text-xs">{n.overdue}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                            </TableCell>
                            <TableCell className="text-center text-sm">{n.overdueClientCount}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )
                ) : byCity.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground text-sm">Nenhum equipamento nesta base.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Cidade</TableHead>
                        <TableHead>UF</TableHead>
                        <TableHead className="text-center">Equip.</TableHead>
                        <TableHead className="text-center">Clientes</TableHead>
                        <TableHead className="text-center">Atrasadas</TableHead>
                        <TableHead className="text-center">Cl. Atras.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byCity.map(c => (
                        <TableRow
                          key={`${c.city}|${c.state}`}
                          className={c.overdue > 0 ? "bg-destructive/5 cursor-pointer" : "cursor-pointer"}
                          onClick={() => { setSelectedCity(c.city); setSelectedState(c.state); }}
                        >
                          <TableCell className="font-medium text-sm flex items-center gap-1">
                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            {c.city}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{c.state}</TableCell>
                          <TableCell className="text-center text-sm">{c.total}</TableCell>
                          <TableCell className="text-center text-sm">{c.clientCount}</TableCell>
                          <TableCell className="text-center">
                            {c.overdue > 0 ? <Badge variant="destructive" className="text-xs">{c.overdue}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell className="text-center text-sm">{c.overdueClientCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* By Status / Lista */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-heading flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" /> Diagnóstico por Lista
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {byStatus.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground text-sm">Nenhum equipamento nesta base.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Lista</TableHead>
                        <TableHead className="text-center">Equip.</TableHead>
                        <TableHead className="text-center">Clientes</TableHead>
                        <TableHead className="text-center">Atrasadas</TableHead>
                        <TableHead className="text-right">Fat. Pot.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byStatus.map(s => (
                        <TableRow key={s.status} className={s.overdue > 0 ? "bg-destructive/5" : ""}>
                          <TableCell>
                            <Badge variant="outline" className={statusColors[s.status] || "bg-muted text-muted-foreground border-border"}>{s.status}</Badge>
                          </TableCell>
                          <TableCell className="text-center text-sm">{s.total}</TableCell>
                          <TableCell className="text-center text-sm">{s.clientCount}</TableCell>
                          <TableCell className="text-center">
                            {s.overdue > 0 ? <Badge variant="destructive" className="text-xs">{s.overdue}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium text-emerald-600">
                            {s.potentialBilling > 0 ? fmtMoney(s.potentialBilling) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <div className="p-4 border-t bg-muted/20">
                  <div className="flex items-center gap-2 text-sm">
                    <Target className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">Faturamento potencial total (todas as listas):</span>
                    <span className="font-bold text-emerald-600">{fmtMoney(potentialBilling)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}