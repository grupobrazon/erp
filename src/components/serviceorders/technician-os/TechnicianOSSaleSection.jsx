import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Trash2, Plus, ChevronDown, ChevronUp, CreditCard, CheckCircle2, Paperclip, ExternalLink, Camera } from "lucide-react";
import ProductCombobox from "@/components/compras/ProductCombobox";
import { base44 } from "@/api/base44Client";
import { getInstallmentBracket } from "@/lib/salePricingRules";

const PAYMENT_METHODS = [
  { value: "PIX", label: "PIX" },
  { value: "Cartão de Débito", label: "Cartão de Débito" },
  { value: "Cartão de Crédito", label: "Cartão de Crédito" },
  { value: "Dinheiro", label: "Dinheiro" },
];

export default function TechnicianOSSaleSection({ form, setForm, readOnly }) {
  const [showItems, setShowItems] = useState((form.technician_sale_items || []).length > 0 || (form.technician_sale_total || 0) > 0);
  const [newQty, setNewQty] = useState(1);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const items = form.technician_sale_items || [];
  const itemsTotal = items.reduce((sum, i) => sum + (i.total || i.quantity * i.unit_price || 0), 0);
  const manualTotal = form.technician_sale_total || 0;
  const total = manualTotal > 0 ? manualTotal : itemsTotal;
  const bracket = getInstallmentBracket(total);
  const isCreditCard = form.technician_sale_payment_method === "Cartão de Crédito";
  const hasItems = items.length > 0;
  const hasPaymentMethod = !!form.technician_sale_payment_method;
  const hasSaleValue = total > 0;

  const addProduct = (product) => {
    if (!product?.id) return;
    const qty = Number(newQty) || 1;
    const item = {
      product_id: product.id,
      product_name: product.name,
      quantity: qty,
      unit_price: product.sale_price || 0,
      total: qty * (product.sale_price || 0),
    };
    const newItems = [...items, item];
    const newTotal = newItems.reduce((s, i) => s + (i.total || 0), 0);
    setForm(p => ({ ...p, technician_sale_items: newItems, technician_sale_total: newTotal }));
    setNewQty(1);
  };

  const updateItem = (idx, field, value) => {
    const updated = items.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, [field]: Number(value) || 0 };
      next.total = (next.quantity || 0) * (next.unit_price || 0);
      return next;
    });
    const newTotal = updated.reduce((s, i) => s + (i.total || 0), 0);
    setForm(p => ({ ...p, technician_sale_items: updated, technician_sale_total: newTotal }));
  };

  const removeItem = (idx) => {
    const updated = items.filter((_, i) => i !== idx);
    const newTotal = updated.reduce((s, i) => s + (i.total || 0), 0);
    setForm(p => ({ ...p, technician_sale_items: updated, technician_sale_total: newTotal }));
  };

  const handleMethodChange = (method) => {
    setForm(p => ({
      ...p,
      technician_sale_payment_method: method,
      technician_sale_installments: method === "Cartão de Crédito" ? 1 : null,
    }));
  };

  const uploadReceipt = async (file) => {
    setUploadingReceipt(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      setForm(p => ({ ...p, technician_sale_signature_url: file_url }));
    } catch (err) {
      console.error(err);
    } finally {
      setUploadingReceipt(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Itens vendidos pelo técnico na casa do cliente — cobrados à parte dos serviços da venda original. O sistema gera um pedido de venda em nome do técnico vinculado a esta OS (sem gerar nova OS).</p>

      {/* Toggle: Deseja lançar mais itens? */}
      <Button
        type="button"
        variant={showItems ? "secondary" : "outline"}
        size="sm"
        className="w-full gap-1"
        onClick={() => setShowItems(s => !s)}
        disabled={readOnly}
      >
        {showItems ? <ChevronUp className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        {showItems ? "Fechar lançamento de venda" : "Deseja lançar uma venda?"}
      </Button>

      {showItems && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
            <div className="sm:col-span-1">
              <Label className="text-xs">Qtd</Label>
              <Input type="number" min="1" value={newQty} onChange={e => setNewQty(e.target.value)} disabled={readOnly} />
            </div>
            <div className="sm:col-span-4">
              <Label className="text-xs">Produto / Item</Label>
              <ProductCombobox value="" onChange={addProduct} />
            </div>
          </div>

          {hasItems && (
            <div className="rounded-md border divide-y">
              {items.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-2 text-sm gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate block">{item.product_name}</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Input type="number" min="1" className="h-7 w-16 text-xs" value={item.quantity} onChange={e => updateItem(i, "quantity", e.target.value)} disabled={readOnly} />
                      <span className="text-muted-foreground text-xs">×</span>
                      <Input type="number" step="0.01" className="h-7 w-20 text-xs" value={item.unit_price} onChange={e => updateItem(i, "unit_price", e.target.value)} disabled={readOnly} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">R$ {(item.total || 0).toFixed(2)}</Badge>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeItem(i)} disabled={readOnly}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between p-2 text-sm font-medium bg-muted/30">
                <span>Total Calculado dos Itens</span>
                <span>R$ {itemsTotal.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Valor total da venda — editável pelo técnico */}
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1">
            <Label className="text-xs font-semibold">Valor Total da Venda *</Label>
            <p className="text-xs text-muted-foreground">Informe o valor total cobrado do cliente. Se houver itens acima, o valor padrão será o total calculado — ajuste se necessário.</p>
            <Input
              type="number"
              step="0.01"
              min="0"
              className="text-lg font-bold"
              value={total || ""}
              onChange={e => setForm(p => ({ ...p, technician_sale_total: Number(e.target.value) || 0 }))}
              disabled={readOnly}
              placeholder="0,00"
            />
          </div>

          {/* Forma de Pagamento */}
          <div>
            <Label className="text-xs">Forma de Pagamento</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PAYMENT_METHODS.map(m => (
                <Button
                  key={m.value}
                  type="button"
                  variant={form.technician_sale_payment_method === m.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleMethodChange(m.value)}
                  disabled={readOnly}
                  className="gap-1"
                >
                  <CreditCard className="h-3 w-3" /> {m.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Maquininha parcelada — apenas Cartão de Crédito */}
          {isCreditCard && (
            <div>
              <Label className="text-xs">
                Parcelas (Maquininha) — <span className="text-muted-foreground">{bracket.label}</span>
              </Label>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {Array.from({ length: bracket.maxInstallments }, (_, i) => i + 1).map(n => (
                  <Button
                    key={n}
                    type="button"
                    variant={(form.technician_sale_installments || 1) === n ? "default" : "outline"}
                    size="sm"
                    onClick={() => setForm(p => ({ ...p, technician_sale_installments: n }))}
                    disabled={readOnly}
                  >
                    {n}x
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Comprovante de Pagamento — anexar foto/arquivo (obrigatório quando há valor de venda e forma de pagamento) */}
          {hasSaleValue && hasPaymentMethod && (
            <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 space-y-2">
              <Label className="text-xs font-semibold text-amber-700">Comprovante de Pagamento *</Label>
              <p className="text-xs text-muted-foreground">Anexe a foto ou arquivo do comprovante de pagamento da venda do técnico.</p>
              <div className="flex items-center gap-2">
                {form.technician_sale_signature_url ? (
                  <>
                    <Button variant="outline" size="sm" asChild>
                      <a href={form.technician_sale_signature_url} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3 w-3" /> Ver Comprovante
                      </a>
                    </Button>
                    {!readOnly && (
                      <Button variant="ghost" size="sm" onClick={() => document.getElementById("tech-sale-receipt-upload").click()}>
                        <Paperclip className="h-3 w-3" /> Trocar
                      </Button>
                    )}
                  </>
                ) : (
                  !readOnly && (
                    <Button variant="outline" size="sm" onClick={() => document.getElementById("tech-sale-receipt-upload").click()} disabled={uploadingReceipt}>
                      <Camera className="h-3 w-3" /> {uploadingReceipt ? "Enviando..." : "Anexar Comprovante"}
                    </Button>
                  )
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  id="tech-sale-receipt-upload"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadReceipt(f); }}
                />
              </div>
              {form.technician_sale_signature_url && (
                <div className="flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" /> Comprovante anexado
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}