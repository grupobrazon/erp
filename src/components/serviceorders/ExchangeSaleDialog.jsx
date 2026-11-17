import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, AlertCircle, Package } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import ProductCombobox from "@/components/compras/ProductCombobox";

export default function ExchangeSaleDialog({ open, onOpenChange, order, parentOs, sale, anticipated = false }) {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [justification, setJustification] = useState("");
  const [generating, setGenerating] = useState(false);

  // Determina os itens devolvidos a partir das etiquetas reversas (volume_index)
  // cruzando com as labels do Melhor Envio da OS pai
  const returnedVolumes = useMemo(() => {
    const shipments = order?.reverse_shipments || [];
    const labels = parentOs?.melhor_envio_labels || [];

    // Tenta cruzar por volume_index quando há labels e shipments
    if (labels.length > 0 && shipments.length > 0) {
      const matched = shipments
        .map(rs => {
          const label = labels.find(l => Number(l.volume_index) === Number(rs.volume_index));
          if (!label) return null;
          return {
            product_id: label.product_id,
            product_name: label.product_name || `Vol. ${rs.volume_index}`,
            quantity: label.quantity || 1,
            original_product_name: label.product_name || `Vol. ${rs.volume_index}`,
            volume_index: rs.volume_index,
          };
        })
        .filter(Boolean);
      if (matched.length > 0) return matched;
    }

    // Fallback: usa os itens da venda original
    return (sale?.items || []).map(it => ({
      product_id: it.product_id,
      product_name: it.product_name,
      quantity: it.quantity,
      original_product_name: it.product_name,
    }));
  }, [order?.id, parentOs?.id, sale?.id]);

  // Inicializa os itens quando o dialog abre
  React.useEffect(() => {
    if (open && returnedVolumes.length > 0 && items.length === 0) {
      setItems(returnedVolumes.map(v => ({ ...v })));
    }
    if (!open) {
      setItems([]);
      setJustification("");
    }
  }, [open, returnedVolumes.length]);

  const handleProductChange = (index, product) => {
    setItems(prev => prev.map((it, i) =>
      i === index
        ? { ...it, product_id: product.id, product_name: product.name }
        : it
    ));
  };

  const handleGenerate = async () => {
    if (!justification.trim()) {
      toast({ title: "Justificativa obrigatória", description: "Informe o motivo da troca.", variant: "destructive" });
      return;
    }
    if (items.length === 0) {
      toast({ title: "Nenhum item", description: "Adicione pelo menos um item para a troca.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const res = await base44.functions.invoke("generateExchangeSale", {
        reverse_os_id: order.id,
        items: items.map(it => ({
          product_id: it.product_id,
          product_name: it.product_name,
          quantity: it.quantity,
        })),
        justification: justification.trim(),
        anticipated,
      });
      const data = res.data || res;
      if (data.error) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      toast({
        title: anticipated ? "Produção antecipada" : "Pedido de troca gerado",
        description: `${data.sale?.order_number} • OS ${data.service_order?.code} • Valor R$ 0,00`,
      });
      onOpenChange(false);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "Erro ao gerar pedido de troca";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <div className="flex items-center gap-3 flex-wrap">
            <RefreshCw className="h-5 w-5 text-blue-600" />
            <DialogTitle>Gerar Pedido de Troca</DialogTitle>
            <Badge className="bg-blue-100 text-blue-700">Valor R$ 0,00</Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {anticipated && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-1">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>
                <strong>Antecipação de Produção:</strong> A mercadoria devolvida ainda não chegou à empresa.
                O pedido de troca está sendo gerado antes do recebimento. Confirme o recebimento quando a mercadoria chegar.
              </span>
            </div>
          )}

          {/* Resumo */}
          <div className="rounded-md border border-blue-200 bg-blue-50/30 p-3 text-sm space-y-1">
            <div><span className="text-muted-foreground">OS Reversa:</span> <span className="font-mono font-medium">{order?.code}</span></div>
            <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{order?.client_name}</span></div>
            {sale && <div><span className="text-muted-foreground">Pedido original:</span> <span className="font-mono">{sale.order_number}</span></div>}
          </div>

          {/* Itens da troca */}
          <div className="space-y-2">
            <div className="text-sm font-medium flex items-center gap-1">
              <Package className="h-4 w-4" /> Itens da Troca
            </div>
            <p className="text-xs text-muted-foreground">
              Os itens devolvidos aparecem abaixo. Você pode trocar o produto (ex: voltagem errada) clicando no seletor. O valor será sempre R$ 0,00.
            </p>
            {items.map((it, i) => {
              const isChanged = it.product_id !== returnedVolumes[i]?.product_id;
              return (
                <div key={i} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      Item {i + 1} • Qtd: <span className="font-medium text-foreground">{it.quantity}x</span>
                    </div>
                    {isChanged && (
                      <Badge className="bg-amber-100 text-amber-700 text-xs">Produto alterado</Badge>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Produto da troca</Label>
                    <ProductCombobox
                      value={it.product_id}
                      onChange={(p) => handleProductChange(i, p)}
                    />
                  </div>
                  {isChanged && (
                    <div className="text-xs text-muted-foreground">
                      Original: <span className="line-through">{it.original_product_name}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Justificativa */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Motivo da Troca *</Label>
            <Textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Ex: Produto enviado com voltagem errada (110V ao invés de 220V)..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Esta justificativa será registrada no pedido de troca e visível para a produção/expedição.
            </p>
          </div>

          {/* Alerta de valor zerado */}
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-start gap-1">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>
              O pedido será gerado com <strong>valor total R$ 0,00</strong> (sem cobrança ao cliente).
              A OS da troca será criada automaticamente em <strong>Produção/Expedição</strong>.
              Se não houver estoque, a produção será acionada.
            </span>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generating || !justification.trim()}
              className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700"
            >
              {generating ? (
                <><div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Gerando...</>
              ) : (
                <><RefreshCw className="h-4 w-4" /> {anticipated ? "Antecipar Produção da Troca" : "Gerar Pedido de Troca"}</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}