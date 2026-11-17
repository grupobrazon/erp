import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import { format, addMonths } from "date-fns";

export default function SaleFormDialog({ open, onOpenChange }) {
  const [form, setForm] = useState({ client_id: "", seller: "", date: format(new Date(), "yyyy-MM-dd"), items: [], notes: "" });
  const queryClient = useQueryClient();

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => base44.entities.Client.list("-created_date", 500), enabled: open });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => base44.entities.Product.list("-created_date", 200), enabled: open });
  const { data: allEquipment = [] } = useQuery({ queryKey: ["equipment"], queryFn: () => base44.entities.Equipment.list("-created_date", 1000), enabled: open });

  const addItem = () => {
    setForm(prev => ({ ...prev, items: [...prev.items, { product_id: "", product_name: "", quantity: 1, unit_price: 0, total: 0, generate_equipment: false }] }));
  };

  const updateItem = (index, field, value) => {
    setForm(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      if (field === "product_id") {
        const product = products.find(p => p.id === value);
        items[index].product_name = product?.name || "";
        items[index].unit_price = product?.sale_price || 0;
        items[index].total = items[index].quantity * items[index].unit_price;
      }
      if (field === "quantity" || field === "unit_price") {
        items[index].total = (items[index].quantity || 0) * (items[index].unit_price || 0);
      }
      return { ...prev, items };
    });
  };

  const removeItem = (index) => {
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const totalVenda = form.items.reduce((sum, item) => sum + (item.total || 0), 0);

  const generateEquipmentCode = () => {
    const maxCode = allEquipment.reduce((max, e) => {
      const num = parseInt(e.code?.replace("EQ", "")) || 0;
      return num > max ? num : max;
    }, 0);
    return maxCode;
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const client = clients.find(c => c.id === form.client_id);
      const sale = await base44.entities.Sale.create({
        ...form,
        client_name: client?.name || "",
        total: totalVenda,
        status: "Confirmada",
      });

      let eqCounter = generateEquipmentCode();
      for (const item of form.items) {
        if (item.generate_equipment) {
          const product = products.find(p => p.id === item.product_id);
          eqCounter++;
          const nextMaint = product?.maintenance_interval_months
            ? format(addMonths(new Date(form.date), product.maintenance_interval_months), "yyyy-MM-dd")
            : null;
          for (let i = 0; i < (item.quantity || 1); i++) {
            await base44.entities.Equipment.create({
              code: `EQ${String(eqCounter + i).padStart(6, "0")}`,
              client_id: form.client_id,
              client_name: client?.name || "",
              product_id: item.product_id,
              product_name: product?.name || "",
              brand: product?.brand || "",
              model: product?.model || "",
              category: product?.category || "",
              sale_date: form.date,
              installation_date: form.date,
              status: "Ativo",
              maintenance_interval_months: product?.maintenance_interval_months || 6,
              next_maintenance_date: nextMaint,
            });
            eqCounter++;
          }
        }
      }
      return sale;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      onOpenChange(false);
      setForm({ client_id: "", seller: "", date: format(new Date(), "yyyy-MM-dd"), items: [], notes: "" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Nova Venda</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(); }} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Cliente *</Label>
              <Select value={form.client_id} onValueChange={v => setForm(p => ({ ...p, client_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Vendedor</Label><Input value={form.seller} onChange={e => setForm(p => ({ ...p, seller: e.target.value }))} /></div>
            <div><Label>Data</Label><Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm font-medium">Itens da Venda</p>
              <Button type="button" size="sm" variant="outline" onClick={addItem} className="gap-1"><Plus className="h-3 w-3" /> Adicionar</Button>
            </div>
            <div className="space-y-3">
              {form.items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end bg-muted/30 p-3 rounded-lg">
                  <div className="col-span-4">
                    <Label className="text-xs">Produto</Label>
                    <Select value={item.product_id} onValueChange={v => updateItem(i, "product_id", v)}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2"><Label className="text-xs">Qtd</Label><Input type="number" className="h-9" value={item.quantity} onChange={e => updateItem(i, "quantity", parseInt(e.target.value) || 0)} /></div>
                  <div className="col-span-2"><Label className="text-xs">Preço Un.</Label><Input type="number" step="0.01" className="h-9" value={item.unit_price} onChange={e => updateItem(i, "unit_price", parseFloat(e.target.value) || 0)} /></div>
                  <div className="col-span-2 text-right pt-5 font-medium text-sm">R$ {(item.total || 0).toFixed(2)}</div>
                  <div className="col-span-1 flex items-center gap-2 pt-5">
                    <Checkbox checked={item.generate_equipment} onCheckedChange={v => updateItem(i, "generate_equipment", v)} />
                    <span className="text-xs">EQ</span>
                  </div>
                  <div className="col-span-1 pt-5">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem(i)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-right mt-3 text-lg font-bold">Total: R$ {totalVenda.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending || !form.client_id || form.items.length === 0}>
              {mutation.isPending ? "Processando..." : "Finalizar Venda"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}