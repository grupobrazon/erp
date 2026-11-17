import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, MapPin } from "lucide-react";
import MultiSelectFilter from "@/components/ui/MultiSelectFilter";

const STATUS_OPTIONS = ["Atrasada", "Próxima", "Em dia", "Sem data"];

export default function MaintenanceFilters({
  filterStates, setFilterStates,
  filterCities, setFilterCities,
  filterNeighborhoods, setFilterNeighborhoods,
  filterTrocaStart, setFilterTrocaStart,
  filterTrocaEnd, setFilterTrocaEnd,
  filterCompraStart, setFilterCompraStart,
  filterCompraEnd, setFilterCompraEnd,
  filterFollowupStart, setFilterFollowupStart,
  filterFollowupEnd, setFilterFollowupEnd,
  filterStatus, setFilterStatus,
  filterClientStatus, setFilterClientStatus,
  stateOptions, cityOptions, neighborhoodOptions,
  clientStatusOptions,
  onClear,
}) {
  const hasActiveFilters = filterStates.length > 0 || filterCities.length > 0 || filterNeighborhoods.length > 0 || filterTrocaStart || filterTrocaEnd || filterCompraStart || filterCompraEnd || filterFollowupStart || filterFollowupEnd || filterStatus || filterClientStatus;

  const stateOpts = stateOptions.map(s => ({ value: s, label: s }));
  const cityOpts = cityOptions.map(c => ({ value: c, label: c }));
  const neighborhoodOpts = neighborhoodOptions.map(n => ({ value: n, label: n }));

  return (
    <div className="mb-4 p-3 rounded-lg border bg-card flex flex-wrap items-end gap-2">
      <div className="flex items-center gap-1.5 mr-2 text-muted-foreground">
        <MapPin className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">Filtros</span>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Estados</Label>
        <MultiSelectFilter
          options={stateOpts}
          selected={filterStates}
          onChange={setFilterStates}
          allLabel="Todos"
          placeholder="Estados"
          icon={MapPin}
          className="w-40 h-8"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Cidades</Label>
        <MultiSelectFilter
          options={cityOpts}
          selected={filterCities}
          onChange={setFilterCities}
          allLabel="Todas"
          placeholder="Cidades"
          className="w-44 h-8"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Bairros</Label>
        <MultiSelectFilter
          options={neighborhoodOpts}
          selected={filterNeighborhoods}
          onChange={setFilterNeighborhoods}
          allLabel="Todos"
          placeholder="Bairros"
          className="w-44 h-8"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Lista / Status</Label>
        <Select value={filterClientStatus || "all"} onValueChange={(v) => setFilterClientStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-48 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {clientStatusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Troca - De</Label>
        <Input type="date" value={filterTrocaStart} onChange={e => setFilterTrocaStart(e.target.value)} className="w-40 h-8" />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Troca - Até</Label>
        <Input type="date" value={filterTrocaEnd} onChange={e => setFilterTrocaEnd(e.target.value)} className="w-40 h-8" />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Compra - De</Label>
        <Input type="date" value={filterCompraStart} onChange={e => setFilterCompraStart(e.target.value)} className="w-40 h-8" />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Compra - Até</Label>
        <Input type="date" value={filterCompraEnd} onChange={e => setFilterCompraEnd(e.target.value)} className="w-40 h-8" />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Follow-up - De</Label>
        <Input type="date" value={filterFollowupStart} onChange={e => setFilterFollowupStart(e.target.value)} className="w-40 h-8" />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Follow-up - Até</Label>
        <Input type="date" value={filterFollowupEnd} onChange={e => setFilterFollowupEnd(e.target.value)} className="w-40 h-8" />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Status</Label>
        <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={onClear}>
          <X className="h-3 w-3" /> Limpar
        </Button>
      )}
    </div>
  );
}