import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Wrench, Calendar, DollarSign, Camera, ClipboardCheck, PenTool, ShoppingCart, CheckCircle2, Paperclip, ExternalLink, Settings, RotateCcw, AlertCircle, XCircle, Save } from "lucide-react";

import TechnicianOSChecklistSection from "./TechnicianOSChecklistSection";
import TechnicianOSSignatureSection from "./TechnicianOSSignatureSection";
import TechnicianOSSaleSection from "./TechnicianOSSaleSection";
import NotCompletedDialog from "./NotCompletedDialog";
import PartialCompletionDialog from "./PartialCompletionDialog";
import { useToast } from "@/components/ui/use-toast";
import { usePermissions } from "@/lib/permissions";
import { getInstallmentBracket } from "@/lib/salePricingRules";
import { evaluatePostSaleConclusion, buildSalePaymentsFromTechnician } from "@/lib/postSaleConclusion";

const fmtMoney = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

// Infere a Forma de Recebimento (in loco) a partir da modalidade da Condição de Pagamento
const inferReceivedMethod = (cond) => {
  if (!cond) return "";
  const mod = `${cond.modality || ""} ${cond.name || ""}`.toLowerCase();
  if (mod.includes("débito") || mod.includes("debito")) return "Cartão de Débito";
  if (mod.includes("crédito") || mod.includes("credito")) return "Cartão de Crédito";
  if (mod.includes("pix")) return "PIX";
  if (mod.includes("dinheiro") || mod.includes("espécie") || mod.includes("especie")) return "Dinheiro";
  return "";
};

