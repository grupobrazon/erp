import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ProductCombobox from "@/components/compras/ProductCombobox";

export default function PurchaseReceivingDialog({ purchaseOrder, open, onOpenChange, onReceived }) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState([]);
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [stockLocationId, setStockLocationId] = useState("");
  const [fiscalDocUrl, setFiscalDocUrl] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceChave, setInvoiceChave] = useState("");
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [parsedSupplier, setParsedSupplier] = useState(null);

  const { data: stockLocations = [] } = useQuery({
    queryKey: ["stockLocations"],
    queryFn: () => base44.entities.StockLocation.list("-name", 100),
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => base44.entities.Product.list("-name", 500),
  });

  const isFiscal = purchaseOrder?.is_fiscal !== false;

  useEffect(() => {
    if (purchaseOrder && open) {
      setReceivedDate(new Date().toISOString().slice(0, 10));
      setStockLocationId(purchaseOrder.stock_location_id || "");
      setFiscalDocUrl(purchaseOrder.fiscal_doc_url || "");
      setInvoiceNumber(purchaseOrder.invoice_number || "");
      setInvoiceChave(purchaseOrder.invoice_chave || "");
      setParsedSupplier(null);
      setItems((purchaseOrder.items || []).map(it => ({
        external_code: "", name: it.product_name, quantity: it.quantity, unit_cost: it.unit_cost,
        total: it.total, product_id: it.product_id, product_name: it.product_name,
      })));
    }
  }, [purchaseOrder, open]);

  const matchProduct = (parsedItem) => {
    const poItem = (purchaseOrder?.items || []).find(pi => (pi.product_name || "").toLowerCase() === (parsedItem.name || "").toLowerCase());
    if (poItem) return { product_id: poItem.product_id, product_name: poItem.product_name };
    const byCode = products.find(p => p.code && p.code === parsedItem.external_code);
    if (byCode) return { product_id: byCode.id, product_name: byCode.name };
    return { product_id: "", product_name: "" };
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFiscalDocUrl(file_url);
      if (isFiscal) {
        setProcessing(true);
        const res = await base44.functions.invoke("parsePurchaseXml", { file_url });
        const data = res.data || res;
        if (data.error) throw new Error(data.error);
        setParsedSupplier(data.supplier);
        if (data.invoice) {
          setInvoiceNumber(data.invoice.number || "");
          setInvoiceChave(data.invoice.chave || "");
        }
        setItems((data.items || []).map(it => {
          const m = matchProduct(it);
          return { external_code: it.external_code, name: it.name, quantity: it.quantity, unit_cost: it.unit_cost, total: it.total, product_id: m.product_id, product_name: m.product_name };
        }));
        setProcessing(false);
      }
    } catch (err) {
      alert("Erro ao importar: " + (err?.message || err));
      setProcessing(false);
    } finally {
      setUploading(false);
    }
  };

  const updateItem = (idx, patch) => setItems(prev => {
    const arr = [...prev];
    arr[idx] = { ...arr[idx], ...patch };
    arr[idx].total = (arr[idx].quantity || 0) * (arr[idx].unit_cost || 0);
    return arr;
  });

  const handleConfirm = async () => {
    if (!stockLocationId) {
      alert("Selecione o local de estoque para dar entrada nos itens.");
      return;
    }
    const payload = {
      purchase_order_id: purchaseOrder.id,
      received_date: receivedDate,
      fiscal_doc_url: fiscalDocUrl,
      invoice_number: invoiceNumber,
      invoice_chave: invoiceChave,
      stock_location_id: stockLocationId,
      stock_location_name: stockLocations.find(l => l.id === stockLocationId)?.name || "",
      items: items.filter(it => it.product_id && it.quantity > 0).map(it => ({
        product_id: it.product_id, product_name: it.product_name,
        quantity: it.quantity, unit_cost: it.unit_cost, total: it.total,
      })),
    };
    try {
      setProcessing(true);
      const res = await base44.functions.invoke("receivePurchase", payload);
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] });
      queryClient.invalidateQueries({ queryKey: ["accountsPayable"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      onReceived();
      onOpenChange(false);
    } catch (err) {
      alert("Erro ao receber: " + (err?.message || err));
    } finally {
      setProcessing(false);
    }
  };

  if (!purchaseOrder) return null;
  const totalReceived = items.reduce((s, it) => s + (it.total || 0), 0);
  const allMapped = items.every(it => it.product_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Recebimento de Compra
            <Badge variant="outline" className="text-[10px]">{isFiscal ? "Fiscal (NF-e)" : "Não Fiscal"}</Badge>
            <Badge variant="outline" className="font-mono text-[10px]">{purchaseOrder.code}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border p-3 bg-muted/30 text-sm space-y-1">
            <div><span className="text-muted-foreground">Fornecedor: </span>{parsedSupplier?.name || purchaseOrder.supplier_name}</div>
            <div><span className="text-muted-foreground">Documento: </span>{parsedSupplier?.document || purchaseOrder.supplier_document || "—"}</div>
            {invoiceNumber && <div><span className="text-muted-foreground">Nota Fiscal: </span>{invoiceNumber}{invoiceChave && <span className="text-muted-foreground text-xs"> · Chave: {invoiceChave}</span>}</div>}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">{isFiscal ? "Importar XML da NF-e" : "Anexar PDF do Pedido"}</Label>
              <div className="flex items-center gap-2 mt-1">
                <label className="cursor-pointer">
                  <input type="file" accept={isFiscal ? ".xml,application/xml" : ".pdf"} onChange={handleFile} className="hidden" disabled={uploading || processing} />
                  <span className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent">
                    <Upload className="h-3 w-3" /> {uploading ? "Enviando..." : isFiscal ? "Enviar XML" : "Enviar PDF"}
                  </span>
                </label>
                {fiscalDocUrl && <a href={fiscalDocUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">ver arquivo</a>}
              </div>
            </div>
            <div>
              <Label className="text-xs">Data de Recebimento</Label>
              <Input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Local de Estoque</Label>
              <Select value={stockLocationId || "none"} onValueChange={v => setStockLocationId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {stockLocations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {processing && (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Processando {isFiscal ? "XML..." : "..."}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">De-para com Produtos do Estoque</Label>
              <span className="text-xs text-muted-foreground">{items.length} item(ns)</span>
            </div>
            <div className="rounded-lg border divide-y">
              {items.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground text-center">{isFiscal ? "Importe o XML para carregar os itens da nota." : "Nenhum item no pedido."}</p>
              ) : items.map((it, idx) => (
                <div key={idx} className="p-2 grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4 text-xs">
                    <p className="font-medium truncate">{it.name}</p>
                    {it.external_code && <p className="text-muted-foreground font-mono">{it.external_code}</p>}
                  </div>
                  <div className="col-span-4">
                    <ProductCombobox value={it.product_id} onChange={(p) => updateItem(idx, { product_id: p?.id || "", product_name: p?.name || "" })} />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" min="0" step="0.01" value={it.quantity} onChange={e => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="col-span-2 text-right text-sm font-medium">R$ {(it.total || 0).toFixed(2)}</div>
                </div>
              ))}
            </div>
            {!allMapped && items.length > 0 && (
              <p className="text-xs text-amber-600 mt-1">⚠ Itens não mapeados a um produto do estoque serão ignorados na entrada.</p>
            )}
          </div>

          <div className="flex justify-between items-center rounded-lg border p-3 bg-muted/30">
            <div className="text-sm">
              <p className="text-muted-foreground">Total Recebido</p>
              <p className="font-bold text-lg">R$ {totalReceived.toFixed(2)}</p>
            </div>
            <p className="text-xs text-muted-foreground max-w-xs text-right">Será gerada a entrada no estoque e o(s) contas a pagar conforme a condição de pagamento do pedido.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={processing || items.filter(i => i.product_id).length === 0} className="gap-1">
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Confirmar Recebimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}