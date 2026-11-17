import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { buildSalePaymentsFromTechnician } from "@/lib/postSaleConclusion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Package, Wrench, Calendar, DollarSign, Camera, ClipboardCheck, ClipboardList, PenTool, ShoppingCart, CheckCircle2, Paperclip, ExternalLink, MapPin, Navigation, Save, Phone, Mail, User, XCircle, Settings, RotateCcw } from "lucide-react";
import TechnicianOSChecklistSection from "@/components/serviceorders/technician-os/TechnicianOSChecklistSection";
import TechnicianOSSignatureSection from "@/components/serviceorders/technician-os/TechnicianOSSignatureSection";
import TechnicianOSSaleSection from "@/components/serviceorders/technician-os/TechnicianOSSaleSection";
import TechnicianClientConfirmDialog from "@/components/serviceorders/technician-os/TechnicianClientConfirmDialog";
import TechnicianPipelineStepper from "@/components/serviceorders/technician-os/TechnicianPipelineStepper";
import NotCompletedDialog from "@/components/serviceorders/technician-os/NotCompletedDialog";
import { getInstallmentBracket } from "@/lib/salePricingRules";
import { useToast } from "@/components/ui/use-toast";
import { usePermissions } from "@/lib/permissions";

const fmtMoney = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

function SectionCard({ icon: Icon, title, children, required }) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-2 font-semibold text-sm">
        <Icon className="h-4 w-4 text-primary" />
        {title}
        {required && <span className="text-destructive">*</span>}
      </div>
      {children}
    </div>
  );
}

