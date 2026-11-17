import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, AlertCircle, CheckCircle2, DollarSign, ArrowRight, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function CarrierChangePanel({ sale, order, currentUser, volumesOutdated }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const quotes = sale?.shipping_quote_history || [];
  const selectedQuote = quotes.find(q => q.selected) || quotes[quotes.length - 1] || null;

  const [selectedQuoteIdx, setSelectedQuoteIdx] = useState(
    selectedQuote ? quotes.findIndex(q => q === selectedQuote) : -1
  );
  const [diffAction, setDiffAction] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [requoting, setRequoting] = useState(false);
  const [requotError, setRequotError] = useState("");

  const originalCarrier = sale?.selected_carrier || selectedQuote?.company_name || "";
  const originalService = sale?.selected_service || selectedQuote?.service_name || "";
  const originalPrice = selectedQuote?.price || 0;

  const newQuote = selectedQuoteIdx >= 0 ? quotes[selectedQuoteIdx] : null;
  const newPrice = newQuote?.price || 0;
  const priceDiff = newQuote ? newPrice - originalPrice : 0;
  const hasDiff = priceDiff > 0.01;
  const hasChange = newQuote && newQuote !== selectedQuote;

  if (quotes.length === 0) return null;

  const alreadyChanged = order.freight_changed_at;

  const handleRequote = async () => {
    setRequoting(true);
    setRequotError("");
    try {
      let originZip = "";
      if (sale.billing_location_id) {
        const bl = await base44.entities.BillingLocation.get(sale.billing_location_id);
        originZip = bl?.zip_code || "";
      }
      if (!originZip) {
        setRequotError("CEP de origem não encontrado no local de faturamento.");
        return;
      }

      const destZip = sale.delivery_address?.zip_code || sale.billing_address?.zip_code || "";
      if (!destZip) {
        setRequotError("CEP de destino não encontrado na venda.");
        return;
      }

      const volumes = sale.shipping_volumes || [];
      if (volumes.length === 0) {
        setRequotError("Nenhum volume de envio cadastrado na venda.");
        return;
      }

      const volQuotes = await Promise.all(volumes.map(async (vol) => {
        const res = await base44.functions.invoke("melhorEnvioQuote", {
          from_postal_code: originZip,
          to_postal_code: destZip,
          products: [{
            id: String(vol.index || 1),
            width: Number(vol.width) || 10,
            height: Number(vol.height) || 10,
            length: Number(vol.length) || 10,
            weight: Number(vol.weight) || 0.3,
            insurance_value: Number(vol.insurance_value) || 0,
            quantity: 1,
          }],
          environment: "production",
        });
        const data = res.data || res;
        if (data.error) return [];
        return (data.quotes || []).filter(q => q.custom_price && !q.error);
      }));

      const validIdxs = volQuotes.map((qs, i) => qs.length > 0 ? i : -1).filter(i => i >= 0);
      if (validIdxs.length === 0) {
        setRequotError("Nenhuma cotação disponível para os CEPs/volumes informados.");
        return;
      }

      const first = volQuotes[validIdxs[0]];
      const common = first.filter(q =>
        validIdxs.every(vi => volQuotes[vi].some(qq => qq.service_id === q.service_id))
      );

      const uniqueQuotes = (common.length > 0 ? common : first).map(q => ({
        // O Melhor Envio retorna service_id/delivery_time numéricos, mas o histórico da
        // venda exige texto — normaliza antes de salvar para não falhar na validação.
        service_id: String(q.service_id ?? ""),
        service_name: String(q.service_name ?? ""),
        company_name: String(q.company_name ?? ""),
        price: Number(q.custom_price ?? q.price ?? 0),
        delivery_time: String(q.custom_delivery_time ?? q.delivery_time ?? ""),
        selected: false,
        date: new Date().toISOString(),
        volumes_count: volumes.length,
      }));

      // Preserva o flag selected das cotações existentes — ele só é redefinido ao confirmar
      // a troca (handleConfirm). Zerar todos os flags aqui deixaria a venda sem cotação
      // selecionada se o usuário fechasse o painel sem confirmar, bloqueando a geração de etiqueta.
      const updatedHistory = [
        ...quotes,
        ...uniqueQuotes,
      ];

      await base44.entities.Sale.update(sale.id, {
        shipping_quote_history: updatedHistory,
      });

      queryClient.invalidateQueries({ queryKey: ["sale"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });

      toast({ title: "Cotações atualizadas", description: `${uniqueQuotes.length} transportadoras disponíveis para seleção.` });
    } catch (err) {
      setRequotError(err.message || "Erro ao re-cotar fretes.");
    } finally {
      setRequoting(false);
    }
  };

  const handleConfirm = async () => {
    if (!newQuote) return;
    if (hasDiff && !diffAction) {
      toast({ title: "Selecione uma ação para a diferença de frete", variant: "destructive" });
      return;
    }
    if (diffAction === "charge" && !paymentMethod) {
      toast({ title: "Selecione a forma de pagamento", variant: "destructive" });
      return;
    }
    if (!reason.trim()) {
      toast({ title: "Informe o motivo da troca", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const updatedHistory = quotes.map((q, i) => ({
        ...q,
        selected: i === selectedQuoteIdx,
      }));

      const saleUpdate = {
        selected_carrier: newQuote.company_name,
        selected_service: newQuote.service_name,
        shipping_quote_history: updatedHistory,
      };

      if (diffAction === "charge") {
        saleUpdate.freight = newPrice;
        saleUpdate.grand_total = (sale.total || 0) + (sale.additions || 0) + newPrice - (sale.discount || 0);
      } else {
        // Diferença isentada (ou sem diferença): o pedido não pode ficar com o frete zerado —
        // sem valor no frete a emissão da NF-e fica bloqueada. O cliente mantém o frete original.
        const keptFreight = originalPrice > 0 ? originalPrice : newPrice;
        saleUpdate.freight = keptFreight;
        saleUpdate.grand_total = (sale.total || 0) + (sale.additions || 0) + keptFreight + (sale.displacement_fee || 0) - (sale.discount || 0);
      }

      await base44.entities.Sale.update(sale.id, saleUpdate);

      const osUpdate = {
        freight_diff_amount: priceDiff,
        freight_diff_exempt: diffAction === "exempt",
        freight_diff_exempt_value: diffAction === "exempt" ? priceDiff : 0,
        freight_diff_charged: diffAction === "charge",
        freight_diff_payment_method: diffAction === "charge" ? paymentMethod : "",
        freight_change_reason: reason,
        original_selected_carrier: originalCarrier,
        original_selected_service: originalService,
        original_freight_value: originalPrice,
        freight_changed_by: currentUser?.full_name || "Pós-Vendas",
        freight_changed_at: new Date().toISOString(),
      };

      await base44.entities.ServiceOrder.update(order.id, osUpdate);

      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["sale"] });

      toast({
        title: "Transportadora alterada",
        description: `${originalCarrier} → ${newQuote.company_name}${hasDiff ? (diffAction === "exempt" ? " — diferença isentada" : " — cobrar do cliente") : ""}`,
      });
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border border-violet-200 bg-violet-50/30 p-3 space-y-3">
      <div className="flex items-center gap-1 text-sm font-semibold text-violet-800">
        <Truck className="h-4 w-4" /> Alterar Transportadora (Pós-Vendas)
      </div>

      {alreadyChanged ? (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>Transportadora alterada em {new Date(order.freight_changed_at).toLocaleString("pt-BR")}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Original:</span>
              <span className="font-medium line-through">{order.original_selected_carrier}</span>
            </div>
            <div className="flex items-center gap-1">
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">{sale?.selected_carrier}</span>
            </div>
            <div><span className="text-muted-foreground">Serviço original:</span> {order.original_selected_service}</div>
            <div><span className="text-muted-foreground">Serviço atual:</span> {sale?.selected_service}</div>
            <div><span className="text-muted-foreground">Valor original:</span> R$ {(order.original_freight_value || 0).toFixed(2)}</div>
            <div><span className="text-muted-foreground">Valor atual:</span> R$ {(sale?.freight || 0).toFixed(2)}</div>
            {order.freight_diff_exempt && (
              <div className="flex items-center gap-1">
                <Badge className="bg-emerald-100 text-emerald-700 border-transparent">Isentada</Badge>
                <span>R$ {(order.freight_diff_exempt_value || 0).toFixed(2)}</span>
              </div>
            )}
            {order.freight_diff_charged && (
              <div className="flex items-center gap-1">
                <Badge className="bg-amber-100 text-amber-700 border-transparent">Cobrada</Badge>
                <span>{order.freight_diff_payment_method}</span>
              </div>
            )}
            <div className="col-span-2"><span className="text-muted-foreground">Motivo:</span> {order.freight_change_reason}</div>
            <div className="col-span-2"><span className="text-muted-foreground">Alterado por:</span> {order.freight_changed_by}</div>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs">
            <div className="text-muted-foreground">Selecionado pelo vendedor:</div>
            <div className="font-medium">{originalCarrier} — {originalService} | R$ {originalPrice.toFixed(2)}</div>
          </div>

          <div className="space-y-2">
            <Button variant="outline" size="sm" className="gap-1 w-full" onClick={handleRequote} disabled={requoting}>
              {requoting ? (
                <><div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Re-cotando fretes...</>
              ) : (
                <><RefreshCw className="h-3.5 w-3.5" /> Re-cotar Fretes (buscar transportadoras disponíveis)</>
              )}
            </Button>
            {requotError && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 flex items-start gap-1">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span className="break-words whitespace-normal">{requotError}</span>
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Selecionar transportadora diferente</Label>
            <Select value={String(selectedQuoteIdx)} onValueChange={v => { setSelectedQuoteIdx(Number(v)); setDiffAction(null); setPaymentMethod(""); }}>
              <SelectTrigger><SelectValue placeholder="Selecione a transportadora" /></SelectTrigger>
              <SelectContent>
                {quotes.map((q, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {q.company_name} — {q.service_name} | R$ {(q.price || 0).toFixed(2)} | {q.delivery_time || "?"} dias
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {hasChange && (
            <div className={`rounded p-2 text-sm ${hasDiff ? "bg-amber-100 border border-amber-300" : "bg-emerald-100 border border-emerald-300"}`}>
              {hasDiff ? (
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <span>Diferença de <strong>R$ {priceDiff.toFixed(2)}</strong> a mais — selecione uma ação:</span>
                </div>
              ) : priceDiff < -0.01 ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Economia de <strong>R$ {Math.abs(priceDiff).toFixed(2)}</strong> — sem cobrança adicional.</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Mesmo valor — sem diferença.</span>
                </div>
              )}
            </div>
          )}

          {hasChange && hasDiff && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={diffAction === "exempt" ? "default" : "outline"}
                size="sm"
                className="gap-1"
                onClick={() => setDiffAction("exempt")}
              >
                <DollarSign className="h-3 w-3" /> Isentar Diferença
              </Button>
              <Button
                variant={diffAction === "charge" ? "default" : "outline"}
                size="sm"
                className="gap-1"
                onClick={() => setDiffAction("charge")}
              >
                <DollarSign className="h-3 w-3" /> Cobrar do Cliente
              </Button>
            </div>
          )}

          {diffAction === "charge" && (
            <div>
              <Label className="text-xs">Forma de Pagamento da Diferença</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="Cartão de Crédito">Cartão de Crédito</SelectItem>
                  <SelectItem value="Cartão de Débito">Cartão de Débito</SelectItem>
                  <SelectItem value="Boleto">Boleto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {hasChange && (
            <div>
              <Label className="text-xs">Motivo da troca *</Label>
              <Textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex: transportadora original sem coleta, prazo maior, etc." />
            </div>
          )}

          {hasChange && (
            <Button
              onClick={handleConfirm}
              disabled={saving || (hasDiff && !diffAction) || (diffAction === "charge" && !paymentMethod) || !reason.trim()}
              className="w-full gap-2"
            >
              {saving ? "Salvando..." : <><CheckCircle2 className="h-4 w-4" /> Confirmar Troca de Transportadora</>}
            </Button>
          )}
        </>
      )}
    </div>
  );
}