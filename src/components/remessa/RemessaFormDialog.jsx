import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2, Search } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useQuery } from "@tanstack/react-query";
import ClientSearchInput from "@/components/sales/ClientSearchInput";

const naturezaMap = {
  "Demonstração": "Remessa de mercadoria para demonstração",
  "Remessa": "Remessa de mercadoria",
  "Consignação": "Remessa de mercadoria em consignação",
  "Devolução": "Devolução de mercadoria",
  "Retorno": "Retorno de mercadoria",
};

export default function RemessaFormDialog({ open, onOpenChange, onSaved }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [clientId, setClientId] = useState("");
  const [client, setClient] = useState(null);
  const [remessaType, setRemessaType] = useState("Demonstração");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([]);
  const [cfopCode, setCfopCode] = useState("");
  const [billingLocationId, setBillingLocationId] = useState("");
  const [delivery, setDelivery] = useState({ zip_code: "", street: "", number: "", neighborhood: "", city: "", state: "" });
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState([]);

  const { data: cfops = [] } = useQuery({
    queryKey: ["cfops"],
    queryFn: () => base44.entities.Cfop.list("-created_date", 200),
  });
  const nonSaleCfops = cfops.filter((c) => c.categoria !== "Venda" && c.is_active !== false);

  const { data: billingLocations = [] } = useQuery({
    queryKey: ["billingLocations"],
    queryFn: () => base44.entities.BillingLocation.list("-created_date", 50),
  });

  const searchProducts = (term) => {
    setProductSearch(term);
    if (!term || term.length < 2) { setProductResults([]); return; }
    base44.entities.Product.filter({ $or: [{ name: { $regex: term, $options: "i" } }, { code: { $regex: term, $options: "i" } }] }, "-created_date", 20)
      .then(setProductResults).catch(() => setProductResults([]));
  };

  const addItem = (product) => {
    setItems((prev) => [...prev, { product_id: product.id, product_name: product.name, quantity: 1, unit_price: product.sale_price || 0, total: product.sale_price || 0 }]);
    setProductSearch("");
    setProductResults([]);
  };

  const updateItem = (idx, field, value) => {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, [field]: Number(value) || value };
      if (field === "quantity" || field === "unit_price") {
        updated.total = (Number(updated.quantity) || 0) * (Number(updated.unit_price) || 0);
      }
      return updated;
    }));
  };

  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const grandTotal = items.reduce((s, it) => s + (Number(it.total) || 0), 0);

  const reset = () => {
    setClientId(""); setClient(null); setRemessaType("Demonstração");
    setItems([]); setCfopCode(""); setBillingLocationId("");
    setDelivery({ zip_code: "", street: "", number: "", neighborhood: "", city: "", state: "" });
    setNotes(""); setProductSearch(""); setProductResults([]);
  };

  const handleSave = async () => {
    if (!clientId) { toast({ title: "Selecione um cliente", variant: "destructive" }); return; }
    if (items.length === 0) { toast({ title: "Adicione pelo menos um item", variant: "destructive" }); return; }
    if (!cfopCode) { toast({ title: "Selecione o CFOP da operação", variant: "destructive" }); return; }
    if (!billingLocationId) { toast({ title: "Selecione o local de faturamento (emitente)", variant: "destructive" }); return; }

    const selCfop = cfops.find((c) => c.code === cfopCode);
    if (selCfop?.categoria === "Venda") {
      toast({ title: "CFOP inválido", description: "Remessas não podem usar CFOP de Venda.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const data = {
        remessa_type: remessaType,
        client_id: clientId,
        client_name: client?.name || "",
        date,
        items,
        delivery_modality: "Envio",
        delivery_address: delivery,
        billing_location_id: billingLocationId,
        billing_location_name: billingLocations.find((b) => b.id === billingLocationId)?.name || "",
        freight: 0,
        discount: 0,
        grand_total: grandTotal,
        cfop_code: cfopCode,
        natureza_operacao: naturezaMap[remessaType] || "Remessa de mercadoria",
        status: "Rascunho",
        notes,
      };
      await base44.functions.invoke("createWithCode", { entity_name: "Remessa", prefix: "REM", code_field: "code", data });
      toast({ title: "Remessa criada" });
      reset();
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro ao criar remessa", description: err?.response?.data?.error || err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Remessa</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs mb-1">Tipo de Operação</Label>
              <Select value={remessaType} onValueChange={setRemessaType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(naturezaMap).map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1">Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs mb-1">Local de Faturamento (Emitente)</Label>
              <Select value={billingLocationId} onValueChange={setBillingLocationId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {billingLocations.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs mb-1">Cliente</Label>
            <ClientSearchInput value={clientId} onChange={setClientId} onClientSelect={setClient} />
          </div>

          <div>
            <Label className="text-xs mb-1">CFOP da Operação (não-venda)</Label>
            <Select value={cfopCode} onValueChange={setCfopCode}>
              <SelectTrigger><SelectValue placeholder="Selecione o CFOP..." /></SelectTrigger>
              <SelectContent>
                {nonSaleCfops.map((c) => (
                  <SelectItem key={c.id} value={c.code}>{c.code} — {c.description} ({c.categoria})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Natureza: {naturezaMap[remessaType]}</p>
          </div>

          <div className="border-t pt-3">
            <Label className="text-xs mb-2">Itens</Label>
            <div className="relative mb-3 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar produto..." value={productSearch} onChange={(e) => searchProducts(e.target.value)} className="pl-10" />
              {productResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {productResults.map((p) => (
                    <button key={p.id} type="button" onClick={() => addItem(p)} className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-0">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground ml-2 font-mono">{p.code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {items.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2">Produto</th>
                      <th className="text-right p-2 w-24">Qtd</th>
                      <th className="text-right p-2 w-32">V. Unitário</th>
                      <th className="text-right p-2 w-32">Total</th>
                      <th className="p-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-2">{it.product_name}</td>
                        <td className="p-2"><Input type="number" value={it.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} className="h-8 w-20 text-right" /></td>
                        <td className="p-2"><Input type="number" step="0.01" value={it.unit_price} onChange={(e) => updateItem(idx, "unit_price", e.target.value)} className="h-8 w-28 text-right" /></td>
                        <td className="p-2 text-right font-medium">R$ {(it.total || 0).toFixed(2)}</td>
                        <td className="p-2"><Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)}><Trash2 className="h-3 w-3 text-destructive" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {items.length > 0 && (
              <div className="text-right mt-2">
                <Badge variant="secondary" className="text-sm">Total: R$ {grandTotal.toFixed(2)}</Badge>
              </div>
            )}
          </div>

          <div className="border-t pt-3">
            <Label className="text-xs mb-2">Endereço de Entrega (opcional)</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <Input placeholder="CEP" value={delivery.zip_code} onChange={(e) => setDelivery({ ...delivery, zip_code: e.target.value })} />
              <Input placeholder="Logradouro" value={delivery.street} onChange={(e) => setDelivery({ ...delivery, street: e.target.value })} className="md:col-span-2" />
              <Input placeholder="Número" value={delivery.number} onChange={(e) => setDelivery({ ...delivery, number: e.target.value })} />
              <Input placeholder="Bairro" value={delivery.neighborhood} onChange={(e) => setDelivery({ ...delivery, neighborhood: e.target.value })} />
              <Input placeholder="Cidade" value={delivery.city} onChange={(e) => setDelivery({ ...delivery, city: e.target.value })} />
              <Input placeholder="UF" value={delivery.state} onChange={(e) => setDelivery({ ...delivery, state: e.target.value })} />
            </div>
          </div>

          <div>
            <Label className="text-xs mb-1">Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar Remessa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}