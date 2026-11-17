import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardCheck, CheckCircle2, RotateCcw, XCircle, History, AlertCircle, CalendarClock, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { usePermissions } from "@/lib/permissions";
import { evaluatePostSaleConclusion } from "@/lib/postSaleConclusion";

const STATUS_OPTIONS = [
  { value: "Concluída Técnico", label: "Concluída Técnico", color: "bg-emerald-100 text-emerald-700" },
  { value: "Atendido Parcialmente", label: "Atendido Parcialmente", color: "bg-amber-100 text-amber-700" },
  { value: "Atendimento Interrompido", label: "Atendimento Interrompido", color: "bg-rose-100 text-rose-700" },
];

const fmtDateTime = (d) => d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

/**
 * Dialog de Revisão Pós-Venda da OS do Técnico.
 * O pós-venda revisa o atendimento do técnico e define o desfecho:
 * - Concluída → envia para faturamento (venda → Faturada, OS pai → Faturada).
 *   Após o faturamento, a OS fica Concluída e conclui a OS mãe e o pedido.
 * - Atendido Parcialmente / Atendimento Interrompido → Reagendar (volta para a agenda
 *   com o motivo registrado no histórico) ou Cancelar (cancela a OS).
 */
export default function PostSaleReviewDialog({ open, onOpenChange, tosId }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canManageOS } = usePermissions();
  const [newStatus, setNewStatus] = useState("");
  const [reason, setReason] = useState("");

  const { data: tos } = useQuery({
    queryKey: ["technician-os", tosId],
    queryFn: () => base44.entities.TechnicianServiceOrder.get(tosId),
    enabled: !!open && !!tosId,
  });

  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    enabled: !!open,
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
    if (tos && open) {
      setNewStatus(tos.status === "Cancelada" ? "" : (STATUS_OPTIONS.find(s => s.value === tos.status)?.value || "Concluída Técnico"));
      setReason(tos.not_completed_reason || "");
    }
  }, [tos?.id, open]);

  const pushReviewHistory = (tosRecord, action, prevStatus, newStat, reasonText) => {
    const history = (tosRecord.review_history || []).slice();
    history.push({
      date: new Date().toISOString(),
      actor: currentUser?.full_name || currentUser?.email || "",
      previous_status: prevStatus,
      new_status: newStat,
      action,
      reason: reasonText || "",
    });
    return history;
  };

  const { shouldSendToFaturamento, needsFinancialApproval, validationErrors, buttonLabel, warningText } = evaluatePostSaleConclusion(tos, sale, parentOS);

  // 1. Concluir → enviar para faturamento (ou apenas concluir se não há o que faturar)
  const concludeMutation = useMutation({
    mutationFn: async () => {
      if (validationErrors.length > 0) {
        throw new Error("Preencha as informações financeiras obrigatórias: " + validationErrors.join("; "));
      }
      const prevStatus = tos.status;
      const action = shouldSendToFaturamento ? "Concluída para Faturamento" : "Concluída (sem faturamento)";
      const history = pushReviewHistory(tos, action, prevStatus, "Aguardando Faturamento - Pós", reason);
      // Atualiza a TOS: envia para Aguardando Faturamento - Pós + registra histórico
      await base44.entities.TechnicianServiceOrder.update(tosId, {
        status: "Aguardando Faturamento - Pós",
        review_history: history,
      });
      if (shouldSendToFaturamento) {
        // Define o status de destino da OS pai:
        // - needsFinancialApproval → "Aguardando Faturamento - Pós" (financeiro lança caixa e confere)
        // - !needsFinancialApproval (pré-pago não faturado) → "Aguardando Faturamento Final" (direto para faturamento)
        const targetStatus = needsFinancialApproval
          ? "Aguardando Faturamento - Pós"
          : "Aguardando Faturamento Final";
        const sourceLabel = needsFinancialApproval
          ? "Revisão Pós-Venda — enviar para aprovação financeira"
          : "Revisão Pós-Venda — enviar para faturamento final";
        if (tos.parent_os_id) {
          try {
            await base44.functions.invoke("updateOsStatus", {
              os_id: tos.parent_os_id,
              updates: { status: targetStatus },
              expected_status: null,
              source: sourceLabel,
            });
          } catch (e) { console.warn("Falha ao atualizar OS pai:", e); }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["technician-os", tosId] });
      queryClient.invalidateQueries({ queryKey: ["technician-os-by-parent"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast({
        title: needsFinancialApproval
          ? "OS enviada para Aprovação Financeira"
          : shouldSendToFaturamento
            ? "OS enviada para Faturamento Final"
            : "OS concluída",
        description: needsFinancialApproval
          ? "O financeiro deve lançar o caixa e conferir o comprovante. Após a aprovação, a OS vai para faturamento final."
          : shouldSendToFaturamento
            ? "A OS aguarda a emissão da NF-e/Nota Simples. Após o faturamento, a OS e o pedido serão concluídos automaticamente."
            : "A OS do técnico foi concluída. Não há valores a faturar neste momento.",
      });
      onOpenChange(false);
    },
    onError: (err) => toast({ title: "Erro ao concluir", description: err?.message, variant: "destructive" }),
  });

  // 2. Reagendar → volta para a agenda com motivo no histórico
  const rescheduleMutation = useMutation({
    mutationFn: async () => {
      const prevStatus = tos.status;
      const history = pushReviewHistory(tos, "Reagendada", prevStatus, newStatus, reason);
      // Reseta a TOS para Pendente (o técnico volta a atender), preserva o snapshot
      await base44.entities.TechnicianServiceOrder.update(tosId, {
        status: "Pendente",
        completed_at: null,
        not_completed_reason: "",
        review_history: history,
      });
      // OS pai → Agendamento/Rota (volta para a agenda/rota)
      if (tos.parent_os_id) {
        try {
          await base44.functions.invoke("updateOsStatus", {
            os_id: tos.parent_os_id,
            updates: { status: "Agendamento/Rota" },
            expected_status: null,
            source: "Revisão Pós-Venda — reagendamento",
          });
        } catch (e) { console.warn("Falha ao atualizar OS pai:", e); }
      }
      // Reseta o agendamento vinculado para "Agendado" (se existir) — a logística remarca
      if (tos.appointment_id) {
        try {
          await base44.entities.AgendamentoRota.update(tos.appointment_id, {
            status: "Agendado",
            technician_id: "",
            technician_name: "",
          });
        } catch (e) { console.warn("Falha ao resetar agendamento:", e); }
      }
      // Marca a OS como Reagendada e libera o vínculo com a rota anterior
      if (tos.parent_os_id) {
        try {
          await base44.functions.invoke("rescheduleServiceOrder", {
            os_id: tos.parent_os_id,
            reason,
            source: "Revisão Pós-Venda",
          });
        } catch (e) { console.warn("Falha ao liberar a OS da rota:", e); }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["technician-os", tosId] });
      queryClient.invalidateQueries({ queryKey: ["technician-os-by-parent"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["os-agendamento"] });
      queryClient.invalidateQueries({ queryKey: ["sale-appointments"] });
      toast({ title: "OS reagendada", description: "Motivo registrado no histórico. A OS voltou para a agenda — a logística deve remarcar e enviar para a rota." });
      onOpenChange(false);
    },
    onError: (err) => toast({ title: "Erro ao reagendar", description: err?.message, variant: "destructive" }),
  });

  // 3. Cancelar → cancela a OS do técnico e a OS pai
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const prevStatus = tos.status;
      const history = pushReviewHistory(tos, "Cancelada", prevStatus, "Cancelada", reason);
      await base44.entities.TechnicianServiceOrder.update(tosId, {
        status: "Cancelada",
        not_completed_reason: reason,
        review_history: history,
      });
      if (tos.parent_os_id) {
        try {
          await base44.functions.invoke("updateOsStatus", {
            os_id: tos.parent_os_id,
            updates: { status: "Cancelada" },
            expected_status: null,
            source: "Revisão Pós-Venda — cancelamento",
          });
        } catch (e) { console.warn("Falha ao atualizar OS pai:", e); }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["technician-os", tosId] });
      queryClient.invalidateQueries({ queryKey: ["technician-os-by-parent"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      toast({ title: "OS cancelada", description: "A OS do técnico e a OS pai foram canceladas." });
      onOpenChange(false);
    },
    onError: (err) => toast({ title: "Erro ao cancelar", description: err?.message, variant: "destructive" }),
  });

  if (!open || !tos) return null;

  const isConcluida = newStatus === "Concluída Técnico";
  const needsReason = !isConcluida;
  const hasFinancialErrors = isConcluida && validationErrors.length > 0;
  const canAct = canManageOS && (!needsReason || reason.trim().length > 0) && !hasFinancialErrors;
  const history = tos.review_history || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-violet-600" /> Revisão Pós-Venda
          </DialogTitle>
          <DialogDescription>
            Revise o atendimento do técnico e defina o desfecho da OS <code className="font-mono bg-cyan-100 text-cyan-800 px-1.5 py-0.5 rounded text-xs">{tos.code}</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status atual */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Status atual:</span>
            <Badge variant="outline">{tos.status}</Badge>
            {tos.completed_at && (
              <span className="text-xs text-muted-foreground">em {fmtDateTime(tos.completed_at)}</span>
            )}
          </div>

          {/* Motivo anterior (se houver) */}
          {tos.not_completed_reason && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs">
              <strong className="text-amber-800">Motivo registrado pelo técnico:</strong>
              <p className="text-amber-700 mt-0.5">{tos.not_completed_reason}</p>
            </div>
          )}

          {/* Seleção do novo status */}
          <div>
            <Label className="text-xs font-semibold">Desfecho da revisão</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger><SelectValue placeholder="Selecione o desfecho..." /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Motivo (obrigatório para não concluída) */}
          {needsReason && (
            <div>
              <Label className="text-xs font-semibold">Motivo / justificativa <span className="text-destructive">*</span></Label>
              <Textarea
                rows={3}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Detalhe o motivo do atendimento parcial/interrompido — será registrado no histórico..."
              />
            </div>
          )}

          {/* Histórico de revisões */}
          {history.length > 0 && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                <History className="h-3.5 w-3.5" /> Histórico de revisões
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {history.slice().reverse().map((h, i) => (
                  <div key={i} className="text-xs border-l-2 pl-2 py-1" style={{ borderColor: h.action === "Reagendada" ? "#f59e0b" : h.action === "Cancelada" ? "#ef4444" : "#10b981" }}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{h.action}</Badge>
                      <span className="text-muted-foreground">{fmtDateTime(h.date)}</span>
                      <span className="text-muted-foreground">· {h.actor || "—"}</span>
                    </div>
                    {h.reason && <p className="mt-0.5 text-muted-foreground">{h.reason}</p>}
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{h.previous_status} → {h.new_status}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Avisos explicativos */}
          {isConcluida && hasFinancialErrors && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-2 text-xs text-destructive flex items-start gap-1.5">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <strong>Bloqueado:</strong> Preencha antes de concluir:
                <ul className="list-disc pl-4 mt-0.5">
                  {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            </div>
          )}
          {isConcluida && !hasFinancialErrors && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700 flex items-start gap-1.5">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{warningText}</span>
            </div>
          )}
          {!isConcluida && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700 flex items-start gap-1.5">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span><strong>Reagendar:</strong> a OS volta para a agenda com o motivo no histórico — a logística remarca e envia para a rota novamente. <strong>Cancelar:</strong> encerra a OS definitivamente.</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={concludeMutation.isPending || rescheduleMutation.isPending || cancelMutation.isPending}>
            Fechar
          </Button>
          {isConcluida ? (
            <Button onClick={() => concludeMutation.mutate()} disabled={!canAct || concludeMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> {concludeMutation.isPending ? "Concluindo..." : buttonLabel}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => rescheduleMutation.mutate()} disabled={!canAct || rescheduleMutation.isPending} className="border-amber-400 text-amber-700 hover:bg-amber-50">
                <CalendarClock className="h-4 w-4" /> {rescheduleMutation.isPending ? "Reagendando..." : "Reagendar OS"}
              </Button>
              <Button variant="destructive" onClick={() => cancelMutation.mutate()} disabled={!canAct || cancelMutation.isPending}>
                <XCircle className="h-4 w-4" /> {cancelMutation.isPending ? "Cancelando..." : "Cancelar OS"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}