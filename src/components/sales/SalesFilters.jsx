import React from "react";
import { Search, Truck, CreditCard, CircleDollarSign, User, CalendarDays, ClipboardList, Filter, X, Paperclip, AlertTriangle, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import MultiSelectFilter from "@/components/ui/MultiSelectFilter";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const MODALIDADE_OPTIONS = [
  { value: "Envio", label: "Envio" },
  { value: "Entrega Própria", label: "Entrega Própria" },
  { value: "Entrega + Instalação", label: "Entrega + Instalação" },
];

const MOMENTO_OPTIONS = [
  { value: "Antecipada", label: "Antecipada" },
  { value: "Na Entrega", label: "Na Entrega" },
  { value: "Na Instalação", label: "Na Instalação" },
];

const PGTO_STATUS_OPTIONS = [
  { value: "Pendente", label: "Pendente" },
  { value: "Realizada", label: "Realizada" },
];

const ETAPA_OPTIONS = [
  { value: "Orçamento", label: "Orçamento" },
  { value: "Confirmada", label: "Confirmada" },
  { value: "Pagamento Aprovado", label: "Pagamento Aprovado" },
  { value: "Em OS", label: "Em OS" },
  { value: "Faturada", label: "Faturada" },
  { value: "Concluída", label: "Concluída" },
  { value: "Cancelada", label: "Cancelada" },
];

const TEM_OS_OPTIONS = [
  { value: "sim", label: "Com OS vinculada" },
  { value: "nao", label: "Sem OS" },
];

const TEM_COMPROVANTE_OPTIONS = [
  { value: "sim", label: "Com comprovante" },
  { value: "nao", label: "Sem comprovante" },
];

const PRIORITY_ALERT_OPTIONS = [
  { value: "Crítico", label: "Crítico" },
  { value: "Muito Crítico", label: "Muito Crítico" },
];

export default function SalesFilters({
  search, setSearch,
  etapa, setEtapa,
  modalidade, setModalidade,
  momento, setMomento,
  pgtoStatus, setPgtoStatus,
  vendedor, setVendedor,
  osStatus, setOsStatus,
  temOs, setTemOs,
  temComprovante, setTemComprovante,
  estado, setEstado,
  estadoOptions,
  priorityAlert, setPriorityAlert,
  dataDe, setDataDe,
  dataAte, setDataAte,
  previsaoDe, setPrevisaoDe,
  previsaoAte, setPrevisaoAte,
  sellerOptions,
  osStatusOptions,
  onClear,
  activeCount,
}) {
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-col lg:flex-row gap-3 flex-wrap">
        {/* Busca */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, código, vendedor, pedido ou OS... (vários pedidos separados por ;)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Etapa (multi) */}
        <MultiSelectFilter
          icon={Filter}
          options={ETAPA_OPTIONS}
          selected={etapa}
          onChange={setEtapa}
          placeholder="Etapa"
          allLabel="Todas as etapas"
        />

        {/* Modalidade (multi) */}
        <MultiSelectFilter
          icon={Truck}
          options={MODALIDADE_OPTIONS}
          selected={modalidade}
          onChange={setModalidade}
          placeholder="Modalidade"
          allLabel="Todas as modalidades"
        />

        {/* Vendedor (multi) */}
        <MultiSelectFilter
          icon={User}
          options={sellerOptions}
          selected={vendedor}
          onChange={setVendedor}
          placeholder="Vendedor"
          allLabel="Todos os vendedores"
        />

        {/* Tem OS (multi) */}
        <MultiSelectFilter
          icon={ClipboardList}
          options={TEM_OS_OPTIONS}
          selected={temOs}
          onChange={setTemOs}
          placeholder="OS vinculada"
          allLabel="Com ou sem OS"
        />

        {/* Estado (multi) */}
        <MultiSelectFilter
          icon={MapPin}
          options={estadoOptions}
          selected={estado}
          onChange={setEstado}
          placeholder="Estado"
          allLabel="Todos os estados"
        />

        {/* Tem comprovante (multi) */}
        <MultiSelectFilter
          icon={Paperclip}
          options={TEM_COMPROVANTE_OPTIONS}
          selected={temComprovante}
          onChange={setTemComprovante}
          placeholder="Comprovante"
          allLabel="Com ou sem comprovante"
        />

        {/* Alerta de prioridade (multi) */}
        <MultiSelectFilter
          icon={AlertTriangle}
          options={PRIORITY_ALERT_OPTIONS}
          selected={priorityAlert}
          onChange={setPriorityAlert}
          placeholder="Alerta de prioridade"
          allLabel="Todos os alertas"
        />
      </div>

      {/* Linha 2 — filtros avançados */}
      <div className="flex flex-col lg:flex-row gap-3 flex-wrap items-end">
        {/* Momento do pagamento (multi) */}
        <MultiSelectFilter
          icon={CreditCard}
          options={MOMENTO_OPTIONS}
          selected={momento}
          onChange={setMomento}
          placeholder="Momento do pagamento"
          allLabel="Todos os momentos"
        />

        {/* Status do pagamento (multi) */}
        <MultiSelectFilter
          icon={CircleDollarSign}
          options={PGTO_STATUS_OPTIONS}
          selected={pgtoStatus}
          onChange={setPgtoStatus}
          placeholder="Status do pagamento"
          allLabel="Todos os status"
        />

        {/* Status da OS (multi) */}
        <MultiSelectFilter
          icon={ClipboardList}
          options={osStatusOptions}
          selected={osStatus}
          onChange={setOsStatus}
          placeholder="Status da OS"
          allLabel="Todos os status de OS"
        />

        {/* Data de */}
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> De</Label>
          <Input type="date" value={dataDe} onChange={e => setDataDe(e.target.value)} className="w-[150px]" />
        </div>

        {/* Data até */}
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Até</Label>
          <Input type="date" value={dataAte} onChange={e => setDataAte(e.target.value)} className="w-[150px]" />
        </div>

        {/* Previsão de expedição de */}
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Previsão Exp. de</Label>
          <Input type="date" value={previsaoDe || ""} onChange={e => setPrevisaoDe(e.target.value)} className="w-[150px]" />
        </div>

        {/* Previsão de expedição até */}
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Previsão Exp. até</Label>
          <Input type="date" value={previsaoAte || ""} onChange={e => setPrevisaoAte(e.target.value)} className="w-[150px]" />
        </div>

        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear} className="gap-1 text-muted-foreground">
            <X className="h-3.5 w-3.5" /> Limpar filtros ({activeCount})
          </Button>
        )}
      </div>
    </div>
  );
}