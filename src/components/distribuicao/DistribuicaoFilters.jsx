import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import MultiSelectPopover from "./MultiSelectPopover";

const BASES = ["Ótimo", "Lsoft", "Novo"];
const STATUSES = ["Base Inativa LSOFT", "Ótimo - Cliente Brazon", "Ótimo", "Ótimo Recorrente", "Novo"];
const MAINT_STATUSES = [
  { value: "Atrasado", color: "bg-destructive text-destructive-foreground border-destructive" },
  { value: "Vai Vencer", color: "bg-amber-500 text-white border-amber-500" },
  { value: "Em Dia", color: "bg-emerald-500 text-white border-emerald-500" },
  { value: "Sem Equipamento", color: "bg-muted text-muted-foreground border-input" },
];

export default function DistribuicaoFilters({
  selBases, setSelBases, selStatuses, setSelStatuses,
  selStates, setSelStates, selCities, setSelCities,
  selRegionals, setSelRegionals,
  selMaintStatus, setSelMaintStatus,
  selFilterNeighborhoods, setSelFilterNeighborhoods,
  stateOptions, regionalOptions, cityOptions, neighborhoodOptions, onClear, totalFiltered, totalClients,
}) {
  const toggleBase = (b) => setSelBases(selBases.includes(b) ? selBases.filter((x) => x !== b) : [...selBases, b]);
  const toggleStatus = (s) => setSelStatuses(selStatuses.includes(s) ? selStatuses.filter((x) => x !== s) : [...selStatuses, s]);
  const toggleMaint = (m) => setSelMaintStatus(selMaintStatus.includes(m) ? selMaintStatus.filter((x) => x !== m) : [...selMaintStatus, m]);
  return (
    <div className="flex flex-wrap items-end gap-4 mb-4 p-4 bg-card rounded-lg border">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted-foreground">Base</span>
        <div className="flex gap-1">
          {BASES.map((b) => (
            <button
              key={b}
              onClick={() => toggleBase(b)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                selBases.includes(b) ? "bg-primary text-primary-foreground border-primary" : "bg-transparent border-input hover:bg-accent"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted-foreground">Status da Lista</span>
        <div className="flex flex-wrap gap-1 max-w-[420px]">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                selStatuses.includes(s) ? "bg-primary text-primary-foreground border-primary" : "bg-transparent border-input hover:bg-accent"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted-foreground">Status de Manutenção</span>
        <div className="flex flex-wrap gap-1 max-w-[420px]">
          {MAINT_STATUSES.map((m) => (
            <button
              key={m.value}
              onClick={() => toggleMaint(m.value)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                selMaintStatus.includes(m.value) ? m.color : "bg-transparent border-input hover:bg-accent"
              }`}
            >
              {m.value}
            </button>
          ))}
        </div>
      </div>
      <MultiSelectPopover label="Regional" options={regionalOptions} selected={selRegionals} onChange={setSelRegionals} placeholder="Todas as regionais" />
      <MultiSelectPopover label="Estado (UF)" options={stateOptions} selected={selStates} onChange={setSelStates} placeholder="Todos os estados" />
      <MultiSelectPopover label="Cidade" options={cityOptions} selected={selCities} onChange={setSelCities} placeholder={selStates.length || selRegionals.length ? "Todas as cidades" : "Selecione um estado/regional primeiro"} />
      <MultiSelectPopover label="Bairro" options={neighborhoodOptions} selected={selFilterNeighborhoods} onChange={setSelFilterNeighborhoods} placeholder={selCities.length || selRegionals.length ? "Todos os bairros" : "Selecione uma cidade/regional primeiro"} />
      <Button variant="ghost" size="sm" onClick={onClear}>Limpar filtros</Button>
      <Badge variant="secondary" className="ml-auto">
        {totalFiltered} de {totalClients} clientes
      </Badge>
    </div>
  );
}