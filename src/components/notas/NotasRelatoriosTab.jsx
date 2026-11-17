import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import EmptyState from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { statusConfig, getNotaStatus } from "@/lib/notaStatus";
import { deriveSaleCfop } from "@/lib/notaCfop";
import { Search, FileSpreadsheet, FileCode2, FileDown, Loader2, ScrollText } from "lucide-react";
import * as XLSX from "xlsx";

const onlyDigits = (s) => String(s || "").replace(/\D/g, "");

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

const TIPOS = [
  { value: "todos", label: "Todos os tipos" },
  { value: "nfe_venda", label: "NF-e (Venda)" },
  { value: "nota_simples", label: "Nota Simples" },
  { value: "nfe_remessa", label: "NF-e (Remessa)" },
];

const STATUS_OPTIONS = [
  { value: "todos", label: "Todos os status" },
  { value: "autorizado", label: "Autorizadas / Emitidas" },
  { value: "processando", label: "Em processamento / Pendentes" },
  { value: "erro", label: "Rejeitadas / Com erro" },
  { value: "cancelado", label: "Canceladas" },
];

const EMPTY_FILTERS = {
  data_inicial: "",
  data_final: "",
  mes_ano: "",
  tipo: "todos",
  status: "todos",
  cliente: "",
  numero: "",
  pedido: "",
  doc: "",
  emissor: "todos",
};

