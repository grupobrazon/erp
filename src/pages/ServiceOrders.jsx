import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2, Truck, Package, Wrench, RefreshCw, AlertTriangle, CalendarClock, X, ShieldCheck, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import MultiSelectFilter from "@/components/ui/MultiSelectFilter";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import ServiceOrderDetailDialog from "@/components/serviceorders/ServiceOrderDetailDialog";
import ReverseOSDetailDialog from "@/components/serviceorders/ReverseOSDetailDialog";
import MaintenanceOSCreateDialog from "@/components/serviceorders/MaintenanceOSCreateDialog";
import MaintenanceOSConvertDialog from "@/components/serviceorders/MaintenanceOSConvertDialog";
import { usePermissions } from "@/lib/permissions";
import { useToast } from "@/components/ui/use-toast";
import { subtractBusinessDays } from "@/lib/businessDays";
import { exportServiceOrders } from "@/lib/excelExport";
import { FileSpreadsheet } from "lucide-react";

const statusColors = {
  "Aprovação Comercial": "bg-amber-100 text-amber-700",
  "Aprovação Financeira": "bg-blue-100 text-blue-700",
  "Produção/Expedição": "bg-orange-100 text-orange-700",
  "Aguardando Produção": "bg-yellow-100 text-yellow-700",
  "Produção Iniciada": "bg-amber-100 text-amber-700",
  "Produção Liberada": "bg-teal-100 text-teal-700",
  "Aguardando Rota": "bg-purple-100 text-purple-700",
  "Agendamento/Rota": "bg-violet-100 text-violet-700",
  "Faturamento": "bg-indigo-100 text-indigo-700",
  "Liberado para Técnico": "bg-cyan-100 text-cyan-700",
  "OS Técnico": "bg-cyan-100 text-cyan-800",
  "Em Execução": "bg-sky-100 text-sky-700",
  "Concluída pelo Técnico": "bg-teal-100 text-teal-700",
  "Rota Enviada": "bg-violet-100 text-violet-700",
  "Em Rota": "bg-purple-100 text-purple-700",
  "Atendimento Interrompido": "bg-rose-100 text-rose-700",
  "Aguardando Faturamento - Pós": "bg-violet-100 text-violet-700",
  "OK - Aprov. Financeira": "bg-blue-100 text-blue-700",
  "Aguardando Faturamento Final": "bg-indigo-100 text-indigo-700",
  "Faturada": "bg-emerald-100 text-emerald-700",
  "Etiqueta Gerada": "bg-indigo-100 text-indigo-700",
  "Separação": "bg-violet-100 text-violet-700",
  "Saída do Estoque": "bg-cyan-100 text-cyan-700",
  "Em Transporte": "bg-sky-100 text-sky-700",
  "Em Andamento": "bg-purple-100 text-purple-700",
  "Concluída": "bg-emerald-100 text-emerald-700",
  "Entregue": "bg-emerald-100 text-emerald-700",
  "Cancelada": "bg-red-100 text-red-700",
  "Aguardando Coleta Reversa": "bg-amber-100 text-amber-700",
  "Em Retorno": "bg-sky-100 text-sky-700",
  "Recebida na Empresa": "bg-emerald-100 text-emerald-700",
};

const typeIcons = { "Expedição": Truck, "Entrega": Package, "Entrega + Instalação": Wrench, "Manutenção": Wrench };

const PAGE_SIZE = 50;

