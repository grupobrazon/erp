import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function RegisterMaintenanceDialog({ open, onOpenChange, equipment }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    product_id: "", quantity: 1, unit_price: 0,
    technician: "", date: new Date().toISOString().split("T")[0], notes: "",
  });
  const [loading, setLoading] = useState(false);

  const { data: parts = [] } = useQuery({
    queryKey: ["maintenanceParts"],
    queryFn: () => base44.entities.Product.filter({ is_maintenance_part: true }, "-created_date", 200),
  });

  useEffect(() => {
    if (open) {
      setForm({
        product_id: "", quantity: 1, unit_price: 0,
        technician: "", date: new Date().toISOString().split("T")[0], notes: "",
      });
    }
  }, [open, equipment]);

  const handleProductChange = (pid) => {
    const prod = parts.find(p => p.id === pid);
    setForm(f => ({ ...f, product_id: pid, unit_price: prod?.sale_price || 0 }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.product_id) {
      toast({ title: "Selecione o elemento filtrante", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await base44.functions.invoke("registerMaintenance", {
        equipment_id: equipment.id,
        product_id: form.product_id,
        quantity: Number(form.quantity) || 1,
        unit_price: Number(form.unit_price) || 0,
        technician: form.technician,
        date: form.date,
        notes: form.notes,
      });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);

      toast({
        title: "Manutenção registrada — Pedido " + data.order_number,
        description: "Próxima troca: " + new Date(data.next_maintenance_date + "T00:00:00").toLocaleDateString("pt-BR"),
      });
      queryClient.invalidateQueries({ queryKey: ["maintenanceEquipment"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro ao registrar manutenção", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Troca de Elemento Filtrante</DialogTitle>
        </DialogHeader>
        {equipment && (
          <div className="text-sm text-muted-foreground mb-2">
            Patrimônio: <span className="font-mono font-medium text-foreground">{equipment.patrimony_code || equipment.code}</span>
            <br />
            {equipment.client_name} — {equipment.product_name}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Elemento Filtrante *</Label>
            <Select value={form.product_id} onValueChange={handleProductChange}>
              <SelectTrigger>
                <span className={!form.product_id ? "text-muted-foreground" : ""}>
                  {form.product_id
                    ? (parts.find(p => p.id === form.product_id)?.name || "Selecione...")
                    : "Selecione o refil..."}
                </span>
              </SelectTrigger>
              <SelectContent>
                {parts.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {parts.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Nenhum produto cadastrado como "Peça de Manutenção". Cadastre produtos com o papel de manutenção apropriado.
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Quantidade</Label>
              <Input type="number" min="1" value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
            </div>
            <div>
              <Label>Preço Unit. (R$)</Label>
              <Input type="number" step="0.01" value={form.unit_price}
                onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} />
            </div>
            <div>
              <Label>Data *</Label>
              <Input type="date" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
            </div>
          </div>
          <div>
            <Label>Técnico</Label>
            <Input value={form.technician}
              onChange={e => setForm(f => ({ ...f, technician: e.target.value }))} />
          </div>
          <div>
            <Label>Observações</Label>
            <Input value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Registrando...</> : "Registrar Troca"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}