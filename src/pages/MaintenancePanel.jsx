import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Wrench, Search, Link2, Droplets, Phone, CalendarClock, ShoppingCart, Upload, Wand2, RefreshCw, UserRound, Download } from "lucide-react";
import { exportClientPhones } from "@/lib/excelExport";
import RegisterMaintenanceDialog from "@/components/maintenance/RegisterMaintenanceDialog";
import LinkPartDialog from "@/components/maintenance/LinkPartDialog";
import CrmContactDialog from "@/components/maintenance/CrmContactDialog";
import LegacyImportDialog from "@/components/maintenance/LegacyImportDialog";
import MatchPurifiersDialog from "@/components/maintenance/MatchPurifiersDialog";
import GenerateAgendamentoLinkDialog from "@/components/maintenance/GenerateAgendamentoLinkDialog";
import AgendamentosTab from "@/components/maintenance/AgendamentosTab";
import Campanhas3CTab from "@/components/maintenance/Campanhas3CTab";
import TablePagination from "@/components/maintenance/TablePagination";
import MaintenanceFilters from "@/components/maintenance/MaintenanceFilters";
import MaintenanceSellerFilter from "@/components/maintenance/MaintenanceSellerFilter";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";

export default function MaintenancePanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("equipamentos");
  const [registerEquip, setRegisterEquip] = useState(null);
  const [linkPart, setLinkPart] = useState(null);
  const [crmEquip, setCrmEquip] = useState(null);
  const [crmCampaignContext, setCrmCampaignContext] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showMatchPurifiers, setShowMatchPurifiers] = useState(false);
  const [agendamentoLinkEquip, setAgendamentoLinkEquip] = useState(null);
  const [vencimentoFilter, setVencimentoFilter] = useState("all");
  const [selectedBases, setSelectedBases] = useState(() => {
    try {
      const saved = localStorage.getItem("maintenance_selectedBases");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [filterStates, setFilterStates] = useState([]);
  const [filterCities, setFilterCities] = useState([]);
  const [filterNeighborhoods, setFilterNeighborhoods] = useState([]);
  const [filterTrocaStart, setFilterTrocaStart] = useState("");
  const [filterTrocaEnd, setFilterTrocaEnd] = useState("");
  const [filterCompraStart, setFilterCompraStart] = useState("");
  const [filterCompraEnd, setFilterCompraEnd] = useState("");
  const [filterFollowupStart, setFilterFollowupStart] = useState("");
  const [filterFollowupEnd, setFilterFollowupEnd] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterClientStatus, setFilterClientStatus] = useState("");
  const [selSellers, setSelSellers] = useState([]);
  const [assignmentFilter, setAssignmentFilter] = useState("all");

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ["maintenanceEquipment"],
    queryFn: async () => {
      const map = new Map();
      const b1 = await base44.entities.Equipment.list("-created_date", 5000);
      for (const r of b1) map.set(r.id, r);
      const b2 = await base44.entities.Equipment.list("created_date", 5000);
      for (const r of b2) map.set(r.id, r);
      return [...map.values()];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clientsForMaintenance"],
    queryFn: async () => {
      const map = new Map();
      const b1 = await base44.entities.Client.list("-created_date", 5000);
      for (const r of b1) map.set(r.id, r);
      const b2 = await base44.entities.Client.list("created_date", 5000);
      for (const r of b2) map.set(r.id, r);
      return [...map.values()];
    },
  });

  const { user } = useAuth();
  const allRoles = [user?.role, ...(user?.additional_roles || [])].filter(Boolean);
  const isManagement = allRoles.some((r) => ["admin", "supervisor", "logistica"].includes(r));
  const isVendedor = !isManagement && allRoles.includes("vendedor");
  const { data: sellers = [] } = useQuery({
    queryKey: ["maintenanceSellers"],
    queryFn: () => base44.entities.Seller.list("-created_date", 500),
  });
  const mySeller = useMemo(() => {
    if (!isVendedor) return null;
    return (
      sellers.find((s) => s.id === user?.seller_id) ||
      sellers.find((s) => (s.name || "").toLowerCase() === (user?.full_name || "").toLowerCase()) ||
      null
    );
  }, [sellers, user, isVendedor]);
  const restrictToSellerId = isVendedor ? mySeller?.id || "__NONE__" : null;

  const clientMap = useMemo(() => {
    const m = new Map();
    for (const c of clients) {
      m.set(c.id, { city: c.city, state: c.state, neighborhood: c.neighborhood, base_type: c.base_type, status: c.status, seller_id: c.seller_id, seller_name: c.seller_name });
    }
    return m;
  }, [clients]);

  const clientInfo = (id) => clientMap.get(id);

  const clientFullMap = useMemo(() => {
    const m = new Map();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const equipmentByClient = useMemo(() => {
    const m = new Map();
    for (const eq of equipment) {
      if (!eq.client_id) continue;
      if (!m.has(eq.client_id)) m.set(eq.client_id, []);
      m.get(eq.client_id).push(eq);
    }
    return m;
  }, [equipment]);

  const handleExportPhones = () => {
    const seen = new Set();
    const list = [];
    for (const e of crmList) {
      if (!e.client_id || seen.has(e.client_id)) continue;
      seen.add(e.client_id);
      const c = clientFullMap.get(e.client_id);
      if (c) list.push(c);
    }
    if (list.length === 0) {
      toast({ title: "Nenhum cliente com telefone neste filtro", variant: "destructive" });
      return;
    }
    exportClientPhones(list, equipmentByClient);
    toast({ title: `Relatório gerado: ${list.length} cliente(s)` });
  };

  const baseBadge = (baseType) => {
    if (!baseType) return "—";
    const map = { "Lsoft": "outline", "Ótimo": "secondary", "Novo": "default" };
    return <Badge variant={map[baseType] || "outline"} className="text-xs">{baseType}</Badge>;
  };

  const stateOptions = useMemo(() => {
    const set = new Set();
    for (const c of clientMap.values()) if (c.state) set.add(c.state);
    return [...set].sort();
  }, [clientMap]);

  const cityOptions = useMemo(() => {
    const set = new Set();
    for (const c of clientMap.values()) {
      if (filterStates.length === 0 || filterStates.includes(c.state)) {
        if (c.city) set.add(c.city);
      }
    }
    return [...set].sort();
  }, [clientMap, filterStates]);

  const neighborhoodOptions = useMemo(() => {
    const set = new Set();
    for (const c of clientMap.values()) {
      if (filterStates.length === 0 || filterStates.includes(c.state)) {
        if (filterCities.length === 0 || filterCities.includes(c.city)) {
          if (c.neighborhood) set.add(c.neighborhood);
        }
      }
    }
    return [...set].sort();
  }, [clientMap, filterStates, filterCities]);

  const clientStatusOptions = useMemo(() => {
    const set = new Set();
    for (const c of clientMap.values()) if (c.status) set.add(c.status);
    return [...set].sort();
  }, [clientMap]);

  const clearFilters = () => {
    setFilterStates([]); setFilterCities([]); setFilterNeighborhoods([]);
    setFilterTrocaStart(""); setFilterTrocaEnd("");
    setFilterCompraStart(""); setFilterCompraEnd("");
    setFilterFollowupStart(""); setFilterFollowupEnd("");
    setFilterStatus("");
    setFilterClientStatus("");
  };

  const toggleBase = (b) => {
    setSelectedBases(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getStatus = (equip) => {
    if (!equip.next_maintenance_date) return { label: "Sem data", variant: "secondary", days: null };
    const next = new Date(equip.next_maintenance_date + "T00:00:00");
    const diffDays = Math.ceil((next - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: "Atrasada", variant: "destructive", days: diffDays };
    if (diffDays <= 30) return { label: "Próxima", variant: "default", days: diffDays };
    return { label: "Em dia", variant: "secondary", days: diffDays };
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return equipment.filter(e => {
      if (q) {
        const matches = (e.patrimony_code || e.code || "").toLowerCase().includes(q) ||
          (e.client_name || "").toLowerCase().includes(q) ||
          (e.product_name || "").toLowerCase().includes(q) ||
          (e.brand || "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (selectedBases.length > 0) {
        const c = clientInfo(e.client_id);
        if (!c || !selectedBases.includes(c.base_type)) return false;
      }
      const sellerId = clientInfo(e.client_id)?.seller_id;
      if (restrictToSellerId) {
        if (sellerId !== restrictToSellerId) return false;
      } else {
        if (selSellers.length > 0 && !selSellers.includes(sellerId)) return false;
        if (assignmentFilter === "assigned" && !sellerId) return false;
        if (assignmentFilter === "unassigned" && sellerId) return false;
      }
      return true;
    });
  }, [equipment, search, clientMap, selectedBases, restrictToSellerId, selSellers, assignmentFilter]);

  const filteredEquip = useMemo(() => {
    return filtered.filter(e => {
      const c = clientInfo(e.client_id);
      if (filterStates.length > 0 && (!c || !filterStates.includes(c.state))) return false;
      if (filterCities.length > 0 && (!c || !filterCities.includes(c.city))) return false;
      if (filterNeighborhoods.length > 0 && (!c || !filterNeighborhoods.includes(c.neighborhood))) return false;
      if (filterClientStatus && (!c || c.status !== filterClientStatus)) return false;
      if (filterTrocaStart || filterTrocaEnd) {
        if (!e.next_maintenance_date) return false;
        if (filterTrocaStart && e.next_maintenance_date < filterTrocaStart) return false;
        if (filterTrocaEnd && e.next_maintenance_date > filterTrocaEnd) return false;
      }
      if (filterCompraStart || filterCompraEnd) {
        if (!e.sale_date) return false;
        if (filterCompraStart && e.sale_date < filterCompraStart) return false;
        if (filterCompraEnd && e.sale_date > filterCompraEnd) return false;
      }
      if (filterFollowupStart || filterFollowupEnd) {
        if (!e.crm_next_contact_date) return false;
        if (filterFollowupStart && e.crm_next_contact_date < filterFollowupStart) return false;
        if (filterFollowupEnd && e.crm_next_contact_date > filterFollowupEnd) return false;
      }
      if (filterStatus && getStatus(e).label !== filterStatus) return false;
      return true;
    });
  }, [filtered, clientMap, filterStates, filterCities, filterNeighborhoods, filterClientStatus, filterTrocaStart, filterTrocaEnd, filterCompraStart, filterCompraEnd, filterFollowupStart, filterFollowupEnd, filterStatus]);

  const equipamentos = filteredEquip.filter(e => (e.record_type || "equipamento") === "equipamento" && e.status !== "Inativo" && !e.pending_link);
  const pecas = filtered.filter(e => e.pending_link && (e.record_type === "peca" || e.record_type === "equipamento"));

  const overdueCount = equipamentos.filter(e => getStatus(e).variant === "destructive" && e.crm_status !== "Agendado").length;
  const upcomingCount = equipamentos.filter(e => getStatus(e).variant === "default" && e.crm_status !== "Agendado").length;
  const agendadoCount = equipamentos.filter(e => e.crm_status === "Agendado").length;

  // ── CRM list: equipment sorted by vencimento (most overdue first) ──
  const crmList = useMemo(() => {
    let list = equipamentos.filter(e => e.status === "Ativo");
    if (vencimentoFilter === "overdue") {
      list = list.filter(e => getStatus(e).variant === "destructive" && e.crm_status !== "Agendado");
    } else if (vencimentoFilter === "upcoming") {
      list = list.filter(e => getStatus(e).variant === "default" && e.crm_status !== "Agendado");
    } else if (vencimentoFilter === "agendado") {
      list = list.filter(e => e.crm_status === "Agendado");
    } else if (vencimentoFilter === "followup") {
      list = list.filter(e => e.crm_next_contact_date);
    }
    return [...list].sort((a, b) => {
      const da = a.next_maintenance_date ? new Date(a.next_maintenance_date + "T00:00:00").getTime() : Infinity;
      const db = b.next_maintenance_date ? new Date(b.next_maintenance_date + "T00:00:00").getTime() : Infinity;
      return da - db;
    });
  }, [equipamentos, vencimentoFilter]);

  const followupList = useMemo(() => {
    return [...equipamentos]
      .filter(e => e.crm_status === "Lembrete Peça Extra")
      .sort((a, b) => {
        const da = a.crm_next_contact_date ? new Date(a.crm_next_contact_date + "T00:00:00").getTime() : Infinity;
        const db = b.crm_next_contact_date ? new Date(b.crm_next_contact_date + "T00:00:00").getTime() : Infinity;
        return da - db;
      });
  }, [equipamentos]);

  const PAGE_SIZE = 50;
  const [equipPage, setEquipPage] = useState(1);
  const [crmPage, setCrmPage] = useState(1);
  const [pecasPage, setPecasPage] = useState(1);
  const [followupPage, setFollowupPage] = useState(1);

  useEffect(() => { setEquipPage(1); setCrmPage(1); setPecasPage(1); setFollowupPage(1); }, [search, vencimentoFilter, selectedBases, filterStates, filterCities, filterNeighborhoods, filterClientStatus, filterTrocaStart, filterTrocaEnd, filterCompraStart, filterCompraEnd, filterFollowupStart, filterFollowupEnd, filterStatus, selSellers, assignmentFilter]);

  useEffect(() => { try { localStorage.setItem("maintenance_selectedBases", JSON.stringify(selectedBases)); } catch {} }, [selectedBases]);

  const equipTotalPages = Math.max(1, Math.ceil(equipamentos.length / PAGE_SIZE));
  const crmTotalPages = Math.max(1, Math.ceil(crmList.length / PAGE_SIZE));
  const pecasTotalPages = Math.max(1, Math.ceil(pecas.length / PAGE_SIZE));
  const followupTotalPages = Math.max(1, Math.ceil(followupList.length / PAGE_SIZE));

  const equipamentosPaged = equipamentos.slice((equipPage - 1) * PAGE_SIZE, equipPage * PAGE_SIZE);
  const crmListPaged = crmList.slice((crmPage - 1) * PAGE_SIZE, crmPage * PAGE_SIZE);
  const pecasPaged = pecas.slice((pecasPage - 1) * PAGE_SIZE, pecasPage * PAGE_SIZE);
  const followupPaged = followupList.slice((followupPage - 1) * PAGE_SIZE, followupPage * PAGE_SIZE);

  const crmStatusBadge = (s) => {
    const map = {
      "Aguardando Contato": { variant: "secondary", label: "Aguardando" },
      "Contato Realizado": { variant: "default", label: "Contatado" },
      "Agendado": { variant: "default", label: "Agendado" },
      "Sem Resposta": { variant: "destructive", label: "Sem Resposta" },
      "Não Interessado": { variant: "outline", label: "Não Interessado" },
      "Lembrete Peça Extra": { variant: "default", label: "Peça Extra" },
    };
    return map[s] || map["Aguardando Contato"];
  };

  const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

  return (
    <div>
      <PageHeader title="Painel de Manutenções" description="Gestão de troca de elementos filtrantes dos purificadores">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="gap-1">
            <Upload className="h-4 w-4" /> Importar Base
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowMatchPurifiers(true)} className="gap-1">
            <Wand2 className="h-4 w-4" /> De-Para Purificadores
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["maintenanceEquipment"] });
            queryClient.invalidateQueries({ queryKey: ["clientsForMaintenance"] });
          }} className="gap-1">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
          {overdueCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> {overdueCount} atrasada{overdueCount > 1 ? "s" : ""}
            </Badge>
          )}
          {upcomingCount > 0 && (
            <Badge variant="default" className="gap-1">
              <Droplets className="h-3 w-3" /> {upcomingCount} próxima{upcomingCount > 1 ? "s" : ""}
            </Badge>
          )}
          {agendadoCount > 0 && (
            <Badge variant="secondary" className="gap-1">
              <CalendarClock className="h-3 w-3" /> {agendadoCount} com agendamento
            </Badge>
          )}
        </div>
      </PageHeader>

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-muted-foreground">Base de Trabalho:</span>
        <div className="flex gap-1">
          <Button size="sm" variant={selectedBases.length === 0 ? "default" : "outline"} onClick={() => setSelectedBases([])}>Todas</Button>
          <Button size="sm" variant={selectedBases.includes("Ótimo") ? "default" : "outline"} onClick={() => toggleBase("Ótimo")}>Ótimo</Button>
          <Button size="sm" variant={selectedBases.includes("Lsoft") ? "default" : "outline"} onClick={() => toggleBase("Lsoft")}>LSoft</Button>
          <Button size="sm" variant={selectedBases.includes("Novo") ? "default" : "outline"} onClick={() => toggleBase("Novo")}>Novo</Button>
        </div>
      </div>

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por patrimônio, cliente ou equipamento..."
          className="pl-9"
        />
      </div>

      {restrictToSellerId ? (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <UserRound className="h-4 w-4 text-primary" />
          <span className="font-medium">Sua carteira:</span>
          <Badge variant="default">{mySeller?.name || "—"}</Badge>
          <span className="text-muted-foreground">· apenas clientes atribuídos a você</span>
        </div>
      ) : (
        <div className="mb-4">
          <MaintenanceSellerFilter
            sellers={sellers}
            selectedSellerIds={selSellers}
            onChange={setSelSellers}
            assignmentFilter={assignmentFilter}
            setAssignmentFilter={setAssignmentFilter}
          />
        </div>
      )}

      {tab !== "pecas" && (
        <MaintenanceFilters
          filterStates={filterStates} setFilterStates={setFilterStates}
          filterCities={filterCities} setFilterCities={setFilterCities}
          filterNeighborhoods={filterNeighborhoods} setFilterNeighborhoods={setFilterNeighborhoods}
          filterTrocaStart={filterTrocaStart} setFilterTrocaStart={setFilterTrocaStart}
          filterTrocaEnd={filterTrocaEnd} setFilterTrocaEnd={setFilterTrocaEnd}
          filterCompraStart={filterCompraStart} setFilterCompraStart={setFilterCompraStart}
          filterCompraEnd={filterCompraEnd} setFilterCompraEnd={setFilterCompraEnd}
          filterFollowupStart={filterFollowupStart} setFilterFollowupStart={setFilterFollowupStart}
          filterFollowupEnd={filterFollowupEnd} setFilterFollowupEnd={setFilterFollowupEnd}
          filterStatus={filterStatus} setFilterStatus={setFilterStatus}
          filterClientStatus={filterClientStatus} setFilterClientStatus={setFilterClientStatus}
          stateOptions={stateOptions} cityOptions={cityOptions}
          neighborhoodOptions={neighborhoodOptions}
          clientStatusOptions={clientStatusOptions}
          onClear={clearFilters}
        />
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="equipamentos">Equipamentos ({equipamentos.length})</TabsTrigger>
          <TabsTrigger value="crm">CRM / Agendamento ({crmList.length})</TabsTrigger>
          <TabsTrigger value="followup">Follow-up Peça Extra ({followupList.length})</TabsTrigger>
          <TabsTrigger value="pecas">Peças Pendentes ({pecas.length})</TabsTrigger>
          <TabsTrigger value="agendamentos">Agendamentos</TabsTrigger>
          <TabsTrigger value="campanhas3c">Campanhas 3C+</TabsTrigger>
        </TabsList>

        <TabsContent value="equipamentos">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                </div>
              ) : equipamentos.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  Nenhum equipamento cadastrado. Equipamentos são gerados automaticamente ao concluir vendas de produtos que "Geram Patrimônio".
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patrimônio</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Localização</TableHead>
                      <TableHead>Base</TableHead>
                      <TableHead>Vendedora</TableHead>
                      <TableHead>Equipamento</TableHead>
                      <TableHead>Compra</TableHead>
                      <TableHead>Última Troca</TableHead>
                      <TableHead>Última Cápsula</TableHead>
                      <TableHead>Próxima Troca</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {equipamentosPaged.map(e => {
                      const status = getStatus(e);
                      return (
                        <TableRow key={e.id} className={status.variant === "destructive" ? "bg-destructive/5" : ""}>
                          <TableCell className="font-mono font-medium text-sm">
                            <div className="flex items-center gap-1">
                              {e.patrimony_code || e.code}
                              {e.imported && <Badge variant="outline" className="text-[10px] gap-0.5 px-1 py-0 h-4 leading-none"><Upload className="h-2.5 w-2.5" />IMP</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{e.client_name}</TableCell>
                          <TableCell className="text-sm">
                            {(() => { const c = clientInfo(e.client_id); return c ? <div><div>{c.city}/{c.state}</div><div className="text-xs text-muted-foreground">{c.neighborhood}</div></div> : "—"; })()}
                          </TableCell>
                          <TableCell>{baseBadge(clientInfo(e.client_id)?.base_type)}</TableCell>
                          <TableCell className="text-sm">{clientInfo(e.client_id)?.seller_name || <span className="text-muted-foreground italic">Sem atribuição</span>}</TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">{e.product_name}</div>
                            <div className="text-xs text-muted-foreground">{e.brand} {e.model && e.model !== e.product_name ? `· ${e.model}` : ""}</div>
                          </TableCell>
                          <TableCell className="text-sm">{fmtDate(e.sale_date)}</TableCell>
                          <TableCell className="text-sm">{fmtDate(e.last_maintenance_date)}</TableCell>
                          <TableCell className="text-sm">
                            {e.last_maintenance_part_name ? (
                              <span className="text-xs">{e.last_maintenance_part_name}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">Sem troca</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm font-medium">{fmtDate(e.next_maintenance_date)}</TableCell>
                          <TableCell>
                            <Badge variant={status.variant} className="gap-1">
                              {status.variant === "destructive" && <AlertTriangle className="h-3 w-3" />}
                              {status.label}
                              {status.days !== null && status.days < 0 && ` (${Math.abs(status.days)}d)`}
                              {status.days !== null && status.days >= 0 && status.days <= 30 && ` (${status.days}d)`}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">

                              <Button size="sm" variant="secondary" onClick={() => navigate(`/vendas/nova?equipment_id=${e.id}`)} className="gap-1">
                                <ShoppingCart className="h-3 w-3" /> Trocar Refil
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              <TablePagination page={equipPage} totalPages={equipTotalPages} totalItems={equipamentos.length} pageSize={PAGE_SIZE} onPageChange={setEquipPage} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="crm">
          <div className="mb-4 flex items-center gap-3">
            <Label className="text-xs whitespace-nowrap">Filtrar por vencimento:</Label>
            <Select value={vencimentoFilter} onValueChange={setVencimentoFilter}>
              <SelectTrigger className="w-48 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="overdue">Atrasadas</SelectItem>
                <SelectItem value="upcoming">Próximas (30d)</SelectItem>
                <SelectItem value="agendado">Com Agendamento</SelectItem>
                <SelectItem value="followup">Com follow-up agendado</SelectItem>
              </SelectContent>
            </Select>
            {overdueCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> {overdueCount} atrasada{overdueCount > 1 ? "s" : ""}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPhones}
              className="gap-1 ml-auto"
              disabled={crmList.length === 0}
              title="Exportar telefones dos clientes deste filtro (Excel)"
            >
              <Download className="h-4 w-4" /> Exportar Telefones
            </Button>
            <Badge variant="secondary" className="gap-1">
              <UserRound className="h-3 w-3" />
              {restrictToSellerId
                ? `${mySeller?.name || "Sua carteira"} · ${crmList.length} cliente(s)`
                : selSellers.length === 1
                  ? `${sellers.find((s) => s.id === selSellers[0])?.name || "Vendedora"} · ${crmList.length} cliente(s)`
                  : selSellers.length > 1
                    ? `${selSellers.length} vendedoras · ${crmList.length} cliente(s)`
                    : `Todas as vendedoras · ${crmList.length} cliente(s)`}
            </Badge>
          </div>
          <Card>
            <CardContent className="p-0">
              {crmList.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  Nenhum equipamento neste filtro.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patrimônio</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Localização</TableHead>
                      <TableHead>Base</TableHead>
                      <TableHead>Vendedora</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Última Cápsula</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>CRM</TableHead>
                      <TableHead>Último Contato</TableHead>
                      <TableHead>Retornar em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {crmListPaged.map(e => {
                      const status = getStatus(e);
                      const crm = crmStatusBadge(e.crm_status);
                      return (
                        <TableRow key={e.id} className={status.variant === "destructive" ? "bg-destructive/5" : ""}>
                          <TableCell className="font-mono font-medium text-sm">
                            <div className="flex items-center gap-1">
                              {e.patrimony_code || e.code}
                              {e.imported && <Badge variant="outline" className="text-[10px] gap-0.5 px-1 py-0 h-4 leading-none"><Upload className="h-2.5 w-2.5" />IMP</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="font-medium">{e.client_name}</div>
                            <div className="text-xs text-muted-foreground">{e.product_name}</div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {(() => { const c = clientInfo(e.client_id); return c ? <div><div>{c.city}/{c.state}</div><div className="text-xs text-muted-foreground">{c.neighborhood}</div></div> : "—"; })()}
                          </TableCell>
                          <TableCell>{baseBadge(clientInfo(e.client_id)?.base_type)}</TableCell>
                          <TableCell className="text-sm">{clientInfo(e.client_id)?.seller_name || <span className="text-muted-foreground italic">Sem atribuição</span>}</TableCell>
                          <TableCell className="text-sm">
                            <div className="font-medium">{e.product_name || "—"}</div>
                            {(e.brand || e.model) && <div className="text-xs text-muted-foreground">{[e.brand, e.model].filter(Boolean).join(" · ")}</div>}
                          </TableCell>
                          <TableCell className="text-sm">
                            {e.last_maintenance_part_name ? (
                              <span className="text-xs">{e.last_maintenance_part_name}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">Sem troca</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            <div className="flex items-center gap-1">
                              <CalendarClock className="h-3 w-3 text-muted-foreground" />
                              {fmtDate(e.next_maintenance_date)}
                            </div>
                            {status.days !== null && status.days < 0 && (
                              <span className="text-xs text-destructive">{Math.abs(status.days)}d em atraso</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={status.variant} className="gap-1">
                              {status.variant === "destructive" && <AlertTriangle className="h-3 w-3" />}
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={crm.variant}>{crm.label}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{fmtDate(e.crm_last_contact_date)}</TableCell>
                          <TableCell className="text-sm">{fmtDate(e.crm_next_contact_date)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">

                              <Button size="sm" variant="outline" onClick={() => setAgendamentoLinkEquip(e)} className="gap-1" title="Gerar link de agendamento">
                                <Link2 className="h-3 w-3" /> Link
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setCrmEquip(e)} className="gap-1">
                                <Phone className="h-3 w-3" /> Contato
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => navigate(`/vendas/nova?equipment_id=${e.id}`)} className="gap-1">
                                <ShoppingCart className="h-3 w-3" /> Trocar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              <TablePagination page={crmPage} totalPages={crmTotalPages} totalItems={crmList.length} pageSize={PAGE_SIZE} onPageChange={setCrmPage} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="followup">
          <Card>
            <CardContent className="p-0">
              {followupList.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  Nenhum equipamento com refil extra pendente. Clientes que compraram purificador + cápsula extra aparecem aqui para contato no vencimento combinado.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patrimônio</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Localização</TableHead>
                      <TableHead>Equipamento</TableHead>
                      <TableHead>Cápsula Extra</TableHead>
                      <TableHead>Compra</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Retornar em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {followupPaged.map(e => {
                      const status = getStatus(e);
                      return (
                        <TableRow key={e.id} className={status.variant === "destructive" ? "bg-destructive/5" : ""}>
                          <TableCell className="font-mono font-medium text-sm">
                            <div className="flex items-center gap-1">
                              {e.patrimony_code || e.code}
                              {e.imported && <Badge variant="outline" className="text-[10px] gap-0.5 px-1 py-0 h-4 leading-none"><Upload className="h-2.5 w-2.5" />IMP</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="font-medium">{e.client_name}</div>
                            <div className="text-xs text-muted-foreground">{e.product_name}</div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {(() => { const c = clientInfo(e.client_id); return c ? <div><div>{c.city}/{c.state}</div><div className="text-xs text-muted-foreground">{c.neighborhood}</div></div> : "—"; })()}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="font-medium">{e.product_name || "—"}</div>
                            {(e.brand || e.model) && <div className="text-xs text-muted-foreground">{[e.brand, e.model].filter(Boolean).join(" · ")}</div>}
                          </TableCell>
                          <TableCell className="text-sm">
                            {e.last_maintenance_part_name ? (
                              <span className="text-xs">{e.last_maintenance_part_name}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{fmtDate(e.sale_date)}</TableCell>
                          <TableCell className="text-sm font-medium">
                            <div className="flex items-center gap-1">
                              <CalendarClock className="h-3 w-3 text-muted-foreground" />
                              {fmtDate(e.next_maintenance_date)}
                            </div>
                            {status.days !== null && status.days < 0 && (
                              <span className="text-xs text-destructive">{Math.abs(status.days)}d em atraso</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            <div className="flex items-center gap-1">
                              <CalendarClock className="h-3 w-3 text-muted-foreground" />
                              {fmtDate(e.crm_next_contact_date)}
                            </div>
                            {(() => {
                              if (!e.crm_next_contact_date) return null;
                              const fu = new Date(e.crm_next_contact_date + "T00:00:00");
                              const diff = Math.ceil((fu - today) / (1000 * 60 * 60 * 24));
                              if (diff < 0) return <span className="text-xs text-destructive">{Math.abs(diff)}d em atraso</span>;
                              if (diff <= 30) return <span className="text-xs text-amber-600">em {diff}d</span>;
                              return null;
                            })()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">

                              <Button size="sm" variant="outline" onClick={() => setAgendamentoLinkEquip(e)} className="gap-1" title="Gerar link de agendamento">
                                <Link2 className="h-3 w-3" /> Link
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setCrmEquip(e)} className="gap-1">
                                <Phone className="h-3 w-3" /> Contato
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => navigate(`/vendas/nova?equipment_id=${e.id}`)} className="gap-1">
                                <ShoppingCart className="h-3 w-3" /> Trocar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              <TablePagination page={followupPage} totalPages={followupTotalPages} totalItems={followupList.length} pageSize={PAGE_SIZE} onPageChange={setFollowupPage} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pecas">
          <Card>
            <CardContent className="p-0">
              {pecas.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  Nenhuma peça pendente. Elementos filtrantes vendidos diretamente (sem equipamento vinculado) ou refis de clientes sem purificador cadastrado aparecem aqui para vinculação/cadastro do modelo.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Peça Vendida</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Data Venda</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pecasPaged.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-sm">{p.patrimony_code || p.code}</TableCell>
                        <TableCell className="text-sm">{p.client_name}</TableCell>
                        <TableCell className="text-sm">{p.product_name}</TableCell>
                        <TableCell className="text-sm">{(p.brand || p.model) ? [p.brand, p.model].filter(Boolean).join(" · ") : <span className="text-muted-foreground italic">Sem modelo</span>}</TableCell>
                        <TableCell className="text-sm">{fmtDate(p.sale_date)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => setLinkPart(p)} className="gap-1">
                            <Link2 className="h-3 w-3" /> {p.record_type === "equipamento" ? "Cadastrar Modelo" : "Vincular Equipamento"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <TablePagination page={pecasPage} totalPages={pecasTotalPages} totalItems={pecas.length} pageSize={PAGE_SIZE} onPageChange={setPecasPage} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agendamentos">
          <AgendamentosTab />
        </TabsContent>

        <TabsContent value="campanhas3c">
          <Campanhas3CTab
            equipment={equipment}
            clients={clients}
            sellers={sellers}
            mySeller={mySeller}
            isVendedor={isVendedor}
            setCrmEquip={setCrmEquip}
            navigate={navigate}
          />
        </TabsContent>
      </Tabs>

      {registerEquip && (
        <RegisterMaintenanceDialog
          open={!!registerEquip}
          onOpenChange={(v) => !v && setRegisterEquip(null)}
          equipment={registerEquip}
        />
      )}
      {linkPart && (
        <LinkPartDialog
          open={!!linkPart}
          onOpenChange={(v) => !v && setLinkPart(null)}
          part={linkPart}
        />
      )}
      {crmEquip && (
        <CrmContactDialog
          open={!!crmEquip}
          onOpenChange={(v) => { if (!v) { setCrmEquip(null); setCrmCampaignContext(null); } }}
          equipment={crmEquip}
          campaignContext={crmCampaignContext}
        />
      )}
      <LegacyImportDialog open={showImport} onOpenChange={setShowImport} />
      <MatchPurifiersDialog open={showMatchPurifiers} onOpenChange={setShowMatchPurifiers} />
      {agendamentoLinkEquip && (
        <GenerateAgendamentoLinkDialog
          open={!!agendamentoLinkEquip}
          onOpenChange={(v) => !v && setAgendamentoLinkEquip(null)}
          equipment={agendamentoLinkEquip}
        />
      )}
    </div>
  );
}