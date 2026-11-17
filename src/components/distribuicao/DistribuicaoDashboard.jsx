import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { MapPin, Building2, Users, UserCheck, Download } from "lucide-react";
import { exportNeighborhoodRegionalReport } from "@/lib/excelExport";

const REGIONAL_ORDER = [
  "BH Capital",
  "Grande BH",
  "SP Capital",
  "Grande SP",
];

export default function DistribuicaoDashboard({ filtered, selNeighborhoods, setSelNeighborhoods, sellers, selectedSellerId, setSelectedSellerId }) {
  const byNeighborhood = useMemo(() => {
    const map = {};
    for (const c of filtered) {
      const nb = c.neighborhood || "(Sem bairro)";
      if (!map[nb]) map[nb] = { name: nb, count: 0, regional: c.regional || "" };
      map[nb].count += 1;
      // Preserva a regional se já tiver sido atribuída a algum cliente do bairro
      if (!map[nb].regional && c.regional) map[nb].regional = c.regional;
    }
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [filtered]);

  // Agrupa bairros por regional, ordenado por count total da regional
  const byRegional = useMemo(() => {
    const map = {};
    for (const n of byNeighborhood) {
      const reg = n.regional || "NÃO PARAMETRIZADA";
      if (!map[reg]) map[reg] = { name: reg, count: 0, neighborhoods: [], nbCount: 0 };
      map[reg].count += n.count;
      map[reg].neighborhoods.push(n);
      map[reg].nbCount += 1;
    }
    return Object.values(map).sort((a, b) => {
      // Regionais conhecidas primeiro, depois por count
      const ai = REGIONAL_ORDER.indexOf(a.name);
      const bi = REGIONAL_ORDER.indexOf(b.name);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return b.count - a.count;
    });
  }, [byNeighborhood]);

  const byCity = useMemo(() => {
    const map = {};
    for (const c of filtered) {
      const ct = c.city || "(Sem cidade)";
      map[ct] = (map[ct] || 0) + 1;
    }
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [filtered]);

  const byState = useMemo(() => {
    const map = {};
    for (const c of filtered) {
      const st = c.state || "(Sem UF)";
      map[st] = (map[st] || 0) + 1;
    }
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [filtered]);

  const bySeller = useMemo(() => {
    const map = {};
    for (const c of filtered) {
      const s = c.seller_name || "(Sem vendedora)";
      map[s] = (map[s] || 0) + 1;
    }
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [filtered]);

  const maxCount = byNeighborhood[0]?.count || 1;
  const toggleNb = (nb) =>
    setSelNeighborhoods(selNeighborhoods.includes(nb) ? selNeighborhoods.filter((x) => x !== nb) : [...selNeighborhoods, nb]);
  const allSelected = selNeighborhoods.length > 0 && byNeighborhood.every((n) => selNeighborhoods.includes(n.name));

  const toggleRegional = (reg) => {
    const nbs = reg.neighborhoods.map((n) => n.name);
    const allIn = nbs.every((n) => selNeighborhoods.includes(n));
    if (allIn) {
      setSelNeighborhoods(selNeighborhoods.filter((x) => !nbs.includes(x)));
    } else {
      setSelNeighborhoods([...new Set([...selNeighborhoods, ...nbs])]);
    }
  };

  const handleExport = () => exportNeighborhoodRegionalReport(byNeighborhood, byRegional);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground"><Users className="h-4 w-4" /> Total no filtro</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{filtered.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" /> Bairros</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{byNeighborhood.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground"><Building2 className="h-4 w-4" /> Cidades</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{byState.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground"><UserCheck className="h-4 w-4" /> Distribuídos</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{filtered.filter((c) => c.seller_id).length}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribuições por Vendedora</CardTitle>
          <p className="text-xs text-muted-foreground">
            {filtered.filter((c) => c.seller_id).length} cliente(s) já distribuído(s) no filtro · {filtered.filter((c) => !c.seller_id).length} sem vendedora
          </p>
        </CardHeader>
        <CardContent>
          {bySeller.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cliente no filtro.</p>
          ) : (
            <div className="space-y-1.5">
              {bySeller.map((s) => {
                const seller = sellers?.find((x) => x.name === s.name);
                const active = seller && selectedSellerId === seller.id;
                return (
                  <div
                    key={s.name}
                    className={`flex justify-between items-center text-sm rounded px-1.5 py-1 cursor-pointer transition ${active ? "bg-primary/10" : "hover:bg-accent"} ${s.name === "(Sem vendedora)" ? "opacity-60" : ""}`}
                    onClick={() => {
                      if (!seller || !setSelectedSellerId) return;
                      setSelectedSellerId(active ? "all" : seller.id);
                    }}
                  >
                    <span className={`truncate ${s.name === "(Sem vendedora)" ? "italic" : "font-medium"}`}>{s.name}</span>
                    <span className="font-medium">{s.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Raio-X por Bairro</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Agrupado por regional · Maior concentração: <strong>{byNeighborhood[0]?.name || "—"}</strong> ({byNeighborhood[0]?.count || 0} clientes)
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-1 shrink-0" onClick={handleExport} disabled={byNeighborhood.length === 0}>
              <Download className="h-4 w-4" /> Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-2 pb-2 border-b">
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <Checkbox
                checked={allSelected}
                onCheckedChange={() => setSelNeighborhoods(allSelected ? [] : byNeighborhood.map((n) => n.name))}
              />
              Selecionar todos ({byNeighborhood.length})
            </label>
            {selNeighborhoods.length > 0 && (
              <span className="text-xs text-primary font-medium">{selNeighborhoods.length} bairro(s) selecionado(s)</span>
            )}
          </div>
          <div className="max-h-[520px] overflow-auto space-y-3">
            {byRegional.map((reg) => {
              const regNbs = reg.neighborhoods;
              const allRegSelected = regNbs.every((n) => selNeighborhoods.includes(n.name));
              const someRegSelected = regNbs.some((n) => selNeighborhoods.includes(n.name));
              return (
                <div key={reg.name} className="rounded-lg border">
                  <div className="flex items-center gap-2 px-2.5 py-2 bg-muted/40 border-b sticky top-0 z-10">
                    <Checkbox
                      checked={allRegSelected}
                      onCheckedChange={() => toggleRegional(reg)}
                      className={someRegSelected && !allRegSelected ? "opacity-60" : ""}
                    />
                    <span className="font-semibold text-sm flex-1 truncate">{reg.name}</span>
                    <span className="text-xs text-muted-foreground">{reg.nbCount} bairro(s)</span>
                    <span className="text-sm font-bold text-primary">{reg.count}</span>
                  </div>
                  <div className="p-1.5 space-y-1">
                    {regNbs.map((n) => (
                      <div key={n.name} className={`flex items-center gap-2 p-1.5 rounded ${selNeighborhoods.includes(n.name) ? "bg-primary/5" : ""}`}>
                        <Checkbox checked={selNeighborhoods.includes(n.name)} onCheckedChange={() => toggleNb(n.name)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center text-sm">
                            <span className="truncate font-medium">{n.name}</span>
                            <span className="text-muted-foreground ml-2">{n.count}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${(n.count / maxCount) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Por Cidade (Top 8)</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {byCity.map((c) => (
                <div key={c.name} className="flex justify-between text-sm">
                  <span className="truncate">{c.name}</span>
                  <span className="font-medium">{c.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Por Estado</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {byState.map((s) => (
                <div key={s.name} className="flex items-center gap-1.5 bg-muted px-2.5 py-1 rounded-md text-sm">
                  <span className="font-mono font-semibold">{s.name}</span>
                  <span className="text-muted-foreground">{s.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}