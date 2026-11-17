import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Search, Ban, Clock, ArrowRight, CheckCircle2, DollarSign, PackageCheck, FileX, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import CancellationDetailDialog from "@/components/sales/CancellationDetailDialog";
import { usePermissions } from "@/lib/permissions";

const STAGES = [
  { value: "Aguardando Aprovação", label: "Aguardando Aprovação", icon: Clock, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  { value: "Aguardando Retorno Logístico", label: "Retorno Logístico", icon: Truck, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
  { value: "Aguardando Recebimento", label: "Recebimento Mercadoria", icon: PackageCheck, color: "text-cyan-600", bg: "bg-cyan-50 border-cyan-200" },
  { value: "Aguardando Estorno Financeiro", label: "Estorno Financeiro", icon: DollarSign, color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
  { value: "Aguardando Cancelamento NF-e", label: "Cancelamento NF-e", icon: FileX, color: "text-purple-600", bg: "bg-purple-50 border-purple-200" },
  { value: "Cancelamento Concluído", label: "Concluído", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
];

const STATUS_COLORS = {
  "Aguardando Aprovação": "bg-amber-100 text-amber-700",
  "Cancelada": "bg-red-100 text-red-700",
  "Aguardando Retorno Logístico": "bg-blue-100 text-blue-700",
  "Aguardando Recebimento": "bg-cyan-100 text-cyan-700",
  "Aguardando Estorno Financeiro": "bg-orange-100 text-orange-700",
  "Aguardando Cancelamento NF-e": "bg-purple-100 text-purple-700",
  "Cancelamento Concluído": "bg-emerald-100 text-emerald-700",
};

export default function Cancelamentos() {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [selectedSale, setSelectedSale] = useState(null);
  const { allRoles, isAdmin } = usePermissions();

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["cancellation-sales"],
    queryFn: async () => {
      const all = [];
      let skip = 0;
      for (;;) {
        const batch = await base44.entities.Sale.filter(
          { cancellation_status: { $ne: "Não Solicitado" } },
          "-cancellation_requested_date", 500, skip
        );
        all.push(...batch);
        if (batch.length < 500) break;
        skip += 500;
      }
      return all;
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => base44.functions.invoke("manageUsers", { action: "list" }),
    select: (data) => data.users || [],
  });

  // Mapa para resolver nomes de usuário (cancellation_requested_by pode ter valor antigo como "mkt")
  const userNameMap = {};
  for (const u of users) {
    const displayName = u.display_name || u.full_name || "";
    if (!displayName) continue;
    if (u.full_name) userNameMap[u.full_name] = displayName;
    if (u.email) userNameMap[u.email] = displayName;
    if (u.email) userNameMap[u.email.split("@")[0]] = displayName;
    userNameMap[displayName] = displayName;
  }
  const resolveUserName = (raw) => userNameMap[raw] || raw || "—";

  const { data: serviceOrders = [] } = useQuery({
    queryKey: ["serviceOrders"],
    queryFn: () => base44.entities.ServiceOrder.list("-created_date", 500),
  });

  const osBySale = {};
  for (const os of serviceOrders) {
    if (os.sale_id) {
      if (!osBySale[os.sale_id]) osBySale[os.sale_id] = [];
      osBySale[os.sale_id].push(os);
    }
  }

  const cancellations = sales.filter(s =>
    s.cancellation_status && s.cancellation_status !== "Não Solicitado"
  );

  const stageCounts = {};
  for (const s of cancellations) {
    const st = s.cancellation_status;
    stageCounts[st] = (stageCounts[st] || 0) + 1;
  }

  const filtered = cancellations
    .filter(s => {
      if (stageFilter !== "all" && s.cancellation_status !== stageFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return s.client_name?.toLowerCase().includes(q) ||
          s.order_number?.toLowerCase().includes(q) ||
          s.seller_name?.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      const da = a.cancellation_requested_date ? new Date(a.cancellation_requested_date).getTime() : null;
      const db = b.cancellation_requested_date ? new Date(b.cancellation_requested_date).getTime() : null;
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return db - da;
    });

  return (
    <div>
      <PageHeader
        title="Vendas Canceladas"
        description="Fluxo de cancelamento de vendas — aprovação do supervisor, retorno logístico, estorno financeiro e cancelamento de NF-e"
      />

      {/* Cards de resumo por etapa */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {STAGES.map(stage => {
          const Icon = stage.icon;
          const count = stageCounts[stage.value] || 0;
          return (
            <Card
              key={stage.value}
              className={`p-3 cursor-pointer border transition-all hover:shadow-md ${stage.bg} ${stageFilter === stage.value ? "ring-2 ring-primary" : ""}`}
              onClick={() => setStageFilter(stageFilter === stage.value ? "all" : stage.value)}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className={`h-4 w-4 ${stage.color}`} />
                <span className="text-2xl font-bold">{count}</span>
              </div>
              <div className="text-xs text-muted-foreground leading-tight">{stage.label}</div>
            </Card>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="mb-4 flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por cliente, pedido ou vendedor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="flex gap-1">
          <Button
            variant={stageFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setStageFilter("all")}
          >
            Todos ({cancellations.length})
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nenhum cancelamento"
          description={cancellations.length === 0 ? "Nenhuma venda com cancelamento em andamento." : "Nenhum cancelamento encontrado com os filtros aplicados."}
          icon={Ban}
        />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Etapa do Cancelamento</TableHead>
                <TableHead>Solicitado por</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(s => (
                <TableRow key={s.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono text-xs font-semibold">{s.order_number}</TableCell>
                  <TableCell className="font-medium">{s.client_name}</TableCell>
                  <TableCell>{s.seller_name || "—"}</TableCell>
                  <TableCell className="text-right font-medium">R$ {(s.grand_total || 0).toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[s.cancellation_status] || "bg-muted text-muted-foreground"}>
                      {s.cancellation_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div>{resolveUserName(s.cancellation_requested_by)}</div>
                    <div className="text-muted-foreground">
                      {s.cancellation_requested_date
                        ? new Date(s.cancellation_requested_date).toLocaleDateString("pt-BR")
                        : ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedSale(s)}
                      className="gap-1"
                    >
                      <ArrowRight className="h-3 w-3" /> Gerenciar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CancellationDetailDialog
        sale={selectedSale}
        osList={selectedSale ? (osBySale[selectedSale.id] || []) : []}
        open={!!selectedSale}
        onOpenChange={v => !v && setSelectedSale(null)}
      />
    </div>
  );
}