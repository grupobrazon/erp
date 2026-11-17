import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Loader2, Package, Factory, Route, Truck, FileCheck, AlertCircle, ClipboardList, ClipboardCheck, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTabs } from "@/lib/TabsContext";

const CATEGORIES = [
  {
    key: "sem_os",
    label: "Vendas sem OS Gerada",
    icon: AlertCircle,
    color: "text-red-500",
    bg: "bg-red-50",
    border: "border-red-200",
    description: "Vendas confirmadas/pagas que ainda não geraram OS",
  },
  {
    key: "aprovacao_comercial",
    label: "Aprovação Comercial",
    icon: FileCheck,
    color: "text-amber-500",
    bg: "bg-amber-50",
    border: "border-amber-200",
    description: "OS paradas na aprovação comercial (pedido criado, aguardando confirmação)",
  },
  {
    key: "aprovacao_financeira",
    label: "Aprovação Financeira",
    icon: DollarSign,
    color: "text-yellow-600",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    description: "OS liberadas pelo comercial, aguardando aprovação do financeiro (conferir pagamento)",
  },
  {
    key: "producao",
    label: "Paradas na Produção",
    icon: Factory,
    color: "text-orange-500",
    bg: "bg-orange-50",
    border: "border-orange-200",
    description: "OS aguardando produção ou em produção",
  },
  {
    key: "liberada_sem_rota",
    label: "Produção Liberada, sem Rota/Despacho",
    icon: Route,
    color: "text-blue-500",
    bg: "bg-blue-50",
    border: "border-blue-200",
    description: "Produção liberou mas logística ainda não agendou rota ou despachou",
  },
  {
    key: "etiqueta_sem_romaneio",
    label: "Etiqueta Gerada, sem Romaneio",
    icon: Package,
    color: "text-purple-500",
    bg: "bg-purple-50",
    border: "border-purple-200",
    description: "Etiqueta gerada mas ainda não incluída em romaneio de expedição",
  },
  {
    key: "expedicao",
    label: "Em Expedição (Separação/Saída)",
    icon: ClipboardList,
    color: "text-cyan-500",
    bg: "bg-cyan-50",
    border: "border-cyan-200",
    description: "OS em separação ou saída do estoque",
  },
  {
    key: "transporte",
    label: "Em Transporte",
    icon: Truck,
    color: "text-indigo-500",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    description: "OS em transporte aguardando entrega",
  },
  {
    key: "pos_rota",
    label: "Pós-Rota (Aguardando)",
    icon: ClipboardCheck,
    color: "text-teal-500",
    bg: "bg-teal-50",
    border: "border-teal-200",
    description: "OS finalizadas pelo técnico aguardando validação/aprovação/faturamento final",
  },
];

const STATUS_MAP = {
  aprovacao_comercial: ["Aprovação Comercial"],
  aprovacao_financeira: ["Aprovação Financeira"],
  producao: ["Aguardando Produção", "Produção Iniciada", "Produção/Expedição"],
  liberada_sem_rota: ["Produção Liberada", "Aguardando Rota"],
  expedicao: ["Separação", "Saída do Estoque"],
  transporte: ["Em Transporte"],
  pos_rota: ["Concluída pelo Técnico", "Atendimento Interrompido", "Aguardando Faturamento - Pós", "OK - Aprov. Financeira", "Aguardando Faturamento Final"],
};

