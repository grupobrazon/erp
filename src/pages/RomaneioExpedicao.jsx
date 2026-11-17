import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, FileDown, Package, Truck, CheckCheck, Loader2, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { openRomaneioExpedicaoPdf } from "@/components/romaneio/RomaneioExpedicaoPdf";
import { useToast } from "@/components/ui/use-toast";
import RomaneioHistorySidebar from "@/components/romaneio/RomaneioHistorySidebar";
import ScanRomaneioDialog from "@/components/romaneio/ScanRomaneioDialog";
import { updateOsStatus } from "@/lib/osStatusUpdate";

export default function RomaneioExpedicao() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [romaneioDate, setRomaneioDate] = useState(new Date().toISOString().slice(0, 10));
  const [generating, setGenerating] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["romaneio-expedicao-os"],
    queryFn: async () => {
      // Filtra diretamente pelo status do Melhor Envio (etiqueta gerada, não postada)
      // para trazer TODAS as OS pendentes, inclusive as antigas
      const [released, generated] = await Promise.all([
        base44.entities.ServiceOrder.filter({ melhor_envio_status: "released" }, "-created_date", 500),
        base44.entities.ServiceOrder.filter({ melhor_envio_status: "generated" }, "-created_date", 500),
      ]);
      const seen = new Set();
      const combined = [...released, ...generated]
        .filter((os) => Array.isArray(os.melhor_envio_labels) && os.melhor_envio_labels.length > 0)
        .filter((os) => {
          if (seen.has(os.id)) return false;
          seen.add(os.id);
          return true;
        });
      return combined;
    },
  });

  // OS já despachadas em romaneios (para o histórico lateral)
  const { data: dispatchedOrders = [] } = useQuery({
    queryKey: ["romaneio-expedicao-historico"],
    queryFn: async () => {
      const dispatched = await base44.entities.ServiceOrder.filter(
        { romaneio_dispatched: true },
        "-romaneio_date",
        500
      );
      return dispatched;
    },
  });

  // Filtra apenas as pendentes (não despachadas em romaneio)
  const pendingOrders = useMemo(
    () => orders.filter((os) => !os.romaneio_dispatched),
    [orders]
  );

  // Agrupa por transportadora para mostrar contadores
  const carrierStats = useMemo(() => {
    const stats = {};
    for (const os of pendingOrders) {
      const labels = os.melhor_envio_labels || [];
      for (const lbl of labels) {
        const c = lbl.carrier || os.carrier || "Não informada";
        stats[c] = (stats[c] || 0) + 1;
      }
    }
    return stats;
  }, [pendingOrders]);

  const filtered = useMemo(() => {
    if (!search) return pendingOrders;
    const q = search.toLowerCase();
    return pendingOrders.filter(
      (os) =>
        os.code?.toLowerCase().includes(q) ||
        os.sale_order_number?.toLowerCase().includes(q) ||
        os.client_name?.toLowerCase().includes(q) ||
        os.delivery_address?.city?.toLowerCase().includes(q)
    );
  }, [pendingOrders, search]);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((o) => o.id)));
    }
  };

  const selectedOrders = filtered.filter((o) => selected.has(o.id));

  const handleGenerate = async () => {
    if (selectedOrders.length === 0) {
      toast({ title: "Selecione ao menos uma OS", variant: "destructive" });
      return;
    }
    if (!romaneioDate) {
      toast({ title: "Informe a data do romaneio", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      // Bloqueia pedidos que precisam de produção mas ainda não foram liberados pela
      // fábrica. A etiqueta pode ser gerada (mercadoria existe), mas o romaneio só sai
      // após a Produção/Gerente confirmar a liberação — evita despachar mercadoria
      // que ainda está em fabricação/ajuste.
      const blocked = selectedOrders.filter(
        (os) => os.production_needed && !os.production_completed
      );
      if (blocked.length > 0) {
        const codes = blocked.map((os) => os.code).join(", ");
        toast({
          title: "Romaneio bloqueado — produção pendente",
          description: `${blocked.length} OS aguardam liberação da Produção: ${codes}. Peça à Produção ou a um Gerente que libere a produção destes pedidos na tela de Produção antes de gerar o romaneio.`,
          variant: "destructive",
        });
        return;
      }
      openRomaneioExpedicaoPdf({ selectedOrders, romaneioDate });
      // Marca as OS como despachadas no romaneio (saem da lista de pendentes)
      // e atualiza o status para "Saída do Estoque" (passa para a aba Em Transporte)
      setDispatching(true);
      const results = await Promise.all(
        selectedOrders.map((os) =>
          updateOsStatus({
            osId: os.id,
            updates: {
              romaneio_dispatched: true,
              romaneio_date: romaneioDate,
              status: "Saída do Estoque",
            },
            source: "Romaneio de Expedição",
          })
        )
      );
      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        toast({
          title: `${failed.length} OS não puderam ser atualizadas`,
          description: failed[0]?.message || "Falha ao atualizar status",
          variant: "destructive",
        });
      }
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["romaneio-expedicao-os"] });
      queryClient.invalidateQueries({ queryKey: ["romaneio-expedicao-historico"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      toast({
        title: "Romaneio gerado",
        description: `${selectedOrders.length} OS despachadas em ${romaneioDate.split("-").reverse().join("/")}`,
      });
    } catch (err) {
      toast({ title: "Erro ao gerar romaneio", description: err?.message, variant: "destructive" });
    } finally {
      setGenerating(false);
      setDispatching(false);
    }
  };

  const totalVolumes = selectedOrders.reduce(
    (s, os) => s + (os.melhor_envio_labels?.length || 0),
    0
  );

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <PageHeader title="Romaneio de Expedição" description="Selecione as OS com etiqueta gerada e gere o romaneio de postagem agrupado por transportadora">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground mb-1">Data do Romaneio</label>
              <Input type="date" value={romaneioDate} onChange={(e) => setRomaneioDate(e.target.value)} className="w-40" />
            </div>
            <Button onClick={handleGenerate} disabled={generating || dispatching || selectedOrders.length === 0} className="gap-2 mt-5">
              {generating || dispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Gerar Romaneio ({selectedOrders.length})
            </Button>
          </div>
        </PageHeader>

        {/* Stats por transportadora */}
        <div className="flex flex-wrap gap-3 mb-6">
          {Object.entries(carrierStats).length === 0 ? (
            <Card className="flex-1 min-w-[200px]">
              <CardContent className="pt-6 flex items-center gap-3">
                <Package className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Nenhum volume pendente</p>
                  <p className="text-sm font-medium">Todas as etiquetas já foram postadas</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            Object.entries(carrierStats).map(([carrier, count]) => (
              <Card key={carrier} className="min-w-[180px]">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-1">
                    <Truck className="h-4 w-4 text-sky-500" />
                    <span className="text-xs text-muted-foreground truncate">{carrier}</span>
                  </div>
                  <p className="text-2xl font-bold text-sky-600">{count} <span className="text-sm font-normal text-muted-foreground">volumes</span></p>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Barra de seleção */}
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por OS, cliente ou cidade..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Button variant="outline" size="sm" onClick={toggleAll} className="gap-2">
            <CheckCheck className="h-4 w-4" />
            {selected.size === filtered.length && filtered.length > 0 ? "Desmarcar todas" : "Selecionar todas"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setScanOpen(true)} className="gap-2 border-sky-300 text-sky-700 hover:bg-sky-50">
            <ScanLine className="h-4 w-4" />
            Digitalizar Romaneio
          </Button>
          {selected.size > 0 && (
            <Badge variant="secondary" className="text-sm">
              {selected.size} OS • {totalVolumes} volumes
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Package} title="Nenhuma OS pendente de postagem" description="Não há ordens de serviço com etiqueta gerada aguardando postagem." />
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="w-10">OS</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Transportadora</TableHead>
                  <TableHead className="text-center">Volumes</TableHead>
                  <TableHead>Rastreios</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((os) => {
                  const labels = os.melhor_envio_labels || [];
                  const carriers = [...new Set(labels.map((l) => l.carrier || os.carrier).filter(Boolean))];
                  const volumeTrackings = labels.map((l) => l.tracking_code).filter(Boolean);
                  const trackings = volumeTrackings.length > 0 ? volumeTrackings : (os.tracking_code ? [os.tracking_code] : []);
                  const isSel = selected.has(os.id);
                  return (
                    <TableRow key={os.id} className={isSel ? "bg-sky-50/50" : "hover:bg-muted/30"}>
                      <TableCell>
                        <Checkbox checked={isSel} onCheckedChange={() => toggleSelect(os.id)} />
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold">{os.code || "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{os.sale_order_number || "—"}</TableCell>
                      <TableCell className="font-medium text-sm">{os.client_name || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {os.delivery_address?.city ? `${os.delivery_address.city}/${os.delivery_address.state || ""}` : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {carriers.length > 0 ? (
                            carriers.map((c) => (
                              <Badge key={c} variant="outline" className="text-xs bg-sky-50 text-sky-700">
                                {c}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm font-medium">{labels.length}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {trackings.length > 0 ? trackings.join(", ") : <span className="text-amber-600">Aguardando rastreio</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      <RomaneioHistorySidebar dispatchedOrders={dispatchedOrders} />
      <ScanRomaneioDialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        orders={pendingOrders}
        onConfirm={(matchedIds) => {
          setSelected(new Set(matchedIds));
          setScanOpen(false);
          toast({
            title: "Seleção automática aplicada",
            description: `${matchedIds.size} OS selecionadas pela leitura de código de barras.`,
          });
        }}
      />
    </div>
  );
}