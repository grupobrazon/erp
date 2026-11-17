import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Wrench, Download, Ban, Eye, FileDown, Loader2, Paperclip, AlertTriangle } from "lucide-react";
import { exportSales } from "@/lib/excelExport";
import { OS_STATUSES } from "@/lib/osStatuses";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import CancellationRequestDialog from "@/components/sales/CancellationRequestDialog";
import SaleViewSheet from "@/components/sales/SaleViewSheet";
import SalePriorityAlertDialog from "@/components/sales/SalePriorityAlertDialog";
import SalesFilters from "@/components/sales/SalesFilters";
import { openSalePdf } from "@/components/sales/SalePdfExport";
import { openSalesRulesPdf } from "@/lib/salesRulesPdf";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";

export default function Sales() {
  // Filtros (multiselect — array vazio = "todos")
  const [search, setSearch] = useState("");
  const [etapa, setEtapa] = useState([]);
  const [modalidade, setModalidade] = useState([]);
  const [momento, setMomento] = useState([]);
  const [pgtoStatus, setPgtoStatus] = useState([]);
  const [vendedor, setVendedor] = useState([]);
  const [osStatus, setOsStatus] = useState([]);
  const [temOs, setTemOs] = useState([]);
  const [temComprovante, setTemComprovante] = useState([]);
  const [estado, setEstado] = useState([]);
  const [priorityAlert, setPriorityAlert] = useState([]);
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [previsaoDe, setPrevisaoDe] = useState("");
  const [previsaoAte, setPrevisaoAte] = useState("");

  const [cancelTarget, setCancelTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);
  const [alertTarget, setAlertTarget] = useState(null);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Carregamento completo por cursor (sem limite fixo) — busca e filtros cobrem 100% das vendas
  const PAGE_SIZE = 50;
  const [allSales, setAllSales] = useState([]);
  const [allOS, setAllOS] = useState([]);
  const [isLoadingAll, setIsLoadingAll] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [matchedClientIds, setMatchedClientIds] = useState(null);
  const [clientCodeMap, setClientCodeMap] = useState({});

  useEffect(() => {
    let cancelled = false;
    const loadAll = async () => {
      setIsLoadingAll(true);
      let limit = 500;
      let result = [];
      while (limit <= 50000) {
        const batch = await base44.entities.Sale.list("-created_date", limit);
        if (cancelled) return;
        result = batch;
        if (batch.length < limit) break;
        limit *= 2;
      }
      // Carrega todas as OS para vincular com as vendas (mapa sale_id -> OS)
      let osLimit = 500;
      let osResult = [];
      while (osLimit <= 50000) {
        const osBatch = await base44.entities.ServiceOrder.list("-created_date", osLimit);
        if (cancelled) return;
        osResult = osBatch;
        if (osBatch.length < osLimit) break;
        osLimit *= 2;
      }
      if (!cancelled) {
        setAllSales(result);
        setAllOS(osResult);
        setIsLoadingAll(false);
      }
    };
    loadAll();
    return () => { cancelled = true; };
  }, []);

  // Mapa sale_id -> OS (primeira OS encontrada para a venda)
  const osBySaleId = useMemo(() => {
    const map = {};
    for (const os of allOS) {
      if (os.sale_id && !map[os.sale_id]) map[os.sale_id] = os;
    }
    return map;
  }, [allOS]);

  // Busca debounced de clientes por código (new_code / old_code) sob demanda
  useEffect(() => {
    const q = search.trim();
    if (!q || q.includes(";")) { setMatchedClientIds(null); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await base44.entities.Client.filter(
          { $or: [{ new_code: { $regex: q } }, { old_code: { $regex: q } }] },
          "-created_date", 200
        );
        if (!cancelled) setMatchedClientIds(new Set(res.map(c => c.id)));
      } catch { if (!cancelled) setMatchedClientIds(null); }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search]);

  // Opções dinâmicas de vendedor e status de OS
  const sellerOptions = useMemo(() => {
    const names = new Set();
    allSales.forEach(s => { if (s.seller_name) names.add(s.seller_name); });
    return Array.from(names).sort((a, b) => a.localeCompare(b)).map(n => ({ value: n, label: n }));
  }, [allSales]);

  const estadoOptions = useMemo(() => {
    const ufs = new Set();
    allSales.forEach(s => {
      const uf = (s.delivery_different && s.delivery_address?.state) || s.billing_address?.state;
      if (uf) ufs.add(uf);
    });
    return Array.from(ufs).sort().map(u => ({ value: u, label: u }));
  }, [allSales]);

  const osStatusOptions = useMemo(() => {
    const statuses = new Set();
    allOS.forEach(os => { if (os.status && OS_STATUSES.includes(os.status)) statuses.add(os.status); });
    return Array.from(statuses).sort((a, b) => a.localeCompare(b)).map(s => ({ value: s, label: s }));
  }, [allOS]);

  const activeFilterCount = etapa.length + modalidade.length + momento.length + pgtoStatus.length +
    vendedor.length + osStatus.length + temOs.length + temComprovante.length + estado.length + priorityAlert.length + (dataDe ? 1 : 0) + (dataAte ? 1 : 0) + (previsaoDe ? 1 : 0) + (previsaoAte ? 1 : 0) + (search ? 1 : 0);

  const clearFilters = () => {
    setSearch(""); setEtapa([]); setModalidade([]); setMomento([]); setPgtoStatus([]);
    setVendedor([]); setOsStatus([]); setTemOs([]); setTemComprovante([]); setEstado([]); setPriorityAlert([]); setDataDe(""); setDataAte(""); setPrevisaoDe(""); setPrevisaoAte("");
  };

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, etapa, modalidade, momento, pgtoStatus, vendedor, osStatus, temOs, temComprovante, estado, priorityAlert, dataDe, dataAte, previsaoDe, previsaoAte]);

  const filtered = useMemo(() => {
    const raw = search.trim();
    // Modo multi-pedido: quando o usuário separa valores com ";", filtra apenas os pedidos informados
    const isMultiOrder = raw.includes(";");
    const orderTokens = isMultiOrder
      ? raw.split(";").map(t => t.trim().toLowerCase()).filter(Boolean)
      : [];
    const q = isMultiOrder ? "" : raw.toLowerCase();
    return allSales.filter(s => {
      const osLinked = osBySaleId[s.id];
      // Busca multi-pedido (match exato por order_number)
      if (isMultiOrder) {
        const num = (s.order_number || "").toLowerCase();
        if (!orderTokens.includes(num)) return false;
      } else if (q) {
        // Busca textual: cliente, vendedor, pedido, código da OS vinculada
        const osCode = (osLinked?.code || "").toLowerCase();
        const hit = s.client_name?.toLowerCase().includes(q) ||
          s.seller_name?.toLowerCase().includes(q) ||
          s.order_number?.toLowerCase().includes(q) ||
          osCode.includes(q) ||
          (matchedClientIds && matchedClientIds.has(s.client_id));
        if (!hit) return false;
      }
      // Etapa (multi)
      if (etapa.length && !etapa.includes(s.stage)) return false;
      // Modalidade (multi)
      if (modalidade.length && !modalidade.includes(s.delivery_modality)) return false;
      // Vendedor (multi)
      if (vendedor.length && !vendedor.includes(s.seller_name)) return false;
      // Estado (multi) — UF do endereço de entrega (quando diferente) ou de faturamento
      if (estado.length) {
        const uf = (s.delivery_different && s.delivery_address?.state) || s.billing_address?.state || "";
        if (!estado.includes(uf)) return false;
      }
      // Data (intervalo)
      if (dataDe && s.date < dataDe) return false;
      if (dataAte && s.date > dataAte) return false;
      // Tem OS vinculada
      if (temOs.length) {
        const hasOs = !!osLinked;
        const wantSim = temOs.includes("sim");
        const wantNao = temOs.includes("nao");
        if (wantSim && !hasOs) return false;
        if (wantNao && hasOs) return false;
      }
      // Status da OS (multi)
      if (osStatus.length) {
        if (!osLinked || !osStatus.includes(osLinked.status)) return false;
      }
      // Momento do pagamento (multi) — venda tem algum pagamento com momento no conjunto
      if (momento.length) {
        const payments = s.payments || [];
        const hasMomento = payments.some(p => momento.includes(p.payment_moment));
        if (!hasMomento) return false;
      }
      // Status do pagamento (multi) — venda tem algum pagamento com status no conjunto
      if (pgtoStatus.length) {
        const payments = s.payments || [];
        const hasStatus = payments.some(p => pgtoStatus.includes(p.payment_status));
        if (!hasStatus) return false;
      }
      // Tem comprovante de pagamento (sim/não)
      if (temComprovante.length) {
        const payments = s.payments || [];
        const hasReceipt = payments.some(p => p.receipt_url);
        const wantSim = temComprovante.includes("sim");
        const wantNao = temComprovante.includes("nao");
        if (wantSim && !hasReceipt) return false;
        if (wantNao && hasReceipt) return false;
      }
      // Alerta de prioridade (multi)
      if (priorityAlert.length && !priorityAlert.includes(s.priority_alert)) return false;
      // Previsão de expedição (intervalo)
      if (previsaoDe && s.expedition_forecast_date && s.expedition_forecast_date < previsaoDe) return false;
      if (previsaoAte && s.expedition_forecast_date && s.expedition_forecast_date > previsaoAte) return false;
      if ((previsaoDe || previsaoAte) && !s.expedition_forecast_date) return false;
      return true;
    });
  }, [allSales, search, etapa, modalidade, vendedor, estado, dataDe, dataAte, previsaoDe, previsaoAte, temOs, temComprovante, osStatus, momento, pgtoStatus, priorityAlert, osBySaleId, matchedClientIds]);

  const visibleSales = filtered.slice(0, visibleCount);
  const hasMoreVisible = visibleCount < filtered.length;

  // Carrega códigos de cliente sob demanda (apenas para as vendas visíveis)
  useEffect(() => {
    const ids = visibleSales.map(s => s.client_id).filter(Boolean);
    const missing = ids.filter(id => !clientCodeMap[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.entities.Client.filter(
          { id: { $in: missing } }, "-created_date", missing.length
        );
        if (cancelled) return;
        setClientCodeMap(prev => {
          const next = { ...prev };
          for (const c of res) next[c.id] = { new_code: c.new_code, old_code: c.old_code };
          return next;
        });
      } catch { /* silencioso */ }
    })();
    return () => { cancelled = true; };
  }, [visibleSales]);

  // A OS só é gerada após a aprovação financeira (vendas Totais e Parciais seguem a mesma regra).
  // "Em OS" também libera o botão: se a OS foi apagada, a venda fica presa nessa etapa sem OS.
  const canGenerateOS = (s) => s.stage === "Pagamento Aprovado" || s.stage === "Em OS";

  const handleGenerateOS = async (saleId) => {
    try {
      await base44.functions.invoke('generateServiceOrder', { sale_id: saleId });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      toast({ title: "Ordem de serviço gerada com sucesso" });
    } catch (err) {
      toast({ title: "Erro ao gerar OS", description: err?.message || "Falha desconhecida", variant: "destructive" });
    }
  };

  const handleDownloadPdf = async (sale) => {
    setPdfLoadingId(sale.id);
    try {
      const [client, billingLocations] = await Promise.all([
        sale.client_id ? base44.entities.Client.get(sale.client_id).catch(() => null) : null,
        base44.entities.BillingLocation.list("-created_date", 200).catch(() => []),
      ]);
      const billingLocation = billingLocations.find(l => l.id === sale.billing_location_id) || null;
      openSalePdf({ sale, orderNumber: sale.order_number, client, mode: "pedido", billingLocation });
    } catch (err) {
      toast({ title: "Erro ao gerar PDF", description: err?.message || "Falha desconhecida", variant: "destructive" });
    } finally {
      setPdfLoadingId(null);
    }
  };

  return (
    <div>
      <PageHeader title="Vendas" description={`${allSales.length} vendas registradas`}>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => openSalesRulesPdf()} className="gap-2"><FileDown className="h-4 w-4" /> Guia de Regras</Button>
          <Button variant="outline" onClick={() => exportSales(filtered, osBySaleId)} disabled={filtered.length === 0} className="gap-2"><Download className="h-4 w-4" /> Exportar Excel</Button>
          <Button onClick={() => navigate("/vendas/nova")} className="gap-2"><Plus className="h-4 w-4" /> Nova Venda</Button>
        </div>
      </PageHeader>

      <SalesFilters
        search={search} setSearch={setSearch}
        etapa={etapa} setEtapa={setEtapa}
        modalidade={modalidade} setModalidade={setModalidade}
        momento={momento} setMomento={setMomento}
        pgtoStatus={pgtoStatus} setPgtoStatus={setPgtoStatus}
        vendedor={vendedor} setVendedor={setVendedor}
        osStatus={osStatus} setOsStatus={setOsStatus}
        temOs={temOs} setTemOs={setTemOs}
        temComprovante={temComprovante} setTemComprovante={setTemComprovante}
        estado={estado} setEstado={setEstado} estadoOptions={estadoOptions}
        priorityAlert={priorityAlert} setPriorityAlert={setPriorityAlert}
        dataDe={dataDe} setDataDe={setDataDe}
        dataAte={dataAte} setDataAte={setDataAte}
        previsaoDe={previsaoDe} setPrevisaoDe={setPrevisaoDe}
        previsaoAte={previsaoAte} setPrevisaoAte={setPrevisaoAte}
        sellerOptions={sellerOptions}
        osStatusOptions={osStatusOptions}
        onClear={clearFilters}
        activeCount={activeFilterCount}
      />

      {isLoadingAll ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhuma venda" description="Registre sua primeira venda." />
      ) : (
        <>
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Pedido</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Itens</TableHead>
                <TableHead>OS</TableHead>
                <TableHead>Status da OS</TableHead>
                <TableHead className="text-center">Comprovante</TableHead>
                <TableHead>Modalidade</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead className="text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleSales.map(s => (
                <TableRow key={s.id} className={`hover:bg-muted/30 ${s.priority_alert === "Muito Crítico" ? "bg-red-50/40" : s.priority_alert === "Crítico" ? "bg-amber-50/40" : ""}`}>
                  <TableCell className="font-mono font-medium">
                    <div className="flex items-center gap-1.5">
                      {s.priority_alert && (
                        <span className={`h-2 w-2 rounded-full ${s.priority_alert === "Muito Crítico" ? "bg-red-500" : "bg-amber-500"}`} title={s.priority_alert} />
                      )}
                      {s.order_number || "-"}
                      {s.is_resale && (
                        <Badge variant="outline" className="bg-sky-50 text-sky-700 text-[10px] border-sky-200">Revenda</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{s.date}</TableCell>
                  <TableCell className="font-medium">
                    {(() => {
                      const code = clientCodeMap[s.client_id]?.new_code || clientCodeMap[s.client_id]?.old_code;
                      return (
                        <span>
                          {code && <span className="font-mono text-muted-foreground mr-1.5">{code}</span>}
                          {s.client_name || "-"}
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell>{s.seller_name || "-"}</TableCell>
                  <TableCell>{s.items?.length || 0}</TableCell>
                  <TableCell>
                    {(() => {
                      const os = osBySaleId[s.id];
                      if (!os) return <span className="text-muted-foreground text-xs">—</span>;
                      return <span className="font-mono text-xs font-medium">{os.code}</span>;
                    })()}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const os = osBySaleId[s.id];
                      if (!os) return <span className="text-muted-foreground text-xs">—</span>;
                      return (
                        <Badge variant="outline" className="text-[10px]">
                          {os.status}
                        </Badge>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-center">
                    {(() => {
                      const hasReceipt = (s.payments || []).some(p => p.receipt_url);
                      return hasReceipt ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 gap-1">
                          <Paperclip className="h-3 w-3" /> Sim
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground gap-1">
                          <Paperclip className="h-3 w-3 opacity-40" /> Não
                        </Badge>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const mod = s.delivery_modality;
                      if (!mod) return <span className="text-muted-foreground text-xs">—</span>;
                      const cls = mod === "Envio" ? "bg-blue-50 text-blue-700"
                        : mod === "Entrega Própria" ? "bg-amber-50 text-amber-700"
                        : "bg-purple-50 text-purple-700";
                      return <Badge variant="outline" className={`text-[10px] ${cls}`}>{mod}</Badge>;
                    })()}
                  </TableCell>
                  <TableCell className="text-right font-medium">R$ {(s.grand_total || s.total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={
                      s.stage === "Confirmada" ? "bg-emerald-100 text-emerald-700"
                      : s.stage === "Cancelada" ? "bg-red-100 text-red-700"
                      : s.stage === "Pagamento Aprovado" ? "bg-blue-100 text-blue-700"
                      : s.stage === "Em OS" ? "bg-purple-100 text-purple-700"
                      : "bg-amber-100 text-amber-700"
                    }>
                      {s.stage || s.status || "-"}
                      {s.confirmation_type === "Parcial" && s.stage === "Confirmada" && " (Parcial)"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center align-middle">
                    <div className="flex justify-center items-center gap-1">
                      {canGenerateOS(s) && (
                        <Button variant="outline" size="sm" onClick={() => handleGenerateOS(s.id)} title="Gerar Ordem de Serviço">
                          <Wrench className="h-3 w-3" /> OS
                        </Button>
                      )}
                      {s.cancellation_status === "Aguardando Aprovação" ? (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 text-[10px] whitespace-nowrap">Cancel. Pendente</Badge>
                      ) : s.stage !== "Cancelada" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCancelTarget(s)}
                          title="Solicitar cancelamento"
                          className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/5 whitespace-nowrap"
                        >
                          <Ban className="h-3 w-3" /> Cancelar
                        </Button>
                      ) : null}
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setAlertTarget(s)}
                              title="Definir alerta de prioridade"
                              className={s.priority_alert === "Muito Crítico" ? "text-red-600 hover:text-red-700 hover:bg-red-50"
                                : s.priority_alert === "Crítico" ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                : "text-muted-foreground hover:text-foreground"}
                            >
                              <AlertTriangle className={`h-4 w-4 ${s.priority_alert ? "fill-current" : ""}`} />
                            </Button>
                          </TooltipTrigger>
                          {s.priority_alert && (
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-semibold">{s.priority_alert}</p>
                              {s.priority_alert_note && <p className="text-xs text-muted-foreground mt-1">{s.priority_alert_note}</p>}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                      <Button variant="ghost" size="icon" onClick={() => setViewTarget(s)} title="Visualizar pedido"><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDownloadPdf(s)} title="Baixar PDF do pedido" disabled={pdfLoadingId === s.id}>
                        {pdfLoadingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => navigate(`/vendas/${s.id}/editar`)} title="Editar venda"><Pencil className="h-4 w-4" /></Button>
                      </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {hasMoreVisible && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" onClick={() => setVisibleCount(c => c + PAGE_SIZE)}>
              Carregar mais ({filtered.length - visibleCount} restantes)
            </Button>
          </div>
        )}
        </>
      )}

      <CancellationRequestDialog
        sale={cancelTarget}
        open={!!cancelTarget}
        onOpenChange={v => !v && setCancelTarget(null)}
      />

      <SaleViewSheet
        sale={viewTarget}
        open={!!viewTarget}
        onOpenChange={v => !v && setViewTarget(null)}
        onSaleUpdated={(updated) => {
          setAllSales(prev => prev.map(s => (s.id === updated.id ? { ...s, ...updated } : s)));
          setViewTarget(prev => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
        }}
      />

      <SalePriorityAlertDialog
        sale={alertTarget}
        open={!!alertTarget}
        onOpenChange={v => !v && setAlertTarget(null)}
        onSaved={() => {
          // Recarrega a lista para refletir o alerta atualizado
          setAllSales(prev => prev.map(s => s.id === alertTarget.id ? { ...s, priority_alert: s.priority_alert, priority_alert_note: s.priority_alert_note } : s));
          // Recarrega do banco para garantir dados atualizados
          const reload = async () => {
            const updated = await base44.entities.Sale.get(alertTarget.id);
            setAllSales(prev => prev.map(s => s.id === updated.id ? updated : s));
          };
          reload();
        }}
      />
    </div>
  );
}