import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import NotasRelatoriosTab from "@/components/notas/NotasRelatoriosTab";
import { deriveSaleCfop } from "@/lib/notaCfop";
import { statusConfig, getNotaStatus } from "@/lib/notaStatus";
import {
  ScrollText, Search, ArrowLeft, Download, RefreshCw,
  CheckCircle2, XCircle, Clock, FileText, Send
} from "lucide-react";

function formatCurrencySafe(value) {
  if (!value && value !== 0) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("pt-BR");
}

export default function NotasFiscais() {
  const [search, setSearch] = useState("");
  const [aba, setAba] = useState("nota_simples");
  const [downloading, setDownloading] = useState(null);
  const [cfopLoading, setCfopLoading] = useState(false);
  const queryClient = useQueryClient();
  const cfopBackfillKey = useRef("");

  const { data: serviceOrders = [], isLoading: loadingOS } = useQuery({
    queryKey: ["nf-os"],
    queryFn: () => base44.entities.ServiceOrder.filter({ invoiced: true }, "-invoice_date", 500),
  });

  const { data: remessas = [], isLoading: loadingRem } = useQuery({
    queryKey: ["nf-remessas"],
    queryFn: () => base44.entities.Remessa.filter({ nfe_transmitted: true }, "-invoice_date", 500),
  });

  const { data: remessasFaturadas = [] } = useQuery({
    queryKey: ["nf-remessas-fat"],
    queryFn: () => base44.entities.Remessa.filter({ status: "Faturada" }, "-invoice_date", 500),
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["nf-sales"],
    queryFn: () => base44.entities.Sale.list("-created_date", 500),
  });

  const { data: settings } = useQuery({
    queryKey: ["nf-settings"],
    queryFn: async () => {
      try {
        const s = await base44.entities.SystemSetting.list("-created_date", 1);
        return s[0] || {};
      } catch {
        return {};
      }
    },
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["nf-locs"],
    queryFn: () => base44.entities.BillingLocation.list("-created_date", 100),
  });

  const saleMap = useMemo(() => {
    const m = new Map();
    for (const s of sales) m.set(s.id, s);
    return m;
  }, [sales]);

  const locMap = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  const notas = useMemo(() => {
    const list = [];

    for (const os of serviceOrders) {
      const sale = os.sale_id ? saleMap.get(os.sale_id) : null;
      const isNFe = os.nfe_transmitted;
      const isNotaSimples = !isNFe && os.nota_simples_number;
      if (!isNFe && !isNotaSimples && !os.invoice_number) continue;

      list.push({
        id: os.id,
        origem: "os",
        origem_id: os.id,
        tipo: "Venda",
        subtipo: isNFe ? "NF-e" : "Nota Simples",
        numero: os.invoice_number || os.nota_simples_number || "—",
        data: os.invoice_date || os.nota_simples_date,
        cliente: os.client_name || "—",
        valor: sale?.grand_total ?? sale?.total ?? 0,
        cfop: isNFe
          ? os.nfe_cfop || "—"
          : deriveSaleCfop({
              cfopInternal: settings?.cfop_internal,
              emitterState: sale?.billing_location_id ? locMap.get(sale.billing_location_id)?.state : null,
              destState: sale?.delivery_address?.state || os.delivery_address?.state,
            }) || "—",
        serie: os.nfe_serie || (os.nota_simples_number ? os.nota_simples_number.split("-")[0] : "—"),
        chave: os.nfe_chave || "",
        status: getNotaStatus(os),
        cancelada: !!os.nfe_cancelled,
        ref: os.nfe_ref,
        detailPath: `/faturamento/os/${os.id}`,
      });
    }

    // Merge remessas (nfe_transmitted + status Faturada), dedupe by id
    const seenRem = new Set();
    for (const rem of [...remessas, ...remessasFaturadas]) {
      if (seenRem.has(rem.id)) continue;
      seenRem.add(rem.id);
      if (!rem.nfe_transmitted && !rem.invoice_number && rem.status !== "Faturada") continue;

      list.push({
        id: rem.id,
        origem: "remessa",
        origem_id: rem.id,
        tipo: "Remessa",
        subtipo: "NF-e",
        numero: rem.invoice_number || "—",
        data: rem.invoice_date,
        cliente: rem.client_name || "—",
        valor: rem.grand_total ?? 0,
        cfop: rem.cfop_code || "—",
        serie: rem.nfe_serie || "—",
        chave: rem.nfe_chave || "",
        status: getNotaStatus(rem),
        cancelada: !!rem.nfe_cancelled,
        ref: rem.nfe_ref,
        detailPath: `/faturamento/remessa/${rem.id}`,
      });
    }

    list.sort((a, b) => {
      const da = a.data ? new Date(a.data).getTime() : 0;
      const db = b.data ? new Date(b.data).getTime() : 0;
      return db - da;
    });

    return list;
  }, [serviceOrders, remessas, remessasFaturadas, saleMap, locMap, settings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notas.filter((n) => {
      const isNFe = n.subtipo === "NF-e";
      if (aba === "nfe" && !isNFe) return false;
      if (aba === "nota_simples" && isNFe) return false;
      if (!q) return true;
      return (
        n.cliente.toLowerCase().includes(q) ||
        String(n.numero).toLowerCase().includes(q) ||
        n.chave.toLowerCase().includes(q) ||
        n.subtipo.toLowerCase().includes(q)
      );
    });
  }, [notas, search, aba]);

  const summary = useMemo(() => {
    const total = filtered.reduce((s, n) => s + (n.cancelada ? 0 : n.valor), 0);
    const autorizadas = filtered.filter((n) => n.status === "autorizado" && !n.cancelada).length;
    const canceladas = filtered.filter((n) => n.cancelada).length;
    const processando = filtered.filter((n) => n.status === "processando").length;
    return { total, autorizadas, canceladas, processando, count: filtered.length };
  }, [filtered]);

  // Preenche o cache de CFOP (nfe_cfop) das NF-e ainda sem valor — em lotes.
  // Cada nota é consultada na FocusNFe apenas uma vez; depois fica cacheada na OS.
  useEffect(() => {
    if (loadingOS) return;
    const ids = serviceOrders.filter((o) => o.nfe_transmitted && !o.nfe_cfop).map((o) => o.id);
    const key = ids.join(",");
    if (!ids.length || cfopBackfillKey.current === key) return;
    cfopBackfillKey.current = key;
    (async () => {
      setCfopLoading(true);
      try {
        let obtained = 0;
        for (let i = 0; i < ids.length; i += 20) {
          const r = await base44.functions.invoke("getNfeCfops", { os_ids: ids.slice(i, i + 20) });
          obtained += Object.keys(r.data?.cfops || {}).length;
        }
        if (obtained > 0) await queryClient.invalidateQueries({ queryKey: ["nf-os"] });
      } catch (e) {
        console.warn("Backfill de CFOP das NF-e:", e);
      } finally {
        setCfopLoading(false);
      }
    })();
  }, [serviceOrders, loadingOS, queryClient]);

  const handleDownload = async (nota) => {
    setDownloading(nota.id);
    try {
      const res = await base44.functions.invoke("downloadDanfe", {
        [nota.origem === "remessa" ? "remessa_id" : "os_id"]: nota.origem_id,
      });
      if (res.data?.base64 && res.data?.filename) {
        const link = document.createElement("a");
        link.href = `data:application/pdf;base64,${res.data.base64}`;
        link.download = res.data.filename;
        link.click();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDownloading(null);
    }
  };

  const isLoading = loadingOS || loadingRem;

  return (
    <div className="space-y-6">
      <PageHeader title="Notas Fiscais" description="Relação unificada de notas fiscais de venda e remessa">
        <Button variant="outline" size="sm" asChild>
          <Link to="/faturamento"><ArrowLeft className="h-4 w-4" /> Voltar ao Faturamento</Link>
        </Button>
      </PageHeader>

      {/* Summary Cards */}
      {aba !== "relatorios" && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <FileText className="h-4 w-4" /> Total de Notas
            </div>
            <p className="text-2xl font-bold">{summary.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Autorizadas
            </div>
            <p className="text-2xl font-bold text-emerald-600">{summary.autorizadas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <Clock className="h-4 w-4 text-amber-600" /> Em Processamento
            </div>
            <p className="text-2xl font-bold text-amber-600">{summary.processando}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <ScrollText className="h-4 w-4" /> Valor Total
            </div>
            <p className="text-2xl font-bold text-primary">{formatCurrencySafe(summary.total)}</p>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <Tabs value={aba} onValueChange={setAba}>
          <TabsList>
            <TabsTrigger value="nota_simples">Notas Simples</TabsTrigger>
            <TabsTrigger value="nfe">NF-e</TabsTrigger>
            <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
          </TabsList>
        </Tabs>
        {cfopLoading && aba !== "relatorios" && (
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1 whitespace-nowrap">
            <RefreshCw className="h-3 w-3 animate-spin" /> buscando CFOP das NF-e...
          </span>
        )}
        {aba !== "relatorios" && (
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, número ou chave..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        )}
      </div>

      {/* Table / Relatórios */}
      {aba === "relatorios" ? (
        <NotasRelatoriosTab />
      ) : (
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title={aba === "nfe" ? "Nenhuma NF-e encontrada" : "Nenhuma Nota Simples encontrada"}
              description={aba === "nfe"
                ? "As NF-e transmitidas via Focus NFe aparecerão aqui automaticamente."
                : "As Notas Simples geradas no faturamento aparecerão aqui automaticamente."}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="px-4 py-3 font-semibold text-muted-foreground">Tipo</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground">Número</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground">Data</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground">Cliente</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Valor</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground">CFOP</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground">Série</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground">Status</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((nota) => {
                    const sc = statusConfig[nota.status] || statusConfig.processando;
                    const StatusIcon = sc.icon;
                    return (
                      <tr key={`${nota.origem}-${nota.id}`} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {nota.tipo === "Remessa" ? (
                              <Send className="h-4 w-4 text-violet-500" />
                            ) : (
                              <FileText className="h-4 w-4 text-emerald-500" />
                            )}
                            <div>
                              <p className="font-medium">{nota.tipo}</p>
                              <p className="text-xs text-muted-foreground">{nota.subtipo}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{nota.numero}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatDate(nota.data)}</td>
                        <td className="px-4 py-3 max-w-[200px] truncate">{nota.cliente}</td>
                        <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                          {nota.cancelada ? (
                            <span className="text-muted-foreground line-through">{formatCurrencySafe(nota.valor)}</span>
                          ) : (
                            formatCurrencySafe(nota.valor)
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{nota.cfop}</td>
                        <td className="px-4 py-3 font-mono text-xs">{nota.serie}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`${sc.color} gap-1`}>
                            <StatusIcon className="h-3 w-3" />
                            {sc.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {nota.subtipo === "NF-e" && !nota.cancelada && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleDownload(nota)}
                                disabled={downloading === nota.id}
                                title="Baixar DANFE"
                              >
                                {downloading === nota.id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Download className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" asChild>
                              <Link to={nota.detailPath}>Ver</Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}