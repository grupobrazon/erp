import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const defaultForm = { code: "", name: "", brand: "", model: "", category: "Purificador", unit: "UN", cost: 0, sale_price: 0, current_stock: 0, min_stock: 0, maintenance_type: "Tempo", maintenance_interval_months: 6, maintenance_interval_liters: 0 };

export default function ProductFormDialog({ open, onOpenChange, product }) {
  const [form, setForm] = useState(defaultForm);
  const queryClient = useQueryClient();
  const isEditing = !!product;

  useEffect(() => {
    setForm(product ? { ...defaultForm, ...product } : defaultForm);
  }, [product, open]);

  const mutation = useMutation({
    mutationFn: (data) => isEditing ? base44.entities.Product.update(product.id, data) : base44.entities.Product.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      onOpenChange(false);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  const update = (f, v) => setForm(p => ({ ...p, [f]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{isEditing ? "Editar Produto" : "Novo Produto"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Código</Label><Input value={form.code} onChange={e => update("code", e.target.value)} /></div>
            <div><Label>Nome *</Label><Input value={form.name} onChange={e => update("name", e.target.value)} required /></div>
            <div><Label>Marca</Label><Input value={form.brand} onChange={e => update("brand", e.target.value)} /></div>
            <div><Label>Modelo</Label><Input value={form.model} onChange={e => update("model", e.target.value)} /></div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={v => update("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Purificador", "Bebedouro", "Refil", "Elemento Filtrante", "Peça", "Acessório"].map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Unidade</Label><Input value={form.unit} onChange={e => update("unit", e.target.value)} /></div>
            <div><Label>Custo (R$)</Label><Input type="number" step="0.01" value={form.cost} onChange={e => update("cost", parseFloat(e.target.value) || 0)} /></div>
            <div><Label>Preço Venda (R$)</Label><Input type="number" step="0.01" value={form.sale_price} onChange={e => update("sale_price", parseFloat(e.target.value) || 0)} /></div>
            <div><Label>Estoque Atual</Label><Input type="number" value={form.current_stock} onChange={e => update("current_stock", parseInt(e.target.value) || 0)} /></div>
            <div><Label>Estoque Mínimo</Label><Input type="number" value={form.min_stock} onChange={e => update("min_stock", parseInt(e.target.value) || 0)} /></div>
          </div>
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">Regra de Manutenção</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo</Label>
                <Select value={form.maintenance_type} onValueChange={v => update("maintenance_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Tempo">Por Tempo</SelectItem>
                    <SelectItem value="Litros">Por Litros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.maintenance_type === "Tempo" ? (
                <div><Label>Intervalo (meses)</Label><Input type="number" value={form.maintenance_interval_months} onChange={e => update("maintenance_interval_months", parseInt(e.target.value) || 0)} /></div>
              ) : (
                <div><Label>Intervalo (litros)</Label><Input type="number" value={form.maintenance_interval_liters} onChange={e => update("maintenance_interval_liters", parseInt(e.target.value) || 0)} /></div>
              )}
            </div>
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