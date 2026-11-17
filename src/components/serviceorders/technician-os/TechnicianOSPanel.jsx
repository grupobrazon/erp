import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wrench, Calendar, AlertCircle, ExternalLink, CheckCircle2, FileText } from "lucide-react";
import TechnicianOSForm from "./TechnicianOSForm";
import PostSaleReviewDialog from "./PostSaleReviewDialog";
import { createWithCode } from "@/lib/codeGeneration";
import { useToast } from "@/components/ui/use-toast";
import { usePermissions } from "@/lib/permissions";
import { ClipboardCheck } from "lucide-react";

const REVIEWABLE_STATUSES = ["Concluída Técnico", "Atendido Parcialmente", "Atendimento Interrompido"];

export default function TechnicianOSPanel({ order, sale }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canManageOS } = usePermissions();
  const [showForm, setShowForm] = useState(false);
  const [showReview, setShowReview] = useState(false);

  // Busca TOS existente vinculada à OS pai
  const { data: existingTOS, isLoading } = useQuery({
    queryKey: ["technician-os-by-parent", order?.id],
    queryFn: () => base44.entities.TechnicianServiceOrder.filter({ parent_os_id: order.id }, "-created_date", 5),
    enabled: !!order?.id,
  });

  const tos = existingTOS?.[0] || null;

  // Busca agendamento vinculado à venda (pré-requisito) — para OS de Manutenção
  // sem venda, busca pelo os_id (o agendamento criado a partir da OS vincula pelo os_id)
  // Fallback: agendamentos órfãos (criados direto na agenda sem vínculo) pela client_id
  const { data: appointments = [] } = useQuery({
    queryKey: ["sale-appointments", order?.sale_id, order?.id, order?.client_id],
    queryFn: async () => {
      // 1. Tenta pela sale_id
      if (order?.sale_id) {
        const bySale = await base44.entities.AgendamentoRota.filter(
          { sale_id: order.sale_id, status: "Agendado" }, "-date", 10
        );
        if (bySale.length > 0) return bySale;
      }
      // 2. Tenta pela os_id
      const byOs = await base44.entities.AgendamentoRota.filter(
        { os_id: order.id, status: "Agendado" }, "-date", 10
      );
      if (byOs.length > 0) return byOs;
      // 3. Fallback: agendamentos órfãos do mesmo cliente (sem sale_id e sem os_id)
      if (order?.client_id) {
        const byClient = await base44.entities.AgendamentoRota.filter(
          { client_id: order.client_id, status: "Agendado" }, "-date", 10
        );
        return byClient.filter(a => !a.sale_id && !a.os_id);
      }
      return [];
    },
    enabled: !!order?.id,
  });

  const hasAppointment = appointments.length > 0;
  const appointment = appointments[0];

  const generateMutation = useMutation({
    mutationFn: async () => {
      const itemsToDeliver = (sale?.items || []).map(i => ({
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: i.quantity,
      }));

      const pendingPayments = (sale?.payments || []).filter(p => p.payment_status === "Pendente" && (p.payment_moment === "Na Entrega" || p.payment_moment === "Na Instalação"));
      const pendingAmount = pendingPayments.reduce((s, p) => s + (p.amount || 0), 0);

      const payload = {
        parent_os_id: order.id,
        parent_os_code: order.code,
        parent_os_type: order.type,
        client_id: order.client_id,
        client_name: order.client_name,
        sale_id: order.sale_id || "",
        sale_order_number: order.sale_order_number || "",
        appointment_id: appointment?.id || "",
        appointment_date: appointment?.date || "",
        appointment_time_type: appointment?.time_type || "",
        appointment_specific_time: appointment?.specific_time || "",
        technician_id: "",
        technician_name: order.technician || "",
        status: "Pendente",
        items_to_deliver: itemsToDeliver,
        service_detail_types: sale?.service_detail_types || appointment?.service_detail_types || order?.service_detail_types || [],
        service_detail_notes: sale?.service_detail_notes || appointment?.service_detail_notes || order?.service_detail_notes || "",
        pending_payment_amount: pendingAmount,
        checklist_results: [],
        technician_sale_items: [],
      };

      const { record } = await createWithCode("technician_os", payload);
      // Atualiza a OS pai com o código da OS do técnico
      await base44.entities.ServiceOrder.update(order.id, { technician_os_code: record.code });
      return record;
    },
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: ["technician-os-by-parent", order.id] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      toast({ title: "OS do Técnico gerada", description: record.code });
      setShowForm(true);
    },
    onError: (err) => toast({ title: "Erro ao gerar OS do Técnico", description: err?.message, variant: "destructive" }),
  });

  return (
    <div className="rounded-md border border-cyan-200 bg-cyan-50/30 p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Wrench className="h-4 w-4 text-primary" /> OS do Técnico
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : tos ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <code className="font-mono bg-cyan-100 text-cyan-800 px-2 py-0.5 rounded">{tos.code}</code>
            <Badge variant="outline">{tos.status}</Badge>
            {tos.status === "Concluída Técnico" && (
              <Badge className="gap-1 bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Concluída pelo Técnico
              </Badge>
            )}
            {tos.appointment_date && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {new Date(tos.appointment_date + "T00:00:00").toLocaleDateString("pt-BR")} — {tos.appointment_time_type}
              </span>
            )}
          </div>
          {tos.status === "Concluída Técnico" && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
              O técnico finalizou esta OS. Os dados estão bloqueados para edição. Valide e avance para aprovação financeira no painel acima.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={tos.status === "Concluída Técnico" ? "outline" : "default"} onClick={() => setShowForm(true)}>
              <ExternalLink className="h-3 w-3" /> {tos.status === "Concluída Técnico" ? "Visualizar OS do Técnico" : "Abrir OS do Técnico"}
            </Button>
            {canManageOS && REVIEWABLE_STATUSES.includes(tos.status) && (
              <Button size="sm" variant="default" className="bg-violet-600 hover:bg-violet-700" onClick={() => setShowReview(true)}>
                <ClipboardCheck className="h-3 w-3" /> Revisão
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {!hasAppointment ? (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-2 text-xs">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <strong className="text-amber-800">Agendamento prévio obrigatório.</strong> O vendedor precisa fazer o agendamento na agenda de rotas antes de gerar a OS do Técnico.
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md bg-emerald-50 border border-emerald-200 p-2 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div>
                Agendamento confirmado: <strong>{new Date(appointment.date + "T00:00:00").toLocaleDateString("pt-BR")}</strong> — {appointment.time_type}. Pronto para gerar a OS do Técnico.
              </div>
            </div>
          )}
          <Button size="sm" disabled={!hasAppointment || generateMutation.isPending} onClick={() => generateMutation.mutate()}>
            <FileText className="h-3 w-3" /> {generateMutation.isPending ? "Gerando..." : "Gerar OS do Técnico"}
          </Button>
        </div>
      )}

      {showForm && tos && (
        <TechnicianOSForm open={showForm} onOpenChange={setShowForm} tosId={tos.id} />
      )}
      {showReview && tos && (
        <PostSaleReviewDialog open={showReview} onOpenChange={setShowReview} tosId={tos.id} />
      )}
    </div>
  );
}