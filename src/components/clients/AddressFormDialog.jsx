import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const defaultForm = { label: "", zip_code: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", reference: "" };

export default function AddressFormDialog({ open, onOpenChange, address, clientId }) {
  const [form, setForm] = useState(defaultForm);
  const queryClient = useQueryClient();
  const isEditing = !!address;

  useEffect(() => {
    setForm(address ? { ...defaultForm, ...address } : defaultForm);
  }, [address, open]);

  const mutation = useMutation({
    mutationFn: (data) => {
      if (isEditing) return base44.entities.Address.update(address.id, data);
      return base44.entities.Address.create({ ...data, client_id: clientId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses", clientId] });
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
        <DialogHeader><DialogTitle>{isEditing ? "Editar Endereço" : "Novo Endereço"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Tipo</Label><Input value={form.label} onChange={e => update("label", e.target.value)} placeholder="Matriz, Filial..." /></div>
            <div><Label>CEP</Label><Input value={form.zip_code} onChange={e => update("zip_code", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-3"><Label>Logradouro *</Label><Input value={form.street} onChange={e => update("street", e.target.value)} required /></div>
            <div><Label>Número *</Label><Input value={form.number} onChange={e => update("number", e.target.value)} required /></div>
          </div>
          <div><Label>Complemento *</Label><Input value={form.complement} onChange={e => update("complement", e.target.value)} required /></div>
          <div className="grid grid-cols-3 gap-4">
            <div><Label>Bairro</Label><Input value={form.neighborhood} onChange={e => update("neighborhood", e.target.value)} /></div>
            <div><Label>Cidade *</Label><Input value={form.city} onChange={e => update("city", e.target.value)} required /></div>
            <div><Label>Estado *</Label><Input value={form.state} onChange={e => update("state", e.target.value)} required /></div>
          </div>
          <div><Label>Referência</Label><Input value={form.reference} onChange={e => update("reference", e.target.value)} /></div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Salvando..." : "Salvar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}