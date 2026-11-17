import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const defaultForm = { name: "", company_name: "", document: "", state_registration: "", email: "", status: "Ativo", old_code: "", notes: "" };

export default function ClientFormDialog({ open, onOpenChange, client }) {
  const [form, setForm] = useState(defaultForm);
  const queryClient = useQueryClient();
  const isEditing = !!client;

  const { data: allClients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list("-created_date", 500),
    enabled: open && !isEditing,
  });

  useEffect(() => {
    if (client) {
      setForm({ ...defaultForm, ...client });
    } else {
      setForm(defaultForm);
    }
  }, [client, open]);

  const generateCode = () => {
    const maxCode = allClients.reduce((max, c) => {
      const num = parseInt(c.new_code?.replace("B", "")) || 0;
      return num > max ? num : max;
    }, 0);
    return `B${String(maxCode + 1).padStart(6, "0")}`;
  };

  const mutation = useMutation({
    mutationFn: (data) => {
      if (isEditing) return base44.entities.Client.update(client.id, data);
      return base44.entities.Client.create({ ...data, new_code: generateCode() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      onOpenChange(false);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={e => update("name", e.target.value)} required />
            </div>
            <div>
              <Label>Razão Social</Label>
              <Input value={form.company_name} onChange={e => update("company_name", e.target.value)} />
            </div>
            <div>
              <Label>CPF/CNPJ</Label>
              <Input value={form.document} onChange={e => update("document", e.target.value)} />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={e => update("email", e.target.value)} />
            </div>
            <div>
              <Label>Inscrição Estadual</Label>
              <Input value={form.state_registration} onChange={e => update("state_registration", e.target.value)} />
            </div>
            <div>
              <Label>Código Antigo</Label>
              <Input value={form.old_code} onChange={e => update("old_code", e.target.value)} placeholder="ERP anterior" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => update("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Ativo", "Inativo", "Bloqueado", "Inadimplente"].map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={e => update("notes", e.target.value)} rows={3} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvando..." : isEditing ? "Atualizar" : "Cadastrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}