export default function TechnicianOSForm({ open, onOpenChange, tosId }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [postSaleEdit, setPostSaleEdit] = useState(false);
  const [showNotCompleted, setShowNotCompleted] = useState(false);
  const [showPartial, setShowPartial] = useState(false);
  const { canManageOS } = usePermissions();
  const canPostSaleEdit = canManageOS;

  const { data: tos, isLoading: tosLoading, error: tosError } = useQuery({
    queryKey: ["technician-os", tosId],
    queryFn: () => base44.entities.TechnicianServiceOrder.get(tosId),
    enabled: !!open && !!tosId,
  });

  const { data: checklistItems = [] } = useQuery({
    queryKey: ["technicianChecklistItems"],
    queryFn: () => base44.entities.TechnicianChecklistItem.filter({ is_active: true }, "order", 50),
  });

  const { data: paymentConditions = [] } = useQuery({
    queryKey: ["paymentConditions"],
    queryFn: () => base44.entities.PaymentCondition.list("-created_date", 100),
  });

  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const { data: sale } = useQuery({
    queryKey: ["sale", tos?.sale_id],
    queryFn: () => base44.entities.Sale.get(tos.sale_id),
    enabled: !!open && !!tos?.sale_id,
  });

  const { data: parentOS } = useQuery({
    queryKey: ["serviceOrder", tos?.parent_os_id],
    queryFn: () => base44.entities.ServiceOrder.get(tos.parent_os_id),
    enabled: !!open && !!tos?.parent_os_id,
  });

  useEffect(() => {
    if (tos) setForm({ ...tos });
  }, [tos]);

  // Puxa a Forma de Recebimento da Condição de Pagamento quando não foi registrada
  useEffect(() => {
    if (!form || !paymentConditions.length || form.received_method) return;
    const cond = paymentConditions.find(c => c.id === form.payment_condition_id);
    const method = inferReceivedMethod(cond);
    if (method) setForm(p => (p && !p.received_method ? { ...p, received_method: method } : p));
  }, [form, paymentConditions]);

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.TechnicianServiceOrder.update(tosId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["technician-os", tosId] });
      queryClient.invalidateQueries({ queryKey: ["technician-os-by-parent"] });
      toast({ title: "OS do Técnico salva" });
    },
    onError: (err) => toast({ title: "Erro ao salvar", description: err?.message, variant: "destructive" }),
  });

  const completeMutation = useMutation({
    mutationFn: async (data) => {
      // 1. Remove campos do sistema e salva snapshot dos dados do técnico (apenas na primeira conclusão)
      const { id, created_date, updated_date, created_by_id, technician_snapshot, ...updateFields } = data;
      const updates = { ...updateFields, status: "Concluída Técnico", completed_at: new Date().toISOString() };
      if (!data.technician_snapshot) {
        updates.technician_snapshot = updateFields;
      }
      // 1b. Conclui a OS do Técnico
      await base44.entities.TechnicianServiceOrder.update(tosId, updates);
      // 2. Atualiza a OS pai para "Concluída pelo Técnico" — bloqueia edição e libera para validação
      if (form.parent_os_id) {
        try {
          await base44.functions.invoke("updateOsStatus", {
            os_id: form.parent_os_id,
            updates: {
              status: "Concluída pelo Técnico",
              tech_completion_date: new Date().toISOString().slice(0, 10),
              received_amount: data.received_amount || 0,
              received_method: data.received_method || "",
              payment_receipt_url: data.payment_receipt_url || "",
            },
            expected_status: null,
            source: "OS do Técnico — conclusão pelo técnico",
          });
        } catch (e) {
          // Se o updateOsStatus falhar (concorrência), a TOS já foi concluída — não bloqueia o fluxo
          console.warn("Falha ao atualizar OS pai:", e);
        }
      }
      // 3. Gera pedido de venda em nome do técnico quando há valor de venda + comprovante anexado
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["technician-os", tosId] });
      queryClient.invalidateQueries({ queryKey: ["technician-os-by-parent"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["route-tos-status"] });
      queryClient.invalidateQueries({ queryKey: ["route-tos-status-all"] });
      queryClient.invalidateQueries({ queryKey: ["techRoutes"] });
      queryClient.invalidateQueries({ queryKey: ["technicianRoutes"] });
      toast({ title: "OS do Técnico concluída", description: "OS pai atualizada para 'Concluída pelo Técnico' — aguardando validação." });
      onOpenChange(false);
    },
    onError: (err) => toast({ title: "Erro ao concluir", description: err?.message, variant: "destructive" }),
  });

  const notCompletedMutation = useMutation({
    mutationFn: async ({ reason, notes, location }) => {
      const updates = {
        status: "Atendimento Interrompido",
        not_completed_reason: reason,
        technician_notes: notes ? `${form.technician_notes || ""}${form.technician_notes ? "\n" : ""}[Atendimento Interrompido] ${notes}` : form.technician_notes,
        location_lat: location.lat,
        location_lng: location.lng,
        location_captured_at: location.captured_at,
        completed_at: new Date().toISOString(),
      };
      await base44.entities.TechnicianServiceOrder.update(tosId, updates);
      if (form.parent_os_id) {
        try {
          await base44.functions.invoke("updateOsStatus", {
            os_id: form.parent_os_id,
            updates: { status: "Atendimento Interrompido", tech_completion_date: new Date().toISOString().slice(0, 10) },
            expected_status: null,
            source: "OS do Técnico — atendimento interrompido",
          });
        } catch (e) { console.warn("Falha ao atualizar OS pai:", e); }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["technician-os", tosId] });
      queryClient.invalidateQueries({ queryKey: ["technician-os-by-parent"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["route-tos-status"] });
      queryClient.invalidateQueries({ queryKey: ["route-tos-status-all"] });
      queryClient.invalidateQueries({ queryKey: ["techRoutes"] });
      queryClient.invalidateQueries({ queryKey: ["technicianRoutes"] });
      toast({ title: "Atendimento interrompido", description: "OS marcada como não concluída — justificativa e localização registradas." });
      setShowNotCompleted(false);
      onOpenChange(false);
    },
    onError: (err) => toast({ title: "Erro", description: err?.message, variant: "destructive" }),
  });

  const partialCompleteMutation = useMutation({
    mutationFn: async ({ reason, notes }) => {
      const { id, created_date, updated_date, created_by_id, technician_snapshot, ...updateFields } = form;
      const updates = { ...updateFields, status: "Atendido Parcialmente", not_completed_reason: reason, completed_at: new Date().toISOString() };
      if (notes) updates.technician_notes = `${form.technician_notes || ""}${form.technician_notes ? "\n" : ""}[Parcial] ${notes}`;
      if (!technician_snapshot) updates.technician_snapshot = updateFields;
      await base44.entities.TechnicianServiceOrder.update(tosId, updates);
      if (form.parent_os_id) {
        try {
          await base44.functions.invoke("updateOsStatus", {
            os_id: form.parent_os_id,
            updates: {
              status: "Concluída pelo Técnico",
              tech_completion_date: new Date().toISOString().slice(0, 10),
              received_amount: form.received_amount || 0,
              received_method: form.received_method || "",
              payment_receipt_url: form.payment_receipt_url || "",
            },
            expected_status: null,
            source: "OS do Técnico — atendimento parcial",
          });
        } catch (e) { console.warn("Falha ao atualizar OS pai:", e); }
      }
      const hasTechSale = (form.technician_sale_total || 0) > 0 && !!form.technician_sale_payment_method;
      if (hasTechSale) {
        try {
          const saleData = {
            client_id: form.client_id, client_name: form.client_name, date: new Date().toISOString().slice(0, 10),
            seller_name: form.technician_name || "Técnico",
            items: (form.technician_sale_items || []).map(i => ({ product_id: i.product_id, product_name: i.product_name, quantity: i.quantity, unit_price: i.unit_price, total: i.total })),
            total: form.technician_sale_total || 0, grand_total: form.technician_sale_total || 0,
            stage: "Faturada", status: "Confirmada", confirmation_type: "Total", is_technician_sale: true,
            technician_os_id: tosId, technician_os_code: form.code, technician_id: form.technician_id, technician_name: form.technician_name,
            delivery_modality: "Entrega Própria",
            payments: [{ condition_name: form.technician_sale_payment_method, amount: form.technician_sale_total || 0, receipt_url: form.technician_sale_signature_url || "", payment_status: "Realizada" }],
            notes: `Venda gerada pelo técnico ${form.technician_name} na OS do Técnico ${form.code}`,
          };
          const res = await base44.functions.invoke("createWithCode", { entity_name: "Sale", prefix: "P", code_field: "order_number", pad_length: 3, data: saleData, filter: {} });
          if (res?.data?.record?.id) {
            await base44.entities.TechnicianServiceOrder.update(tosId, { technician_sale_id: res.data.record.id, technician_sale_number: res.data.record.order_number });
          }
        } catch (e) { console.warn("Falha ao gerar venda do técnico:", e); }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["technician-os", tosId] });
      queryClient.invalidateQueries({ queryKey: ["technician-os-by-parent"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["route-tos-status"] });
      queryClient.invalidateQueries({ queryKey: ["route-tos-status-all"] });
      queryClient.invalidateQueries({ queryKey: ["techRoutes"] });
      queryClient.invalidateQueries({ queryKey: ["technicianRoutes"] });
      toast({ title: "Atendimento parcial registrado", description: "OS marcada como atendido parcialmente — aguardando validação." });
      setShowPartial(false);
      onOpenChange(false);
    },
    onError: (err) => toast({ title: "Erro", description: err?.message, variant: "destructive" }),
  });

  // Valor pendente pode vir da OS do Técnico, do valor recebido informado ou da venda vinculada
  const saleHasPendingPayment = (sale?.payments || []).some(p => p.payment_status === "Pendente");
  const hasPendingPayment = Number(form?.pending_payment_amount || 0) > 0 || Number(form?.received_amount || 0) > 0 || saleHasPendingPayment;
  const { shouldSendToFaturamento, validationErrors: conclusionErrors, buttonLabel: conclusionButtonLabel, warningText: conclusionWarning } = evaluatePostSaleConclusion(form, sale, parentOS);

  const concludeOsMutation = useMutation({
    mutationFn: async () => {
      if (conclusionErrors.length > 0) {
        throw new Error("Preencha as informações financeiras obrigatórias: " + conclusionErrors.join("; "));
      }
      // Salva as edições financeiras do pós-venda + registra a revisão no histórico da TOS
      const { id, created_date, updated_date, created_by_id, technician_snapshot, review_history: _rh, ...updateFields } = form;
      const action = shouldSendToFaturamento ? "Concluída para Faturamento" : "Concluída (sem faturamento)";
      const history = (tos.review_history || []).slice();
      history.push({
        date: new Date().toISOString(),
        actor: currentUser?.full_name || currentUser?.email || "",
        previous_status: tos.status,
        new_status: shouldSendToFaturamento ? "Finalizada" : "Concluída Técnico",
        action,
        reason: "",
      });
      await base44.entities.TechnicianServiceOrder.update(tosId, {
        ...updateFields,
        status: shouldSendToFaturamento ? "Finalizada" : "Concluída Técnico",
        review_history: history,
      });
      if (shouldSendToFaturamento) {
        if (tos?.sale_id) {
          const saleUpdates = { stage: "Faturada", status: "Confirmada" };
          if (hasPendingPayment && sale) {
            saleUpdates.payments = buildSalePaymentsFromTechnician(sale, form);
            saleUpdates.received_amount = Number(form.received_amount || 0);
          }
          await base44.entities.Sale.update(tos.sale_id, saleUpdates);
        }
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
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["technician-os", tosId] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast({
        title: shouldSendToFaturamento ? "OS concluída e enviada para faturamento" : "OS concluída",
        description: shouldSendToFaturamento
          ? "Venda enviada para aprovação financeira e faturamento."
          : "A OS do técnico foi concluída. Não há valores a faturar neste momento.",
      });
      setPostSaleEdit(false);
      onOpenChange(false);
    },
    onError: (err) => toast({ title: "Erro", description: err?.message, variant: "destructive" }),
  });

  if (!open) return null;

  if (!form) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" /> OS do Técnico
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            {tosError ? (
              <>
                <AlertCircle className="h-8 w-8 text-destructive" />
                <p className="text-sm text-destructive font-medium">Erro ao carregar OS do Técnico</p>
                <p className="text-xs text-muted-foreground">{tosError?.message || "Não foi possível carregar os dados."}</p>
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
              </>
            ) : (
              <>
                <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Carregando OS do Técnico...</p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const isDelivery = form.parent_os_type === "Entrega" || form.parent_os_type === "Entrega + Instalação";
  const isCompleted = form.status === "Concluída Técnico" || form.status === "Atendido Parcialmente" || form.status === "Atendimento Interrompido" || form.status === "Aguardando Faturamento - Pós" || form.status === "Finalizada";

  const handleSave = () => saveMutation.mutate(form);

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

  const handleComplete = () => {
    const errors = [];
    if (!form.client_full_name?.trim()) errors.push("Nome de quem recebeu o atendimento");
    if (!form.client_document?.trim()) errors.push("Documento (RG ou CPF) de quem recebeu");
    if (!form.technician_name?.trim()) errors.push("Nome do técnico responsável");
    if (!form.final_service_photos || form.final_service_photos.length === 0) errors.push("Pelo menos 1 foto do serviço realizado");
    if (!form.client_signature_url) errors.push('Assinatura do cliente (clique "Salvar Assinatura Cliente")');
    if (!form.technician_signature_url) errors.push('Assinatura do técnico (clique "Salvar Assinatura Técnico")');
    if (form.location_lat == null) errors.push("Capturar a localização do atendimento");
    const hasTechSaleValue = (form.technician_sale_total || 0) > 0 || (form.technician_sale_items || []).length > 0;
    if (hasTechSaleValue && form.technician_sale_payment_method && !form.technician_sale_signature_url) errors.push("Anexar o comprovante de pagamento da venda do técnico");

    if (errors.length > 0) {
      setValidationErrors(errors);
      toast({
        title: `Não foi possível concluir — ${errors.length} pendência(s)`,
        description: errors[0] + (errors.length > 1 ? ` e mais ${errors.length - 1}...` : ""),
        variant: "destructive",
      });
      // Scroll to the error box so the technician sees what's missing
      setTimeout(() => {
        const el = document.getElementById("tos-validation-errors");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return;
    }
    setValidationErrors([]);
    completeMutation.mutate(form);
  };

  const handlePartialClick = () => {
    const errors = [];
    if (!form.client_full_name?.trim()) errors.push("Nome de quem recebeu o atendimento");
    if (!form.client_document?.trim()) errors.push("Documento (RG ou CPF) de quem recebeu");
    if (!form.technician_name?.trim()) errors.push("Nome do técnico responsável");
    if (!form.final_service_photos || form.final_service_photos.length === 0) errors.push("Pelo menos 1 foto do serviço realizado");
    if (!form.client_signature_url) errors.push('Assinatura do cliente (clique "Salvar Assinatura Cliente")');
    if (!form.technician_signature_url) errors.push('Assinatura do técnico (clique "Salvar Assinatura Técnico")');
    if (form.location_lat == null) errors.push("Capturar a localização do atendimento");
    const hasTechSaleValue = (form.technician_sale_total || 0) > 0 || (form.technician_sale_items || []).length > 0;
    if (hasTechSaleValue && form.technician_sale_payment_method && !form.technician_sale_signature_url) errors.push("Anexar o comprovante de pagamento da venda do técnico");

    if (errors.length > 0) {
      setValidationErrors(errors);
      toast({
        title: `Não foi possível registrar parcial — ${errors.length} pendência(s)`,
        description: errors[0] + (errors.length > 1 ? ` e mais ${errors.length - 1}...` : ""),
        variant: "destructive",
      });
      setTimeout(() => {
        const el = document.getElementById("tos-validation-errors");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return;
    }
    setValidationErrors([]);
    setShowPartial(true);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Wrench className="h-5 w-5 text-primary" />
            OS do Técnico <code className="text-sm font-mono bg-cyan-100 text-cyan-800 px-2 py-0.5 rounded">{form.code}</code>
            <Badge variant="outline">{form.status}</Badge>
            {isCompleted && canPostSaleEdit && (
              <Button
                type="button"
                variant={postSaleEdit ? "default" : "outline"}
                size="sm"
                className="ml-auto"
                onClick={() => setPostSaleEdit(!postSaleEdit)}
              >
                <Settings className="h-4 w-4" /> {postSaleEdit ? "Sair da edição" : "Editar (Pós-Vendas)"}
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Aviso de OS finalizada — bloqueia edição */}
          {isCompleted && !postSaleEdit && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
              <div className="text-sm">
                <strong className="text-emerald-800">OS Concluída pelo Técnico</strong>
                <p className="text-emerald-700 text-xs mt-0.5">
                  Concluída em {form.completed_at ? new Date(form.completed_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}.
                  A OS está disponível para validação no painel de Ordens de Serviço — os dados abaixo não podem mais ser alterados pelo técnico.
                </p>
              </div>
            </div>
          )}

          {/* Aviso de edição pós-vendas */}
          {isCompleted && postSaleEdit && (
            <div className="rounded-md border border-violet-300 bg-violet-50 p-3 flex items-center gap-2">
              <Settings className="h-5 w-5 text-violet-600 flex-shrink-0" />
              <div className="text-sm">
                <strong className="text-violet-800">Modo de Edição Pós-Vendas</strong>
                <p className="text-violet-700 text-xs mt-0.5">
                  Apenas as informações financeiras são editáveis. Os dados preenchidos pelo técnico (fotos, assinaturas, checklist, localização) estão preservados.
                  Use "Resetar para versão do técnico" para reverter as alterações antes do faturamento.
                </p>
              </div>
            </div>
          )}

          {/* Resumo */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div><span className="text-muted-foreground">OS Pai:</span> <code className="font-mono">{form.parent_os_code}</code></div>
            <div><span className="text-muted-foreground">Pedido:</span> {form.sale_order_number || "—"}</div>
            <div><span className="text-muted-foreground">Cliente:</span> {form.client_name}</div>
            <div><span className="text-muted-foreground">Técnico:</span> {form.technician_name || "—"}</div>
          </div>

          {/* 1. Itens a entregar */}
          {isDelivery && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-1 text-sm font-semibold"><Package className="h-4 w-4 text-primary" /> Itens a Entregar</div>
              {form.items_to_deliver?.length > 0 ? (
                <div className="space-y-1">
                  {form.items_to_deliver.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{item.product_name}</span>
                      <Badge variant="outline">{item.quantity}x</Badge>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-muted-foreground italic">Nenhum item na OS.</p>}
            </div>
          )}

          {/* 2. Detalhamento do serviço */}
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-1 text-sm font-semibold"><Wrench className="h-4 w-4 text-primary" /> Detalhamento do Serviço</div>
            {form.service_detail_types?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {form.service_detail_types.map((t, i) => <Badge key={i} variant="secondary">{t.service_type_name}</Badge>)}
              </div>
            )}
            {form.service_detail_notes && <p className="text-sm whitespace-pre-wrap bg-amber-50/50 rounded p-2 border border-amber-200">{form.service_detail_notes}</p>}
          </div>

          {/* 3. Agendamento final */}
          <div className="rounded-md border p-3 space-y-1">
            <div className="flex items-center gap-1 text-sm font-semibold"><Calendar className="h-4 w-4 text-primary" /> Agendamento</div>
            <div className="text-sm">
              {fmtDate(form.appointment_date)} — {form.appointment_time_type}
              {form.appointment_specific_time && ` às ${form.appointment_specific_time}`}
            </div>
          </div>

          {/* 4. Informações financeiras */}
          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-center gap-1 text-sm font-semibold"><DollarSign className="h-4 w-4 text-primary" /> Informações Financeiras</div>
            {hasPendingPayment && (
              <div className="text-xs bg-blue-50 rounded p-2 border border-blue-200">
                {Number(form.pending_payment_amount || 0) > 0
                  ? <>Valor a receber na casa do cliente: <strong>{fmtMoney(form.pending_payment_amount)}</strong></>
                  : <>Há pagamento pendente no pedido — preencha a forma de recebimento e anexe o comprovante.</>}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Condição de Pagamento</Label>
                <Select value={form.payment_condition_id || "none"} onValueChange={v => {
                   const cond = paymentConditions.find(c => c.id === v);
                   const method = inferReceivedMethod(cond);
                   setForm(p => ({ ...p, payment_condition_id: v === "none" ? "" : v, payment_condition_name: cond?.name || "", received_method: method, received_installments: method === "Cartão de Crédito" ? (p.received_installments || 1) : null }));
                 }} disabled={isCompleted && !canPostSaleEdit}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {paymentConditions.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Valor Recebido</Label>
                <Input type="number" step="0.01" value={form.received_amount || 0} onChange={e => setForm(p => ({ ...p, received_amount: Number(e.target.value) || 0 }))} disabled={isCompleted && !canPostSaleEdit} />
              </div>
              {hasPendingPayment && (
                <div>
                  <Label className="text-xs">Forma de recebimento (in loco)</Label>
                  <Select
                    value={form.received_method || "none"}
                    onValueChange={v => setForm(p => ({ ...p, received_method: v === "none" ? "" : v, received_installments: v === "Cartão de Crédito" ? (p.received_installments || 1) : null }))}
                    disabled={isCompleted && !canPostSaleEdit}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="PIX">PIX</SelectItem>
                      <SelectItem value="Cartão de Débito">Cartão de Débito</SelectItem>
                      <SelectItem value="Cartão de Crédito">Cartão de Crédito</SelectItem>
                      <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {hasPendingPayment && form.received_method === "Cartão de Crédito" && (() => {
                const bracket = getInstallmentBracket(form.received_amount || form.pending_payment_amount || 0);
                return (
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Parcelas (Maquininha) — <span className="text-muted-foreground">{bracket.label}</span></Label>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      {Array.from({ length: bracket.maxInstallments }, (_, i) => i + 1).map(n => (
                        <Button key={n} type="button" variant={(form.received_installments || 1) === n ? "default" : "outline"} size="sm"
                          onClick={() => setForm(p => ({ ...p, received_installments: n }))} disabled={isCompleted && !canPostSaleEdit}>
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
                      {(!isCompleted || canPostSaleEdit) && (
                        <Button variant="ghost" size="sm" onClick={() => document.getElementById("receipt-upload-tos").click()}><Paperclip className="h-3 w-3" /> Trocar</Button>
                      )}
                    </>
                  ) : (
                    (!isCompleted || canPostSaleEdit) && (
                      <Button variant="outline" size="sm" onClick={() => document.getElementById("receipt-upload-tos").click()} disabled={uploadingReceipt}>
                        <Paperclip className="h-3 w-3" /> {uploadingReceipt ? "Enviando..." : "Anexar"}
                      </Button>
                    )
                  )}
                  <input type="file" accept="image/*" className="hidden" id="receipt-upload-tos" onChange={e => { const f = e.target.files?.[0]; if (f) uploadReceipt(f); }} />
                </div>
              </div>
            </div>
          </div>

          {/* 5. Observações do técnico */}
          <div className="rounded-md border p-3 space-y-2">
            <Label className="text-sm font-semibold">Observações do Técnico</Label>
            <Textarea rows={3} value={form.technician_notes || ""} onChange={e => setForm(p => ({ ...p, technician_notes: e.target.value }))} placeholder="Observações sobre o atendimento..." disabled={isCompleted} />
          </div>

          {/* 6. Fotos finais do serviço */}
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-1 text-sm font-semibold"><Camera className="h-4 w-4 text-primary" /> Fotos Finais do Serviço {isCompleted ? "" : <><span className="text-destructive">*</span> <span className="text-xs font-normal text-muted-foreground">(mínimo 1)</span></>} </div>
            <div className="flex flex-wrap gap-2">
              {(form.final_service_photos || []).map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt={`Foto ${i + 1}`} className="w-20 h-20 object-cover rounded border" />
                </a>
              ))}
              {!isCompleted && (
                <Button variant="outline" size="sm" onClick={() => document.getElementById("photo-upload-tos").click()} disabled={uploadingPhoto}>
                  <Camera className="h-3 w-3" /> {uploadingPhoto ? "Enviando..." : "Adicionar Foto"}
                </Button>
              )}
              <input type="file" accept="image/*" className="hidden" id="photo-upload-tos" onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} />
            </div>
          </div>

          {/* 7. Checklist */}
          <div className="rounded-md border p-3">
            <TechnicianOSChecklistSection
              checklistItems={checklistItems}
              results={form.checklist_results || []}
              onChange={results => setForm(p => ({ ...p, checklist_results: results }))}
              readOnly={isCompleted}
            />
          </div>

          {/* 8. Assinatura e localização */}
          <div className="rounded-md border p-3">
            <TechnicianOSSignatureSection form={form} setForm={setForm} readOnly={isCompleted} />
          </div>

          {/* 9. Venda do técnico */}
          <div className="rounded-md border p-3">
            <TechnicianOSSaleSection form={form} setForm={setForm} readOnly={isCompleted && !postSaleEdit} />
          </div>
        </div>

        <DialogFooter className="flex-col items-stretch gap-3">
          {validationErrors.length > 0 && (
            <div id="tos-validation-errors" className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 space-y-1">
              <p className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> Para concluir a OS, preencha:
              </p>
              <ul className="text-xs text-destructive/90 list-disc pl-5 space-y-0.5">
                {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}
          {isCompleted && postSaleEdit && form?.status === "Concluída Técnico" && conclusionErrors.length > 0 && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 space-y-1">
              <p className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" /> Bloqueado — preencha antes de concluir:
              </p>
              <ul className="text-xs text-destructive/90 list-disc pl-5 space-y-0.5">
                {conclusionErrors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}
          {isCompleted && postSaleEdit && form?.status === "Concluída Técnico" && conclusionErrors.length === 0 && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700 flex items-start gap-1.5">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{conclusionWarning}</span>
            </div>
          )}
          {!isCompleted && (
            <div className="flex flex-col gap-2">
              <Button variant="outline" className="w-full border-amber-400 text-amber-700 hover:bg-amber-50" onClick={() => setShowNotCompleted(true)}>
                <XCircle className="h-4 w-4" /> Atendimento Interrompido
              </Button>
              <Button variant="outline" className="w-full border-blue-400 text-blue-700 hover:bg-blue-50" onClick={handlePartialClick}>
                <AlertCircle className="h-4 w-4" /> Atendido Parcialmente
              </Button>
            </div>
          )}
          <div className="flex justify-end gap-2">
            {isCompleted && canPostSaleEdit && (
              <Button variant="secondary" className="mr-auto" onClick={handleSave} disabled={saveMutation.isPending}>
                <Save className="h-4 w-4" /> {saveMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            )}
            <Button variant="outline" onClick={() => { setValidationErrors([]); onOpenChange(false); }}>Fechar</Button>
            {!isCompleted && (
              <>
                <Button variant="secondary" onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
                <Button onClick={handleComplete} disabled={completeMutation.isPending}>
                  <CheckCircle2 className="h-4 w-4" /> {completeMutation.isPending ? "Concluindo..." : "Concluir OS"}
                </Button>
              </>
            )}
            {isCompleted && postSaleEdit && (
              <>
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
                  <Button variant="outline" onClick={handleResetToTechnician} disabled={saveMutation.isPending}>
                    <RotateCcw className="h-4 w-4" /> Resetar para versão do técnico
                  </Button>
                )}
                <Button variant="secondary" onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Salvando..." : "Salvar edição"}
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => concludeOsMutation.mutate()}
                  disabled={concludeOsMutation.isPending || saveMutation.isPending || (form.status === "Concluída Técnico" && conclusionErrors.length > 0)}
                >
                  <CheckCircle2 className="h-4 w-4" /> {concludeOsMutation.isPending ? "Concluindo..." : (form.status === "Concluída Técnico" ? conclusionButtonLabel : "Salvar e concluir")}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>

      <NotCompletedDialog
        open={showNotCompleted}
        onOpenChange={setShowNotCompleted}
        onConfirm={(data) => notCompletedMutation.mutate(data)}
        loading={notCompletedMutation.isPending}
      />
      <PartialCompletionDialog
        open={showPartial}
        onOpenChange={setShowPartial}
        onConfirm={(data) => partialCompleteMutation.mutate(data)}
        loading={partialCompleteMutation.isPending}
      />
    </Dialog>
  );
}