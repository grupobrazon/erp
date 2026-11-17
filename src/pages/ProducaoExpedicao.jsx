import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Factory, CheckCircle2, Search, Filter, Download } from "lucide-react";
import { exportProductionOrders } from "@/lib/excelExport";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import ProductionTable from "@/components/producao/ProductionTable";
import ProductionBatchView from "@/components/producao/ProductionBatchView";
import { useToast } from "@/components/ui/use-toast";
import { usePermissions } from "@/lib/permissions";
import { subtractBusinessDays } from "@/lib/businessDays";
import { updateOsStatus, refusalMessage, refusalShortReason } from "@/lib/osStatusUpdate";

// A fila de Produção só mostra OS que a logística EXPLICITAMENTE enviou para produção
// (status "Aguardando Produção" ou "Produção Iniciada"). O status inicial
// "Produção/Expedição" NÃO aparece aqui — ele é o estágio pré-decisão da logística
// (expedir do estoque ou produzir), e incluí-lo fazia a fábrica ver pedidos que
// ainda não foram confirmados para produção.
const PRODUCTION_ACTIVE = ["Aguardando Produção", "Produção Iniciada"];
const PRODUCTION_DONE = ["Produção Liberada"];

// OS movimentada por outro setor: a auditoria (status_history) registra a saída das
// etapas de Produção para uma etapa posterior sem passar por "Produção Liberada".
// Ela continua na fila da Produção apenas como pendência — visível com quem
// movimentou e o status real — até ser retirada da fila manualmente.
const movedOutOfProduction = (os) => {
  const h = Array.isArray(os?.status_history) ? os.status_history : [];
  if (h.length === 0) return false;
  const last = h[h.length - 1];
  return PRODUCTION_ACTIVE.includes(last.previous_status) &&
    ![...PRODUCTION_ACTIVE, ...PRODUCTION_DONE].includes(last.new_status);
};

// Logística confirmou estoque verificado (decisão sem produção): a OS deixa de ser
// pendência da fila da Produção e passa a ser exibida na aba Concluídos, refletindo
// exatamente a decisão registrada pela Logística — sem alterar status ou histórico.
const stockConfirmedByLogistics = (os) =>
  !!os.stock_confirmed_date && !os.production_needed;

// Correção manual pontual: OS retirada da fila da Produção (flag exclusiva) que já
// alcançou etapa final (ex: correção de entrega confirmada no Melhor Envio) passa a
// ser exibida na aba Concluídos, refletindo o encerramento real do pedido.
const manuallyConcludedFromQueue = (os) =>
  !!os.production_queue_removed && ["Entregue", "Concluída"].includes(os.status);

// Fila da Produção: etapas ativas + OS movimentadas por outros setores que ainda
// não foram retiradas da fila (flag exclusiva da Produção — não usa o status da OS).
// Inclui OS com etiqueta gerada cuja produção ainda não foi liberada — a etiqueta
// pode ser emitida, mas o romaneio só sai após a Produção/Gerente liberar.
// Status que representam saída definitiva do fluxo de produção (aprovada pelo
// financeiro, faturada, etc.) — a OS deixa de ser pendência da fila da Produção.
const LEFT_PRODUCTION_STATUSES = ["OK - Aprov. Financeira", "Faturada", "Aguardando Faturamento Final", "Aguardando Faturamento - Pós"];

const inProductionQueue = (os) =>
  !os.production_queue_removed &&
  !stockConfirmedByLogistics(os) &&
  !LEFT_PRODUCTION_STATUSES.includes(os.status) &&
  (PRODUCTION_ACTIVE.includes(os.status) ||
    movedOutOfProduction(os) ||
    (os.production_needed && !os.production_completed && os.status === "Etiqueta Gerada"));

