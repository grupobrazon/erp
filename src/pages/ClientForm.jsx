import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/ui/PageHeader";
import { ArrowLeft, Ticket } from "lucide-react";
import ClientFormFields, { defaultForm } from "@/components/clients/ClientFormFields";
import { createWithCode } from "@/lib/codeGeneration";
import { checkClientDuplicates } from "@/lib/clientDuplicateCheck";
import DuplicateWarningBanner from "@/components/clients/DuplicateWarningBanner";
import { hasValidPhone, PHONE_REQUIRED_MESSAGE } from "@/lib/clientPhoneCheck";
import { useAuth } from "@/lib/AuthContext";

const ADDRESS_FIELDS = ["zip_code", "street", "number", "complement", "neighborhood", "city", "state"];

const buildAddressSnapshot = (obj) => {
  const snap = {};
  for (const f of ADDRESS_FIELDS) snap[f] = (obj?.[f] || "").trim();
  return snap;
};

const addressChanged = (oldAddr, newAddr) =>
  ADDRESS_FIELDS.some(f => (oldAddr[f] || "") !== (newAddr[f] || ""));

export default function ClientForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditing = !!id && id !== "novo";
  const [form, setForm] = useState(defaultForm);
  const [loadingCep, setLoadingCep] = useState(false);
  const [docError, setDocError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [addressError, setAddressError] = useState("");
  const [conflicts, setConflicts] = useState([]);
  const { user } = useAuth();

  const { data: client } = useQuery({
    queryKey: ["client", id],
    queryFn: () => base44.entities.Client.filter({ id }),
    enabled: isEditing,
    select: (data) => data[0],
  });

  useEffect(() => {
    if (client) setForm({ ...defaultForm, ...client });
  }, [client]);

  const previewCode = isEditing ? client?.new_code : null;

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
    mutationFn: async (data) => {
      if (!hasValidPhone(data)) throw new Error(PHONE_REQUIRED_MESSAGE);
      if (isEditing) {
        // Detecta alteração de endereço e registra no histórico
        const oldAddr = buildAddressSnapshot(client);
        const newAddr = buildAddressSnapshot(data);
        const payload = { ...data };
        if (addressChanged(oldAddr, newAddr)) {
          const history = client.address_history || [];
          payload.address_history = [
            ...history,
            {
              date: new Date().toISOString(),
              user_id: user?.id || "",
              user_name: user?.full_name || user?.email || "Sistema",
              old_address: oldAddr,
              new_address: newAddr,
            },
          ];
        }
        return base44.entities.Client.update(id, payload);
      }
      const res = await createWithCode("client", data);
      return res.record;
    },
    onSuccess: async (record) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      const targetId = isEditing ? id : record?.id;
      // Sincroniza o endereço do cliente para todas as OS ativas automaticamente
      if (isEditing) {
        try {
          await base44.functions.invoke("syncClientAddressToOS", { client_id: id });
        } catch (e) {
          console.warn("Falha ao sincronizar endereço nas OS:", e);
        }
      }
      // Reatribui as zonas de rota do cliente com base no endereço atualizado
      if (targetId) {
        try {
          await base44.functions.invoke("assignClientsToZones", { client_id: targetId });
        } catch (e) {
          console.warn("Falha ao reatribuir zonas do cliente:", e);
        }
      }
      navigate(isEditing ? `/clientes/${id}` : `/clientes/${record?.id || ""}`);
    },
    onError: (err) => {
      setDocError(err.message);
      if (err.message === PHONE_REQUIRED_MESSAGE) setPhoneError(err.message);
    },
  });

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (field === "document") setDocError("");
    if (field.startsWith("phone")) setPhoneError("");
    if (field === "number" || field === "complement") setAddressError("");
    // Qualquer dado de contato alterado invalida o aviso de duplicidade anterior
    if (field === "document" || field === "email" || field.startsWith("phone") || field.startsWith("zoox_phone")) {
      setConflicts([]);
    }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={isEditing ? "Editar Cliente" : "Novo Cliente"}
        description={previewCode ? `Código: ${previewCode}` : "Código gerado automaticamente ao salvar"}
      >
        <div className="flex items-center gap-2">
          {isEditing && (
            <Button variant="outline" onClick={() => navigate(`/clientes/${id}?tab=promotions`)} className="gap-2">
              <Ticket className="h-4 w-4" /> Programas e Promoções
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>
      </PageHeader>

      {phoneError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive">
          {phoneError}
        </div>
      )}
      {addressError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive">
          {addressError}
        </div>
      )}
      <form onSubmit={async e => {
        e.preventDefault();
        if (!form.number?.trim() || !form.complement?.trim()) {
          setAddressError("Preencha o Número e o Complemento do endereço principal.");
          return;
        }
        setAddressError("");
        setConflicts([]);
        let found = [];
        try {
          found = await checkClientDuplicates(form, isEditing ? id : null);
        } catch (err) {
          console.warn("Não foi possível validar duplicidade:", err);
        }
        if (found.length > 0) {
          setConflicts(found);
          return;
        }
        mutation.mutate(form);
      }} className="space-y-6">
        <DuplicateWarningBanner
          conflicts={conflicts}
          saving={mutation.isPending}
          onDismiss={() => setConflicts([])}
          onConfirm={() => {
            setConflicts([]);
            mutation.mutate(form);
          }}
        />
        <ClientFormFields
          form={form}
          update={update}
          isEditing={isEditing}
          previewCode={previewCode}
          loadingCep={loadingCep}
          buscarCep={buscarCep}
          clientId={id}
          docError={docError}
        />

        <div className="flex justify-end gap-3 pb-8">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancelar</Button>
          <Button type="submit" disabled={mutation.isPending} className="min-w-[120px]">
            {mutation.isPending ? "Salvando..." : isEditing ? "Atualizar" : "Cadastrar Cliente"}
          </Button>
        </div>
      </form>
    </div>
  );
}