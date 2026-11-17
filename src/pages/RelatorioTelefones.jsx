import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import MultiSelectFilter from "@/components/ui/MultiSelectFilter";
import { Phone, Download, Filter, Users } from "lucide-react";
import { exportClientPhones } from "@/lib/excelExport";

const PHONE_FIELDS = [
  "phone1", "phone2", "phone3", "phone4", "phone5",
  "zoox_phone1", "zoox_phone2", "zoox_phone3", "zoox_phone4", "zoox_phone5", "zoox_phone6", "zoox_phone7",
];

export default function RelatorioTelefones() {
  const [filters, setFilters] = useState({ states: [], cities: [], neighborhoods: [], name: "" });
  const [appliedFilters, setAppliedFilters] = useState({ states: [], cities: [], neighborhoods: [], name: "" });

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients-phones-report"],
    queryFn: async () => {
      const all = [];
      let skip = 0;
      const limit = 500;
      while (true) {
        const batch = await base44.entities.Client.list("-created_date", limit, skip);
        all.push(...batch);
        if (batch.length < limit) break;
        skip += limit;
        if (skip > 6000) break;
      }
      return all;
    },
  });

  // Unique states/cities/neighborhoods for filter dropdowns
  const states = useMemo(() => {
    const s = new Set(clients.map((c) => c.state).filter(Boolean));
    return Array.from(s).sort();
  }, [clients]);

  const cities = useMemo(() => {
    const s = new Set(
      clients
        .filter((c) => appliedFilters.states.length === 0 || appliedFilters.states.includes(c.state))
        .map((c) => c.city)
        .filter(Boolean)
    );
    return Array.from(s).sort();
  }, [clients, appliedFilters.states]);

  const neighborhoods = useMemo(() => {
    const s = new Set(
      clients
        .filter((c) =>
          (appliedFilters.states.length === 0 || appliedFilters.states.includes(c.state)) &&
          (appliedFilters.cities.length === 0 || appliedFilters.cities.includes(c.city))
        )
        .map((c) => c.neighborhood)
        .filter(Boolean)
    );
    return Array.from(s).sort();
  }, [clients, appliedFilters.states, appliedFilters.cities]);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (appliedFilters.states.length > 0 && !appliedFilters.states.includes(c.state)) return false;
      if (appliedFilters.cities.length > 0 && !appliedFilters.cities.includes(c.city)) return false;
      if (appliedFilters.neighborhoods.length > 0 && !appliedFilters.neighborhoods.includes(c.neighborhood)) return false;
      if (appliedFilters.name && !(c.name || "").toLowerCase().includes(appliedFilters.name.toLowerCase())) return false;
      const hasPhone = PHONE_FIELDS.some((f) => c[f]);
      return hasPhone;
    });
  }, [clients, appliedFilters]);

  const maxPhones = useMemo(() => {
    let max = 0;
    for (const c of filtered) {
      const count = PHONE_FIELDS.filter((f) => c[f]).length;
      if (count > max) max = count;
    }
    return max;
  }, [filtered]);

  const handleApply = () => setAppliedFilters(filters);
  const handleClear = () => {
    setFilters({ states: [], cities: [], neighborhoods: [], name: "" });
    setAppliedFilters({ states: [], cities: [], neighborhoods: [], name: "" });
  };

  const handleExport = () => exportClientPhones(filtered);

  return (
    <div className="space-y-4">
      <PageHeader title="Relatório de Telefones" description="Lista de clientes com todos os telefones, filtrável por estado, cidade e bairro." icon={Phone} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Estado</Label>
              <MultiSelectFilter
                options={states.map((s) => ({ value: s, label: s }))}
                selected={filters.states}
                onChange={(v) => setFilters((f) => ({ ...f, states: v, cities: [], neighborhoods: [] }))}
                placeholder="Todos os estados"
                allLabel="Todos os estados"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cidade</Label>
              <MultiSelectFilter
                options={cities.map((c) => ({ value: c, label: c }))}
                selected={filters.cities}
                onChange={(v) => setFilters((f) => ({ ...f, cities: v, neighborhoods: [] }))}
                placeholder="Todas as cidades"
                allLabel="Todas as cidades"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bairro</Label>
              <MultiSelectFilter
                options={neighborhoods.map((n) => ({ value: n, label: n }))}
                selected={filters.neighborhoods}
                onChange={(v) => setFilters((f) => ({ ...f, neighborhoods: v }))}
                placeholder="Todos os bairros"
                allLabel="Todos os bairros"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nome do cliente</Label>
              <Input value={filters.name} onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))} placeholder="Buscar por nome..." />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={handleApply} size="sm">Aplicar Filtros</Button>
            <Button onClick={handleClear} variant="outline" size="sm">Limpar</Button>
            <Button onClick={handleExport} variant="secondary" size="sm" className="ml-auto" disabled={filtered.length === 0}>
              <Download className="h-4 w-4" /> Exportar Excel ({filtered.length})
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Users} title="Nenhum cliente encontrado" description="Ajuste os filtros para ver resultados." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-2 font-medium whitespace-nowrap">Nome</th>
                    <th className="py-2 px-2 font-medium whitespace-nowrap">Código</th>
                    <th className="py-2 px-2 font-medium whitespace-nowrap">Estado</th>
                    <th className="py-2 px-2 font-medium whitespace-nowrap">Cidade</th>
                    <th className="py-2 px-2 font-medium whitespace-nowrap">Bairro</th>
                    {Array.from({ length: maxPhones }).map((_, i) => (
                      <th key={i} className="py-2 px-2 font-medium whitespace-nowrap">Telefone {i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 200).map((c) => {
                    const phones = PHONE_FIELDS.map((f) => c[f]).filter(Boolean);
                    return (
                      <tr key={c.id} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-2">{c.name}</td>
                        <td className="py-2 px-2 text-muted-foreground">{c.new_code || c.old_code || ""}</td>
                        <td className="py-2 px-2">{c.state || ""}</td>
                        <td className="py-2 px-2">{c.city || ""}</td>
                        <td className="py-2 px-2">{c.neighborhood || ""}</td>
                        {Array.from({ length: maxPhones }).map((_, i) => (
                          <td key={i} className="py-2 px-2">{phones[i] || ""}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length > 200 && (
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  Mostrando 200 de {filtered.length} registros. Exporte para ver todos.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}