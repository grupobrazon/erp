import React, { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import moment from "moment";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { createWithCode } from "@/lib/codeGeneration";
import PageHeader from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, Plus, Printer, ShoppingCart, Paperclip, Eye, X } from "lucide-react";
import BalcaoProductCombobox from "@/components/balcao/BalcaoProductCombobox";
import SignaturePad from "@/components/balcao/SignaturePad";
import PaymentConditionCombobox from "@/components/sales/PaymentConditionCombobox";
import ClientSearchInput from "@/components/sales/ClientSearchInput";

const BRL = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function VendaBalcao() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const sigRef = useRef(null);

  const [items, setItems] = useState([]);
  const [pendingProduct, setPendingProduct] = useState(null);
  const [pendingQty, setPendingQty] = useState(1);
  const [pendingPrice, setPendingPrice] = useState(0);
  const [paymentConditionId, setPaymentConditionId] = useState("");
  const [receivedAmount, setReceivedAmount] = useState(0);
  const [sellerId, setSellerId] = useState("");
  const [clientId, setClientId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [receiptUrl, setReceiptUrl] = useState("");
  const [receiptName, setReceiptName] = useState("");
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const receiptInputRef = useRef(null);

  const { data: paymentConditions = [] } = useQuery({
    queryKey: ["paymentConditions"],
    queryFn: () => base44.entities.PaymentCondition.list("-created_date", 200),
  });
  const { data: sellers = [] } = useQuery({
    queryKey: ["sellers-balcao"],
    queryFn: () => base44.entities.Seller.list("-name", 200),
  });

  const total = items.reduce((s, it) => s + it.total, 0);
  const change = Math.max(0, (Number(receivedAmount) || 0) - total);

  const addProduct = () => {
    if (!pendingProduct) {
      toast({ variant: "destructive", title: "Selecione um produto" });
      return;
    }
    if (Number(pendingQty) < 1) {
      toast({ variant: "destructive", title: "Quantidade inválida" });
      return;
    }
    const qty = Number(pendingQty);
    const unit = Number(pendingPrice) || 0;
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === pendingProduct.id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === pendingProduct.id
            ? { ...i, quantity: i.quantity + qty, unit_price: unit || i.unit_price, total: (i.quantity + qty) * (unit || i.unit_price) }
            : i
        );
      }
      return [
        ...prev,
        {
          product_id: pendingProduct.id,
          product_name: pendingProduct.name,
          quantity: qty,
          unit_price: unit,
          total: qty * unit,
          generate_equipment: false,
        },
      ];
    });
    setPendingProduct(null);
    setPendingQty(1);
    setPendingPrice(0);
  };

  const removeItem = (id) => setItems((p) => p.filter((i) => i.product_id !== id));

  const printCupom = (sale) => {
    const w = window.open("", "_blank", "width=380,height=600");
    const itemsHtml = sale.items
      .map((i) => `<tr><td>${i.quantity}x ${i.product_name}</td><td style="text-align:right">${BRL(i.total)}</td></tr>`)
      .join("");
    w.document.write(`<html><head><title>Cupom ${sale.order_number}</title><style>
      body{font-family:monospace;font-size:12px;padding:8px;color:#000}
      h2{text-align:center;margin:4px 0}.c{text-align:center}
      table{width:100%;border-collapse:collapse;margin-top:6px}td{padding:1px 0}
      .t{border-top:1px dashed #000;margin-top:6px;padding-top:6px}
    </style></head><body>
      <h2>BRAZON</h2>
      <div class="c">Cupom de Venda de Balcão</div>
      <div class="c">${sale.order_number} - ${moment(sale.date).format("DD/MM/YYYY HH:mm")}</div>
      <table>${itemsHtml}</table>
      <div class="t"><b>Total: ${BRL(sale.grand_total)}</b></div>
      <div>Recebido: ${BRL(sale.received_amount)}</div>
      <div>Troco: ${BRL(sale.change_amount)}</div>
      <div>Cliente: ${sale.client_name}</div>
      <div style="margin-top:18px;border-bottom:1px solid #000;height:40px"></div>
      <div class="c" style="margin-top:4px">Assinatura do cliente</div>
    </body></html>`);
    w.document.close();
    w.print();
  };

  const finalize = async () => {
    if (items.length === 0) {
      toast({ variant: "destructive", title: "Adicione ao menos um produto" });
      return;
    }
    if (!paymentConditionId) {
      toast({ variant: "destructive", title: "Selecione a condição de pagamento" });
      return;
    }
    if (sigRef.current?.isEmpty()) {
      toast({ variant: "destructive", title: "Assinatura obrigatória", description: "O cliente deve assinar a retirada do produto." });
      return;
    }
    const cond = paymentConditions.find((c) => c.id === paymentConditionId);
    if (!cond) {
      toast({ variant: "destructive", title: "Condição de pagamento inválida" });
      return;
    }
    const recAmt = Number(receivedAmount) || 0;
    if (recAmt < total) {
      toast({ variant: "destructive", title: "Valor recebido menor que o total" });
      return;
    }
    setSubmitting(true);
    try {
      const now = moment();
      let client;
      if (clientId) {
        client = await base44.entities.Client.get(clientId);
      } else {
        const stamp = now.format("DD/MM/YY HH:mm");
        const res = await createWithCode("client", {
          name: `Balcão ${stamp}`,
          person_type: "Física",
          document: "",
          base_type: "Novo",
          is_active: true,
          registration_date: now.format("YYYY-MM-DD"),
        });
        client = res.record;
      }

      const blob = await sigRef.current.getBlob();
      const file = new File([blob], `assinacao-${client.new_code}.png`, { type: "image/png" });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      let paymentReceiptUrl = receiptUrl;
      if (receiptInputRef.current?.files?.[0] && !receiptUrl) {
        const receiptFile = receiptInputRef.current.files[0];
        const uploaded = await base44.integrations.Core.UploadFile({ file: receiptFile });
        paymentReceiptUrl = uploaded.file_url;
      }

      const today = now.format("YYYY-MM-DD");
      const { record: sale } = await createWithCode("sale", {
        is_counter_sale: true,
        client_id: client.id,
        client_name: client.name,
        date: today,
        delivery_modality: "Entrega Própria",
        items,
        total,
        grand_total: total,
        received_amount: recAmt,
        change_amount: change,
        payments: [
          { condition_id: cond.id, condition_name: cond.name, amount: total, payment_status: "Realizada", receipt_url: paymentReceiptUrl || "" },
        ],
        stage: "Concluída",
        confirmation_type: "Total",
        counter_sale_signature_url: file_url,
        seller_id: sellerId || "",
        seller_name: sellers.find((s) => s.id === sellerId)?.name || user?.full_name || "",
      });

      setLastSale(sale);
      setItems([]);
      setPaymentConditionId("");
      setReceivedAmount(0);
      setSellerId("");
      setClientId("");
      setReceiptUrl("");
      setReceiptName("");
      if (receiptInputRef.current) receiptInputRef.current.value = "";
      sigRef.current?.clear();
      qc.invalidateQueries({ queryKey: ["sales"] });
      toast({ title: "Venda de balcão finalizada", description: `Pedido ${sale.order_number} registrado.` });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao finalizar", description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <PageHeader title="Venda de Balcão" description="Retirada no balcão com assinatura. Cliente opcional, não gera OS." />

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="grid md:grid-cols-[1fr_80px_120px_auto] gap-2 items-end">
            <div className="space-y-1">
              <Label>Produto</Label>
              <BalcaoProductCombobox
                value={pendingProduct?.id}
                onChange={(p) => { setPendingProduct(p); setPendingPrice(p?.sale_price || 0); }}
              />
            </div>
            <div className="space-y-1">
              <Label>Qtd</Label>
              <Input type="number" min={1} value={pendingQty} onChange={(e) => setPendingQty(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Preço unit.</Label>
              <Input type="number" min={0} step="0.01" value={pendingPrice} onChange={(e) => setPendingPrice(e.target.value)} />
            </div>
            <Button type="button" onClick={addProduct}><Plus className="h-4 w-4" /> Add</Button>
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum item adicionado.</p>
          ) : (
            <div className="border rounded-md divide-y">
              {items.map((it) => (
                <div key={it.product_id} className="flex items-center justify-between p-2">
                  <div>
                    <div className="font-medium text-sm">{it.product_name}</div>
                    <div className="text-xs text-muted-foreground">{it.quantity} x {BRL(it.unit_price)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{BRL(it.total)}</span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(it.product_id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end text-lg font-bold">Total: {BRL(total)}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Condição de pagamento</Label>
              <PaymentConditionCombobox conditions={paymentConditions} value={paymentConditionId} onChange={setPaymentConditionId} placeholder="Selecione a condição" />
            </div>
            <div className="space-y-1">
              <Label>Vendedor</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={sellerId}
                onChange={(e) => setSellerId(e.target.value)}
              >
                <option value="">Selecione...</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Valor recebido</Label>
              <Input type="number" min={0} step="0.01" value={receivedAmount} onChange={(e) => setReceivedAmount(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end text-sm">Troco: <b className="ml-1">{BRL(change)}</b></div>

          <div className="space-y-1 pt-2 border-t">
            <Label>Comprovante de pagamento (opcional)</Label>
            <input
              ref={receiptInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploadingReceipt(true);
                try {
                  const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
                  setReceiptUrl(file_url);
                  setReceiptName(f.name);
                  toast({ title: "Comprovante anexado" });
                } catch (err) {
                  toast({ variant: "destructive", title: "Erro ao anexar", description: err.message });
                } finally {
                  setUploadingReceipt(false);
                }
              }}
            />
            {receiptUrl ? (
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm truncate">{receiptName || "comprovante"}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button type="button" variant="ghost" size="icon" onClick={() => window.open(receiptUrl, "_blank")} title="Visualizar">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => { setReceiptUrl(""); setReceiptName(""); if (receiptInputRef.current) receiptInputRef.current.value = ""; }} title="Remover">
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => receiptInputRef.current?.click()} disabled={uploadingReceipt}>
                <Paperclip className="h-4 w-4" /> {uploadingReceipt ? "Enviando..." : "Anexar comprovante"}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">Imagem ou PDF. Anexo opcional, não impede a finalização.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-6">
          <Label>Cliente (opcional)</Label>
          <p className="text-xs text-muted-foreground">Se não informado, será registrado como cliente de balcão não identificado.</p>
          <ClientSearchInput value={clientId} onChange={setClientId} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <SignaturePad ref={sigRef} />
        </CardContent>
      </Card>

      <div className="flex gap-2 justify-end">
        {lastSale && (
          <Button type="button" variant="outline" onClick={() => printCupom(lastSale)}>
            <Printer className="h-4 w-4" /> Imprimir cupom ({lastSale.order_number})
          </Button>
        )}
        <Button type="button" onClick={finalize} disabled={submitting}>
          <ShoppingCart className="h-4 w-4" /> {submitting ? "Finalizando..." : "Finalizar venda"}
        </Button>
      </div>
    </div>
  );
}