export default function ServiceOrders() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("todas");
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedPriorities, setSelectedPriorities] = useState([]);
  const [agendaDateFrom, setAgendaDateFrom] = useState("");
  const [agendaDateTo, setAgendaDateTo] = useState("");
  const [romaneioFilter, setRomaneioFilter] = useState("todos");
  const [romaneioDate, setRomaneioDate] = useState("");
  const [completedAtFrom, setCompletedAtFrom] = useState("");
  const [completedAtTo, setCompletedAtTo] = useState("");
  const [tosSubTab, setTosSubTab] = useState("todas");
  const [modalityFilter, setModalityFilter] = useState("todas");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [selectedReverse, setSelectedReverse] = useState(null);
  const [showCreateMaint, setShowCreateMaint] = useState(false);
  const [convertOrder, setConvertOrder] = useState(null);
  const [syncingTracking, setSyncingTracking] = useState(false);
  const queryClient = useQueryClient();
  const { canManageOS, canDeleteOS } = usePermissions();
  const { toast } = useToast();

  const handleSyncTracking = async () => {
    setSyncingTracking(true);
    try {
      const res = await base44.functions.invoke("syncMelhorEnvioTracking", {});
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      const changes = res?.status_changes?.length || 0;
      toast({
        title: "Rastreio sincronizado",
        description: `${res?.checked_orders || 0} OS verificadas, ${changes} status atualizado(s), ${res?.codes_filled || 0} código(s) preenchido(s).`,
      });
    } catch (err) {
      toast({ title: "Erro ao sincronizar rastreio", description: err?.message || "Falha desconhecida", variant: "destructive" });
    } finally {
      setSyncingTracking(false);
    }
  };

  const { data: orders = [], isLoading, refetch: refetchOrders, isFetching: fetchingOrders } = useQuery({
    queryKey: ["serviceOrders"],
    queryFn: async () => {
      const all = [];
      let skip = 0;
      for (;;) {
        const batch = await base44.entities.ServiceOrder.list("-created_date", 500, skip);
        all.push(...batch);
        if (batch.length < 500) break;
        skip += 500;
      }
      return all;
    },
  });

  // Carrega vendas para enriquecer as OS's com prioridade e data de entrega
  const { data: sales = [] } = useQuery({
    queryKey: ["sales"],
    queryFn: () => base44.entities.Sale.list("-created_date", 1000),
  });

  // Carrega remessas para enriquecer OS geradas de remessa com prioridade e data
  const { data: remessas = [] } = useQuery({
    queryKey: ["remessas", "os-enrich"],
    queryFn: () => base44.entities.Remessa.list("-created_date", 200),
  });

  // Carrega agendamentos de rota para enriquecer as OS's com a data de agenda
  const { data: appointments = [] } = useQuery({
    queryKey: ["agendamentoRotas"],
    queryFn: () => base44.entities.AgendamentoRota.list("-created_date", 500),
  });

  // Carrega todas as OS do Técnico (TOS) para mapear parent_os_id -> tos.id
  // (necessário para abrir a TOS em página inteira ao clicar na aba "OS Técnico")
  const { data: allTOS = [] } = useQuery({
    queryKey: ["allTechnicianOS"],
    queryFn: () => base44.entities.TechnicianServiceOrder.list("-created_date", 500),
  });

  const tosByParent = React.useMemo(() => {
    const m = {};
    allTOS.forEach(t => { if (t.parent_os_id) m[t.parent_os_id] = t.id; });
    return m;
  }, [allTOS]);

  // Mapa de parent_os_id -> TOS completa (status, completed_at) para a aba "OS Técnico"
  const tosDataByParent = React.useMemo(() => {
    const m = {};
    allTOS.forEach(t => { if (t.parent_os_id) m[t.parent_os_id] = t; });
    return m;
  }, [allTOS]);

  const TOS_STATUS_OPTIONS = ["Pendente", "Em Execução", "Concluída", "Não Concluída", "Atendido Parcialmente", "Cancelada"];
  // Mapeia a opção do filtro para os status reais da TOS (ex: "Concluída" engloba "Concluída Téc" e "Finalizada")
  const TOS_STATUS_FILTER_MAP = {
    "Pendente": ["Pendente"],
    "Em Execução": ["Em Execução"],
    "Concluída": ["Concluída Téc", "Finalizada", "Aguardando Faturamento - Pós", "OK - Aprov. Financeira", "Concluída pelo Técnico", "Faturada", "Aguardando Faturamento Final", "Concluída", "Entregue"],
    "Não Concluída": ["Atendimento Interrompido"],
    "Atendido Parcialmente": ["Atendido Parcialmente"],
    "Cancelada": ["Cancelada"],
  };
  const tosStatusColors = {
    "Pendente": "bg-blue-100 text-blue-700",
    "Em Execução": "bg-purple-100 text-purple-700",
    "Concluída": "bg-emerald-100 text-emerald-700",
    "Não Concluída": "bg-rose-100 text-rose-700",
    "Atendido Parcialmente": "bg-amber-100 text-amber-700",
    "Cancelada": "bg-red-100 text-red-700",
  };

  const saleMap = React.useMemo(() => {
    const m = {};
    sales.forEach(s => { m[s.id] = s; });
    return m;
  }, [sales]);

  const remessaMap = React.useMemo(() => {
    const m = {};
    remessas.forEach(r => { m[r.id] = r; });
    return m;
  }, [remessas]);

  // Mapa de sale_id -> agendamento mais próximo (data >= hoje, não cancelado)
  const appointmentBySale = React.useMemo(() => {
    const m = {};
    const today = new Date().toISOString().slice(0, 10);
    for (const a of appointments) {
      if (a.status === "Cancelado") continue;
      if (!a.sale_id) continue;
      const existing = m[a.sale_id];
      // Prioriza agendamentos com data >= hoje; entre os futuros, o mais próximo
      if (!existing || (a.date >= today && (existing.date < today || a.date < existing.date))) {
        m[a.sale_id] = a;
      }
    }
    return m;
  }, [appointments]);

  // Enriquece cada OS com prioridade, data de entrega e data de agenda
  const enrichedOrders = React.useMemo(() => orders.map(o => {
    const sale = o.sale_id ? saleMap[o.sale_id] : null;
    const remessa = o.remessa_id ? remessaMap[o.remessa_id] : null;
    // Serviço finalizado pelo técnico, concluído ou já com romaneio gerado:
    // já saiu da fila — não faz sentido continuar marcada como crítica
    const finishedStatuses = [
      "Entregue", "Concluída", "Cancelada",
      "Concluída pelo Técnico", "Finalizada pelo Técnico", "Finalizada",
    ];
    const isFinished = finishedStatuses.includes(o.status) || !!o.romaneio_date;
    const priorityAlert = isFinished ? null : (sale?.priority_alert || remessa?.priority_alert || null);
    const priorityNewForecast = sale?.priority_alert_new_forecast_date || remessa?.priority_alert_new_forecast_date || null;
    const appt = o.sale_id ? appointmentBySale[o.sale_id] : null;
    const appointmentDate = appt?.date || null;
    // Previsão de expedição automática: 2 dias úteis antes do agendamento
    // (mesma regra do dashboard de Produção/Expedição)
    const appointmentExpeditionForecast = appointmentDate ? subtractBusinessDays(appointmentDate, 2) : null;
    const deliveryDate =
      (priorityAlert && priorityNewForecast) ||
      sale?.expedition_forecast_date ||
      appointmentExpeditionForecast ||
      sale?.cr_delivery_deadline ||
      o.date || null;
    // Data do pedido (data da venda / remessa) — base da ordenação das entregas pendentes
    const orderDate = sale?.date || remessa?.date || o.date || null;
    return { ...o, priority_alert: priorityAlert, delivery_date: deliveryDate, appointment_date: appointmentDate, order_date: orderDate, is_finished: isFinished };
  }), [orders, saleMap, remessaMap, appointmentBySale]);

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ServiceOrder.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["serviceOrders"] }),
  });

  // Pós-venda corrigiu o apontado pelo financeiro e reenvia a OS para aprovação
  const resendFinanceMutation = useMutation({
    mutationFn: async (osId) => {
      const result = await base44.functions.invoke("updateOsStatus", {
        os_id: osId,
        updates: { status: "OK - Aprov. Financeira", finance_rejected: false },
        expected_status: null,
        source: "Ordens de Serviço — pós-venda corrigiu e reenviou ao financeiro",
      });
      const body = result?.data || result;
      if (!body.success) throw new Error(body.message || "Não foi possível reenviar a OS.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      toast({ title: "OS reenviada ao financeiro", description: "A OS voltou para a aprovação financeira." });
    },
    onError: (err) => toast({ title: "Erro ao reenviar", description: err?.message, variant: "destructive" }),
  });

  // "Reprovado pelo Financeiro" é flag (finance_rejected), não status da OS — entra como opção virtual no filtro
  const temReprovado = orders.some(o => o.finance_rejected);
  const statusOptions = [
    ...new Set([
      ...orders.map(o => o.status).filter(Boolean),
      ...(temReprovado ? ["Reprovado pelo Financeiro"] : []),
    ]),
  ].sort();

  const filtered = React.useMemo(() => {
    const concludedStatuses = ["Concluída", "Entregue"];
    const transportStatuses = ["Saída do Estoque", "Em Transporte"];
    let result = enrichedOrders.filter(o => {
      const isConcluded = concludedStatuses.includes(o.status);
      const isTransport = transportStatuses.includes(o.status);
      // Aba "os_tecnico": mostra todas as OS que têm código de OS do técnico (TOS...)
      if (tab === "os_tecnico") {
        if (!o.technician_os_code) return false;
      } else if (tab === "concluidas") {
        // Aba "concluidas": mostra todas as OS concluídas (todos os tipos)
        if (!isConcluded) return false;
      } else if (tab === "em_transporte") {
        // Aba "em_transporte": OS com status Saída do Estoque ou Em Transporte
        if (!isTransport) return false;
      } else if (tab === "os_reversa") {
        if (!o.is_reverse) return false;
      } else if (tab === "pos_rota") {
        const posRotaStatuses = ["Concluída pelo Técnico", "Atendimento Interrompido", "Aguardando Faturamento - Pós", "OK - Aprov. Financeira", "Aguardando Faturamento Final"];
        if (!posRotaStatuses.includes(o.status)) return false;
      } else if (tab === "todas") {
        // Aba "Todas": mostra TODAS as OS, inclusive em transporte e concluídas
      } else {
        // Demais abas específicas excluem OS concluídas e em transporte
        if (isConcluded) return false;
        if (isTransport) return false;
        if (tab === "entregas") {
          // Entregas junta Entrega e Entrega + Instalação (mesmo caso: montar rota)
          if (o.type !== "Entrega" && o.type !== "Entrega + Instalação") return false;
        } else if (tab === "Expedição") {
          if (o.type !== "Expedição") return false;
        } else if (tab === "manutencao") {
          // Manutenção/Garantia: OS sem tipo (não vindas de venda) OU com maintenance_subtype
          if (o.type && !o.maintenance_subtype) return false;
        }
      }
      if (tab === "os_tecnico") {
        const tosData = tosDataByParent[o.id];
        const tosStatus = tosData?.status;
        if (tosSubTab === "pendentes" && tosStatus !== "Pendente") return false;
        if (tosSubTab === "enviadas" && tosStatus === "Pendente") return false;
      }
      if (selectedStatuses.length > 0) {
        if (tab === "os_tecnico") {
          const tosStatus = tosDataByParent[o.id]?.status;
          const allowed = selectedStatuses.flatMap(s => TOS_STATUS_FILTER_MAP[s] || [s]);
          // Considera concluído se o status da TOS OU da OS pai (etapas pós-atendimento) bater
          if (!allowed.includes(tosStatus) && !allowed.includes(o.status)) return false;
        } else {
          const statusOk = selectedStatuses.includes(o.status);
          const reprovadoOk = selectedStatuses.includes("Reprovado pelo Financeiro") && o.finance_rejected;
          if (!statusOk && !reprovadoOk) return false;
        }
      }
      if (tab === "os_tecnico" && (agendaDateFrom || agendaDateTo || completedAtFrom || completedAtTo)) {
        // Na aba OS Técnico, Data da Agenda e Data de Conclusão combinam com OU:
        // o atendimento entra se a agenda OU a conclusão estiver no período.
        const compDate = tosDataByParent[o.id]?.completed_at ? tosDataByParent[o.id].completed_at.slice(0, 10) : null;
        const agendaOk = o.appointment_date
          && (!agendaDateFrom || o.appointment_date >= agendaDateFrom)
          && (!agendaDateTo || o.appointment_date <= agendaDateTo);
        const completedOk = compDate
          && (!completedAtFrom || compDate >= completedAtFrom)
          && (!completedAtTo || compDate <= completedAtTo);
        const hasAgenda = agendaDateFrom || agendaDateTo;
        const hasCompleted = completedAtFrom || completedAtTo;
        if (hasAgenda && hasCompleted) {
          if (!agendaOk && !completedOk) return false;
        } else if (hasAgenda && !agendaOk) {
          return false;
        } else if (hasCompleted && !completedOk) {
          return false;
        }
      } else if (agendaDateFrom || agendaDateTo) {
        if (!o.appointment_date) return false;
        if (agendaDateFrom && o.appointment_date < agendaDateFrom) return false;
        if (agendaDateTo && o.appointment_date > agendaDateTo) return false;
      }
      if (selectedPriorities.length > 0) {
        const pVal = o.priority_alert || "Sem prioridade";
        if (!selectedPriorities.includes(pVal)) return false;
      }
      if (modalityFilter === "Envio" && o.delivery_modality !== "Envio") return false;
      if (modalityFilter === "Atendimento" && !["Entrega Própria", "Entrega + Instalação"].includes(o.delivery_modality)) return false;
      if (romaneioFilter === "sem_romaneio" && o.romaneio_date) return false;
      if (romaneioFilter === "com_romaneio" && !o.romaneio_date) return false;
      if (romaneioDate && o.romaneio_date !== romaneioDate) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return o.code?.toLowerCase().includes(q) ||
        o.client_name?.toLowerCase().includes(q) ||
        o.sale_order_number?.toLowerCase().includes(q) ||
        (tab === "os_tecnico" && o.technician?.toLowerCase().includes(q));
    });

    // Ordenação: alerta de prioridade no topo (Muito Crítico > Crítico), depois por data de entrega (mais próxima primeiro)
    const priorityRank = (o) => {
      // Entregues / concluídas / canceladas vão sempre para o fim da fila
      if (o.is_finished) return 3;
      if (o.priority_alert === "Muito Crítico") return 0;
      if (o.priority_alert === "Crítico") return 1;
      return 2;
    };

    if (tab === "entregas") {
      // Mesma regra das demais abas: prioridade primeiro (Muito Crítico > Crítico > sem prioridade),
      // depois data do pedido mais antiga dentro de cada grupo
      result.sort((a, b) => {
        const pa = priorityRank(a);
        const pb = priorityRank(b);
        if (pa !== pb) return pa - pb;
        const da = a.order_date || "9999-12-31";
        const db = b.order_date || "9999-12-31";
        return da.localeCompare(db);
      });
    } else if (tab === "concluidas" || tab === "os_tecnico" || tab === "os_reversa") {
      // Concluídas / OS Técnico / OS Reversa: mais recentes primeiro (created_date decrescente)
      result.sort((a, b) => (b.created_date || "").localeCompare(a.created_date || ""));
    } else {
      // todas, Expedição, manutencao, em_transporte: prioridade primeiro
      // (Muito Crítico > Crítico > sem prioridade), depois data do pedido mais antiga dentro de cada grupo
      result.sort((a, b) => {
        const pa = priorityRank(a);
        const pb = priorityRank(b);
        if (pa !== pb) return pa - pb;
        const da = a.order_date || "9999-12-31";
        const db = b.order_date || "9999-12-31";
        return da.localeCompare(db);
      });
    }
    return result;
  }, [enrichedOrders, tab, selectedStatuses, selectedPriorities, agendaDateFrom, agendaDateTo, romaneioFilter, romaneioDate, search, tosDataByParent, completedAtFrom, completedAtTo, tosSubTab, modalityFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div>
      <PageHeader title="Ordens de Serviço" description={`${orders.length} ordens registradas`}>
        <div className="flex gap-2">
          {tab === "manutencao" && (
            <Button onClick={() => setShowCreateMaint(true)} className="gap-2">
              <Wrench className="h-4 w-4" /> Nova OS Manutenção
            </Button>
          )}
          <Button variant="outline" onClick={() => refetchOrders()} disabled={fetchingOrders} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${fetchingOrders ? "animate-spin" : ""}`} />
            {fetchingOrders ? "Atualizando..." : "Atualizar"}
          </Button>
          <Button variant="outline" onClick={handleSyncTracking} disabled={syncingTracking} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${syncingTracking ? "animate-spin" : ""}`} />
            {syncingTracking ? "Sincronizando..." : "Atualizar rastreio Melhor Envio"}
          </Button>
          <Button variant="outline" onClick={() => exportServiceOrders(filtered, tab, tosDataByParent)} className="gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
          </Button>
        </div>
      </PageHeader>

      <div className="mb-4 flex items-center gap-4 flex-wrap">
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1); }}>
          <TabsList>
            <TabsTrigger value="todas">Todas</TabsTrigger>
            <TabsTrigger value="Expedição">Expedição</TabsTrigger>
            <TabsTrigger value="entregas">Entregas</TabsTrigger>
            <TabsTrigger value="manutencao">Manutenção/Garantia</TabsTrigger>
            <TabsTrigger value="em_transporte">Em Transporte</TabsTrigger>
            <TabsTrigger value="concluidas">Concluídas</TabsTrigger>
            <TabsTrigger value="os_tecnico" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white data-[state=active]:shadow-sm text-teal-700">OS Técnico</TabsTrigger>
            <TabsTrigger value="pos_rota" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:shadow-sm text-blue-700">Pós-Rota</TabsTrigger>
            <TabsTrigger value="os_reversa" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white data-[state=active]:shadow-sm text-purple-700">OS Reversa</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={tab === "os_tecnico" ? "Buscar por código, cliente, técnico..." : "Buscar por código, cliente, pedido..."} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
        </div>
        <MultiSelectFilter
          options={tab === "os_tecnico" ? TOS_STATUS_OPTIONS.map(s => ({ value: s, label: s })) : statusOptions.map(s => ({ value: s, label: s }))}
          selected={selectedStatuses}
          onChange={(v) => { setSelectedStatuses(v); setPage(1); }}
          placeholder="Todos os status"
          allLabel="Todos os status"
          className="w-[200px]"
        />
        <Select value={modalityFilter} onValueChange={(v) => { setModalityFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Modalidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as modalidades</SelectItem>
            <SelectItem value="Envio">Envio</SelectItem>
            <SelectItem value="Atendimento">Atendimento</SelectItem>
          </SelectContent>
        </Select>
        <MultiSelectFilter
          options={[
            { value: "Muito Crítico", label: "Muito Crítico" },
            { value: "Crítico", label: "Crítico" },
            { value: "Sem prioridade", label: "Sem prioridade" },
          ]}
          selected={selectedPriorities}
          onChange={(v) => { setSelectedPriorities(v); setPage(1); }}
          placeholder="Todas as prioridades"
          allLabel="Todas as prioridades"
          className="w-[180px]"
        />
        <div className="flex items-center gap-1.5">
          <CalendarClock className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground font-medium leading-none">Data da Agenda</span>
            <div className="flex items-center gap-1">
              <Input type="date" value={agendaDateFrom} onChange={e => { setAgendaDateFrom(e.target.value); setPage(1); }} className="w-[140px] h-8" />
              <span className="text-xs text-muted-foreground">até</span>
              <Input type="date" value={agendaDateTo} onChange={e => { setAgendaDateTo(e.target.value); setPage(1); }} className="w-[140px] h-8" />
            </div>
          </div>
          {(agendaDateFrom || agendaDateTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setAgendaDateFrom(""); setAgendaDateTo(""); setPage(1); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {tab !== "os_tecnico" && (
          <Select value={romaneioFilter} onValueChange={(v) => { setRomaneioFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Romaneio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os romaneios</SelectItem>
              <SelectItem value="sem_romaneio">Sem romaneio</SelectItem>
              <SelectItem value="com_romaneio">Com romaneio</SelectItem>
            </SelectContent>
          </Select>
        )}
        {tab !== "os_tecnico" && (
          <div className="flex items-center gap-1.5">
            <Package className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input type="date" value={romaneioDate} onChange={e => { setRomaneioDate(e.target.value); setPage(1); }} className="w-[150px]" placeholder="Data romaneio" />
            {romaneioDate && (
              <Button variant="ghost" size="sm" onClick={() => { setRomaneioDate(""); setPage(1); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
        {tab === "os_tecnico" && (
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-teal-700 font-medium leading-none">
                Data de Conclusão{(agendaDateFrom || agendaDateTo) && (completedAtFrom || completedAtTo) ? " (OU Agenda)" : ""}
              </span>
              <div className="flex items-center gap-1">
                <Input type="date" value={completedAtFrom} onChange={e => { setCompletedAtFrom(e.target.value); setPage(1); }} className="w-[140px] h-8" />
                <span className="text-xs text-muted-foreground">até</span>
                <Input type="date" value={completedAtTo} onChange={e => { setCompletedAtTo(e.target.value); setPage(1); }} className="w-[140px] h-8" />
              </div>
            </div>
            {(completedAtFrom || completedAtTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setCompletedAtFrom(""); setCompletedAtTo(""); setPage(1); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {tab === "os_tecnico" && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">OS do Técnico:</span>
          <Tabs value={tosSubTab} onValueChange={(v) => { setTosSubTab(v); setPage(1); }}>
            <TabsList>
              <TabsTrigger value="todas" className="text-xs">Todas</TabsTrigger>
              <TabsTrigger value="pendentes" className="text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-white">Pendentes</TabsTrigger>
              <TabsTrigger value="enviadas" className="text-xs data-[state=active]:bg-violet-500 data-[state=active]:text-white">Enviadas para Rota</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      {tab === "pos_rota" && (
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(() => {
            const counts = {
              "Concluída pelo Técnico": orders.filter(o => o.status === "Concluída pelo Técnico").length,
              "Aguardando Faturamento - Pós": orders.filter(o => o.status === "Aguardando Faturamento - Pós").length,
              "OK - Aprov. Financeira": orders.filter(o => o.status === "OK - Aprov. Financeira").length,
              "Aguardando Faturamento Final": orders.filter(o => o.status === "Aguardando Faturamento Final").length,
            };
            const cards = [
              { status: "Concluída pelo Técnico", count: counts["Concluída pelo Técnico"], desc: "Aguardando validação do pós-venda", color: "teal", icon: CheckCircle2 },
              { status: "Aguardando Faturamento - Pós", count: counts["Aguardando Faturamento - Pós"], desc: "Validada pelo pós-venda", color: "violet", icon: CheckCircle2 },
              { status: "OK - Aprov. Financeira", count: counts["OK - Aprov. Financeira"], desc: "Validada — aguardando financeiro", color: "blue", icon: ShieldCheck },
              { status: "Aguardando Faturamento Final", count: counts["Aguardando Faturamento Final"], desc: "Aprovada — aguardando faturamento", color: "indigo", icon: Truck },
            ];
            return cards.map(c => (
              <button
                key={c.status}
                onClick={() => { setSelectedStatuses([c.status]); setPage(1); }}
                className={`text-left rounded-xl border p-4 transition-all hover:shadow-md ${selectedStatuses.includes(c.status) ? "ring-2 ring-primary" : ""} ${
                  c.color === "teal" ? "bg-teal-50 border-teal-200" :
                  c.color === "blue" ? "bg-blue-50 border-blue-200" :
                  "bg-indigo-50 border-indigo-200"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <c.icon className={`h-5 w-5 ${
                    c.color === "teal" ? "text-teal-600" :
                    c.color === "blue" ? "text-blue-600" :
                    "text-indigo-600"
                  }`} />
                  <span className={`text-2xl font-bold ${
                    c.color === "teal" ? "text-teal-700" :
                    c.color === "blue" ? "text-blue-700" :
                    "text-indigo-700"
                  }`}>{c.count}</span>
                </div>
                <p className={`text-sm font-semibold ${
                  c.color === "teal" ? "text-teal-800" :
                  c.color === "blue" ? "text-blue-800" :
                  "text-indigo-800"
                }`}>{c.status}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{c.desc}</p>
              </button>
            ));
          })()}
          {selectedStatuses.length > 0 && (
            <div className="sm:col-span-3 -mt-1">
              <Button variant="ghost" size="sm" onClick={() => { setSelectedStatuses([]); setPage(1); }} className="text-xs">
                <X className="h-3 w-3" /> Limpar filtro de status
              </Button>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhuma OS" description="Ordens de serviço são geradas a partir de vendas confirmadas. Use o botão 'OS' na lista de vendas para gerar." />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                {tab === "os_tecnico" ? (
                  <>
                    <TableHead>OS Mãe</TableHead>
                    <TableHead>OS Técnico</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Data Agenda</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Técnico</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data Conclusão</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </>
                ) : tab === "os_reversa" ? (
                  <>
                    <TableHead>Código Reversa</TableHead>
                    <TableHead>OS Original</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Rastreio</TableHead>
                    <TableHead>Recebida</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>Código</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Entrega</TableHead>
                    <TableHead>Data Agenda</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Técnico</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Romaneio</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map(o => {
                const TypeIcon = typeIcons[o.type] || Package;
                const isMuitoCritico = o.priority_alert === "Muito Crítico";
                const isCritico = o.priority_alert === "Crítico";
                const rowHighlight = isMuitoCritico ? "bg-red-50/60" : isCritico ? "bg-amber-50/40" : "";
                return (
                  <TableRow key={o.id} className={`hover:bg-muted/30 cursor-pointer ${rowHighlight}`} onClick={() => {
                    if (tab === "os_tecnico") {
                      const tosId = tosByParent[o.id];
                      if (tosId) { navigate(`/modo-tecnico/${tosId}`); return; }
                    }
                    if (tab === "os_reversa") {
                      setSelectedReverse(o);
                      return;
                    }
                    setSelected(o);
                  }}>
                    {tab === "os_tecnico" ? (
                      <>
                        <TableCell className="font-mono text-xs font-semibold">{o.code}</TableCell>
                        <TableCell className="font-mono text-xs text-cyan-700 font-semibold">{o.technician_os_code || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{o.sale_order_number || "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1 text-xs">
                              <TypeIcon className="h-3 w-3" /> {o.type || "Manutenção"}
                            </div>
                            {o.maintenance_subtype && (
                              <Badge variant="outline" className={`text-[10px] w-fit ${
                                o.maintenance_subtype === "Análise" ? "border-amber-300 text-amber-700 bg-amber-50" :
                                o.maintenance_subtype === "Garantia" ? "border-emerald-300 text-emerald-700 bg-emerald-50" :
                                "border-blue-300 text-blue-700 bg-blue-50"
                              }`}>
                                {o.maintenance_subtype}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium text-sm">{o.client_name || "—"}</TableCell>
                        <TableCell>
                          {o.appointment_date ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-700">
                              <CalendarClock className="h-3 w-3" />
                              {new Date(o.appointment_date + "T00:00:00").toLocaleDateString("pt-BR")}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell>
                          {o.priority_alert ? (
                            <Badge variant="outline" className={`text-xs gap-1 ${isMuitoCritico ? "border-red-400 text-red-700 bg-red-50" : "border-amber-400 text-amber-700 bg-amber-50"}`}>
                              <AlertTriangle className="h-3 w-3" /> {o.priority_alert}
                            </Badge>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-sm">{o.technician || tosDataByParent[o.id]?.technician_name || "—"}</TableCell>
                        <TableCell>
                          {(() => {
                            const tosStatus = tosDataByParent[o.id]?.status;
                            return tosStatus ? (
                              <Badge variant="secondary" className={tosStatusColors[tosStatus] || "bg-muted text-muted-foreground"}>{tosStatus}</Badge>
                            ) : <span className="text-muted-foreground text-xs">—</span>;
                          })()}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const compAt = tosDataByParent[o.id]?.completed_at;
                            return compAt ? (
                              <span className="text-xs text-teal-700 font-medium">{new Date(compAt).toLocaleDateString("pt-BR")}</span>
                            ) : <span className="text-muted-foreground text-xs">—</span>;
                          })()}
                        </TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          {canDeleteOS && <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(o.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                        </TableCell>
                      </>
                    ) : tab === "os_reversa" ? (
                      <>
                        <TableCell className="font-mono text-xs font-semibold text-purple-700">{o.code}</TableCell>
                        <TableCell className="font-mono text-xs">{o.reverse_parent_os_code || "—"}</TableCell>
                        <TableCell className="font-medium text-sm">{o.client_name || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{o.sale_order_number || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">{o.reverse_reason || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {(o.reverse_shipments || []).map((s) => s.tracking_code).filter(Boolean).join(", ") || "—"}
                        </TableCell>
                        <TableCell>
                          {o.reverse_received ? (
                            <Badge className="bg-emerald-100 text-emerald-700 text-xs">Sim</Badge>
                          ) : <span className="text-muted-foreground text-xs">Não</span>}
                        </TableCell>
                        <TableCell><Badge variant="secondary" className={statusColors[o.status] || "bg-muted text-muted-foreground"}>{o.status}</Badge></TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          {canDeleteOS && <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(o.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="font-mono text-xs font-semibold">
                          <div className="flex items-center gap-1.5">
                            <span>{o.code}</span>
                            {o.rescheduled && (
                              <Badge variant="outline" className="text-[10px] gap-0.5 border-amber-400 text-amber-700 bg-amber-50">
                                <CalendarClock className="h-2.5 w-2.5" /> Reagendada
                              </Badge>
                            )}
                            {o.finance_rejected && (
                              <Badge variant="outline" className="text-[10px] gap-0.5 border-red-400 text-red-700 bg-red-50" title={o.finance_rejected_reason || ""}>
                                <XCircle className="h-2.5 w-2.5" /> Reprovado pelo Financeiro
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1 text-xs">
                              <TypeIcon className="h-3 w-3" /> {o.type || "Manutenção"}
                            </div>
                            {o.maintenance_subtype && (
                              <Badge variant="outline" className={`text-[10px] w-fit ${
                                o.maintenance_subtype === "Análise" ? "border-amber-300 text-amber-700 bg-amber-50" :
                                o.maintenance_subtype === "Garantia" ? "border-emerald-300 text-emerald-700 bg-emerald-50" :
                                "border-blue-300 text-blue-700 bg-blue-50"
                              }`}>
                                {o.maintenance_subtype}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <div className="flex flex-col">
                            <span>{o.sale_order_number || "—"}</span>
                            {o.order_date && (
                              <span className="text-[10px] text-muted-foreground font-sans">
                                {new Date(o.order_date + (o.order_date.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR")}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{o.client_name || "—"}</TableCell>
                        <TableCell>
                          {o.delivery_date ? (
                            <span className={`inline-flex items-center gap-1 text-xs ${isMuitoCritico ? "text-red-700 font-semibold" : isCritico ? "text-amber-700 font-medium" : "text-muted-foreground"}`}>
                              <CalendarClock className="h-3 w-3" />
                              {new Date(o.delivery_date + (o.delivery_date.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR")}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const isDeliveryType = o.type === "Entrega" || o.type === "Entrega + Instalação";
                            if (!isDeliveryType && (tab === "todas" || tab === "concluidas")) {
                              return <X className="h-3.5 w-3.5 text-muted-foreground/40" />;
                            }
                            if (o.appointment_date) {
                              return (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-700">
                                  <CalendarClock className="h-3 w-3" />
                                  {new Date(o.appointment_date + "T00:00:00").toLocaleDateString("pt-BR")}
                                </span>
                              );
                            }
                            return <span className="text-muted-foreground text-xs">—</span>;
                          })()}
                        </TableCell>
                        <TableCell>
                          {o.priority_alert ? (
                            <Badge variant="outline" className={`text-xs gap-1 ${isMuitoCritico ? "border-red-400 text-red-700 bg-red-50" : "border-amber-400 text-amber-700 bg-amber-50"}`}>
                              <AlertTriangle className="h-3 w-3" /> {o.priority_alert}
                            </Badge>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell>{o.technician || "—"}</TableCell>
                        <TableCell><Badge variant="secondary" className={statusColors[o.status] || "bg-muted text-muted-foreground"}>{o.status}</Badge></TableCell>
                        <TableCell>
                          {o.romaneio_date ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-700">
                              <Truck className="h-3 w-3" />
                              {new Date(o.romaneio_date + "T00:00:00").toLocaleDateString("pt-BR")}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell>
                          {o.has_pending_payment ? (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 text-xs">R$ {(o.pending_payment_amount || 0).toFixed(2)}</Badge>
                          ) : o.received_amount > 0 ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 text-xs">R$ {(o.received_amount || 0).toFixed(2)}</Badge>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1 justify-end">
                            {o.maintenance_subtype === "Análise" && o.analysis_status === "Em Análise" && (
                              <Button variant="outline" size="sm" onClick={() => setConvertOrder(o)} className="gap-1 text-amber-700 border-amber-300 hover:bg-amber-50">
                                <ShieldCheck className="h-3 w-3" /> Converter
                              </Button>
                            )}
                            {canManageOS && o.finance_rejected && o.status === "Aguardando Faturamento - Pós" && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={resendFinanceMutation.isPending}
                                onClick={() => resendFinanceMutation.mutate(o.id)}
                                className="gap-1 border-blue-300 text-blue-700 hover:bg-blue-50"
                                title={o.finance_rejected_reason || "Corrigido — reenviar ao financeiro"}
                              >
                                <ShieldCheck className="h-3 w-3" /> Reenviar ao Financeiro
                              </Button>
                            )}
                            {canDeleteOS && <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(o.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                          </div>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
              <span className="text-xs text-muted-foreground">
                Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length} ordens
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</Button>
                <span className="text-xs text-muted-foreground">Página {currentPage} de {totalPages}</span>
                <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Próxima</Button>
              </div>
            </div>
          )}
        </div>
      )}

      <ErrorBoundary key={selected?.id || "no-selection"}>
        <ServiceOrderDetailDialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)} order={selected} />
      </ErrorBoundary>
      <ReverseOSDetailDialog open={!!selectedReverse} onOpenChange={(v) => !v && setSelectedReverse(null)} order={selectedReverse} />
      <MaintenanceOSCreateDialog open={showCreateMaint} onOpenChange={setShowCreateMaint} />
      <MaintenanceOSConvertDialog open={!!convertOrder} onOpenChange={(v) => !v && setConvertOrder(null)} order={convertOrder} />
    </div>
  );
}