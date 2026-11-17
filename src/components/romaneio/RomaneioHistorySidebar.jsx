import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, Truck, Undo2, Loader2, Search, Printer } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { openRomaneioExpedicaoPdf } from "@/components/romaneio/RomaneioExpedicaoPdf";

export default function RomaneioHistorySidebar({ dispatchedOrders }) {
  const [expandedDates, setExpandedDates] = useState({});
  const [reverting, setReverting] = useState(null);
  const [historySearch, setHistorySearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filtra OS pelo termo de busca (código, cliente, cidade, transportadora, rastreio)
  const filteredOrders = useMemo(() => {
    if (!historySearch) return dispatchedOrders;
    const q = historySearch.toLowerCase();
    return dispatchedOrders.filter((os) => {
      const labels = os.melhor_envio_labels || [];
      const carriers = [...new Set(labels.map((l) => l.carrier || os.carrier).filter(Boolean))];
      const trackings = labels.map((l) => l.tracking_code).filter(Boolean);
      return (
        os.code?.toLowerCase().includes(q) ||
        os.client_name?.toLowerCase().includes(q) ||
        os.delivery_address?.city?.toLowerCase().includes(q) ||
        os.sale_order_number?.toLowerCase().includes(q) ||
        carriers.some((c) => c.toLowerCase().includes(q)) ||
        trackings.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [dispatchedOrders, historySearch]);

  // Agrupa por data de romaneio
  const grouped = useMemo(() => {
    const map = {};
    for (const os of filteredOrders) {
      const d = os.romaneio_date || "Sem data";
      if (!map[d]) map[d] = [];
      map[d].push(os);
    }
    // Ordena por data decrescente
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredOrders]);

  const toggleDate = (date) => {
    setExpandedDates((prev) => ({ ...prev, [date]: !prev[date] }));
  };

  const handleRevert = async (osId, code) => {
    setReverting(osId);
    try {
      await base44.entities.ServiceOrder.update(osId, {
        romaneio_dispatched: false,
        romaneio_date: null,
      });
      queryClient.invalidateQueries({ queryKey: ["romaneio-expedicao-os"] });
      toast({ title: "OS retornou para pendentes", description: code });
    } catch (err) {
      toast({ title: "Erro ao reverter OS", description: err?.message, variant: "destructive" });
    } finally {
      setReverting(null);
    }
  };

  const formatDate = (d) => {
    if (!d || d === "Sem data") return d;
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  return (
    <div className="w-80 flex-shrink-0 border-l bg-card flex flex-col max-h-[calc(100vh-12rem)]">
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-sky-500" />
          <h3 className="font-semibold text-sm">Histórico de Expedição</h3>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          OS já incluídas em romaneios ({dispatchedOrders.length})
        </p>
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar no histórico..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {grouped.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            Nenhum romaneio gerado ainda
          </div>
        ) : (
          grouped.map(([date, orders]) => {
            const isExpanded = expandedDates[date] ?? true;
            const totalVolumes = orders.reduce((s, o) => s + (o.melhor_envio_labels?.length || 0), 0);
            return (
              <div key={date} className="rounded-lg border bg-background overflow-hidden">
                <div className="w-full flex items-center justify-between p-3 hover:bg-muted/40 transition-colors">
                  <button
                    onClick={() => toggleDate(date)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="text-sm font-medium truncate">{formatDate(date)}</span>
                  </button>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openRomaneioExpedicaoPdf({ selectedOrders: orders, romaneioDate: date })}
                      title="Reimprimir romaneio"
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                    <Badge variant="secondary" className="text-xs">
                      {orders.length} OS • {totalVolumes} vol.
                    </Badge>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t divide-y">
                    {orders.map((os) => {
                      const labels = os.melhor_envio_labels || [];
                      const carriers = [...new Set(labels.map((l) => l.carrier || os.carrier).filter(Boolean))];
                      return (
                        <div key={os.id} className="p-3 flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-xs font-semibold">{os.code}</p>
                            <p className="text-xs text-muted-foreground truncate">{os.client_name}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {carriers.map((c) => (
                                <Badge key={c} variant="outline" className="text-[10px] bg-sky-50 text-sky-700">
                                  {c}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 flex-shrink-0"
                            onClick={() => handleRevert(os.id, os.code)}
                            disabled={reverting === os.id}
                            title="Retornar para pendentes"
                          >
                            {reverting === os.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Undo2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}