export default function NotasRelatoriosTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [exporting, setExporting] = useState(null);
  const [cfopLoading, setCfopLoading] = useState(false);

  const osQ = useQuery({
    queryKey: ["nf-rel-os"],
    queryFn: () => base44.entities.ServiceOrder.filter({ invoiced: true }, "-invoice_date", 1000),
  });
  const remQ = useQuery({
    queryKey: ["nf-rel-rem"],
    queryFn: () => base44.entities.Remessa.filter({ nfe_transmitted: true }, "-invoice_date", 1000),
  });
  const remFatQ = useQuery({
    queryKey: ["nf-rel-rem-fat"],
    queryFn: () => base44.entities.Remessa.filter({ status: "Faturada" }, "-invoice_date", 1000),
  });
  const salesQ = useQuery({
    queryKey: ["nf-rel-sales"],
    queryFn: () => base44.entities.Sale.list("-created_date", 2000),
  });
  const clientsQ = useQuery({
    queryKey: ["nf-rel-clients"],
    queryFn: async () => {
      const map = new Map();
      for (const r of await base44.entities.Client.list("-created_date", 5000)) map.set(r.id, r);
      for (const r of await base44.entities.Client.list("created_date", 5000)) map.set(r.id, r);
      return [...map.values()];
    },
  });
  const locsQ = useQuery({
    queryKey: ["nf-rel-locs"],
    queryFn: () => base44.entities.BillingLocation.list("-created_date", 100),
  });
  const settingsQ = useQuery({
    queryKey: ["nf-rel-settings"],
    queryFn: async () => {
      try {
        const s = await base44.entities.SystemSetting.list("-created_date", 1);
        return s[0] || {};
      } catch {
        return {};
      }
    },
  });

  const serviceOrders = osQ.data || [];
  const sales = salesQ.data || [];
  const clients = clientsQ.data || [];
  const locations = locsQ.data || [];
  const settings = settingsQ.data || {};

  const saleMap = useMemo(() => new Map(sales.map((s) => [s.id, s])), [sales]);
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const locMap = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  const isLoading = osQ.isLoading || remQ.isLoading || remFatQ.isLoading || salesQ.isLoading || clientsQ.isLoading;

  // Base unificada de notas com dados enriquecidos (documento, pedido, emitente)
  const notas = useMemo(() => {
    const list = [];

    for (const os of serviceOrders) {
      const sale = os.sale_id ? saleMap.get(os.sale_id) : null;
      const isNFe = os.nfe_transmitted;
      const isNotaSimples = !isNFe && os.nota_simples_number;
      if (!isNFe && !isNotaSimples && !os.invoice_number) continue;
      const client = os.client_id ? clientMap.get(os.client_id) : null;
      const loc = sale?.billing_location_id ? locMap.get(sale.billing_location_id) : null;
      list.push({
        key: `os-${os.id}`,
        origem: "os",
        origem_id: os.id,
        tipo: "Venda",
        subtipo: isNFe ? "NF-e" : "Nota Simples",
        numero: os.invoice_number || os.nota_simples_number || "—",
        serie: os.nfe_serie || (os.nota_simples_number ? os.nota_simples_number.split("-")[0] : "—"),
        data: os.invoice_date || os.nota_simples_date,
        cliente: os.client_name || "—",
        cliente_doc: client?.document || "",
        pedido: os.sale_order_number || sale?.order_number || "",
        valor: sale?.grand_total ?? sale?.total ?? 0,
        cfop: isNFe
          ? os.nfe_cfop || "—"
          : deriveSaleCfop({
              cfopInternal: settings?.cfop_internal,
              emitterState: loc?.state,
              destState: sale?.delivery_address?.state || os.delivery_address?.state,
            }) || "—",
        chave: os.nfe_chave || "",
        emissor_id: sale?.billing_location_id || "",
        emissor: sale?.billing_location_name || "",
        emissor_cnpj: loc?.cnpj || "",
        status: getNotaStatus(os),
        cancelada: !!os.nfe_cancelled,
      });
    }

    const seenRem = new Set();
    for (const rem of [...(remQ.data || []), ...(remFatQ.data || [])]) {
      if (seenRem.has(rem.id)) continue;
      seenRem.add(rem.id);
      if (!rem.nfe_transmitted && !rem.invoice_number && rem.status !== "Faturada") continue;
      const client = rem.client_id ? clientMap.get(rem.client_id) : null;
      const loc = rem.billing_location_id ? locMap.get(rem.billing_location_id) : null;
      list.push({
        key: `rem-${rem.id}`,
        origem: "remessa",
        origem_id: rem.id,
        tipo: "Remessa",
        subtipo: "NF-e",
        numero: rem.invoice_number || "—",
        serie: rem.nfe_serie || "—",
        data: rem.invoice_date,
        cliente: rem.client_name || "—",
        cliente_doc: client?.document || "",
        pedido: rem.code || "",
        valor: rem.grand_total ?? 0,
        cfop: rem.cfop_code || "—",
        chave: rem.nfe_chave || "",
        emissor_id: rem.billing_location_id || "",
        emissor: rem.billing_location_name || "",
        emissor_cnpj: loc?.cnpj || "",
        status: getNotaStatus(rem),
        cancelada: !!rem.nfe_cancelled,
      });
    }

    return list;
  }, [serviceOrders, remQ.data, remFatQ.data, saleMap, clientMap, locMap, settings]);

  const setF = (k, v) => setFilters((p) => ({ ...p, [k]: v }));

  const handleBuscar = () => {
    const f = filters;
    const res = notas.filter((n) => {
      if (f.mes_ano && (!n.data || String(n.data).slice(0, 7) !== f.mes_ano)) return false;
      if (f.data_inicial) {
        const t = n.data ? new Date(n.data).getTime() : 0;
        if (!t || t < new Date(`${f.data_inicial}T00:00:00`).getTime()) return false;
      }
      if (f.data_final) {
        const t = n.data ? new Date(n.data).getTime() : 0;
        if (!t || t > new Date(`${f.data_final}T23:59:59`).getTime()) return false;
      }
      if (f.tipo === "nfe_venda" && !(n.origem === "os" && n.subtipo === "NF-e")) return false;
      if (f.tipo === "nota_simples" && n.subtipo !== "Nota Simples") return false;
      if (f.tipo === "nfe_remessa" && n.origem !== "remessa") return false;
      if (f.status !== "todos" && n.status !== f.status) return false;
      if (f.emissor !== "todos" && n.emissor_id !== f.emissor) return false;
      if (f.cliente && !n.cliente.toLowerCase().includes(f.cliente.trim().toLowerCase())) return false;
      if (f.numero && !String(n.numero).toLowerCase().includes(f.numero.trim().toLowerCase())) return false;
      if (f.pedido && !String(n.pedido).toLowerCase().includes(f.pedido.trim().toLowerCase())) return false;
      if (f.doc && !onlyDigits(n.cliente_doc).includes(onlyDigits(f.doc))) return false;
      return true;
    });
    res.sort((a, b) => {
      const da = a.data ? new Date(a.data).getTime() : 0;
      const db = b.data ? new Date(b.data).getTime() : 0;
      return db - da;
    });
    setResults(res);
    setSelected(new Set());
    setSearched(true);
    loadCfops(res);
  };

  // Busca o CFOP efetivo de cada NF-e de venda direto do XML autorizado (FocusNFe)
  const loadCfops = async (res) => {
    const ids = res
      .filter((n) => n.origem === "os" && n.subtipo === "NF-e" && n.cfop === "—")
      .map((n) => n.origem_id)
      .slice(0, 200);
    if (!ids.length) return;
    setCfopLoading(true);
    try {
      const r = await base44.functions.invoke("getNfeCfops", { os_ids: ids });
      const map = r.data?.cfops || {};
      if (Object.keys(map).length) {
        setResults((prev) =>
          prev.map((n) => (n.origem === "os" && map[n.origem_id] ? { ...n, cfop: map[n.origem_id] } : n))
        );
        queryClient.invalidateQueries({ queryKey: ["nf-rel-os"] });
      }
      if (r.data?.errors?.length) {
        toast({
          title: `${r.data.errors.length} NF-e sem CFOP localizado`,
          description: r.data.errors.slice(0, 3).join("; "),
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({ title: "Não foi possível buscar o CFOP das NF-e", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setCfopLoading(false);
    }
  };

  const handleLimpar = () => {
    setFilters(EMPTY_FILTERS);
    setResults([]);
    setSelected(new Set());
    setSearched(false);
  };

  const notaByKey = useMemo(() => new Map(results.map((n) => [n.key, n])), [results]);

  // Apenas NF-e autorizadas (não canceladas) têm XML/DANFE para baixar
  const eligibleExport = useMemo(
    () =>
      [...selected]
        .map((k) => notaByKey.get(k))
        .filter(Boolean)
        .filter((n) => n.subtipo === "NF-e" && n.status === "autorizado" && !n.cancelada),
    [selected, notaByKey]
  );

  const downloadBase64 = (data) => {
    const blob = new Blob([Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0))], { type: data.mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = data.filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Lotes grandes (ZIP) vêm por link direto do armazenamento — o navegador baixa sozinho.
  const downloadFromUrl = (data) => {
    const link = document.createElement("a");
    link.href = data.url;
    link.download = data.filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleExportFiles = async (kind) => {
    if (!eligibleExport.length) {
      toast({ title: "Selecione NF-e autorizadas (não canceladas) para baixar", variant: "destructive" });
      return;
    }
    setExporting(kind);
    try {
      const res = await base44.functions.invoke("exportNfeFiles", {
        kind,
        items: eligibleExport.map((n) =>
          n.origem === "remessa" ? { remessa_id: n.origem_id } : { os_id: n.origem_id }
        ),
      });
      if ((res.data?.url || res.data?.base64) && res.data?.filename) {
        if (res.data.url) downloadFromUrl(res.data);
        else downloadBase64(res.data);
        if (res.data.errors?.length) {
          toast({ title: `${res.data.errors.length} arquivo(s) não baixado(s)`, description: res.data.errors.join("; "), variant: "destructive" });
        } else {
          toast({ title: `${eligibleExport.length} arquivo(s) baixado(s) — ${res.data.filename}` });
        }
      } else {
        toast({ title: "Erro na exportação", description: res.data?.error || "Tente novamente", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Erro na exportação", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const handleExportExcel = () => {
    const rows = (selected.size ? results.filter((n) => selected.has(n.key)) : results).map((n) => ({
      "Número da NF": n.numero === "—" ? "" : n.numero,
      "Série": n.serie === "—" ? "" : n.serie,
      "Data de Emissão": n.data ? new Date(n.data).toLocaleDateString("pt-BR") : "",
      "Cliente": n.cliente,
      "CPF/CNPJ": n.cliente_doc,
      "Número do Pedido": n.pedido,
      "Valor (R$)": n.valor ?? 0,
      "Status": (statusConfig[n.status]?.label || n.status) + (n.cancelada ? " (cancelada)" : ""),
      "CFOP": n.cfop,
      "Chave de Acesso": n.chave,
      "Empresa/CNPJ Emissor": [n.emissor, n.emissor_cnpj].filter(Boolean).join(" — "),
      "Tipo": `${n.tipo} (${n.subtipo})`,
    }));
    if (!rows.length) {
      toast({ title: "Nenhuma nota para exportar", variant: "destructive" });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notas Fiscais");
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Relatorio_Notas_Fiscais_${today}.xlsx`);
    toast({ title: `Excel exportado (${rows.length} notas)` });
  };

  const allSelected = results.length > 0 && results.every((n) => selected.has(n.key));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(results.map((n) => n.key)));
  const toggleOne = (key) =>
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key);
      else s.add(key);
      return s;
    });

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Data inicial</Label>
              <Input type="date" value={filters.data_inicial} onChange={(e) => setF("data_inicial", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Data final</Label>
              <Input type="date" value={filters.data_final} onChange={(e) => setF("data_final", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Mês/Ano</Label>
              <Input type="month" value={filters.mes_ano} onChange={(e) => setF("mes_ano", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Tipo da nota</Label>
              <Select value={filters.tipo} onValueChange={(v) => setF("tipo", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={filters.status} onValueChange={(v) => setF("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Empresa / CNPJ emissor</Label>
              <Select value={filters.emissor} onValueChange={(v) => setF("emissor", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as empresas</SelectItem>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}{l.cnpj ? ` (${l.cnpj})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Cliente</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" value={filters.cliente} onChange={(e) => setF("cliente", e.target.value)} placeholder="Nome do cliente" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Número da nota</Label>
              <Input value={filters.numero} onChange={(e) => setF("numero", e.target.value)} placeholder="Ex: 000123" />
            </div>
            <div>
              <Label className="text-xs">Pedido</Label>
              <Input value={filters.pedido} onChange={(e) => setF("pedido", e.target.value)} placeholder="Ex: P677" />
            </div>
            <div>
              <Label className="text-xs">CPF/CNPJ do cliente</Label>
              <Input value={filters.doc} onChange={(e) => setF("doc", e.target.value)} placeholder="Somente números" />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={handleLimpar}>Limpar</Button>
            <Button onClick={handleBuscar} disabled={isLoading}>
              <Search className="h-4 w-4" /> Buscar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resultados */}
      {isLoading ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </CardContent>
        </Card>
      ) : !searched ? (
        <EmptyState
          icon={ScrollText}
          title="Relatórios fiscais"
          description="Selecione os filtros acima e clique em Buscar para gerar a relação de notas do período — ideal para o fechamento mensal e envio à contabilidade."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-b">
              <p className="text-sm font-medium">
                {results.length} nota(s) encontrada(s)
                {cfopLoading && (
                  <span className="text-muted-foreground font-normal text-xs inline-flex items-center gap-1 ml-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> buscando CFOP das NF-e...
                  </span>
                )}
                {selected.size > 0 && <span className="text-muted-foreground font-normal"> · {selected.size} selecionada(s)</span>}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => handleExportFiles("xml")} disabled={!!exporting || !eligibleExport.length}>
                  {exporting === "xml" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCode2 className="h-4 w-4" />}
                  Baixar XML
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExportFiles("pdf")} disabled={!!exporting || !eligibleExport.length}>
                  {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  Baixar PDF
                </Button>
                <Button size="sm" onClick={handleExportExcel} disabled={results.length === 0}>
                  <FileSpreadsheet className="h-4 w-4" />
                  Exportar Excel {selected.size > 0 ? `(${selected.size})` : `(${results.length})`}
                </Button>
              </div>
            </div>
            {results.length === 0 ? (
              <EmptyState icon={ScrollText} title="Nenhuma nota encontrada" description="Ajuste os filtros e clique em Buscar novamente." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      <th className="px-4 py-3 w-10">
                        <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Selecionar todas" />
                      </th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Número</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Série</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Data</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Cliente</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">CPF/CNPJ</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Pedido</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Valor</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">CFOP</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Chave de acesso</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Emissor</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((n) => {
                      const sc = statusConfig[n.status] || statusConfig.processando;
                      const StatusIcon = sc.icon;
                      return (
                        <tr key={n.key} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <Checkbox checked={selected.has(n.key)} onCheckedChange={() => toggleOne(n.key)} aria-label="Selecionar nota" />
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{n.numero}</td>
                          <td className="px-4 py-3 font-mono text-xs">{n.serie}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{formatDate(n.data)}</td>
                          <td className="px-4 py-3 max-w-[180px] truncate">{n.cliente}</td>
                          <td className="px-4 py-3 font-mono text-xs">{n.cliente_doc || "—"}</td>
                          <td className="px-4 py-3 font-mono text-xs">{n.pedido || "—"}</td>
                          <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                            {n.cancelada ? (
                              <span className="text-muted-foreground line-through">{formatCurrencySafe(n.valor)}</span>
                            ) : (
                              formatCurrencySafe(n.valor)
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{n.cfop}</td>
                          <td className="px-4 py-3 font-mono text-xs max-w-[140px] truncate" title={n.chave}>{n.chave || "—"}</td>
                          <td className="px-4 py-3 max-w-[140px] truncate" title={[n.emissor, n.emissor_cnpj].filter(Boolean).join(" — ")}>
                            {n.emissor || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`${sc.color} gap-1`}>
                              <StatusIcon className="h-3 w-3" />
                              {sc.label}
                            </Badge>
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