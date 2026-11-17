import React, { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronUp, Wrench, PackageCheck, CheckCircle2, Users, Boxes, AlertCircle, CalendarClock, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import LiberateProductionDialog from "@/components/producao/LiberateProductionDialog";

const fmtDate = (d) => d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";

const statusBadge = (status) => {
  if (status === "Aguardando Produção") return "border-yellow-300 text-yellow-700 bg-yellow-50";
  if (status === "Produção Iniciada") return "border-amber-300 text-amber-700 bg-amber-50";
  return "";
};

export default function ProductionBatchView({ groups, updateStatus, onBatchComplete, readOnly, groupBy, clientPendingCount = {} }) {
  const [expanded, setExpanded] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [forecastDate, setForecastDate] = useState("");
  const { toast } = useToast();

  const isByProduct = groupBy === "product";
  const clientHasPending = (clientId) => (clientPendingCount[clientId] || 0) > 0;

  // Ordena itens dentro de cada grupo: alerta de prioridade no topo, depois por previsão de expedição
  const priorityRank = (o) => {
    if (o.priorityAlert === "Muito Crítico") return 0;
    if (o.priorityAlert === "Crítico") return 1;
    if (o.displayBadge === "Agendamento") return 2;
    return 3;
  };
  const effectiveForecast = (o) => {
    if (o.priorityAlert) return o.priorityAlertNewForecastDate || o.expeditionForecastDate || null;
    if (o.displayBadge === "Agendamento") return o.appointmentExpeditionForecast || null;
    return o.expeditionForecastDate || null;
  };
  const sortedGroups = useMemo(() => groups.map(g => ({
    ...g,
    items: [...g.items].sort((a, b) => {
      const da = effectiveForecast(a) || "9999-12-31";
      const db = effectiveForecast(b) || "9999-12-31";
      if (da !== db) return da.localeCompare(db);
      const pa = priorityRank(a);
      const pb = priorityRank(b);
      return pa - pb;
    }),
  })), [groups]);

  const toggleSelect = (osId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(osId)) next.delete(osId);
      else next.add(osId);
      return next;
    });
  };

  const toggleSelectGroup = (items) => {
    const actionable = items.filter(o => o.status === "Aguardando Produção" || o.status === "Produção Iniciada" || o.status === "Etiqueta Gerada");
    const allSelected = actionable.length > 0 && actionable.every(o => selected.has(o.osId));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) {
        actionable.forEach(o => next.delete(o.osId));
      } else {
        actionable.forEach(o => next.add(o.osId));
      }
      return next;
    });
  };

  const selectedOrders = useMemo(() => {
    const result = [];
    for (const g of groups) {
      for (const o of g.items) {
        if (selected.has(o.osId)) result.push(o);
      }
    }
    return result;
  }, [groups, selected]);

  const toStart = selectedOrders.filter(o => o.status === "Aguardando Produção" || o.status === "Etiqueta Gerada");
  const toLiberate = selectedOrders.filter(o => o.status === "Produção Iniciada" || o.status === "Etiqueta Gerada");

  const [batchBusy, setBatchBusy] = useState(false);
  const [liberateDialogOpen, setLiberateDialogOpen] = useState(false);

  // Lote com resultado real: cada OS é revalidada no backend individualmente e o
  // aviso informa exatamente quantas foram atualizadas, quais falharam e o motivo.
  const handleBatch = async (action, liberateOpts) => {
    const today = new Date().toISOString().slice(0, 10);
    const targets = action === "start" ? toStart : toLiberate;
    if (targets.length === 0 || batchBusy) return;
    setBatchBusy(true);
    const results = [];
    for (const o of targets) {
      let data;
      if (action === "start") {
        data = { status: "Produção Iniciada", production_started_date: today, production_forecast_date: forecastDate || null };
      } else {
        const liberateDate = liberateOpts?.retroactive ? liberateOpts.liberateDate : today;
        const notesSuffix = liberateOpts?.retroactive
          ? `\n\n[Liberação retroativa — ${liberateDate}]: ${liberateOpts.justification}`
          : "";
        data = {
          status: "Produção Liberada",
          production_liberated_date: liberateDate,
          production_completed: true,
          production_notes: (o.productionNotes || "") + notesSuffix,
        };
      }
      const r = await updateStatus(o.osId, data, null, o.status, o.osCode, { silent: true });
      results.push({ code: o.osCode, ok: r.success === true, shortReason: r.shortReason || "falha ao atualizar" });
    }
    setBatchBusy(false);
    setSelected(new Set());
    if (action === "start") setForecastDate("");
    if (onBatchComplete) onBatchComplete();
    const okCount = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok);
    const actionLabel = action === "start" ? "iniciada" : "liberada";
    if (failed.length === 0) {
      toast({ title: `Produção ${actionLabel}`, description: `${okCount} pedido(s) atualizado(s).` });
    } else if (okCount === 0) {
      toast({ title: "Nenhum pedido foi atualizado", description: failed.map(f => `${f.code}: ${f.shortReason}`).join(" · "), variant: "destructive" });
    } else {
      toast({
        title: `${okCount} pedido(s) atualizado(s) e ${failed.length} não puderam ser atualizados`,
        description: `Não atualizados — ${failed.map(f => `${f.code}: ${f.shortReason}`).join(" · ")}`,
        variant: "destructive",
      });
    }
  };

  if (groups.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        Nenhum item em produção com os filtros atuais.
      </div>
    );
  }

  const totalQty = groups.reduce((s, g) => s + g.totalQty, 0);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
        {isByProduct ? <Boxes className="h-4 w-4" /> : <Users className="h-4 w-4" />}
        <span>
          {groups.length} {isByProduct ? "produto(s)" : "cliente(s)"} —{" "}
          <strong>{totalQty}</strong> unidades totais a produzir
        </span>
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-8"></TableHead>
              {!readOnly && <TableHead className="w-10"></TableHead>}
              <TableHead>{isByProduct ? "Produto" : "Cliente"}</TableHead>
              <TableHead>{isByProduct ? "Tipo (Grupo)" : "Código"}</TableHead>
              <TableHead className="text-center">Qtd Total</TableHead>
              <TableHead className="text-center">Pedidos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedGroups.map((g, i) => {
              const key = g.key + "_" + i;
              const isOpen = expanded[key];
              const actionable = g.items.filter(o => o.status === "Aguardando Produção" || o.status === "Produção Iniciada" || o.status === "Etiqueta Gerada");
              const allSelected = actionable.length > 0 && actionable.every(o => selected.has(o.osId));
              const someSelected = actionable.some(o => selected.has(o.osId));
              return (
                <React.Fragment key={key}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))}
                  >
                    <TableCell className="text-center">
                      {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </TableCell>
                    {!readOnly && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={allSelected ? true : someSelected ? "indeterminate" : false}
                          onCheckedChange={() => toggleSelectGroup(g.items)}
                          disabled={actionable.length === 0}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{g.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{g.subtitle}</Badge>
                    </TableCell>
                    <TableCell className="text-center font-bold text-primary text-base">{g.totalQty}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span>{g.items.length}</span>
                        {!isByProduct && clientHasPending(g.key) ? (
                          <Badge variant="outline" className="text-[10px] border-yellow-300 text-yellow-700 bg-yellow-50 gap-1">
                            <AlertCircle className="h-2.5 w-2.5" /> {clientPendingCount[g.key]} pend.
                          </Badge>
                        ) : !isByProduct && g.items.every(o => o.status === "Produção Iniciada") ? (
                          <Badge variant="outline" className="text-[10px] border-teal-300 text-teal-700 bg-teal-50">
                            Pronto
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow className="bg-muted/20">
                      <TableCell></TableCell>
                      {!readOnly && <TableCell></TableCell>}
                      <TableCell colSpan={4}>
                        <div className="space-y-1 py-1">
                          {g.items.map((o, j) => {
                            const canAct = o.status === "Aguardando Produção" || o.status === "Produção Iniciada" || o.status === "Etiqueta Gerada";
                            const isSelected = selected.has(o.osId);
                            return (
                              <div key={j} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0 px-1">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {!readOnly && (
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={() => toggleSelect(o.osId)}
                                      disabled={!canAct}
                                    />
                                  )}
                                  <span className="font-mono font-semibold flex-shrink-0">{o.osCode}</span>
                                  {o.displayBadge && (
                                    <span className={`h-2 w-2 rounded-full flex-shrink-0 ${o.displayBadge === "Muito Crítico" ? "bg-red-500" : o.displayBadge === "Crítico" ? "bg-amber-500" : "bg-emerald-500"}`} title={o.displayBadge === "Agendamento" ? `Agenda ${fmtDate(o.appointmentDate)}` : o.displayBadge} />
                                  )}
                                  <span className="text-muted-foreground truncate">{o.lineLabel}</span>
                                  {o.lineSubLabel && (
                                    <Badge variant="outline" className="text-[10px] flex-shrink-0 hidden sm:inline-flex">{o.lineSubLabel}</Badge>
                                  )}
                                  {o.purifierModel && (
                                    <Badge variant="outline" className="text-[10px] flex-shrink-0 border-primary/30 text-primary bg-primary/5 hidden sm:inline-flex">Modelo: {o.purifierModel}</Badge>
                                  )}
                                  {o.purifierModels && (
                                    <span className="text-[10px] text-primary flex-shrink-0 hidden md:inline truncate max-w-[200px]">{o.purifierModels}</span>
                                  )}
                                  {isByProduct && clientHasPending(o.clientId) && o.status === "Produção Iniciada" && (
                                    <Badge variant="outline" className="text-[10px] flex-shrink-0 border-yellow-300 text-yellow-700 bg-yellow-50 gap-1" title="Cliente possui itens pendentes de produção">
                                      <AlertCircle className="h-2.5 w-2.5" /> Cliente pend.
                                    </Badge>
                                  )}
                                  <span className="text-muted-foreground hidden md:inline flex-shrink-0">Pedido {o.saleOrder || "—"}</span>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <Badge variant="outline" className={`text-[10px] ${statusBadge(o.status)}`}>{o.status}</Badge>
                                  {o.status === "Produção/Expedição" && (
                                    <span className="text-[9px] text-muted-foreground" title="Sem ação da Produção — a Logística está decidindo entre expedir do estoque ou enviar para produção">aguardando Logística</span>
                                  )}
                                  <span className="text-muted-foreground hidden sm:inline">Enviado: {fmtDate(o.sentDate)}</span>
                                  {o.priorityAlertNewForecastDate ? (
                                    <span className="hidden sm:inline font-medium text-amber-700">
                                      Exp.: {fmtDate(o.priorityAlertNewForecastDate)}
                                    </span>
                                  ) : o.displayBadge === "Agendamento" && o.appointmentExpeditionForecast ? (
                                    <span className="hidden sm:inline font-medium text-emerald-700">
                                      Exp.: {fmtDate(o.appointmentExpeditionForecast)}
                                    </span>
                                  ) : o.expeditionForecastDate ? (
                                    <span className="hidden sm:inline font-medium text-primary">
                                      Exp.: {fmtDate(o.expeditionForecastDate)}
                                    </span>
                                  ) : null}
                                  {o.displayBadge === "Agendamento" && o.appointmentDate && (
                                    <span className="hidden md:inline text-[10px] text-emerald-600 flex-shrink-0">
                                      Agenda: {fmtDate(o.appointmentDate)}
                                    </span>
                                  )}
                                  {o.startedDate && (
                                    <span className="text-muted-foreground hidden sm:inline">Iniciado: {fmtDate(o.startedDate)}</span>
                                  )}
                                  {o.forecastDate && (
                                    <span className="text-amber-600 font-medium hidden sm:inline">Previsão: {fmtDate(o.forecastDate)}</span>
                                  )}
                                  <span className="font-bold text-primary">{o.qty}x</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {selected.size > 0 && !readOnly && (
        <div className="sticky bottom-4 mt-3 rounded-lg border bg-card shadow-lg p-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span><strong>{selected.size}</strong> pedido(s) selecionado(s)</span>
          </div>
          <div className="flex items-center gap-2">
            {toStart.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" /> Previsão:
                </Label>
                <Input
                  type="date"
                  className="h-8 w-[150px] text-xs"
                  value={forecastDate}
                  onChange={(e) => setForecastDate(e.target.value)}
                />
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>Limpar</Button>
            {toLiberate.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                disabled={batchBusy}
                onClick={() => setLiberateDialogOpen(true)}
              >
                <PackageCheck className="h-3 w-3" /> {batchBusy ? "Processando..." : `Liberar (${toLiberate.length})`}
              </Button>
            )}
            {toStart.length > 0 && (
              <Button
                size="sm"
                className="gap-1"
                disabled={batchBusy}
                onClick={() => handleBatch("start")}
              >
                <Wrench className="h-3 w-3" /> {batchBusy ? "Processando..." : `Iniciar Produção (${toStart.length})`}
              </Button>
            )}
          </div>
        </div>
      )}

      <LiberateProductionDialog
        open={liberateDialogOpen}
        onOpenChange={setLiberateDialogOpen}
        osCode={`${toLiberate.length} pedido(s)`}
        busy={batchBusy}
        onConfirm={async (opts) => {
          setLiberateDialogOpen(false);
          await handleBatch("liberate", opts);
        }}
      />
    </div>
  );
}