import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wrench, PackageCheck, AlertCircle, AlertTriangle, Calendar, ChevronDown, ChevronUp } from "lucide-react";
// AlertCircle re-exported for the cancellation section below
import LiberateProductionDialog from "@/components/producao/LiberateProductionDialog";
import ProductionCancellationDecision from "@/components/producao/ProductionCancellationDecision";

const statusColors = {
  "Produção/Expedição": "bg-orange-100 text-orange-700",
  "Aguardando Produção": "bg-yellow-100 text-yellow-700",
  "Produção Iniciada": "bg-amber-100 text-amber-700",
  "Produção Liberada": "bg-teal-100 text-teal-700",
};

const fmtDate = (d) => d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";

const fmtDateTime = (d) => {
  if (!d) return "";
  const date = new Date(d.length === 10 ? d + "T00:00:00" : d);
  const dia = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${dia} às ${hora}`;
};

// Última movimentação registrada na auditoria da OS (status_history).
// Sem histórico = registro antigo: não inventa autor.
const lastMovement = (os) => {
  const h = Array.isArray(os?.status_history) ? os.status_history : [];
  return h.length > 0 ? h[h.length - 1] : null;
};

export default function ProductionTable({ orders, view, deadlines, setDeadlines, updateStatus, readOnly, clientPendingCount = {} }) {
  const isConcluidos = view === "concluidos";
  const [busyId, setBusyId] = useState(null);
  const [liberatingOs, setLiberatingOs] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>OS / Pedido</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Itens</TableHead>
            <TableHead className="text-center">Data Venda</TableHead>
            <TableHead className="text-center">Enviado em</TableHead>
            <TableHead className="text-center">Previsão Expedição</TableHead>
            <TableHead className="text-center">Iniciado em</TableHead>
            <TableHead className="text-center">Modalidade</TableHead>
            <TableHead className="text-center">Status</TableHead>
            {!isConcluidos ? (<>
              <TableHead className="text-center">Previsão / Ação</TableHead>
              <TableHead className="text-center">Status de Movimentação</TableHead>
              <TableHead className="text-center">Ação</TableHead>
            </>) : (
              <TableHead className="text-center">Liberado em</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map(os => {
            const mov = lastMovement(os);
            const isExpanded = expandedId === os.id;
            return (
              <React.Fragment key={os.id}>
              <TableRow className={os.priorityAlert === "Muito Crítico" ? "bg-red-50/50" : os.priorityAlert === "Crítico" ? "bg-amber-50/50" : os.displayBadge === "Agendamento" ? "bg-emerald-50/40" : ""}>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {os.displayBadge && (
                      <span className={`h-2.5 w-2.5 rounded-full ${os.displayBadge === "Muito Crítico" ? "bg-red-500" : os.displayBadge === "Crítico" ? "bg-amber-500" : "bg-emerald-500"}`} title={os.displayBadge} />
                    )}
                    <div>
                      <div className="font-mono font-semibold text-sm">{os.code}</div>
                      <div className="text-xs text-muted-foreground">Pedido {os.sale_order_number || "—"}</div>
                    </div>
                  </div>
                  {os.displayBadge === "Muito Crítico" || os.displayBadge === "Crítico" ? (
                    <div className={`mt-1 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${os.displayBadge === "Muito Crítico" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      <AlertTriangle className="h-2.5 w-2.5" /> {os.displayBadge}
                    </div>
                  ) : os.displayBadge === "Agendamento" ? (
                    <div className="mt-1 inline-flex flex-col gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                      <span className="flex items-center gap-1"><Calendar className="h-2.5 w-2.5" /> Agenda {fmtDate(os.appointmentDate)}</span>
                      <span className="pl-3.5">Exp.: {fmtDate(os.appointmentExpeditionForecast)}</span>
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="font-medium text-sm">{os.client_name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{os.clientCode}</div>
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    <div className="flex items-start gap-1">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : os.id)}
                        className="mt-0.5 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex-shrink-0"
                        title={isExpanded ? "Recolher itens" : "Ver todos os itens"}
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                      <div className="space-y-0.5 min-w-0">
                        {os.items.slice(0, 2).map((item, i) => (
                          <div key={i} className="text-xs">
                            <div className="flex items-center gap-1">
                              <span className="truncate max-w-[140px]">{item.product_name}</span>
                              <span className="font-bold text-primary flex-shrink-0">{item.quantity}x</span>
                            </div>
                            {item.purifier_model && (
                              <div className="text-[10px] text-primary ml-3">Modelo: {item.purifier_model}</div>
                            )}
                          </div>
                        ))}
                        {os.items.length > 2 && !isExpanded && (
                          <div className="text-xs text-muted-foreground">+{os.items.length - 2} mais</div>
                        )}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-center text-xs">{fmtDate(os.saleDate)}</TableCell>
                <TableCell className="text-center text-xs">{fmtDate(os.sentDate)}</TableCell>
                <TableCell className="text-center text-xs">
                  {os.priorityAlertNewForecastDate ? (
                    <div className="flex flex-col items-center">
                      <span className="font-semibold text-amber-700">{fmtDate(os.priorityAlertNewForecastDate)}</span>
                      <span className="text-[10px] text-amber-600">nova previsão</span>
                    </div>
                  ) : os.displayBadge === "Agendamento" && os.appointmentExpeditionForecast ? (
                    <div className="flex flex-col items-center">
                      <span className="font-medium text-emerald-700">{fmtDate(os.appointmentExpeditionForecast)}</span>
                      <span className="text-[10px] text-emerald-600">2 dias úteis antes</span>
                    </div>
                  ) : os.expeditionForecastDate ? (
                    <span className="font-medium text-primary">{fmtDate(os.expeditionForecastDate)}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-center text-xs">{fmtDate(os.production_started_date)}</TableCell>
                <TableCell className="text-center">
                  <Badge className={
                    os.deliveryModality === "Envio"
                      ? "bg-cyan-100 text-cyan-700"
                      : "bg-violet-100 text-violet-700"
                  }>
                    {os.deliveryModality === "Envio" ? "Envio" : "Atendimento"}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <Badge className={statusColors[os.status] || "bg-muted text-muted-foreground"}>{os.status}</Badge>
                  {os.production_cancellation_requested && (
                    <div className="mt-1">
                      <Badge className="bg-purple-100 text-purple-700 text-[10px]">Cancel. Solicitado</Badge>
                    </div>
                  )}
                </TableCell>
                {!isConcluidos ? (<>
                  <TableCell>
                    {readOnly ? (
                      <span className="text-xs text-muted-foreground text-center block">Somente leitura</span>
                    ) : os.status === "Aguardando Produção" || os.status === "Etiqueta Gerada" ? (
                      <div className="space-y-1">
                        {os.status === "Etiqueta Gerada" && (
                          <div className="text-[10px] text-muted-foreground text-center">Etiqueta já gerada</div>
                        )}
                        <Label className="text-[10px] text-muted-foreground block text-center">Previsão de Conclusão</Label>
                        <Input
                          type="date"
                          className="h-8 text-xs"
                          value={deadlines[os.id] ?? os.production_forecast_date ?? ""}
                          onChange={(e) => setDeadlines(prev => ({ ...prev, [os.id]: e.target.value }))}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 w-full"
                          disabled={busyId === os.id}
                          onClick={async () => {
                            setBusyId(os.id);
                            await updateStatus(os.id, {
                              status: "Produção Iniciada",
                              production_started_date: new Date().toISOString().slice(0, 10),
                              production_forecast_date: deadlines[os.id] ?? os.production_forecast_date ?? null,
                            }, "Produção iniciada", os.status, os.code);
                            setBusyId(null);
                          }}
                        >
                          <Wrench className="h-3 w-3" /> Iniciar Produção
                        </Button>
                      </div>
                    ) : os.status === "Produção Iniciada" ? (
                      <div className="space-y-1">
                        <div className="text-[10px] text-muted-foreground text-center">
                          Previsão: <span className="font-medium text-foreground">{fmtDate(os.production_forecast_date)}</span>
                        </div>
                        {(clientPendingCount[os.client_id] || 0) > 0 && (
                          <div className="flex items-center justify-center gap-1 text-[10px] text-yellow-700" title={`Cliente possui ${clientPendingCount[os.client_id]} item(s) pendente(s) de produção`}>
                            <AlertCircle className="h-3 w-3" />
                            <span>{clientPendingCount[os.client_id]} item(s) do cliente não iniciado(s)</span>
                          </div>
                        )}
                        <Button
                          size="sm"
                          className="gap-1 w-full"
                          disabled={busyId === os.id}
                          onClick={() => setLiberatingOs(os)}
                        >
                          <PackageCheck className="h-3 w-3" /> Liberar
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground text-center block">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {mov ? (
                      <div className="text-xs leading-snug space-y-0.5">
                        <div>
                          {mov.actor ? (
                            <>Movimentado por <span className="font-medium text-foreground">{mov.actor}</span>{mov.date ? <> — {fmtDateTime(mov.date)}</> : null}</>
                          ) : (
                            <>Movimentado automaticamente pelo sistema{mov.date ? <> — {fmtDateTime(mov.date)}</> : null}</>
                          )}
                        </div>
                        <div className="text-muted-foreground">
                          Status atual: <span className="font-medium text-foreground">{os.status}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground text-center block">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {os.isRemessa || os.status !== "Produção/Expedição" ? (
                      <span className="text-xs text-muted-foreground text-center block">—</span>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <Badge className="bg-sky-100 text-sky-700 border-transparent">Aguardando definição da Logística</Badge>
                        <span className="text-[10px] text-muted-foreground">Estoque ou Produção</span>
                      </div>
                    )}
                  </TableCell>
                </>) : (
                  <TableCell className="text-center text-xs">
                    <div className="flex flex-col items-center gap-0.5">
                      {os.stock_confirmed_date && !os.production_liberated_date ? (
                        <span className="font-medium text-emerald-700">Estoque confirmado: {fmtDate(os.stock_confirmed_date)}</span>
                      ) : os.production_liberated_date ? (
                        <span className="font-medium text-teal-700">Liberado: {fmtDate(os.production_liberated_date)}</span>
                      ) : (
                        <span className="font-medium text-muted-foreground">Entregue (correção manual)</span>
                      )}
                      {os.production_forecast_date && (
                        <span className="text-muted-foreground text-[10px]">Previsão: {fmtDate(os.production_forecast_date)}</span>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
              {isExpanded && (
                <TableRow className="bg-muted/20">
                  <TableCell colSpan={isConcluidos ? 8 : 11}>
                    <div className="py-2">
                      <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                        Itens do Pedido {os.sale_order_number} — {os.items.length} produto(s)
                      </div>
                      <div className="space-y-1.5">
                        {os.items.map((item, i) => (
                          <div key={i} className="flex items-start gap-3 text-xs border-b last:border-0 pb-1.5 last:pb-0">
                            <span className="font-mono text-muted-foreground flex-shrink-0 w-20">
                              {item.product_code || "—"}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{item.product_name}</span>
                                <span className="font-bold text-primary flex-shrink-0">{item.quantity}x</span>
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground mt-0.5">
                                {item.group_name && item.group_name !== "Sem Grupo" && (
                                  <span>Grupo: <span className="text-foreground">{item.group_name}</span></span>
                                )}
                                {item.subgroup_name && item.subgroup_name !== "Sem Subgrupo" && (
                                  <span>Subgrupo: <span className="text-foreground">{item.subgroup_name}</span></span>
                                )}
                                {item.product_type && (
                                  <span>Tipo: <span className="text-foreground">{item.product_type}</span></span>
                                )}
                                {item.purifier_model && (
                                  <span className="text-primary">Modelo: {item.purifier_model}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>

      {/* Decisão de cancelamento de produção — exibida abaixo da tabela para OSs com solicitação pendente */}
      {orders.filter(o => o.production_cancellation_requested && (!o.production_cancellation_decision || o.production_cancellation_decision === "Pendente")).length > 0 && (
        <div className="p-3 space-y-3 border-t">
          <div className="text-sm font-medium text-purple-900 flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4" /> Solicitações de Cancelamento de Produção
          </div>
          {orders.filter(o => o.production_cancellation_requested && (!o.production_cancellation_decision || o.production_cancellation_decision === "Pendente")).map(os => (
            <ProductionCancellationDecision key={os.id} os={os} readOnly={readOnly} />
          ))}
        </div>
      )}

      <LiberateProductionDialog
        open={!!liberatingOs}
        onOpenChange={(v) => !v && setLiberatingOs(null)}
        osCode={liberatingOs?.code}
        busy={busyId === liberatingOs?.id}
        onConfirm={async ({ liberateDate, retroactive, justification }) => {
          if (!liberatingOs) return;
          const os = liberatingOs;
          setBusyId(os.id);
          const notesSuffix = retroactive
            ? `\n\n[Liberação retroativa — ${liberateDate}]: ${justification}`
            : "";
          await updateStatus(os.id, {
            status: "Produção Liberada",
            production_liberated_date: liberateDate,
            production_completed: true,
            production_notes: (os.production_notes || "") + notesSuffix,
          }, retroactive
            ? `Produção liberada (retroativa ${liberateDate}) — OS movida para concluídos`
            : "Produção liberada — OS movida para concluídos",
          os.status, os.code);
          setBusyId(null);
          setLiberatingOs(null);
        }}
      />
    </div>
  );
}