import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const defaultForm = { serial_number: "", client_id: "", address_id: "", product_id: "", brand: "", model: "", category: "", sale_date: "", installation_date: "", warranty_date: "", status: "Ativo", refill_type: "", maintenance_interval_months: 6 };

export default function EquipmentFormDialog({ open, onOpenChange, equipment }) {
  const [form, setForm] = useState(defaultForm);
  const queryClient = useQueryClient();
  const isEditing = !!equipment;

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => base44.entities.Client.list("-created_date", 500), enabled: open });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => base44.entities.Product.list("-created_date", 200), enabled: open });
  const { data: addresses = [] } = useQuery({ queryKey: ["addresses-for-client", form.client_id], queryFn: () => base44.entities.Address.filter({ client_id: form.client_id }), enabled: open && !!form.client_id });
  const { data: allEquipment = [] } = useQuery({ queryKey: ["equipment"], queryFn: () => base44.entities.Equipment.list("-created_date", 500), enabled: open && !isEditing });

  useEffect(() => {
    setForm(equipment ? { ...defaultForm, ...equipment } : defaultForm);
  }, [equipment, open]);

  const generateCode = () => {
    const maxCode = allEquipment.reduce((max, e) => {
      const num = parseInt(e.code?.replace("EQ", "")) || 0;
      return num > max ? num : max;
    }, 0);
    return `EQ${String(maxCode + 1).padStart(6, "0")}`;
  };

  const mutation = useMutation({
    mutationFn: (data) => {
      const client = clients.find(c => c.id === data.client_id);
      const product = products.find(p => p.id === data.product_id);
      const addr = addresses.find(a => a.id === data.address_id);
      const enriched = {
        ...data,
        client_name: client?.name || "",
        product_name: product?.name || "",
        address_label: addr?.label || "",
        brand: data.brand || product?.brand || "",
        model: data.model || product?.model || "",
        category: data.category || product?.category || "",
      };
      if (isEditing) return base44.entities.Equipment.update(equipment.id, enriched);
      return base44.entities.Equipment.create({ ...enriched, code: generateCode() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      onOpenChange(false);
    },
  });

  const handleProductChange = (productId) => {
    const product = products.find(p => p.id === productId);
    setForm(prev => ({
      ...prev,
      product_id: productId,
      brand: product?.brand || prev.brand,
      model: product?.model || prev.model,
      category: product?.category || prev.category,
      maintenance_interval_months: product?.maintenance_interval_months || prev.maintenance_interval_months,
    }));
  };

  const update = (f, v) => setForm(p => ({ ...p, [f]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{isEditing ? "Editar Equipamento" : "Novo Equipamento"}</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Cliente *</Label>
              <Select value={form.client_id} onValueChange={v => update("client_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Endereço</Label>
              <Select value={form.address_id} onValueChange={v => update("address_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{addresses.map(a => <SelectItem key={a.id} value={a.id}>{a.label || a.street}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Produto</Label>
              <Select value={form.product_id} onValueChange={handleProductChange}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Nº Série</Label><Input value={form.serial_number} onChange={e => update("serial_number", e.target.value)} /></div>
            <div><Label>Marca</Label><Input value={form.brand} onChange={e => update("brand", e.target.value)} /></div>
            <div><Label>Modelo</Label><Input value={form.model} onChange={e => update("model", e.target.value)} /></div>
            <div><Label>Data Venda</Label><Input type="date" value={form.sale_date} onChange={e => update("sale_date", e.target.value)} /></div>
            <div><Label>Data Instalação</Label><Input type="date" value={form.installation_date} onChange={e => update("installation_date", e.target.value)} /></div>
            <div><Label>Garantia até</Label><Input type="date" value={form.warranty_date} onChange={e => update("warranty_date", e.target.value)} /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => update("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Ativo", "Inativo", "Retirado", "Em manutenção", "Substituído"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Tipo de Refil</Label><Input value={form.refill_type} onChange={e => update("refill_type", e.target.value)} /></div>
            <div><Label>Intervalo Manutenção (meses)</Label><Input type="number" value={form.maintenance_interval_months} onChange={e => update("maintenance_interval_months", parseInt(e.target.value) || 0)} /></div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Salvando..." : "Salvar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}