export default function TecnicoTOSExecucao() {
  const { tosId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [showClientConfirm, setShowClientConfirm] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [showNotCompleted, setShowNotCompleted] = useState(false);
  const [postSaleEdit, setPostSaleEdit] = useState(false);
  const [logisticsNotes, setLogisticsNotes] = useState("");
  const { canManageOS } = usePermissions();
  const canPostSaleEdit = canManageOS;

  const { data: tos } = useQuery({
    queryKey: ["technician-os", tosId],
    queryFn: () => base44.entities.TechnicianServiceOrder.get(tosId),
    enabled: !!tosId,
  });

  const { data: parentOS } = useQuery({
    queryKey: ["serviceOrder", tos?.parent_os_id],
    queryFn: () => base44.entities.ServiceOrder.get(tos?.parent_os_id),
    enabled: !!tos?.parent_os_id,
  });

  const { data: checklistItems = [] } = useQuery({
    queryKey: ["technicianChecklistItems"],
    queryFn: () => base44.entities.TechnicianChecklistItem.filter({ is_active: true }, "order", 50),
  });

  const { data: client } = useQuery({
    queryKey: ["client", tos?.client_id],
    queryFn: () => base44.entities.Client.get(tos?.client_id),
    enabled: !!tos?.client_id,
  });

  useEffect(() => {
    if (tos) setForm({ ...tos });
  }, [tos]);

  useEffect(() => {
    if (parentOS) setLogisticsNotes(parentOS.logistics_notes || "");
  }, [parentOS]);

  const { data: sale } = useQuery({
    queryKey: ["sale", tos?.sale_id],
    queryFn: () => base44.entities.Sale.get(tos?.sale_id),
    enabled: !!tos?.sale_id,
  });

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.TechnicianServiceOrder.update(tosId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["technician-os", tosId] });
      queryClient.invalidateQueries({ queryKey: ["techMyTOS"] });
      toast({ title: "Salvo" });
    },
    onError: (err) => toast({ title: "Erro ao salvar", description: err?.message, variant: "destructive" }),
  });

  const startMutation = useMutation({
    mutationFn: () => base44.entities.TechnicianServiceOrder.update(tosId, { status: "Em Execução" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["technician-os", tosId] });
      queryClient.invalidateQueries({ queryKey: ["techMyTOS"] });
      toast({ title: "Execução iniciada" });
    },
    onError: (err) => toast({ title: "Erro", description: err?.message, variant: "destructive" }),
  });

  const completeMutation = useMutation({
    mutationFn: async (data) => {
      // Salva snapshot dos dados do técnico (apenas na primeira conclusão) — usado pelo pós-vendas para resetar
      const { id, created_date, updated_date, created_by_id, technician_snapshot, ...updateFields } = data;
      const updates = { ...updateFields, status: "Concluída Técnico", completed_at: new Date().toISOString() };
      if (!technician_snapshot) {
        updates.technician_snapshot = updateFields;
      }
      const updated = await base44.entities.TechnicianServiceOrder.update(tosId, updates);
      // Atualiza a OS pai para "Concluída pelo Técnico" — o financeiro aprova depois
      if (tos?.parent_os_id) {
        try {
          await base44.entities.ServiceOrder.update(tos.parent_os_id, {
            status: "Concluída pelo Técnico",
            tech_completion_date: new Date().toISOString().slice(0, 10),
          });
        } catch (e) { /* não bloqueia a conclusão da TOS se a OS pai falhar */ }
      }
      // Gera pedido de venda em nome do técnico quando há valor de venda + comprovante anexado
      const hasTechSale = (data.technician_sale_total || 0) > 0 && !!data.technician_sale_payment_method;
      if (hasTechSale) {
        try {
          const saleData = {
            client_id: data.client_id,
            client_name: data.client_name,
            date: new Date().toISOString().slice(0, 10),
            seller_name: data.technician_name || "Técnico",
            items: (data.technician_sale_items || []).map(i => ({
              product_id: i.product_id,
              product_name: i.product_name,
              quantity: i.quantity,
              unit_price: i.unit_price,
              total: i.total,
            })),
            total: data.technician_sale_total || 0,
            grand_total: data.technician_sale_total || 0,
            stage: "Faturada",
            status: "Confirmada",
            confirmation_type: "Total",
            is_technician_sale: true,
            technician_os_id: tosId,
            technician_os_code: data.code,
            technician_id: data.technician_id,
            technician_name: data.technician_name,
            delivery_modality: "Entrega Própria",
            payments: [{
              condition_name: data.technician_sale_payment_method,
              amount: data.technician_sale_total || 0,
              receipt_url: data.technician_sale_signature_url || "",
              payment_status: "Realizada",
            }],
            notes: `Venda gerada pelo técnico ${data.technician_name} na OS do Técnico ${data.code}`,
          };
          const res = await base44.functions.invoke("createWithCode", {
            entity_name: "Sale",
            prefix: "P",
            code_field: "order_number",
            pad_length: 3,
            data: saleData,
            filter: {},
          });
          if (res?.data?.record?.id) {
            await base44.entities.TechnicianServiceOrder.update(tosId, {
              technician_sale_id: res.data.record.id,
              technician_sale_number: res.data.record.order_number,
            });
          }
        } catch (e) { console.warn("Falha ao gerar venda do técnico:", e); }
      }
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["technician-os", tosId] });
      queryClient.invalidateQueries({ queryKey: ["techMyTOS"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["route-tos-status"] });
      queryClient.invalidateQueries({ queryKey: ["route-tos-status-all"] });
      queryClient.invalidateQueries({ queryKey: ["techRoutes"] });
      queryClient.invalidateQueries({ queryKey: ["technicianRoutes"] });
      toast({ title: "OS finalizada pelo técnico!" });
      navigate("/modo-tecnico");
    },
    onError: (err) => toast({ title: "Erro ao concluir", description: err?.message, variant: "destructive" }),
  });

  const notCompletedMutation = useMutation({
    mutationFn: async ({ reason, notes, location }) => {
      const updated = await base44.entities.TechnicianServiceOrder.update(tosId, {
        status: "Atendimento Interrompido",
        not_completed_reason: reason,
        technician_notes: notes || form.technician_notes || "",
        location_lat: location.lat,
        location_lng: location.lng,
        location_captured_at: location.captured_at,
      });
      if (tos?.parent_os_id) {
        try {
          await base44.entities.ServiceOrder.update(tos.parent_os_id, {
            status: "Atendimento Interrompido",
          });
        } catch (e) { /* não bloqueia */ }
      }
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["technician-os", tosId] });
      queryClient.invalidateQueries({ queryKey: ["techMyTOS"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["route-tos-status"] });
      queryClient.invalidateQueries({ queryKey: ["route-tos-status-all"] });
      queryClient.invalidateQueries({ queryKey: ["techRoutes"] });
      queryClient.invalidateQueries({ queryKey: ["technicianRoutes"] });
      toast({ title: "OS marcada como não concluída" });
      navigate("/modo-tecnico");
    },
    onError: (err) => toast({ title: "Erro", description: err?.message, variant: "destructive" }),
  });

  const concludeOsMutation = useMutation({
    mutationFn: async () => {
      // Move a venda original (que gerou a OS) para aprovação financeira e faturamento
      if (tos?.sale_id) {
        const sale = await base44.entities.Sale.get(tos.sale_id);
        const saleUpdates = { stage: "Faturada", status: "Confirmada" };
        if (Number(tos?.pending_payment_amount || 0) > 0 || (sale?.payments || []).some(p => p.payment_status === "Pendente")) {
          saleUpdates.payments = buildSalePaymentsFromTechnician(sale, tos);
          saleUpdates.received_amount = Number(tos.received_amount || 0);
        }
        await base44.entities.Sale.update(tos.sale_id, saleUpdates);
      }
      // Move a OS pai para Faturada
      if (tos?.parent_os_id) {
        try {
          await base44.functions.invoke("updateOsStatus", {
            os_id: tos.parent_os_id,
            updates: { status: "Faturada" },
            expected_status: null,
            source: "OS do Técnico — conclusão pelo pós-vendas",
          });
        } catch (e) { console.warn("Falha ao atualizar OS pai:", e); }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["technician-os", tosId] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast({ title: "OS concluída", description: "Venda enviada para aprovação financeira e faturamento." });
      setPostSaleEdit(false);
    },
    onError: (err) => toast({ title: "Erro", description: err?.message, variant: "destructive" }),
  });

  if (!form) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const isDelivery = form.parent_os_type === "Entrega" || form.parent_os_type === "Entrega + Instalação";
  const isCompleted = form.status === "Concluída Técnico" || form.status === "Cancelada" || form.status === "Atendimento Interrompido" || form.status === "Atendido Parcialmente" || form.status === "Aguardando Faturamento - Pós" || form.status === "Finalizada";
  const addr = parentOS?.delivery_address || {};
  // Edição pós-vendas: habilitada quando a OS está concluída e o usuário tem permissão
  const editable = !isCompleted || postSaleEdit;

  const handleSave = async () => {
    saveMutation.mutate(form);
    if (parentOS && logisticsNotes !== (parentOS.logistics_notes || "")) {
      try {
        await base44.entities.ServiceOrder.update(parentOS.id, { logistics_notes: logisticsNotes });
        queryClient.invalidateQueries({ queryKey: ["serviceOrder", parentOS.id] });
      } catch (e) { /* não bloqueia o save da TOS */ }
    }
  };

  const handleResetToTechnician = () => {
    if (!form.technician_snapshot) {
      toast({ title: "Snapshot não disponível", description: "Não há versão original do técnico para restaurar.", variant: "destructive" });
      return;
    }
    const restored = { ...form.technician_snapshot, status: form.status, completed_at: form.completed_at };
    saveMutation.mutate(restored, {
      onSuccess: () => {
        setPostSaleEdit(false);
        toast({ title: "OS resetada", description: "Restaurada para a versão original do técnico." });
      },
    });
  };

  // Valor pendente pode vir da OS do Técnico, do valor recebido informado ou da venda vinculada
  const saleHasPendingPayment = (sale?.payments || []).some(p => p.payment_status === "Pendente");
  const hasPendingPayment = Number(form?.pending_payment_amount || 0) > 0 || Number(form?.received_amount || 0) > 0 || saleHasPendingPayment;

  const handleComplete = () => {
    if (!form.client_full_name || !form.client_document) {
      toast({ title: "Campos obrigatórios", description: "Preencha o nome e documento de quem recebeu o atendimento.", variant: "destructive" });
      return;
    }
    if (!form.client_signature_url || !form.technician_signature_url) {
      toast({ title: "Assinaturas obrigatórias", description: "Salve as assinaturas do cliente e do técnico antes de concluir.", variant: "destructive" });
      return;
    }
    if (form.location_lat == null) {
      toast({ title: "Localização obrigatória", description: "Capture a localização do atendimento antes de concluir.", variant: "destructive" });
      return;
    }
    if (hasPendingPayment && (!form.received_method || !form.payment_receipt_url)) {
      toast({ title: "Informações financeiras obrigatórias", description: "Informe a forma de recebimento e anexe o comprovante de pagamento antes de concluir.", variant: "destructive" });
      return;
    }
    const hasSaleValue = (form.technician_sale_total || 0) > 0 || (form.technician_sale_items || []).length > 0;
    if (hasSaleValue && form.technician_sale_payment_method && !form.technician_sale_signature_url) {
      toast({ title: "Comprovante obrigatório", description: "Anexe o comprovante de pagamento da venda do técnico antes de concluir.", variant: "destructive" });
      return;
    }
    setShowClientConfirm(true);
  };

  const handleClientConfirm = async (clientData) => {
    setSavingClient(true);
    try {
      // Atualiza o cadastro do cliente se houver alteração
      if (client && (clientData.phone1 !== (client.phone1 || "") || clientData.phone2 !== (client.phone2 || "") || clientData.email !== (client.email || ""))) {
        await base44.entities.Client.update(client.id, {
          phone1: clientData.phone1,
          phone2: clientData.phone2,
          email: clientData.email,
        });
        queryClient.invalidateQueries({ queryKey: ["client", client.id] });
      }
      setShowClientConfirm(false);
      completeMutation.mutate(form);
    } catch (err) {
      toast({ title: "Erro ao atualizar cliente", description: err?.message, variant: "destructive" });
    } finally {
      setSavingClient(false);
    }
  };

  const uploadPhoto = async (file) => {
    setUploadingPhoto(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      setForm(p => ({ ...p, final_service_photos: [...(p.final_service_photos || []), file_url] }));
    } catch (err) { toast({ title: "Erro no upload", description: err.message, variant: "destructive" }); }
    finally { setUploadingPhoto(false); }
  };

  const uploadReceipt = async (file) => {
    setUploadingReceipt(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      setForm(p => ({ ...p, payment_receipt_url: file_url }));
    } catch (err) { toast({ title: "Erro no upload", description: err.message, variant: "destructive" }); }
    finally { setUploadingReceipt(false); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 sticky top-0 bg-background/95 backdrop-blur z-10 py-2 -mx-2 px-2 border-b">
        <Button variant="ghost" size="icon" onClick={() => navigate("/ordens-servico")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <code className="font-mono font-bold">{form.code}</code>
            <Badge variant="outline">{form.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{form.client_name}</p>
        </div>
        {!isCompleted && form.status === "Pendente" && (
          <Button size="sm" onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
            <Wrench className="h-4 w-4" /> Iniciar
          </Button>
        )}
        {isCompleted && canPostSaleEdit && (form.status === "Concluída Técnico" || form.status === "Atendido Parcialmente" || form.status === "Atendimento Interrompido") && (
          <Button
            size="sm"
            variant={postSaleEdit ? "default" : "outline"}
            className="gap-1"
            onClick={() => setPostSaleEdit(!postSaleEdit)}
          >
            <Settings className="h-4 w-4" /> {postSaleEdit ? "Sair da edição" : "Editar"}
          </Button>
        )}
      </div>

      {/* Aviso de edição pós-vendas */}
      {isCompleted && postSaleEdit && (
        <div className="rounded-lg border border-violet-300 bg-violet-50 p-3 flex items-center gap-2">
          <Settings className="h-5 w-5 text-violet-600 flex-shrink-0" />
          <div className="text-sm">
            <strong className="text-violet-800">Modo de Edição Pós-Vendas</strong>
            <p className="text-violet-700 text-xs mt-0.5">
              Informações financeiras, venda do técnico, observações e notas de logística são editáveis. Use "Resetar" para reverter as alterações antes do faturamento.
            </p>
          </div>
        </div>
      )}

      {/* Técnico responsável */}
      {form.technician_name && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Técnico Responsável</p>
            <p className="text-sm font-bold text-primary">{form.technician_name}</p>
          </div>
        </div>
      )}

      {/* Pipeline (bolinhas) — acompanha o status da OS mãe */}
      {parentOS?.status && (
        <TechnicianPipelineStepper parentStatus={parentOS.status} />
      )}

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:gap-2 gap-1.5 text-xs">
        <div className="rounded border p-2">
          <span className="text-muted-foreground">OS Pai:</span>
          <br /><code className="font-mono">{form.parent_os_code}</code>
        </div>
        <div className="rounded border p-2">
          <span className="text-muted-foreground">Pedido:</span>
          <br />{form.sale_order_number || "—"}
        </div>
      </div>

      {/* Dados do Cliente + Endereço + Traçar Rota */}
      {client && (
        <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
          <div className="flex items-center gap-1 font-medium text-sm">
            <User className="h-4 w-4 text-primary" /> Dados do Cliente
          </div>
          <div className="space-y-1 text-sm">
            <div><span className="text-muted-foreground">Nome:</span> <strong>{client.name}</strong></div>
            {client.document && <div><span className="text-muted-foreground">Documento:</span> {client.document}</div>}
            <div className="border-t pt-1.5 space-y-1">
              <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-primary" /> <span className="text-muted-foreground">Tel 1:</span> {client.phone1 || "—"}</div>
              {client.phone2 && <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-primary" /> <span className="text-muted-foreground">Tel 2:</span> {client.phone2}</div>}
              {client.phone3 && <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-primary" /> <span className="text-muted-foreground">Tel 3:</span> {client.phone3}</div>}
              <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-primary" /> <span className="text-muted-foreground">E-mail:</span> {client.email || "—"}</div>
            </div>
          </div>
          {addr.street && (
            <div className="border-t pt-2 space-y-1 text-sm">
              <div className="flex items-center gap-1 font-medium">
                <MapPin className="h-3.5 w-3.5 text-primary" /> Endereço de Entrega
              </div>
              <p>{addr.street}, {addr.number}{addr.complement ? ` — ${addr.complement}` : ""} — {addr.neighborhood}</p>
              <p>{addr.city}/{addr.state} — CEP {addr.zip_code}</p>
              {addr.city && (
                <Button variant="ghost" size="sm" className="mt-1 h-7 gap-1 px-1" asChild>
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${addr.street}, ${addr.number}, ${addr.city}, ${addr.state}`)}`} target="_blank" rel="noreferrer">
                    <Navigation className="h-3 w-3" /> Traçar Rota
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 1. Itens a entregar */}
      {isDelivery && (
        <SectionCard icon={Package} title="Itens a Entregar">
          {form.items_to_deliver?.length > 0 ? (
            <div className="space-y-1">
              {form.items_to_deliver.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{item.product_name}</span>
                  <Badge variant="outline">{item.quantity}x</Badge>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground italic">Nenhum item.</p>}
        </SectionCard>
      )}

      {/* 2. Detalhamento do serviço */}
      <SectionCard icon={Wrench} title="Detalhamento do Serviço">
        {form.service_detail_types?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {form.service_detail_types.map((t, i) => <Badge key={i} variant="secondary">{t.service_type_name}</Badge>)}
          </div>
        )}
        {form.service_detail_notes && (
          <p className="text-sm whitespace-pre-wrap bg-amber-50 rounded p-2 border border-amber-200">{form.service_detail_notes}</p>
        )}
      </SectionCard>

      {/* 3. Agendamento */}
      <SectionCard icon={Calendar} title="Agendamento">
        <div className="text-sm">
          {fmtDate(form.appointment_date)} — {form.appointment_time_type || "Dia Inteiro"}
          {form.appointment_specific_time && ` às ${form.appointment_specific_time}`}
        </div>
      </SectionCard>

      {/* 4. Informações financeiras */}
      <SectionCard icon={DollarSign} title="Informações Financeiras">
        {Number(form.pending_payment_amount || 0) > 0 ? (
          <div className="text-xs bg-blue-50 rounded p-2 border border-blue-200">
            Valor a receber na casa do cliente: <strong>{fmtMoney(form.pending_payment_amount)}</strong>
          </div>
        ) : saleHasPendingPayment ? (
          <div className="text-xs bg-blue-50 rounded p-2 border border-blue-200">
            Há pagamento pendente no pedido {sale?.order_number || ""} — preencha a forma de recebimento e anexe o comprovante.
          </div>
        ) : (
          <div className="text-xs bg-emerald-50 rounded p-2 border border-emerald-200">
            <strong className="text-emerald-700">Valor 100% pago</strong> — não é necessário receber na casa do cliente.
          </div>
        )}
        {(hasPendingPayment || postSaleEdit) && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Valor Recebido</Label>
              <Input type="number" step="0.01" value={form.received_amount || 0} onChange={e => setForm(p => ({ ...p, received_amount: Number(e.target.value) || 0 }))} disabled={!editable} />
              </div>
              <div>
               <Label className="text-xs">Forma (in loco)</Label>
               <Select value={form.received_method || "none"} onValueChange={v => setForm(p => ({ ...p, received_method: v === "none" ? "" : v, received_installments: v === "Cartão de Crédito" ? (p.received_installments || 1) : null }))} disabled={!editable}>
                <SelectTrigger><SelectValue placeholder="..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="Cartão de Débito">Cartão de Débito</SelectItem>
                  <SelectItem value="Cartão de Crédito">Cartão de Crédito</SelectItem>
                  <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.received_method === "Cartão de Crédito" && (() => {
            const bracket = getInstallmentBracket(form.received_amount || form.pending_payment_amount || 0);
            return (
              <div>
                <Label className="text-xs">Parcelas (Maquininha) — <span className="text-muted-foreground">{bracket.label}</span></Label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {Array.from({ length: bracket.maxInstallments }, (_, i) => i + 1).map(n => (
                    <Button key={n} type="button" variant={(form.received_installments || 1) === n ? "default" : "outline"} size="sm"
                      onClick={() => setForm(p => ({ ...p, received_installments: n }))} disabled={!editable}>
                      {n}x
                    </Button>
                  ))}
                </div>
              </div>
            );
          })()}
          <div>
            <Label className="text-xs">Comprovante de Pagamento</Label>
            <div className="flex items-center gap-2">
              {form.payment_receipt_url ? (
                <>
                  <Button variant="outline" size="sm" asChild><a href={form.payment_receipt_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /> Ver</a></Button>
                  {editable && <Button variant="ghost" size="sm" onClick={() => document.getElementById("receipt-upload-mobile").click()}><Paperclip className="h-3 w-3" /> Trocar</Button>}
                </>
              ) : (
                editable && <Button variant="outline" size="sm" onClick={() => document.getElementById("receipt-upload-mobile").click()} disabled={uploadingReceipt}>
                  <Paperclip className="h-3 w-3" /> {uploadingReceipt ? "Enviando..." : "Anexar"}
                </Button>
              )}
              <input type="file" accept="image/*" className="hidden" id="receipt-upload-mobile" onChange={e => { const f = e.target.files?.[0]; if (f) uploadReceipt(f); }} />
            </div>
          </div>
        </div>
        )}
      </SectionCard>

      {/* 5. Observações do técnico */}
      <SectionCard icon={Wrench} title="Observações do Técnico">
        <Textarea rows={3} value={form.technician_notes || ""} onChange={e => setForm(p => ({ ...p, technician_notes: e.target.value }))} placeholder="Observações sobre o atendimento..." disabled={!editable} />
      </SectionCard>

      {/* 5b. Observação interna da logística (apenas pós-vendas) */}
      {postSaleEdit && (
        <SectionCard icon={ClipboardList} title="Observação Interna da Logística">
          <p className="text-xs text-muted-foreground">Nota interna para a logística — não visível para o cliente nem para o técnico.</p>
          <Textarea rows={3} value={logisticsNotes} onChange={e => setLogisticsNotes(e.target.value)} placeholder="Observação interna da logística..." />
        </SectionCard>
      )}

      {/* 6. Fotos finais do serviço */}
      <SectionCard icon={Camera} title="Fotos Finais do Serviço">
        <div className="flex flex-wrap gap-2">
          {(form.final_service_photos || []).map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noreferrer">
              <img src={url} alt={`Foto ${i + 1}`} className="w-20 h-20 object-cover rounded border" />
            </a>
          ))}
          {!isCompleted && (
            <>
              <Button variant="outline" size="sm" className="w-20 h-20" onClick={() => document.getElementById("photo-upload-mobile").click()} disabled={uploadingPhoto}>
                <Camera className="h-5 w-5" />
              </Button>
              <input type="file" accept="image/*" capture="environment" className="hidden" id="photo-upload-mobile" onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} />
            </>
          )}
        </div>
      </SectionCard>

      {/* 7. Checklist */}
      <SectionCard icon={ClipboardCheck} title="Checklist" required>
        <TechnicianOSChecklistSection
          checklistItems={checklistItems}
          results={form.checklist_results || []}
          onChange={results => setForm(p => ({ ...p, checklist_results: results }))}
          readOnly={isCompleted}
        />
      </SectionCard>

      {/* 9. Venda do técnico (oculta por padrão) */}
      <SectionCard icon={ShoppingCart} title="Venda do Técnico (Acessórios/Peças)">
        <TechnicianOSSaleSection form={form} setForm={setForm} readOnly={!editable} />
      </SectionCard>

      {/* 10. Assinatura e Localização (última seção antes de salvar) */}
      <SectionCard icon={PenTool} title="Assinatura e Localização" required>
        <TechnicianOSSignatureSection form={form} setForm={setForm} readOnly={isCompleted} />
      </SectionCard>

      {/* Dialog de confirmação cadastral */}
      <TechnicianClientConfirmDialog
        open={showClientConfirm}
        onOpenChange={setShowClientConfirm}
        client={client}
        onConfirm={handleClientConfirm}
        saving={savingClient || completeMutation.isPending}
      />

      {/* Dialog de não conclusão */}
      <NotCompletedDialog
        open={showNotCompleted}
        onOpenChange={setShowNotCompleted}
        onConfirm={(data) => notCompletedMutation.mutate(data)}
        loading={notCompletedMutation.isPending}
      />

      {/* Sticky footer — técnico */}
      {!isCompleted && (
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t z-20">
          <div className="max-w-2xl mx-auto p-3 flex gap-2">
            <Button variant="secondary" className="flex-1 gap-1" onClick={handleSave} disabled={saveMutation.isPending}>
              <Save className="h-4 w-4" /> {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
            <Button variant="destructive" className="gap-1" onClick={() => setShowNotCompleted(true)} disabled={notCompletedMutation.isPending}>
              <XCircle className="h-4 w-4" /> Não Concluir
            </Button>
            <Button className="flex-1 gap-1" onClick={handleComplete} disabled={completeMutation.isPending}>
              <CheckCircle2 className="h-4 w-4" /> {completeMutation.isPending ? "Concluindo..." : "Concluir OS"}
            </Button>
          </div>
        </div>
      )}

      {/* Sticky footer — edição pós-vendas */}
      {isCompleted && postSaleEdit && (
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t z-20">
          <div className="max-w-2xl mx-auto p-3 flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-2 mr-auto">
              <Label className="text-xs whitespace-nowrap">Alterar status:</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm(p => ({ ...p, status: v }))}
              >
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Concluída Técnico">Concluída Técnico</SelectItem>
                  <SelectItem value="Atendido Parcialmente">Atendido Parcialmente</SelectItem>
                  <SelectItem value="Atendimento Interrompido">Atendimento Interrompido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.technician_snapshot && (
              <Button variant="outline" className="gap-1" onClick={handleResetToTechnician} disabled={saveMutation.isPending}>
                <RotateCcw className="h-4 w-4" /> Resetar para versão do técnico
              </Button>
            )}
            <Button variant="secondary" className="flex-1 gap-1" onClick={handleSave} disabled={saveMutation.isPending}>
              <Save className="h-4 w-4" /> {saveMutation.isPending ? "Salvando..." : "Salvar edição"}
            </Button>
            <Button className="flex-1 gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => concludeOsMutation.mutate()} disabled={concludeOsMutation.isPending || saveMutation.isPending}>
              <CheckCircle2 className="h-4 w-4" /> {concludeOsMutation.isPending ? "Concluindo..." : "Concluir e enviar para Faturamento"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}