export default function VisaoGeralLogistica() {
  const [loading, setLoading] = useState(true);
  const [allOS, setAllOS] = useState([]);
  const [salesSemOS, setSalesSemOS] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const { openTab } = useTabs();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [osPage, salesPage] = await Promise.all([
          base44.entities.ServiceOrder.filter(
            { status: { $nin: ["Cancelada", "Concluída", "Entregue", "Recebida na Empresa"] } },
            { sort: "-created_date", limit: 1000, fields: ["code", "status", "sale_id", "client_name", "sale_order_number", "romaneio_dispatched", "type", "delivery_modality", "technician", "production_needed"] }
          ),
          base44.entities.Sale.filter(
            { stage: { $in: ["Confirmada", "Pagamento Aprovado"] }, is_counter_sale: { $ne: true } },
            { sort: "-created_date", limit: 1000, fields: ["order_number", "client_name", "stage", "seller_name", "date", "delivery_modality"] }
          ),
        ]);
        if (cancelled) return;
        const osList = osPage.items || [];
        const salesList = salesPage.items || [];
        setAllOS(osList);

        const osSaleIds = new Set(osList.map((os) => os.sale_id).filter(Boolean));
        const semOS = salesList.filter((s) => !osSaleIds.has(s.id));
        setSalesSemOS(semOS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const buckets = useMemo(() => {
    const map = {};
    for (const cat of CATEGORIES) {
      if (cat.key === "sem_os") continue;
      const statuses = STATUS_MAP[cat.key] || [];
      map[cat.key] = allOS.filter((os) => statuses.includes(os.status));
    }
    map.etiqueta_sem_romaneio = allOS.filter(
      (os) => os.status === "Etiqueta Gerada" && !os.romaneio_dispatched
    );
    map.sem_os = salesSemOS;
    return map;
  }, [allOS, salesSemOS]);

  const counts = useMemo(() => {
    const c = {};
    for (const cat of CATEGORIES) c[cat.key] = (buckets[cat.key] || []).length;
    return c;
  }, [buckets]);

  const totalGargalos = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);

  const openOS = (os) => openTab({ path: "/ordens-servico", label: "Ordens de Serviço", Icon: ClipboardList, color: { icon: "text-orange-400", border: "border-orange-400/40", tint: "bg-gradient-to-br from-orange-500/[0.14] to-transparent" } });
  const openSales = () => openTab({ path: "/vendas", label: "Vendas", Icon: ClipboardList, color: { icon: "text-emerald-400", border: "border-emerald-400/40", tint: "bg-gradient-to-br from-emerald-500/[0.14] to-transparent" } });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Visão Geral da Logística</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gargalos do pipeline: {totalGargalos} item(ns) parado(s) em alguma etapa
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-9 gap-3">
        {CATEGORIES.map((cat) => {
          const count = counts[cat.key] || 0;
          const isExpanded = expanded === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setExpanded(isExpanded ? null : cat.key)}
              className="text-left"
            >
              <Card className={cn(
                "transition-all hover:shadow-md hover:-translate-y-0.5",
                cat.border,
                isExpanded && "ring-2 ring-primary"
              )}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={cn("p-1.5 rounded-md", cat.bg)}>
                      <cat.icon className={cn("h-4 w-4", cat.color)} />
                    </div>
                    <span className={cn("text-2xl font-bold", cat.color)}>{count}</span>
                  </div>
                  <p className="text-xs font-medium leading-tight">{cat.label}</p>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {/* Expanded list */}
      {expanded && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {(() => {
                    const cat = CATEGORIES.find((c) => c.key === expanded);
                    return (
                      <>
                        <cat.icon className={cn("h-5 w-5", cat.color)} />
                        {cat.label}
                      </>
                    );
                  })()}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {CATEGORIES.find((c) => c.key === expanded)?.description}
                </p>
              </div>
              <Badge variant="secondary">{counts[expanded]} item(ns)</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <BucketList items={buckets[expanded] || []} type={expanded} onOpenOS={openOS} onOpenSales={openSales} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BucketList({ items, type, onOpenOS, onOpenSales }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Nenhum item parado nesta etapa 🎉</p>;
  }

  if (type === "sem_os") {
    return (
      <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
        {items.map((s) => (
          <div key={s.id} className="flex items-center justify-between p-2.5 rounded-md border bg-card hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <Badge variant="outline" className="font-mono text-xs shrink-0">{s.order_number || "—"}</Badge>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{s.client_name || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {s.seller_name || "—"} • {s.delivery_modality || "—"} • {s.date ? new Date(s.date).toLocaleDateString("pt-BR") : "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="secondary" className="text-xs">{s.stage}</Badge>
              <Button size="sm" variant="ghost" onClick={onOpenSales}>Ver Venda</Button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
      {items.map((os) => (
        <div key={os.id} className="flex items-center justify-between p-2.5 rounded-md border bg-card hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            <Badge variant="outline" className="font-mono text-xs shrink-0">{os.code || "—"}</Badge>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{os.client_name || "—"}</p>
              <p className="text-xs text-muted-foreground">
                {os.sale_order_number || "—"} • {os.type || os.delivery_modality || "—"}
                {os.technician ? ` • ${os.technician}` : ""}
                {os.production_needed ? " • Produção" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="text-xs">{os.status}</Badge>
            <Button size="sm" variant="ghost" onClick={() => onOpenOS(os)}>Ver OS</Button>
          </div>
        </div>
      ))}
    </div>
  );
}