import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const defaultForm = { name: "", role: "", phone: "", whatsapp: "", email: "", notes: "" };

export default function ContactFormDialog({ open, onOpenChange, contact, clientId }) {
  const [form, setForm] = useState(defaultForm);
  const queryClient = useQueryClient();
  const isEditing = !!contact;

  useEffect(() => {
    setForm(contact ? { ...defaultForm, ...contact } : defaultForm);
  }, [contact, open]);

  const mutation = useMutation({
    mutationFn: (data) => {
      if (isEditing) return base44.entities.Contact.update(contact.id, data);
      return base44.entities.Contact.create({ ...data, client_id: clientId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts", clientId] });
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
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEditing ? "Editar Contato" : "Novo Contato"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><Label>Nome *</Label><Input value={form.name} onChange={e => update("name", e.target.value)} required /></div>
          <div><Label>Cargo</Label><Input value={form.role} onChange={e => update("role", e.target.value)} placeholder="Financeiro, Comprador..." /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Telefone</Label><Input value={form.phone} onChange={e => update("phone", e.target.value)} /></div>
            <div><Label>WhatsApp</Label><Input value={form.whatsapp} onChange={e => update("whatsapp", e.target.value)} /></div>
          </div>
          <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={e => update("email", e.target.value)} /></div>
          <div><Label>Observações</Label><Textarea value={form.notes} onChange={e => update("notes", e.target.value)} rows={2} /></div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Salvando..." : "Salvar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}