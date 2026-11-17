import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Download, FileSpreadsheet, Package, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import SalesFilters from "@/components/sales/SalesFilters";
import MultiSelectFilter from "@/components/ui/MultiSelectFilter";
import { exportSalesReportDetailed, exportSalesReportSummary } from "@/lib/excelExport";
import { OS_STATUSES } from "@/lib/osStatuses";
import { buildAppointmentsBySale, dashLabel, evaluateSaleDash, monthKeyOf, normalizeText } from "@/lib/commercialCounting";

const PAGE_SIZE = 100;

export default function SalesReport() {
  // Mesmos filtros da tela de Vendas
  const [search, setSearch] = useState("");
  const [etapa, setEtapa] = useState([]);
  const [modalidade, setModalidade] = useState([]);
  const [momento, setMomento] = useState([]);
  const [pgtoStatus, setPgtoStatus] = useState([]);
  const [vendedor, setVendedor] = useState([]);
  const [osStatus, setOsStatus] = useState([]);
  const [temOs, setTemOs] = useState([]);
  const [temComprovante, setTemComprovante] = useState([]);
  const [priorityAlert, setPriorityAlert] = useState([]);
  const [estado, setEstado] = useState([]);
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [previsaoDe, setPrevisaoDe] = useState("");
  const [previsaoAte, setPrevisaoAte] = useState("");
  // Filtro extra: produto
  const [produto, setProduto] = useState([]);
  // Modo de visualização
  const [viewMode, setViewMode] = useState("detalhado"); // "detalhado" | "somatorio"

  const [allSales, setAllSales] = useState([]);
  const [allOS, setAllOS] = useState([]);
  const [allTos, setAllTos] = useState([]);
  const [allAgenda, setAllAgenda] = useState([]);
  const [paymentConditions, setPaymentConditions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [matchedClientIds, setMatchedClientIds] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loadEntity = async (entity) => {
      let limit = 500;
      let result = [];
      while (limit <= 50000) {
        const batch = await entity.list("-created_date", limit);
        if (cancelled) return [];
        result = batch;
        if (batch.length < limit) break;
        limit *= 2;
      }
      return result;
    };
    const loadAll = async () => {
      setIsLoading(true);
      // Vendas + tudo que o dashboard usa para decidir se a venda computa o mês
      const [sales, orders, toses, appointments, conditions] = await Promise.all([
        loadEntity(base44.entities.Sale),
        loadEntity(base44.entities.ServiceOrder),
        loadEntity(base44.entities.TechnicianServiceOrder),
        loadEntity(base44.entities.AgendamentoRota),
        base44.entities.PaymentCondition.list(),
      ]);
      if (cancelled) return;
      setAllSales(sales);
      setAllOS(orders);
      setAllTos(toses);
      setAllAgenda(appointments);
      setPaymentConditions(conditions || []);
      setIsLoading(false);
    };
    loadAll();
    return () => { cancelled = true; };
  }, []);

  const osBySaleId = useMemo(() => {
    const map = {};
    for (const os of allOS) {
      if (os.sale_id && !map[os.sale_id]) map[os.sale_id] = os;
    }
    return map;
  }, [allOS]);

  // Avalia cada venda com o MESMO critério do Dashboard Comercial:
  // computa o mês (estrela) ou fica de fora (com o motivo na observação).
  const dashBySaleId = useMemo(() => {
    const tosesBySale = {};
    const ordersBySale = {};
    allTos.forEach((t) => { if (t.sale_id) (tosesBySale[t.sale_id] = tosesBySale[t.sale_id] || []).push(t); });
    allOS.forEach((o) => { if (o.sale_id) (ordersBySale[o.sale_id] = ordersBySale[o.sale_id] || []).push(o); });
    const bonusConditionIds = new Set(
      paymentConditions.filter((c) => normalizeText(c.payment_type) === "bonificacao").map((c) => c.id)
    );
    // Os agendamentos são indexados dentro do mesmo escopo do dashboard (as vendas do mês de
    // competência da venda), para que a atribuição dos atendimentos sem pedido vinculado seja idêntica.
    const salesByMonth = {};
    allSales.forEach((s) => {
      const key = monthKeyOf(s.first_status_change_date) || "sem-mes";
      (salesByMonth[key] = salesByMonth[key] || []).push(s);
    });
    const map = {};
    Object.values(salesByMonth).forEach((scoped) => {
      const appointmentsBySale = buildAppointmentsBySale(allAgenda, scoped);
      scoped.forEach((s) => {
        map[s.id] = evaluateSaleDash(s, { tosesBySale, ordersBySale, appointmentsBySale, bonusConditionIds });
      });
    });
    return map;
  }, [allSales, allOS, allTos, allAgenda, paymentConditions]);

  // Busca debounced de clientes por código
  useEffect(() => {
    const q = search.trim();
    if (!q) { setMatchedClientIds(null); return; }
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

  const sellerOptions = useMemo(() => {
    const names = new Set();
    allSales.forEach(s => { if (s.seller_name) names.add(s.seller_name); });
    return Array.from(names).sort((a, b) => a.localeCompare(b)).map(n => ({ value: n, label: n }));
  }, [allSales]);

  const osStatusOptions = useMemo(() => {
    const statuses = new Set();
    allOS.forEach(os => { if (os.status && OS_STATUSES.includes(os.status)) statuses.add(os.status); });
    return Array.from(statuses).sort((a, b) => a.localeCompare(b)).map(s => ({ value: s, label: s }));
  }, [allOS]);

  // Opções de estado (UF) derivadas dos endereços das vendas
  const estadoOptions = useMemo(() => {
    const ufs = new Set();
    allSales.forEach(s => {
      const uf = (s.delivery_different && s.delivery_address?.state) || s.billing_address?.state;
      if (uf) ufs.add(uf);
    });
    return Array.from(ufs).sort().map(u => ({ value: u, label: u }));
  }, [allSales]);

  // Opções de produto derivadas dos itens das vendas
  const productOptions = useMemo(() => {
    const map = new Map();
    allSales.forEach(s => {
      (s.items || []).forEach(it => {
        if (it.product_id && !map.has(it.product_id)) {
          map.set(it.product_id, it.product_name || it.product_id);
        }
      });
    });
    return Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));
  }, [allSales]);

  const activeFilterCount = etapa.length + modalidade.length + momento.length + pgtoStatus.length +
    vendedor.length + osStatus.length + temOs.length + temComprovante.length + estado.length + priorityAlert.length +
    produto.length + (dataDe ? 1 : 0) + (dataAte ? 1 : 0) + (previsaoDe ? 1 : 0) + (previsaoAte ? 1 : 0) + (search ? 1 : 0);

  const clearFilters = () => {
    setSearch(""); setEtapa([]); setModalidade([]); setMomento([]); setPgtoStatus([]);
    setVendedor([]); setOsStatus([]); setTemOs([]); setTemComprovante([]); setEstado([]); setPriorityAlert([]);
    setProduto([]); setDataDe(""); setDataAte(""); setPrevisaoDe(""); setPrevisaoAte("");
  };

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, etapa, modalidade, momento, pgtoStatus, vendedor, osStatus, temOs, temComprovante, estado, priorityAlert, produto, dataDe, dataAte, previsaoDe, previsaoAte]);

  // Filtra as vendas (mesma lógica da tela de Vendas + filtro por produto)
  const filteredSales = useMemo(() => {
    const q = search.toLowerCase();
    const produtoSet = produto.length ? new Set(produto) : null;
    return allSales.filter(s => {
      const osLinked = osBySaleId[s.id];
      if (q) {
        const osCode = (osLinked?.code || "").toLowerCase();
        const hit = s.client_name?.toLowerCase().includes(q) ||
          s.seller_name?.toLowerCase().includes(q) ||
          s.order_number?.toLowerCase().includes(q) ||
          osCode.includes(q) ||
          (matchedClientIds && matchedClientIds.has(s.client_id));
        if (!hit) return false;
      }
      if (etapa.length && !etapa.includes(s.stage)) return false;
      if (modalidade.length && !modalidade.includes(s.delivery_modality)) return false;
      if (vendedor.length && !vendedor.includes(s.seller_name)) return false;
      // Estado (multi) — UF do endereço de entrega (quando diferente) ou de faturamento
      if (estado.length) {
        const uf = (s.delivery_different && s.delivery_address?.state) || s.billing_address?.state || "";
        if (!estado.includes(uf)) return false;
      }
      if (dataDe && s.date < dataDe) return false;
      if (dataAte && s.date > dataAte) return false;
      if (temOs.length) {
        const hasOs = !!osLinked;
        if (temOs.includes("sim") && !hasOs) return false;
        if (temOs.includes("nao") && hasOs) return false;
      }
      if (osStatus.length) {
        if (!osLinked || !osStatus.includes(osLinked.status)) return false;
      }
      if (momento.length) {
        const hasMomento = (s.payments || []).some(p => momento.includes(p.payment_moment));
        if (!hasMomento) return false;
      }
      if (pgtoStatus.length) {
        const hasStatus = (s.payments || []).some(p => pgtoStatus.includes(p.payment_status));
        if (!hasStatus) return false;
      }
      if (temComprovante.length) {
        const hasReceipt = (s.payments || []).some(p => p.receipt_url);
        if (temComprovante.includes("sim") && !hasReceipt) return false;
        if (temComprovante.includes("nao") && hasReceipt) return false;
      }
      if (priorityAlert.length && !priorityAlert.includes(s.priority_alert)) return false;
      // Previsão de expedição (intervalo)
      if (previsaoDe && s.expedition_forecast_date && s.expedition_forecast_date < previsaoDe) return false;
      if (previsaoAte && s.expedition_forecast_date && s.expedition_forecast_date > previsaoAte) return false;
      if ((previsaoDe || previsaoAte) && !s.expedition_forecast_date) return false;
      // Filtro por produto: a venda precisa ter ao menos um item com product_id no conjunto
      if (produtoSet) {
        const hasProduct = (s.items || []).some(it => produtoSet.has(it.product_id));
        if (!hasProduct) return false;
      }
      return true;
    });
  }, [allSales, search, etapa, modalidade, vendedor, estado, dataDe, dataAte, previsaoDe, previsaoAte, temOs, temComprovante, osStatus, momento, pgtoStatus, priorityAlert, produto, osBySaleId, matchedClientIds]);

  // === MODO DETALHADO: uma linha por item de cada venda ===
  const detailedRows = useMemo(() => {
    const rows = [];
    const produtoSet = produto.length ? new Set(produto) : null;
    for (const s of filteredSales) {
      const os = osBySaleId[s.id];
      const items = s.items || [];
      if (items.length === 0) {
        // Venda sem itens — ainda assim aparece como linha única
        rows.push({
          sale: s, os, dash: dashBySaleId[s.id] || null,
          product_name: "—", product_id: null,
          quantity: 0, unit_price: 0, total: 0,
        });
        continue;
      }
      for (const it of items) {
        if (produtoSet && !produtoSet.has(it.product_id)) continue;
        rows.push({
          sale: s, os, dash: dashBySaleId[s.id] || null,
          product_name: it.product_name || "—",
          product_id: it.product_id || null,
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
          total: Number(it.total) || (Number(it.unit_price) || 0) * (Number(it.quantity) || 1),
        });
      }
    }
    return rows;
  }, [filteredSales, osBySaleId, dashBySaleId, produto]);

  // === MODO SOMATÓRIO: agrupa por produto ===
  const summaryRows = useMemo(() => {
    const map = new Map();
    const produtoSet = produto.length ? new Set(produto) : null;
    for (const s of filteredSales) {
      for (const it of (s.items || [])) {
        if (produtoSet && !produtoSet.has(it.product_id)) continue;
        const key = it.product_id || `sem-id:${it.product_name}`;
        if (!map.has(key)) {
          map.set(key, {
            product_id: it.product_id || "",
            product_name: it.product_name || "—",
            total_quantity: 0,
            order_count: 0,
            total_value: 0,
            saleIds: new Set(),
          });
        }
        const entry = map.get(key);
        entry.total_quantity += Number(it.quantity) || 1;
        entry.total_value += Number(it.total) || (Number(it.unit_price) || 0) * (Number(it.quantity) || 1);
        entry.saleIds.add(s.id);
      }
    }
    return Array.from(map.values())
      .map(e => ({ ...e, order_count: e.saleIds.size }))
      .sort((a, b) => b.total_quantity - a.total_quantity);
  }, [filteredSales, produto]);

  const visibleRows = detailedRows.slice(0, visibleCount);
  const hasMore = visibleCount < detailedRows.length;

  const handleExport = () => {
    if (viewMode === "detalhado") {
      exportSalesReportDetailed(detailedRows);
    } else {
      exportSalesReportSummary(summaryRows);
    }
  };

  const fmtMoney = (v) => `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  const fmtDate = (d) => d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";

  const totalItems = detailedRows.reduce((s, r) => s + r.quantity, 0);
  const totalValue = detailedRows.reduce((s, r) => s + r.total, 0);

  return (
    <div>
      <PageHeader title="Relatório de Vendas" description={`${filteredSales.length} vendas • ${detailedRows.length} itens • ${totalItems} unidades • ${fmtMoney(totalValue)}`}>
        <div className="flex gap-2">
          <div className="flex rounded-md border overflow-hidden">
            <Button
              variant={viewMode === "detalhado" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode("detalhado")}
            >
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Detalhado por Item
            </Button>
            <Button
              variant={viewMode === "somatorio" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode("somatorio")}
            >
              <Package className="h-4 w-4 mr-1" /> Somatório por Produto
            </Button>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={detailedRows.length === 0} className="gap-2">
            <Download className="h-4 w-4" /> Exportar Excel
          </Button>
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

      {/* Filtro de produto extra (linha separada) */}
      <div className="mb-4">
        <MultiSelectFilter
          icon={Package}
          options={productOptions}
          selected={produto}
          onChange={setProduto}
          placeholder="Produto"
          allLabel="Todos os produtos"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : viewMode === "detalhado" ? (
        detailedRows.length === 0 ? (
          <EmptyState title="Nenhum item" description="Nenhuma venda encontrada com os filtros atuais." />
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
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-center">Qtd</TableHead>
                    <TableHead className="text-right">Preço Unit.</TableHead>
                    <TableHead className="text-right">Total Item</TableHead>
                    <TableHead>Modalidade</TableHead>
                    <TableHead>Etapa</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead>Status OS</TableHead>
                    <TableHead>Computa o Dashboard</TableHead>
                    <TableHead>Observação (Dashboard)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((r, i) => (
                    <TableRow key={i} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs font-medium">{r.sale.order_number || "—"}</TableCell>
                      <TableCell className="text-xs">{fmtDate(r.sale.date)}</TableCell>
                      <TableCell className="font-medium text-sm">{r.sale.client_name || "—"}</TableCell>
                      <TableCell className="text-xs">{r.sale.seller_name || "—"}</TableCell>
                      <TableCell className="text-sm">{r.product_name}</TableCell>
                      <TableCell className="text-center font-semibold">{r.quantity}</TableCell>
                      <TableCell className="text-right text-xs">{fmtMoney(r.unit_price)}</TableCell>
                      <TableCell className="text-right font-medium text-sm">{fmtMoney(r.total)}</TableCell>
                      <TableCell>
                        {r.sale.delivery_modality ? (
                          <Badge variant="outline" className="text-[10px]">{r.sale.delivery_modality}</Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">{r.sale.stage || r.sale.status || "—"}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.os?.code || "—"}</TableCell>
                      <TableCell>{r.os?.status ? <Badge variant="outline" className="text-[10px]">{r.os.status}</Badge> : "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.dash?.counted ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                            {dashLabel(r.dash)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[340px]">
                        {r.dash && !r.dash.counted ? r.dash.note : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {hasMore && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" onClick={() => setVisibleCount(c => c + PAGE_SIZE)}>
                  Carregar mais ({detailedRows.length - visibleCount} restantes)
                </Button>
              </div>
            )}
          </>
        )
      ) : (
        summaryRows.length === 0 ? (
          <EmptyState title="Nenhum produto" description="Nenhuma venda encontrada com os filtros atuais." />
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-center">Qtd Total</TableHead>
                  <TableHead className="text-center">Nº de Pedidos</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaryRows.map((r, i) => (
                  <TableRow key={i} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{r.product_name}</TableCell>
                    <TableCell className="text-center font-bold text-primary text-lg">{r.total_quantity}</TableCell>
                    <TableCell className="text-center">{r.order_count}</TableCell>
                    <TableCell className="text-right font-medium">{fmtMoney(r.total_value)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30 font-bold border-t-2">
                  <TableCell>Total Geral</TableCell>
                  <TableCell className="text-center text-primary text-lg">{summaryRows.reduce((s, r) => s + r.total_quantity, 0)}</TableCell>
                  <TableCell className="text-center">{filteredSales.length}</TableCell>
                  <TableCell className="text-right">{fmtMoney(summaryRows.reduce((s, r) => s + r.total_value, 0))}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )
      )}
    </div>
  );
}