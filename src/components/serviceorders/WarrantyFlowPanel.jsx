import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PackageCheck, Truck, User, Download, FileText, RefreshCw, CheckCircle2,
  AlertCircle, Clock, MapPin, ExternalLink,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const flowStatusConfig = {
  "Aguardando Recebimento": { label: "Aguardando Recebimento", color: "bg-amber-100 text-amber-700", icon: Clock },
  "Recebido na Empresa": { label: "Recebido na Empresa", color: "bg-blue-100 text-blue-700", icon: PackageCheck },
  "Aguardando Retorno": { label: "Aguardando Retorno", color: "bg-violet-100 text-violet-700", icon: Truck },
  "Retornado ao Cliente": { label: "Retornado ao Cliente", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
};

const fmtDateTime = (d) => d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function WarrantyFlowPanel({ order }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [receiptMethod, setReceiptMethod] = useState("");
  const [returnMethod, setReturnMethod] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [billingRemessa, setBillingRemessa] = useState(false);
  const [generatingLabel, setGeneratingLabel] = useState(false);
  const [pickingUp, setPickingUp] = useState(false);
  const [meService, setMeService] = useState("2");

  const flowStatus = order?.warranty_flow_status || "Aguardando Recebimento";
  const flowCfg = flowStatusConfig[flowStatus] || flowStatusConfig["Aguardando Recebimento"];
  const FlowIcon = flowCfg.icon;

  // Busca a remessa vinculada (se existir)
  const { data: remessa, isLoading: remessaLoading } = useQuery({
    queryKey: ["warrantyRemessa", order?.warranty_remessa_id],
    queryFn: () => base44.entities.Remessa.get(order.warranty_remessa_id),
    enabled: !!order?.warranty_remessa_id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["serviceOrder", order.id] });
    queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
    queryClient.invalidateQueries({ queryKey: ["warrantyRemessa", order?.warranty_remessa_id] });
    queryClient.invalidateQueries({ queryKey: ["remessas"] });
  };

  const handleConfirmReceipt = async () => {
    if (!receiptMethod) {
      toast({ title: "Selecione o método de recebimento", variant: "destructive" });
      return;
    }
    setConfirming(true);
    try {
      const res = await base44.functions.invoke("confirmWarrantyReceipt", {
        os_id: order.id,
        receipt_method: receiptMethod,
      });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      toast({ title: "Produto recebido na empresa", description: `Método: ${receiptMethod === "Codigo Reverso" ? "Código Reverso" : "Entrega Pessoal"}` });
      invalidate();
    } catch (err) {
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  const handleBillRemessa = async () => {
    setBillingRemessa(true);
    try {
      const res = await base44.functions.invoke("generateWarrantyRemessa", { os_id: order.id });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      const msg = data.message || `Remessa ${data.remessa_code} criada`;
      const isAuthorized = data.nfe?.status === "autorizado";
      toast({
        title: isAuthorized ? "Remessa faturada e NF-e autorizada" : "Remessa criada",
        description: msg,
        variant: isAuthorized ? "default" : "default",
      });
      invalidate();
    } catch (err) {
      toast({ title: "Erro ao faturar remessa", description: err?.message, variant: "destructive" });
    } finally {
      setBillingRemessa(false);
    }
  };

  const handleGenerateLabel = async () => {
    setGeneratingLabel(true);
    try {
      const res = await base44.functions.invoke("generateWarrantyReturnLabel", {
        os_id: order.id,
        service_id: meService,
      });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      toast({
        title: "Etiqueta gerada",
        description: `${data.volumes_count} volume(s) • ${data.service_name || "SEDEX"} • ${data.tracking_code || "ver no painel"}`,
      });
      invalidate();
    } catch (err) {
      toast({ title: "Erro ao gerar etiqueta", description: err?.message, variant: "destructive" });
    } finally {
      setGeneratingLabel(false);
    }
  };

  const handleConfirmPickup = async () => {
    setPickingUp(true);
    try {
      const res = await base44.functions.invoke("confirmWarrantyPickup", { os_id: order.id });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      toast({ title: "Busca pessoal confirmada", description: "Produto devolvido ao cliente" });
      invalidate();
    } catch (err) {
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    } finally {
      setPickingUp(false);
    }
  };

  const nfeAuthorized = remessa?.nfe_status === "autorizado" || !!remessa?.nfe_chave;
  const nfeProcessing = remessa?.nfe_status === "processando";
  const isReturned = flowStatus === "Retornado ao Cliente";

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/20 p-3 space-y-3">
      {/* Header do fluxo */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <PackageCheck className="h-4 w-4" /> Fluxo de Garantia — Recebimento e Retorno
        </div>
        <Badge className={flowCfg.color + " gap-1"}>
          <FlowIcon className="h-3 w-3" /> {flowCfg.label}
        </Badge>
      </div>

      {/* === ETAPA 1: RECEBIMENTO === */}
      <div className="rounded-md border border-border bg-card p-3 space-y-2">
        <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">1</span>
          Recebimento do Produto na Empresa
        </div>

        {flowStatus === "Aguardando Recebimento" ? (
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Método de Recebimento</Label>
              <Select value={receiptMethod} onValueChange={setReceiptMethod}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Como o produto chegou?" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Codigo Reverso">
                    <div className="flex items-center gap-2"><Truck className="h-3.5 w-3.5" /> Código Reverso (cliente enviou)</div>
                  </SelectItem>
                  <SelectItem value="Entrega Pessoal">
                    <div className="flex items-center gap-2"><User className="h-3.5 w-3.5" /> Entrega Pessoal (cliente entregou)</div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleConfirmReceipt} disabled={confirming || !receiptMethod} size="sm" className="w-full gap-2">
              {confirming ? (
                <><div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Confirmando...</>
              ) : (
                <><PackageCheck className="h-3.5 w-3.5" /> Confirmar Recebimento</>
              )}
            </Button>
          </div>
        ) : (
          <div className="text-xs space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>Recebido por <strong>{order.warranty_receipt_by || "—"}</strong> em {fmtDateTime(order.warranty_receipt_date)}</span>
            </div>
            <div className="flex items-center gap-1.5 pl-5">
              <span className="text-muted-foreground">Método:</span>
              <Badge variant="outline" className="text-[10px]">
                {order.warranty_receipt_method === "Codigo Reverso" ? (
                  <span className="flex items-center gap-1"><Truck className="h-3 w-3" /> Código Reverso</span>
                ) : order.warranty_receipt_method === "Entrega Pessoal" ? (
                  <span className="flex items-center gap-1"><User className="h-3 w-3" /> Entrega Pessoal</span>
                ) : "—"}
              </Badge>
            </div>
          </div>
        )}
      </div>

      {/* === ETAPA 2: RETORNO === */}
      {flowStatus !== "Aguardando Recebimento" && (
        <div className="rounded-md border border-border bg-card p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">2</span>
            Retorno do Produto ao Cliente
          </div>

          {!isReturned ? (
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Método de Retorno</Label>
                <Select value={returnMethod} onValueChange={setReturnMethod}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Como o produto será devolvido?" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Melhor Envio">
                      <div className="flex items-center gap-2"><Truck className="h-3.5 w-3.5" /> Melhor Envio (empresa envia)</div>
                    </SelectItem>
                    <SelectItem value="Busca Pessoal">
                      <div className="flex items-center gap-2"><User className="h-3.5 w-3.5" /> Busca Pessoal (cliente busca)</div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Fluxo Melhor Envio: faturar remessa → gerar etiqueta */}
              {returnMethod === "Melhor Envio" && (
                <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/30 p-2">
                  {!order.warranty_remessa_id ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground flex items-start gap-1">
                        <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>Fature a nota de remessa antes de gerar a etiqueta. A remessa vai para a fila de faturamento.</span>
                      </p>
                      <Button onClick={handleBillRemessa} disabled={billingRemessa} size="sm" className="w-full gap-2">
                        {billingRemessa ? (
                          <><div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Faturando...</>
                        ) : (
                          <><FileText className="h-3.5 w-3.5" /> Faturar Remessa (NF-e)</>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Info da remessa criada */}
                      <div className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Remessa:</span>
                        <Badge variant="outline" className="font-mono text-[10px]">{order.warranty_remessa_code}</Badge>
                        <Badge variant="outline" className="text-[10px]">{remessa?.status || "—"}</Badge>
                      </div>

                      {/* Status da NF-e */}
                      {nfeProcessing && (
                        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-1">
                          <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span>NF-e em processamento na SEFAZ. Consulte o status na remessa e volte para gerar a etiqueta.</span>
                        </div>
                      )}
                      {!nfeAuthorized && !nfeProcessing && (
                        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 flex items-start gap-1">
                          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span>NF-e ainda não autorizada. Acesse a remessa {order.warranty_remessa_code} para transmitir/consultar.</span>
                        </div>
                      )}

                      {/* Seleção do serviço + gerar etiqueta */}
                      {nfeAuthorized && (
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs">Serviço dos Correios</Label>
                            <Select value={meService} onValueChange={setMeService}>
                              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="2">SEDEX (mais rápido)</SelectItem>
                                <SelectItem value="1">PAC (mais econômico)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button onClick={handleGenerateLabel} disabled={generatingLabel} size="sm" className="w-full gap-2">
                            {generatingLabel ? (
                              <><div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Gerando...</>
                            ) : (
                              <><Download className="h-3.5 w-3.5" /> Gerar Etiqueta de Retorno</>
                            )}
                          </Button>
                        </div>
                      )}

                      {/* Link para a remessa */}
                      <a
                        href={`/#/remessas/${order.warranty_remessa_id}`}
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" /> Ver remessa {order.warranty_remessa_code}
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Fluxo Busca Pessoal */}
              {returnMethod === "Busca Pessoal" && (
                <Button onClick={handleConfirmPickup} disabled={pickingUp} size="sm" variant="outline" className="w-full gap-2">
                  {pickingUp ? (
                    <><div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Confirmando...</>
                  ) : (
                    <><User className="h-3.5 w-3.5" /> Confirmar Busca Pessoal</>
                  )}
                </Button>
              )}
            </div>
          ) : (
            <div className="text-xs space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Retornado por <strong>{order.warranty_return_by || "—"}</strong> em {fmtDateTime(order.warranty_return_date)}</span>
              </div>
              <div className="flex items-center gap-1.5 pl-5">
                <span className="text-muted-foreground">Método:</span>
                <Badge variant="outline" className="text-[10px]">
                  {order.warranty_return_method === "Melhor Envio" ? (
                    <span className="flex items-center gap-1"><Truck className="h-3 w-3" /> Melhor Envio</span>
                  ) : (
                    <span className="flex items-center gap-1"><User className="h-3 w-3" /> Busca Pessoal</span>
                  )}
                </Badge>
              </div>
              {order.warranty_return_tracking_code && (
                <div className="flex items-center gap-1.5 pl-5">
                  <span className="text-muted-foreground">Rastreio:</span>
                  <span className="font-mono text-[10px]">{order.warranty_return_tracking_code}</span>
                </div>
              )}
              {order.warranty_return_label_url && (
                <a href={order.warranty_return_label_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 pl-5 text-xs text-blue-600 hover:underline">
                  <ExternalLink className="h-3 w-3" /> Ver etiqueta
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}