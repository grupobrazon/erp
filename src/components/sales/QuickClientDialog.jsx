import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ClientFormFields, { defaultForm } from "@/components/clients/ClientFormFields";
import DuplicateWarningBanner from "@/components/clients/DuplicateWarningBanner";
import { checkClientDuplicates } from "@/lib/clientDuplicateCheck";
import { hasValidPhone, PHONE_REQUIRED_MESSAGE } from "@/lib/clientPhoneCheck";

export default function QuickClientDialog({ open, onOpenChange, onCreated }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ...defaultForm });
  const [loadingCep, setLoadingCep] = useState(false);
  const [docError, setDocError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [conflicts, setConflicts] = useState([]);

  const { data: allClients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list("-created_date", 500),
  });

  const generateCode = () => {
    const maxCode = allClients.reduce((max, c) => {
      const num = parseInt(c.new_code?.replace("B", "")) || 0;
      return num > max ? num : max;
    }, 0);
    return `B${String(maxCode + 1).padStart(6, "0")}`;
  };
  const previewCode = generateCode();

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (field === "document") setDocError("");
    if (field.startsWith("phone")) setPhoneError("");
    // Qualquer dado de contato alterado invalida o aviso de duplicidade anterior
    if (field === "document" || field === "email" || field.startsWith("phone") || field.startsWith("zoox_phone")) {
      setConflicts([]);
    }
  };

  const buscarCep = async () => {
    const cep = form.zip_code.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setLoadingCep(true);
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await res.json();
    setLoadingCep(false);
    if (!data.erro) {
      setForm(prev => ({
        ...prev,
        street: data.logradouro || prev.street,
        neighborhood: data.bairro || prev.neighborhood,
        city: data.localidade || prev.city,
        state: data.uf || prev.state,
      }));
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!hasValidPhone(form)) throw new Error(PHONE_REQUIRED_MESSAGE);
      return base44.entities.Client.create({ ...form, new_code: generateCode() });
    },
    onSuccess: async (client) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      if (client?.id) {
        try {
          await base44.functions.invoke("assignClientsToZones", { client_id: client.id });
        } catch (e) {
          console.warn("Falha ao atribuir zonas do novo cliente:", e);
        }
      }
      onCreated?.(client);
      setForm({ ...defaultForm });
      onOpenChange?.(false);
    },
    onError: (err) => {
      setDocError(err.message);
      if (err.message === PHONE_REQUIRED_MESSAGE) setPhoneError(err.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar Novo Cliente</DialogTitle>
        </DialogHeader>
        <form onSubmit={async e => {
          e.preventDefault();
          if (!hasValidPhone(form)) { setPhoneError(PHONE_REQUIRED_MESSAGE); return; }
          if (!form.name || !form.document) return;
          setConflicts([]);
          let found = [];
          try {
            found = await checkClientDuplicates(form, null);
          } catch (err) {
            console.warn("Não foi possível validar duplicidade:", err);
          }
          if (found.length > 0) { setConflicts(found); return; }
          mutation.mutate();
        }} className="space-y-6">
          {phoneError && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive">
              {phoneError}
            </div>
          )}
          <DuplicateWarningBanner
            conflicts={conflicts}
            saving={mutation.isPending}
            onDismiss={() => setConflicts([])}
            onConfirm={() => { setConflicts([]); mutation.mutate(); }}
          />
          <ClientFormFields
            form={form}
            update={update}
            isEditing={false}
            previewCode={previewCode}
            loadingCep={loadingCep}
            buscarCep={buscarCep}
            clientId={null}
            docError={docError}
          />
          <DialogFooter className="sticky bottom-0 bg-background pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange?.(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending || !form.name || !form.document} className="min-w-[120px]">
              {mutation.isPending ? "Salvando..." : "Cadastrar Cliente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}