export default function ProducaoExpedicao() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canEditProduction } = usePermissions();
  const [view, setView] = useState("producao");
  const [mode, setMode] = useState("pedidos");
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [modalityFilter, setModalityFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [saleDateFrom, setSaleDateFrom] = useState("");
  const [saleDateTo, setSaleDateTo] = useState("");
  const [sentDateFrom, setSentDateFrom] = useState("");
  const [sentDateTo, setSentDateTo] = useState("");
  const [expForecastFrom, setExpForecastFrom] = useState("");
  const [expForecastTo, setExpForecastTo] = useState("");
  const [deadlines, setDeadlines] = useState({});

  // Janela crescente: re-busca até trazer TODOS os registros (sem limite fixo que
  // esconda OS/vendas antigas da fila — mesma estratégia do Faturamento).
  const fetchAll = async (entity) => {
    let limit = 500;
    let result = [];
    while (limit <= 50000) {
      const batch = await base44.entities[entity].list("-created_date", limit);
      result = batch;
      if (batch.length < limit) break; // todos os registros foram carregados
      limit *= 2; // expande a janela e refaz a busca
    }
    return result;
  };

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["serviceOrders", "producao"],
    queryFn: () => fetchAll("ServiceOrder"),
  });
  const { data: sales = [] } = useQuery({
    queryKey: ["sales", "producao"],
    queryFn: () => fetchAll("Sale"),
  });
  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list("-created_date", 500),
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => base44.entities.Product.list("-created_date", 500),
  });
  // Remessas aprovadas (sem cobrança) que precisam de preparação na fábrica.
  // Remessas não geram OS — são incluídas diretamente na view de Produção como
  // linhas próprias (status "Produção/Expedição") para dar visibilidade à fábrica.
  const { data: remessas = [] } = useQuery({
    queryKey: ["remessas"],
    queryFn: () => base44.entities.Remessa.list("-created_date", 200),
  });

  // Agendamentos de rota ativos (não cancelados/bloqueados) — usados para o badge
  // verde "Agendamento" com a data do atendimento e a previsão de expedição
  // (2 dias úteis antes da agenda). O alerta de prioridade (Muito Crítico/Crítico)
  // sobrescreve o badge de agendamento quando definido pelo pós-venda.
  const { data: agendamentos = [] } = useQuery({
    queryKey: ["agendamentos", "producao"],
    queryFn: () => fetchAll("AgendamentoRota"),
  });

  const saleMap = useMemo(() => { const m = {}; sales.forEach(s => { m[s.id] = s; }); return m; }, [sales]);
  const remessaMap = useMemo(() => { const m = {}; remessas.forEach(r => { m[r.id] = r; }); return m; }, [remessas]);
  const clientMap = useMemo(() => { const m = {}; clients.forEach(c => { m[c.id] = c; }); return m; }, [clients]);
  const productMap = useMemo(() => { const m = {}; products.forEach(p => { m[p.id] = p; }); return m; }, [products]);
  // Mapa os_id → OS (para resolver sale_id quando o agendamento só tem os_id vinculado).
  const osMap = useMemo(() => { const m = {}; orders.forEach(o => { m[o.id] = o; }); return m; }, [orders]);

  // Mapa sale_id → agendamento ativo mais recente (para o badge verde de Agendamento).
  // Resolve sale_id via os_id quando o agendamento foi criado sem sale_id (vinculado só à OS).
  const appointmentBySale = useMemo(() => {
    const m = {};
    for (const a of agendamentos) {
      if (a.status === "Cancelado" || a.status === "Bloqueado") continue;
      let saleId = a.sale_id;
      if (!saleId && a.os_id) {
        saleId = osMap[a.os_id]?.sale_id;
      }
      if (!saleId) continue;
      if (!m[saleId] || (a.created_date || "") > (m[saleId].created_date || "")) {
        m[saleId] = a;
      }
    }
    return m;
  }, [agendamentos, osMap]);

  const productionOrders = useMemo(() =>
    orders.filter(o => inProductionQueue(o) || PRODUCTION_DONE.includes(o.status) || stockConfirmedByLogistics(o) || manuallyConcludedFromQueue(o)),
    [orders]
  );

  // Remessas "Aprovadas" = aptas para produção/preparação (ainda não faturadas nem canceladas).
  const approvedRemessas = useMemo(() => remessas.filter(r => r.status === "Aprovada" || r.status === "Aprovada Financeiro"), [remessas]);

  const enriched = useMemo(() => {
    const osRows = productionOrders.map(os => {
      const sale = saleMap[os.sale_id];
      const remessa = os.remessa_id ? remessaMap[os.remessa_id] : null;
      const client = clientMap[os.client_id];
      const sourceItems = sale?.items || remessa?.items || [];
      const items = sourceItems.map(item => ({
        ...item,
        group_name: productMap[item.product_id]?.group_name || "—",
      }));
      const appointment = os.sale_id ? appointmentBySale[os.sale_id] : null;
      const appointmentDate = appointment?.date || null;
      const appointmentExpeditionForecast = appointmentDate ? subtractBusinessDays(appointmentDate, 2) : null;
      const priorityAlert = sale?.priority_alert || remessa?.priority_alert || null;
      const priorityAlertNewForecastDate = sale?.priority_alert_new_forecast_date || remessa?.priority_alert_new_forecast_date || null;
      const displayBadge = priorityAlert === "Muito Crítico" ? "Muito Crítico"
        : priorityAlert === "Crítico" ? "Crítico"
        : appointmentDate ? "Agendamento"
        : null;
      return {
        ...os,
        sale,
        sale_order_number: os.sale_order_number || remessa?.code || null,
        clientCode: client?.new_code || client?.old_code || "—",
        clientState: client?.state || sale?.delivery_address?.state || sale?.billing_address?.state || remessa?.delivery_address?.state || null,
        items,
        saleDate: sale?.date || remessa?.date || null,
        deliveryModality: sale?.delivery_modality || remessa?.delivery_modality || null,
        sentDate: os.production_sent_date,
        expeditionForecastDate: sale?.expedition_forecast_date || remessa?.date || null,
        priorityAlert,
        priorityAlertNewForecastDate,
        appointmentDate,
        appointmentExpeditionForecast,
        displayBadge,
      };
    });
    // Linhas de Remessa (sem OS vinculada) — mapeadas para o mesmo shape das OS.
    const remessaRows = approvedRemessas.map(r => {
      const client = clientMap[r.client_id];
      const items = (r.items || []).map(item => ({
        ...item,
        group_name: productMap[item.product_id]?.group_name || "—",
      }));
      return {
        id: `rem-${r.id}`,
        code: r.code,
        client_id: r.client_id,
        client_name: r.client_name || "",
        status: "Produção/Expedição",
        type: "Remessa",
        sale_order_number: r.code,
        sale: null,
        clientCode: client?.new_code || client?.old_code || "—",
        clientState: client?.state || r.delivery_address?.state || null,
        items,
        saleDate: r.date,
        sentDate: null,
        production_started_date: null,
        production_forecast_date: null,
        production_liberated_date: null,
        expeditionForecastDate: null,
        priorityAlert: r.priority_alert || null,
        priorityAlertNewForecastDate: r.priority_alert_new_forecast_date || null,
        appointmentDate: null,
        appointmentExpeditionForecast: null,
        displayBadge: r.priority_alert === "Muito Crítico" ? "Muito Crítico" : r.priority_alert === "Crítico" ? "Crítico" : null,
        isRemessa: true,
        remessa: r,
        deliveryModality: r.delivery_modality || null,
      };
    });
    return [...osRows, ...remessaRows];
  }, [productionOrders, approvedRemessas, saleMap, remessaMap, clientMap, productMap]);

  const stateOptions = useMemo(() => {
    const states = new Set();
    enriched.forEach(os => { if (os.clientState) states.add(os.clientState); });
    return Array.from(states).sort((a, b) => a.localeCompare(b));
  }, [enriched]);

  const filtered = useMemo(() => {
    const result = enriched.filter(os => {
      if (view === "producao" && !inProductionQueue(os)) return false;
      if (view === "concluidos" && !PRODUCTION_DONE.includes(os.status) && !stockConfirmedByLogistics(os) && !manuallyConcludedFromQueue(os)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!os.code?.toLowerCase().includes(q) &&
            !os.client_name?.toLowerCase().includes(q) &&
            !os.sale_order_number?.toLowerCase().includes(q) &&
            !os.clientCode?.toLowerCase().includes(q)) return false;
      }
      if (groupFilter !== "all") {
        if (!os.items.some(i => i.group_name === groupFilter)) return false;
      }
      if (modalityFilter !== "all") {
        const modality = os.sale?.delivery_modality || os.remessa?.delivery_modality || "";
        if (modalityFilter === "envio" && modality !== "Envio") return false;
        if (modalityFilter === "atendimento" && (!modality || modality === "Envio")) return false;
      }
      if (stateFilter !== "all") {
        if (!os.clientState || os.clientState !== stateFilter) return false;
      }
      if (saleDateFrom && os.saleDate && os.saleDate < saleDateFrom) return false;
      if (saleDateTo && os.saleDate && os.saleDate > saleDateTo) return false;
      if (sentDateFrom && os.sentDate && os.sentDate < sentDateFrom) return false;
      if (sentDateTo && os.sentDate && os.sentDate > sentDateTo) return false;
      if (expForecastFrom && os.expeditionForecastDate && os.expeditionForecastDate < expForecastFrom) return false;
      if (expForecastTo && os.expeditionForecastDate && os.expeditionForecastDate > expForecastTo) return false;
      return true;
    });
    // Ordenação: Muito Crítico > Crítico > Agendamento > sem badge, depois por previsão de expedição (mais antiga primeiro)
    const priorityRank = (os) => {
      if (os.priorityAlert === "Muito Crítico") return 0;
      if (os.priorityAlert === "Crítico") return 1;
      if (os.displayBadge === "Agendamento") return 2;
      return 3;
    };
    const effectiveForecast = (os) => {
      if (os.priorityAlert) return os.priorityAlertNewForecastDate || os.expeditionForecastDate || null;
      if (os.displayBadge === "Agendamento") return os.appointmentExpeditionForecast || null;
      return os.expeditionForecastDate || null;
    };
    // Ordenação: primeiro pela data de expedição (mais próxima primeiro), e dentro da
    // mesma data segue Muito Crítico > Crítico > Agendamento > sem badge.
    return result.sort((a, b) => {
      const da = effectiveForecast(a) || "9999-12-31";
      const db = effectiveForecast(b) || "9999-12-31";
      if (da !== db) return da.localeCompare(db);
      const pa = priorityRank(a);
      const pb = priorityRank(b);
      return pa - pb;
    });
  }, [enriched, view, search, groupFilter, modalityFilter, stateFilter, saleDateFrom, saleDateTo, sentDateFrom, sentDateTo, expForecastFrom, expForecastTo]);

  const productGroups = useMemo(() => {
    const activeOrders = enriched.filter(os => PRODUCTION_ACTIVE.includes(os.status));
    const map = {};
    for (const os of activeOrders) {
      for (const item of os.items) {
        const key = item.product_id || item.product_name;
        if (!map[key]) {
          map[key] = { key, title: item.product_name, subtitle: item.group_name, totalQty: 0, items: [] };
        }
        map[key].totalQty += item.quantity || 0;
        if (!map[key].items.find(o => o.osId === os.id)) {
          map[key].items.push({
            osId: os.id, osCode: os.code, clientId: os.client_id,
            lineLabel: os.client_name, lineSubLabel: os.clientCode,
            saleOrder: os.sale_order_number, qty: item.quantity, status: os.status, sentDate: os.sentDate,
            startedDate: os.production_started_date, forecastDate: os.production_forecast_date,
            expeditionForecastDate: os.expeditionForecastDate,
            priorityAlert: os.priorityAlert,
            priorityAlertNewForecastDate: os.priorityAlertNewForecastDate,
            displayBadge: os.displayBadge,
            appointmentDate: os.appointmentDate,
            appointmentExpeditionForecast: os.appointmentExpeditionForecast,
            purifierModel: item.purifier_model || "",
          });
        }
      }
    }
    let result = Object.values(map);
    if (groupFilter !== "all") result = result.filter(p => p.subtitle === groupFilter);
    return result.sort((a, b) => b.totalQty - a.totalQty);
  }, [enriched, groupFilter]);

  const clientGroups = useMemo(() => {
    const activeOrders = enriched.filter(os => PRODUCTION_ACTIVE.includes(os.status));
    const map = {};
    for (const os of activeOrders) {
      const key = os.client_id;
      if (!map[key]) {
        map[key] = { key, title: os.client_name, subtitle: os.clientCode, totalQty: 0, items: [] };
      }
      const osQty = os.items.reduce((s, i) => s + (i.quantity || 0), 0);
      map[key].totalQty += osQty;
      if (!map[key].items.find(o => o.osId === os.id)) {
        const productNames = os.items.map(i => i.product_name).join(", ");
        const groups = [...new Set(os.items.map(i => i.group_name).filter(Boolean))];
        const purifierModels = os.items.filter(i => i.purifier_model).map(i => `${i.product_name}: ${i.purifier_model}`).join(" · ");
        map[key].items.push({
          osId: os.id, osCode: os.code, clientId: os.client_id,
          lineLabel: productNames, lineSubLabel: groups.join(", "),
          saleOrder: os.sale_order_number, qty: osQty, status: os.status, sentDate: os.sentDate,
          startedDate: os.production_started_date, forecastDate: os.production_forecast_date,
          expeditionForecastDate: os.expeditionForecastDate,
          priorityAlert: os.priorityAlert,
          priorityAlertNewForecastDate: os.priorityAlertNewForecastDate,
          displayBadge: os.displayBadge,
          appointmentDate: os.appointmentDate,
          appointmentExpeditionForecast: os.appointmentExpeditionForecast,
          purifierModels,
        });
      }
    }
    let result = Object.values(map);
    if (groupFilter !== "all") {
      result = result.filter(g => g.items.some(o => o.lineSubLabel?.includes(groupFilter)));
    }
    return result.sort((a, b) => b.totalQty - a.totalQty);
  }, [enriched, groupFilter]);

  const uniqueGroups = useMemo(() => {
    const set = new Set();
    products.forEach(p => { if (p.group_name) set.add(p.group_name); });
    return Array.from(set).sort();
  }, [products]);

  const clientPendingCount = useMemo(() => {
    const map = {};
    for (const os of enriched) {
      if (os.status === "Aguardando Produção") {
        map[os.client_id] = (map[os.client_id] || 0) + 1;
      }
    }
    return map;
  }, [enriched]);

  // Tempo real: qualquer alteração de OS (Logística, Financeiro, Supervisor ou outra
  // Produção) atualiza a lista automaticamente, sem depender de F5.
  useEffect(() => {
    const unsubscribe = base44.entities.ServiceOrder.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
    });
    return unsubscribe;
  }, [queryClient]);

  // Atualização de status com revalidação no backend: a OS só é alterada se ainda
  // estiver exatamente no status exibido na tela. Se outro setor já avançou a OS,
  // a operação é recusada (sem sobrescrever a nova etapa) e a lista é sincronizada.
  // Busca sempre o status AO VIVO da OS antes de validar — a lista completa (fetchAll)
  // é lenta e pode estar desatualizada no momento do clique, causando recusa falsa.
  // Atualização de status com revalidação no backend: a OS só é alterada se ainda
  // estiver exatamente no status exibido na tela. Se outro setor já avançou a OS,
  // a operação é recusada (sem sobrescrever a nova etapa) e a lista é sincronizada.
  //
  // Em modo lote (opts.silent): NÃO faz o GET ao vivo nem invalida a query a cada
  // item — o backend já faz o próprio GET/validação, e invalidar a query pesada
  // (fetchAll) 27x em sequência satura a API e faz os GETs falharem (NOT_FOUND).
  // A invalidação acontece uma única vez ao final do lote (onBatchComplete).
  const updateStatus = async (osId, data, msg, expectedStatus, osCode, opts = {}) => {
    let liveExpectedStatus = expectedStatus;
    if (!opts.silent) {
      try {
        const liveOs = await base44.entities.ServiceOrder.get(osId);
        liveExpectedStatus = liveOs?.status || expectedStatus;
      } catch {
        // Se a busca ao vivo falhar, mantém o status da tela (fallback).
      }
    }
    const result = await updateOsStatus({ osId, updates: data, expectedStatus: liveExpectedStatus, source: "Produção" });
    if (!opts.silent) {
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
    }
    if (result.success) {
      if (!opts.silent && msg) {
        toast({ title: msg, description: osCode ? `${osCode} — etapa atual: ${data.status}` : undefined });
      }
      return { success: true };
    }
    const reason = refusalMessage(result, osCode);
    if (!opts.silent) {
      toast({ title: "Ação não realizada", description: reason, variant: "destructive" });
    }
    return { success: false, code: result.code, reason, shortReason: refusalShortReason(result) };
  };

  const onBatchComplete = () => queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });

  const counts = {
    producao: enriched.filter(o => inProductionQueue(o)).length,
    concluidos: enriched.filter(o => PRODUCTION_DONE.includes(o.status) || stockConfirmedByLogistics(o) || manuallyConcludedFromQueue(o)).length,
  };

  const hasFilters = search || groupFilter !== "all" || modalityFilter !== "all" || stateFilter !== "all" || saleDateFrom || saleDateTo || sentDateFrom || sentDateTo || expForecastFrom || expForecastTo;

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader title="Produção" description="Acompanhamento de itens enviados para produção na fábrica (Maxfilter)" />
        <Button variant="outline" size="sm" onClick={() => exportProductionOrders(filtered)} disabled={filtered.length === 0}>
          <Download className="h-4 w-4" /> Exportar Excel
        </Button>
      </div>

      <div className="mb-4">
        <Tabs value={view} onValueChange={setView}>
          <TabsList>
            <TabsTrigger value="producao" className="gap-1">
              <Factory className="h-3 w-3" /> Em Produção
              <Badge variant="secondary" className="ml-1 text-xs">{counts.producao}</Badge>
            </TabsTrigger>
            <TabsTrigger value="concluidos" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> Concluídos
              <Badge variant="secondary" className="ml-1 text-xs">{counts.concluidos}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-md border p-3 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Filter className="h-4 w-4" /> Filtros
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <div className="md:col-span-2 lg:col-span-2">
            <Label className="text-xs">Buscar (OS, pedido, cliente, código)</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-10" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Tipo de Produto (Grupo)</Label>
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {uniqueGroups.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Modalidade</Label>
            <Select value={modalityFilter} onValueChange={setModalityFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as modalidades</SelectItem>
                <SelectItem value="envio">Envio</SelectItem>
                <SelectItem value="atendimento">Atendimento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Estado (UF)</Label>
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os estados</SelectItem>
                {stateOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {view === "producao" && (
            <div>
              <Label className="text-xs">Visualização</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pedidos">Por Venda</SelectItem>
                  <SelectItem value="produtos">Por Produto</SelectItem>
                  <SelectItem value="clientes">Por Cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Venda de</Label>
            <Input type="date" value={saleDateFrom} onChange={e => setSaleDateFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Venda até</Label>
            <Input type="date" value={saleDateTo} onChange={e => setSaleDateTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Enviado de</Label>
            <Input type="date" value={sentDateFrom} onChange={e => setSentDateFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Enviado até</Label>
            <Input type="date" value={sentDateTo} onChange={e => setSentDateTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Previsão Exp. de</Label>
            <Input type="date" value={expForecastFrom} onChange={e => setExpForecastFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Previsão Exp. até</Label>
            <Input type="date" value={expForecastTo} onChange={e => setExpForecastTo(e.target.value)} />
          </div>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setGroupFilter("all"); setModalityFilter("all"); setStateFilter("all"); setSaleDateFrom(""); setSaleDateTo(""); setSentDateFrom(""); setSentDateTo(""); setExpForecastFrom(""); setExpForecastTo(""); }}>
            Limpar filtros
          </Button>
        )}
      </div>

      <div>
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
        ) : view === "producao" && mode === "produtos" ? (
          <ProductionBatchView groups={productGroups} updateStatus={updateStatus} onBatchComplete={onBatchComplete} readOnly={!canEditProduction} groupBy="product" clientPendingCount={clientPendingCount} />
        ) : view === "producao" && mode === "clientes" ? (
          <ProductionBatchView groups={clientGroups} updateStatus={updateStatus} onBatchComplete={onBatchComplete} readOnly={!canEditProduction} groupBy="client" clientPendingCount={clientPendingCount} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={view === "producao" ? Factory : CheckCircle2}
            title="Nada por aqui"
            description={view === "producao" ? "Nenhuma OS em produção com os filtros atuais." : "Nenhuma produção concluída ainda."}
          />
        ) : (
          <ProductionTable
            orders={filtered}
            view={view}
            deadlines={deadlines}
            setDeadlines={setDeadlines}
            updateStatus={updateStatus}
            readOnly={!canEditProduction}
            clientPendingCount={clientPendingCount}
          />
        )}
      </div>
    </div>
  );
}