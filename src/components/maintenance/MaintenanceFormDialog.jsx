import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { format, addMonths } from "date-fns";

const types = ["Troca de Refil", "Troca de Elemento Filtrante", "Higienização", "Revisão Preventiva", "Manutenção Corretiva", "Visita Técnica"];
const results = ["Realizada", "Reagendada", "Cancelada", "Sem acesso ao local"];

export default function MaintenanceFormDialog({ open, onOpenChange }) {
  const [form, setForm] = useState({ equipment_id: "", technician: "", date: format(new Date(), "yyyy-MM-dd"), type: "Troca de Refil", description: "", result: "Realizada", notes: "" });
  const queryClient = useQueryClient();

  const { data: equipment = [] } = useQuery({ queryKey: ["equipment"], queryFn: () => base44.entities.Equipment.list("-created_date", 500), enabled: open });
  const { data: allServiceOrders = [] } = useQuery({ queryKey: ["serviceOrders"], queryFn: () => base44.entities.ServiceOrder.list("-created_date", 500), enabled: open });

  const generateOSCode = () => {
    const maxCode = allServiceOrders.reduce((max, o) => {
      const num = parseInt(o.code?.replace("OS", "")) || 0;
      return num > max ? num : max;
    }, 0);
    return `OS${String(maxCode + 1).padStart(6, "0")}`;
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const eq = equipment.find(e => e.id === form.equipment_id);
      if (!eq) return;

      const osCode = generateOSCode();

      const os = await base44.entities.ServiceOrder.create({
        code: osCode,
        client_id: eq.client_id,
        client_name: eq.client_name,
        equipment_id: eq.id,
        equipment_code: eq.code,
        technician: form.technician,
        date: form.date,
        service_description: `${form.type} - ${form.description}`,
        status: form.result === "Realizada" ? "Concluída" : "Aberta",
      });

      await base44.entities.Maintenance.create({
        ...form,
        equipment_code: eq.code,
        client_id: eq.client_id,
        client_name: eq.client_name,
        service_order_id: os.id,
      });

      if (form.result === "Realizada") {
        const nextDate = eq.maintenance_interval_months
          ? format(addMonths(new Date(form.date), eq.maintenance_interval_months), "yyyy-MM-dd")
          : null;
        await base44.entities.Equipment.update(eq.id, {
          last_maintenance_date: form.date,
          next_maintenance_date: nextDate,
          status: "Ativo",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenances"] });
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      onOpenChange(false);
      setForm({ equipment_id: "", technician: "", date: format(new Date(), "yyyy-MM-dd"), type: "Troca de Refil", description: "", result: "Realizada", notes: "" });
    },
  });

  const update = (f, v) => setForm(p => ({ ...p, [f]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nova Manutenção</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Equipamento *</Label>
              <Select value={form.equipment_id} onValueChange={v => update("equipment_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{equipment.map(e => <SelectItem key={e.id} value={e.id}>{e.code} - {e.client_name} ({e.product_name})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Técnico</Label><Input value={form.technician} onChange={e => update("technician", e.target.value)} /></div>
            <div><Label>Data</Label><Input type="date" value={form.date} onChange={e => update("date", e.target.value)} /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={v => update("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Resultado</Label>
              <Select value={form.result} onValueChange={v => update("result", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{results.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Descrição</Label><Textarea value={form.description} onChange={e => update("description", e.target.value)} rows={3} /></div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending || !form.equipment_id}>
              {mutation.isPending ? "Salvando..." : "Registrar Manutenção"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}