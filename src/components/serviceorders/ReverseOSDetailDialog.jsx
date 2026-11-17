import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  RotateCcw, Download, Search, ExternalLink, PackageCheck, AlertCircle, Truck, MapPinned, Ban, RefreshCw, Clock, Info, Zap
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import ReverseShippingCard from "@/components/serviceorders/ReverseShippingCard";
import ExchangeSaleDialog from "@/components/serviceorders/ExchangeSaleDialog";

const statusColors = {
  "Aguardando Coleta Reversa": "bg-amber-100 text-amber-700",
  "Em Retorno": "bg-sky-100 text-sky-700",
  "Recebida na Empresa": "bg-emerald-100 text-emerald-700",
};

export default function ReverseOSDetailDialog({ open, onOpenChange, order }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [labelError, setLabelError] = useState("");
  const [trackingEvents, setTrackingEvents] = useState([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [showTracking, setShowTracking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [settingResolution, setSettingResolution] = useState(false);
  const [selectedVolumes, setSelectedVolumes] = useState([]);
  const [reverseService, setReverseService] = useState("2");
  const [exchangeDialogOpen, setExchangeDialogOpen] = useState(false);
  const [exchangeAnticipated, setExchangeAnticipated] = useState(false);

  const { data: liveOrder } = useQuery({
    queryKey: ["serviceOrder", order?.id],
    queryFn: () => base44.entities.ServiceOrder.get(order.id),
    enabled: !!open && !!order?.id,
    refetchInterval: 30000,
  });
  const meOrder = liveOrder || order;

  // OS pai (original) — onde estão as etiquetas do Melhor Envio (volumes por item)
  const { data: parentOs } = useQuery({
    queryKey: ["serviceOrder", order?.reverse_parent_os_id],
    queryFn: () => base44.entities.ServiceOrder.get(order.reverse_parent_os_id),
    enabled: !!open && !!order?.reverse_parent_os_id,
  });

  // Venda — para mostrar os itens do pedido
  const { data: sale } = useQuery({
    queryKey: ["sale", order?.sale_id],
    queryFn: () => base44.entities.Sale.get(order.sale_id),
    enabled: !!open && !!order?.sale_id,
  });

  const parentLabels = parentOs?.melhor_envio_labels || [];

  // Verifica se já existe pedido de troca gerado para esta OS Reversa
  const { data: existingExchange } = useQuery({
    queryKey: ["exchangeSale", order?.id],
    queryFn: () => base44.entities.Sale.filter({ exchange_reverse_os_id: order.id }),
    enabled: !!open && !!order?.id,
  });

  useEffect(() => {
    if (order) {
      setLabelError("");
      setTrackingEvents([]);
      setShowTracking(false);
      // Pré-seleciona todos os volumes
      setSelectedVolumes(parentLabels.map(l => Number(l.volume_index)));
    }
  }, [order?.id, parentLabels.length]);

  if (!order) return null;

  const reverseShipments = meOrder?.reverse_shipments || [];
  const firstShipment = reverseShipments[0] || {};
  const trackingCode = firstShipment.tracking_code || "";
  const labelUrl = firstShipment.label_url || "";

  const toggleVolume = (idx) => {
    setSelectedVolumes(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const toggleAll = () => {
    if (selectedVolumes.length === parentLabels.length) {
      setSelectedVolumes([]);
    } else {
      setSelectedVolumes(parentLabels.map(l => Number(l.volume_index)));
    }
  };

  const handleGenerateLabel = async () => {
    if (selectedVolumes.length === 0) {
      toast({ title: "Selecione pelo menos um item", variant: "destructive" });
      return;
    }
    setGenerating(true);
    setLabelError("");
    try {
      const res = await base44.functions.invoke("generateReverseShippingLabel", {
        os_id: order.id,
        reason: meOrder?.reverse_reason,
        selected_volume_indexes: selectedVolumes,
        reverse_service: reverseService,
      });
      const data = res.data || res;
      if (data.error) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      toast({
        title: "Etiqueta reversa gerada",
        description: `${data.volumes_count} volume(s) • ${data.service_name || "Correios"} • Rastreio: ${data.reverse_shipments?.[0]?.tracking_code || "ver no painel do ME"}`
      });
      queryClient.invalidateQueries({ queryKey: ["serviceOrder", order.id] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
    } catch (err) {
      // Extrai a mensagem de erro real do backend (não apenas "Request failed with status code 502")
      const backendMsg = err?.response?.data?.error || err?.response?.data?.message;
      const msg = backendMsg || err?.message || "Falha no Melhor Envio";
      setLabelError(msg);
      toast({ title: "Erro ao gerar etiqueta reversa", description: msg, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleTrack = async () => {
    if (!trackingCode) return;
    setTrackingLoading(true);
    setShowTracking(true);
    try {
      const res = await base44.functions.invoke("trackMelhorEnvioShipment", { tracking_code: trackingCode });
      const data = res.data || res;
      setTrackingEvents(data.events || []);
    } catch (err) {
      toast({ title: "Erro ao rastrear", description: err?.message, variant: "destructive" });
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleConfirmReceipt = async (resolution = null) => {
    setConfirming(true);
    try {
      const payload = { reverse_os_id: order.id };
      if (resolution) payload.resolution = resolution;
      const res = await base44.functions.invoke("confirmReverseReceipt", payload);
      const data = res.data || res;
      if (data.error) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      const desc = resolution
        ? `Mercadoria recebida — resolução: ${resolution}.`
        : "Mercadoria devolvida deu entrada na empresa. Defina a resolução (Troca ou Cancelamento).";
      toast({ title: "Recebimento confirmado", description: desc });
      queryClient.invalidateQueries({ queryKey: ["serviceOrder", order.id] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["reverseOS", meOrder?.reverse_parent_os_id] });
    } catch (err) {
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  const handleSetResolution = async (resolution) => {
    setSettingResolution(true);
    try {
      const res = await base44.functions.invoke("confirmReverseReceipt", {
        reverse_os_id: order.id,
        resolution,
      });
      const data = res.data || res;
      if (data.error) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      toast({ title: "Resolução definida", description: `Devolução resolvida como: ${resolution}.` });
      queryClient.invalidateQueries({ queryKey: ["serviceOrder", order.id] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["reverseOS", meOrder?.reverse_parent_os_id] });
    } catch (err) {
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    } finally {
      setSettingResolution(false);
    }
  };

  const fmtDateTime = (d) => d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <div className="flex items-center gap-3 flex-wrap">
            <RotateCcw className="h-5 w-5 text-purple-600" />
            <DialogTitle className="font-mono">{order.code}</DialogTitle>
            <Badge className={statusColors[meOrder?.status] || "bg-muted text-muted-foreground"}>{meOrder?.status}</Badge>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {/* Info da OS Reversa */}
          <div className="rounded-md border border-purple-200 bg-purple-50/30 p-3 text-sm space-y-1">
            <div><span className="text-muted-foreground">OS Original:</span> <span className="font-mono font-medium">{order.reverse_parent_os_code || "—"}</span></div>
            <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{order.client_name || "—"}</span></div>
            <div><span className="text-muted-foreground">Pedido:</span> <span className="font-mono">{order.sale_order_number || "—"}</span></div>
            <div><span className="text-muted-foreground">Gerada em:</span> {fmtDateTime(order.reverse_generated_date)}</div>
            <div><span className="text-muted-foreground">Gerada por:</span> {order.reverse_generated_by || "—"}</div>
            <div className="pt-1 border-t">
              <span className="text-muted-foreground">Motivo:</span>
              <p className="text-foreground mt-0.5">{order.reverse_reason || "—"}</p>
            </div>
          </div>

          {/* Etiqueta reversa */}
          {reverseShipments.length === 0 ? (
            <div className="space-y-3">
              {/* Seleção de itens para devolução */}
              {parentLabels.length > 0 && (
                <div className="rounded-md border border-purple-200 bg-purple-50/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-purple-800 flex items-center gap-1">
                      <PackageCheck className="h-4 w-4" /> Itens para Devolução
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleAll}>
                      {selectedVolumes.length === parentLabels.length ? "Desmarcar todos" : "Selecionar todos"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Selecione quais itens do pedido devem ser coletados na devolução.
                  </p>
                  <div className="space-y-1.5">
                    {parentLabels.map((lbl, i) => {
                      const saleItem = (sale?.items || []).find(it => it.product_id === lbl.product_id);
                      const isSelected = selectedVolumes.includes(Number(lbl.volume_index));
                      return (
                        <label key={i} className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer transition-colors ${isSelected ? "border-purple-400 bg-purple-50" : "border-border hover:bg-muted/30"}`}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleVolume(Number(lbl.volume_index))}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{lbl.product_name || `Volume ${lbl.volume_index}`}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                              <span>{lbl.label_tag || `Vol. ${lbl.volume_index}`}</span>
                              {saleItem && <span>• {saleItem.quantity}x • R$ {(saleItem.unit_price || 0).toFixed(2)}</span>}
                              {lbl.tracking_code && <span>• Rastreio original: {lbl.tracking_code}</span>}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Seleção do serviço (Correios PAC ou SEDEX) */}
              <div className="rounded-md border border-blue-200 bg-blue-50/30 p-3 space-y-2">
                <div className="text-sm font-medium text-blue-800 flex items-center gap-1">
                  <Truck className="h-4 w-4" /> Serviço de Coleta Reversa
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <Info className="h-3 w-3 shrink-0" />
                  <span>A logística reversa do Melhor Envio só funciona com Correios (PAC ou SEDEX), independente da transportadora original.</span>
                </div>
                <div>
                  <Label className="text-xs">Serviço dos Correios</Label>
                  <Select value={reverseService} onValueChange={setReverseService}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">SEDEX (mais rápido)</SelectItem>
                      <SelectItem value="1">PAC (mais econômico)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Gere a etiqueta de coleta reversa no Melhor Envio. O produto será coletado na casa do cliente e enviado de volta para a empresa.
              </p>
              <Button onClick={handleGenerateLabel} disabled={generating || selectedVolumes.length === 0} className="w-full gap-2">
                {generating ? (
                  <><div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Gerando etiqueta...</>
                ) : (
                  <><Download className="h-4 w-4" /> Gerar Etiqueta Reversa ({selectedVolumes.length} {selectedVolumes.length === 1 ? "item" : "itens"})</>
                )}
              </Button>
              {labelError && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 flex items-start gap-1">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span className="break-words whitespace-normal">{labelError}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <ReverseShippingCard
                shipments={reverseShipments}
                clientName={order.client_name}
                orderCode={order.code}
                parentCode={order.reverse_parent_os_code}
                onTrack={handleTrack}
                trackingLoading={trackingLoading}
              />

              {showTracking && (
                <div className="rounded-md border bg-muted/30 p-3 max-h-40 overflow-y-auto">
                  {trackingEvents.length === 0 && !trackingLoading ? (
                    <p className="text-xs text-muted-foreground">Nenhum evento de rastreio encontrado ainda.</p>
                  ) : (
                    <div className="space-y-2">
                      {trackingEvents.map((ev, i) => (
                        <div key={i} className="flex gap-2 text-xs">
                          <MapPinned className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                          <div>
                            <span className="font-medium">{ev.date || ev.created_at || "—"}</span>
                            <p className="text-muted-foreground">{ev.description || ev.message || ev.status || "—"}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Confirmar recebimento + bifurcação troca/cancelamento */}
              {!meOrder?.reverse_received ? (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 space-y-3">
                  <div className="text-sm font-medium text-emerald-800 flex items-center gap-1">
                    <PackageCheck className="h-4 w-4" /> Confirmar Recebimento na Empresa
                  </div>
                  {(() => {
                    const anyPosted = reverseShipments.some(s => s.status === 'posted' || s.status === 'delivered');
                    if (!anyPosted) {
                      return (
                        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-1">
                          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                          <span>O cliente ainda não postou a devolução. O status no Melhor Envio é "generated" (etiqueta gerada, aguardando postagem). O recebimento só poderá ser confirmado após a postagem ser detectada pela sincronização automática.</span>
                        </div>
                      );
                    }
                    return (
                      <p className="text-xs text-muted-foreground">
                        Confirme o recebimento e escolha a resolução da devolução:
                      </p>
                    );
                  })()}
                  {(() => {
                    const anyPosted = reverseShipments.some(s => s.status === 'posted' || s.status === 'delivered');
                    return (
                      <>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => handleConfirmReceipt("Troca")}
                      disabled={confirming || !anyPosted}
                      className="gap-2 bg-blue-600 hover:bg-blue-700"
                    >
                      {confirming ? (
                        <><div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Recebendo...</>
                      ) : (
                        <><RefreshCw className="h-4 w-4" /> Receber para Troca</>
                      )}
                    </Button>
                    <Button
                      onClick={() => handleConfirmReceipt("Cancelamento")}
                      disabled={confirming || !anyPosted}
                      variant="destructive"
                      className="gap-2"
                    >
                      {confirming ? (
                        <><div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Recebendo...</>
                      ) : (
                        <><Ban className="h-4 w-4" /> Receber para Cancelamento</>
                      )}
                    </Button>
                  </div>
                  <Button
                    onClick={() => handleConfirmReceipt(null)}
                    disabled={confirming || !anyPosted}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    {confirming ? (
                      <><div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Recebendo...</>
                    ) : (
                      <><Clock className="h-4 w-4" /> Confirmar (decidir depois)</>
                    )}
                  </Button>
                      </>
                    );
                  })()}

                  {reverseShipments.length > 0 && existingExchange?.length === 0 && (
                    <div className="pt-2 border-t border-emerald-200 space-y-2">
                      <div className="text-sm font-medium text-blue-800 flex items-center gap-1">
                        <Zap className="h-4 w-4" /> Antecipar Produção da Troca
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Não precisa esperar a mercadoria chegar. Gere o pedido de troca agora e a produção começa imediatamente.
                      </p>
                      <Button
                        onClick={() => { setExchangeAnticipated(true); setExchangeDialogOpen(true); }}
                        variant="outline"
                        className="w-full gap-2 border-blue-400 text-blue-700 hover:bg-blue-50"
                      >
                        <Zap className="h-4 w-4" /> Antecipar Troca
                      </Button>
                    </div>
                  )}

                  {existingExchange?.length > 0 && !meOrder?.reverse_received && (
                    <div className="pt-2 border-t border-emerald-200 space-y-1">
                      <div className="text-sm font-medium text-blue-800 flex items-center gap-1">
                        <Zap className="h-4 w-4" /> Produção Antecipada
                      </div>
                      <div className="text-sm flex items-center gap-2 flex-wrap">
                        <span>Pedido gerado:</span>
                        <Badge className="bg-blue-100 text-blue-700 font-mono">{existingExchange[0].order_number}</Badge>
                        {existingExchange[0].exchange_anticipated && (
                          <Badge className="bg-amber-100 text-amber-700 text-xs">Antecipado</Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm">
                    <div className="font-medium text-emerald-800 flex items-center gap-2">
                      <PackageCheck className="h-4 w-4" /> Mercadoria Recebida
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Recebida por <strong>{meOrder?.reverse_received_by || "—"}</strong> em {fmtDateTime(meOrder?.reverse_received_date)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Resolução:</span>
                    {meOrder?.reverse_resolution === "Troca" && (
                      <Badge className="bg-blue-100 text-blue-700 gap-1">
                        <RefreshCw className="h-3 w-3" /> Troca
                      </Badge>
                    )}
                    {meOrder?.reverse_resolution === "Cancelamento" && (
                      <Badge className="bg-red-100 text-red-700 gap-1">
                        <Ban className="h-3 w-3" /> Cancelamento
                      </Badge>
                    )}
                    {(!meOrder?.reverse_resolution || meOrder?.reverse_resolution === "Pendente") && (
                      <Badge className="bg-amber-100 text-amber-700 gap-1">
                        <Clock className="h-3 w-3" /> Pendente
                      </Badge>
                    )}
                  </div>

                  {meOrder?.reverse_resolution === "Troca" && (
                    <div className="rounded-md border border-blue-300 bg-blue-50 p-3 space-y-2">
                      <div className="text-sm font-medium text-blue-800 flex items-center gap-1">
                        <RefreshCw className="h-4 w-4" /> Pedido de Troca
                      </div>
                      {existingExchange && existingExchange.length > 0 ? (
                        <div className="text-sm flex items-center gap-2 flex-wrap">
                          <span>Pedido gerado:</span>
                          <Badge className="bg-blue-100 text-blue-700 font-mono">{existingExchange[0].order_number}</Badge>
                          <span className="text-xs text-muted-foreground">R$ 0,00 • OS em Produção/Expedição</span>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground">
                            Gere o pedido de troca com valor zerado (R$ 0,00). A OS será criada automaticamente em Produção/Expedição. Você pode trocar o produto (ex: voltagem errada) e deve justificar o motivo.
                          </p>
                          <Button onClick={() => { setExchangeAnticipated(false); setExchangeDialogOpen(true); }} className="w-full gap-2 bg-blue-600 hover:bg-blue-700">
                            <RefreshCw className="h-4 w-4" /> Gerar Pedido de Troca
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  {(!meOrder?.reverse_resolution || meOrder?.reverse_resolution === "Pendente") && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
                      <div className="text-sm font-medium text-amber-800">
                        Definir Resolução da Devolução
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Escolha o que fazer com a devolução:
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          onClick={() => handleSetResolution("Troca")}
                          disabled={settingResolution}
                          className="gap-2 bg-blue-600 hover:bg-blue-700"
                        >
                          {settingResolution ? (
                            <><div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Salvando...</>
                          ) : (
                            <><RefreshCw className="h-4 w-4" /> Troca</>
                          )}
                        </Button>
                        <Button
                          onClick={() => handleSetResolution("Cancelamento")}
                          disabled={settingResolution}
                          variant="destructive"
                          className="gap-2"
                        >
                          {settingResolution ? (
                            <><div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Salvando...</>
                          ) : (
                            <><Ban className="h-4 w-4" /> Cancelamento</>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <ExchangeSaleDialog
          open={exchangeDialogOpen}
          onOpenChange={setExchangeDialogOpen}
          order={meOrder}
          parentOs={parentOs}
          sale={sale}
          anticipated={exchangeAnticipated}
        />
      </DialogContent>
    </Dialog>
  );
}