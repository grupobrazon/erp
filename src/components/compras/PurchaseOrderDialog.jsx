import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createWithCode } from "@/lib/codeGeneration";
import ProductCombobox from "@/components/compras/ProductCombobox";
import PaymentConditionCombobox from "@/components/sales/PaymentConditionCombobox";

export default function PurchaseOrderDialog({ open, onOpenChange, editingItem }) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    supplier_name: "", supplier_document: "", date: today, expected_delivery_date: "",
    stock_location_id: "", payment_condition_id: "", is_fiscal: true,
    freight: 0, discount: 0, notes: "", items: [],
  });

  const { data: stockLocations = [] } = useQuery({
    queryKey: ["stockLocations"],
    queryFn: () => base44.entities.StockLocation.list("-name", 100),
  });
  const { data: allConditions = [] } = useQuery({
    queryKey: ["paymentConditions"],
    queryFn: () => base44.entities.PaymentCondition.list("-created_date", 200),
  });
  const payConditions = allConditions.filter(c => (c.direction || "Recebimento") === "Pagamento");

  useEffect(() => {
    if (editingItem) {
      setForm({
        supplier_name: editingItem.supplier_name || "",
        supplier_document: editingItem.supplier_document || "",
        date: editingItem.date || today,
        expected_delivery_date: editingItem.expected_delivery_date || "",
        stock_location_id: editingItem.stock_location_id || "",
        payment_condition_id: editingItem.payment_condition_id || "",
        is_fiscal: editingItem.is_fiscal !== false,
        freight: editingItem.freight || 0,
        discount: editingItem.discount || 0,
        notes: editingItem.notes || "",
        items: editingItem.items || [],
      });
    } else {
      setForm({ supplier_name: "", supplier_document: "", date: today, expected_delivery_date: "", stock_location_id: "", payment_condition_id: "", is_fiscal: true, freight: 0, discount: 0, notes: "", items: [] });
    }
  }, [editingItem, open]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const addItem = () => setForm(prev => ({ ...prev, items: [...prev.items, { product_id: "", product_name: "", quantity: 1, unit_cost: 0, total: 0 }] }));
  const updateItem = (idx, patch) => setForm(prev => {
    const items = [...prev.items];
    items[idx] = { ...items[idx], ...patch };
    items[idx].total = (items[idx].quantity || 0) * (items[idx].unit_cost || 0);
    return { ...prev, items };
  });
  const removeItem = (idx) => setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  const itemsTotal = form.items.reduce((s, it) => s + (it.total || 0), 0);
  const grandTotal = itemsTotal + (parseFloat(form.freight) || 0) - (parseFloat(form.discount) || 0);

  const createMut = useMutation({
    mutationFn: (data) => createWithCode("purchase", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] }); onOpenChange(false); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PurchaseOrder.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] }); onOpenChange(false); },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const cond = payConditions.find(c => c.id === form.payment_condition_id);
    const data = {
      ...form,
      freight: parseFloat(form.freight) || 0,
      discount: parseFloat(form.discount) || 0,
      grand_total: grandTotal,
      payment_condition_name: cond?.name || "",
      stock_location_name: stockLocations.find(l => l.id === form.stock_location_id)?.name || "",
    };
    if (editingItem) updateMut.mutate({ id: editingItem.id, data });
    else createMut.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editingItem ? "Editar Pedido de Compra" : "Novo Pedido de Compra"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="col-span-2">
              <Label className="text-xs">Fornecedor *</Label>
              <Input required value={form.supplier_name} onChange={e => set("supplier_name", e.target.value)} placeholder="Nome do fornecedor" />
            </div>
            <div>
              <Label className="text-xs">CNPJ/CPF</Label>
              <Input value={form.supplier_document} onChange={e => set("supplier_document", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Data *</Label>
              <Input required type="date" value={form.date} onChange={e => set("date", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Previsão de Entrega</Label>
              <Input type="date" value={form.expected_delivery_date} onChange={e => set("expected_delivery_date", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Local de Estoque (entrada)</Label>
              <Select value={form.stock_location_id || "none"} onValueChange={v => set("stock_location_id", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {stockLocations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Condição de Pagamento</Label>
              <PaymentConditionCombobox conditions={payConditions} value={form.payment_condition_id} onChange={v => set("payment_condition_id", v)} placeholder="Pagamento..." />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={form.is_fiscal} onCheckedChange={v => set("is_fiscal", v)} />
              <Label className="text-xs">{form.is_fiscal ? "Fiscal (NF-e)" : "Não Fiscal"}</Label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Itens</Label>
              <Button type="button" size="sm" variant="outline" onClick={addItem} className="gap-1"><Plus className="h-3 w-3" /> Adicionar</Button>
            </div>
            <div className="rounded-lg border divide-y">
              {form.items.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground text-center">Nenhum item. Clique em adicionar.</p>
              ) : form.items.map((it, idx) => (
                <div key={idx} className="p-2 grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <ProductCombobox value={it.product_id} onChange={(p) => updateItem(idx, { product_id: p?.id || "", product_name: p?.name || "", unit_cost: p?.cost || it.unit_cost })} />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" min="0" step="0.01" value={it.quantity} onChange={e => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })} placeholder="Qtd" />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" min="0" step="0.01" value={it.unit_cost} onChange={e => updateItem(idx, { unit_cost: parseFloat(e.target.value) || 0 })} placeholder="Custo" />
                  </div>
                  <div className="col-span-2 text-right text-sm font-medium">R$ {(it.total || 0).toFixed(2)}</div>
                  <div className="col-span-1 text-right">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(idx)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Frete</Label>
              <Input type="number" step="0.01" value={form.freight} onChange={e => set("freight", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Desconto</Label>
              <Input type="number" step="0.01" value={form.discount} onChange={e => set("discount", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Total Geral</Label>
              <div className="h-9 flex items-center font-bold text-lg">R$ {grandTotal.toFixed(2)}</div>
            </div>
          </div>
          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>{editingItem ? "Salvar" : "Cadastrar Pedido"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}