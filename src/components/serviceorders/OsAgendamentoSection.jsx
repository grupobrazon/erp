import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, Clock, Sun, Sunset, Calendar as CalendarIcon, User, FileText, Save, History, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { getColorClasses } from "@/lib/calendarColors";
import { format } from "date-fns";
import SaleScheduleSection from "@/components/sales/SaleScheduleSection";
import MaintenanceServiceDetailEditor from "@/components/serviceorders/MaintenanceServiceDetailEditor";
import MaintenanceWhatsAppCard from "@/components/serviceorders/MaintenanceWhatsAppCard";

/**
 * Seção de Agenda dentro do detalhe da OS.
 * Mostra o agendamento vinculado à venda (criado pelo vendedor) e permite
 * à logística/supervisão/admin editar data, período, calendário, técnico e observação.
 * O vendedor sempre visualiza (read-only) — nunca edita por aqui.
 */
export default function OsAgendamentoSection({ order, sale, readOnly, currentUser }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(false);

  const saleId = sale?.id || order?.sale_id;

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["os-agendamento", saleId],
    queryFn: () => base44.entities.AgendamentoRota.filter({ sale_id: saleId }, "-date", 10),
    enabled: !!saleId,
  });

  const appt = appointments[0] || null;

  // Busca o cliente para permitir criar agendamento a partir da OS (mesmo formulário da venda)
  // e para gerar mensagens WhatsApp em OS de Manutenção (mesmo quando já agendada).
  const { data: client } = useQuery({
    queryKey: ["client", order?.client_id],
    queryFn: () => base44.entities.Client.get(order.client_id),
    enabled: !!order?.client_id && (!appt || order?.type === "Manutenção"),
  });

  const { data: calendars = [] } = useQuery({
    queryKey: ["calendarioRotas"],
    queryFn: () => base44.entities.CalendarioRota.list("-created_date", 200),
  });
  const activeCalendars = calendars.filter(c => c.is_active !== false);

  const { data: technicians = [] } = useQuery({
    queryKey: ["technicians"],
    queryFn: () => base44.entities.Technician.list("-created_date", 200),
  });

  useEffect(() => {
    if (appt) {
      setForm({
        date: appt.date || format(new Date(), "yyyy-MM-dd"),
        time_type: appt.time_type || "Dia Inteiro",
        calendar_id: appt.calendar_id || "",
        technician_id: appt.technician_id || "",
        notes: appt.notes || "",
      });
    } else {
      setForm(null);
    }
    setEditing(false);
  }, [appt?.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const cal = activeCalendars.find(c => c.id === form.calendar_id);
      const tech = technicians.find(t => t.id === form.technician_id);
      const history = (appt.schedule_history || []).slice();
      // Registra a alteração se data/período/calendário mudaram (preserva a agenda sugestiva do vendedor)
      if (appt && (appt.date !== form.date || appt.time_type !== form.time_type || appt.calendar_id !== form.calendar_id)) {
        history.push({
          date: appt.date,
          time_type: appt.time_type,
          calendar_name: appt.calendar_name || "",
          changed_by: currentUser?.full_name || "Logística",
          changed_at: new Date().toISOString(),
        });
      }
      const payload = {
        date: form.date,
        time_type: form.time_type,
        calendar_id: form.calendar_id,
        calendar_name: cal?.name || "",
        calendar_color: cal?.color || "blue",
        technician_id: form.technician_id || "",
        technician_name: tech?.name || "",
        notes: form.notes,
        schedule_history: history,
      };
      return base44.entities.AgendamentoRota.update(appt.id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["os-agendamento", saleId] });
      queryClient.invalidateQueries({ queryKey: ["agendamentoRotas"] });
      toast({ title: "Agendamento atualizado", description: "A agenda de rotas foi atualizada." });
      setEditing(false);
    },
    onError: (err) => toast({ title: "Erro ao atualizar agendamento", description: err?.message, variant: "destructive" }),
  });

  const selectedCalendar = activeCalendars.find(c => c.id === (form?.calendar_id || appt?.calendar_id));
  const periodMode = selectedCalendar?.period_mode || "Dia Inteiro";

  const timeTypeOptions = [
    { value: "Horário Específico", icon: Clock, label: "Horário" },
    { value: "Manhã", icon: Sun, label: "Manhã" },
    { value: "Tarde", icon: Sunset, label: "Tarde" },
    { value: "Dia Inteiro", icon: CalendarIcon, label: "Dia todo" },
  ].filter(opt => {
    if (opt.value === "Horário Específico") return true;
    if (periodMode === "Dia Inteiro") return opt.value === "Dia Inteiro";
    if (periodMode === "Periodos") return opt.value === "Manhã" || opt.value === "Tarde";
    return true;
  });

  const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";
  const fmtDateTime = (d) => d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div className="rounded-md border border-violet-200 bg-violet-50/30 p-3">
      <div className="flex items-center gap-1.5 mb-2 text-sm font-semibold">
        <CalendarClock className="h-4 w-4 text-primary" /> Agenda de Atendimento
        <div className="ml-auto flex items-center gap-1.5">
          {appt?.sale_order_number && (
            <Badge variant="outline" className="text-xs gap-1">
              <FileText className="h-3 w-3" /> Ped. {appt.sale_order_number}
            </Badge>
          )}
          {appt?.os_code && (
            <Badge variant="outline" className="text-xs bg-cyan-50 text-cyan-700 gap-1">
              <FileText className="h-3 w-3" /> {appt.os_code}
            </Badge>
          )}
        </div>
      </div>

      {isLoading && (
        <p className="text-xs text-muted-foreground">Carregando agendamento...</p>
      )}

      {!isLoading && !appt && !readOnly && client && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-amber-800 font-medium">Nenhum agendamento vinculado a esta OS.</p>
              <p>Agende o atendimento abaixo — é o mesmo formulário da venda. O agendamento será vinculado automaticamente a esta OS.</p>
            </div>
          </div>

          {/* Descrição do problema/motivo (OS de Manutenção) */}
          {order?.service_description && order?.type === "Manutenção" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 text-sm">
              <div className="text-xs font-medium text-amber-800 mb-1">Descrição do Problema / Motivo</div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{order.service_description}</p>
            </div>
          )}

          {/* Editor de detalhamento para OS de Manutenção — aparece sempre que a venda
              vinculada não tenha detalhamento. O editor salva na OS e tem modo visualização
              (com botão Editar) quando já preenchido, e modo edição quando vazio. */}
          {order?.type === "Manutenção" && !(sale?.service_detail_types?.length > 0) && (
            <MaintenanceServiceDetailEditor order={order} />
          )}

          <SaleScheduleSection
            client={client}
            saleId={saleId}
            orderNumber={sale?.order_number || order?.sale_order_number}
            osId={order?.id}
            osCode={order?.code}
            serviceDetailTypes={sale?.service_detail_types?.length ? sale.service_detail_types : (order?.service_detail_types || [])}
            serviceDetailNotes={sale?.service_detail_notes || order?.service_detail_notes || ""}
            maintenanceMode={order?.type === "Manutenção"}
          />
        </div>
      )}

      {!isLoading && !appt && !readOnly && !client && (
        <div className="text-xs text-muted-foreground flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-amber-800 font-medium">Nenhum agendamento vinculado a esta OS.</p>
            <p>Carregando dados do cliente para permitir o agendamento...</p>
          </div>
        </div>
      )}

      {!isLoading && !appt && readOnly && (
        <div className="text-xs text-muted-foreground flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-amber-800 font-medium">Vendedor ainda não agendou pela venda.</p>
            <p>O agendamento é feito pelo vendedor dentro da venda (aba Relacionamento). Quando ele agendar, a OS vincula automaticamente e aparece aqui.</p>
          </div>
        </div>
      )}

      {!isLoading && appt && !editing && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">Calendário:</span>
              <div className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${getColorClasses(appt.calendar_color).dot}`} />
                <span className="font-medium">{appt.calendar_name || "—"}</span>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Data:</span>
              <div className="font-medium">{fmtDate(appt.date)}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Período:</span>
              <div className="font-medium">
                {appt.time_type === "Horário Específico" ? `${appt.specific_time} (${appt.duration_minutes}min)` : appt.time_type}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Técnico:</span>
              <div className="font-medium flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> {appt.technician_name || "Não atribuído"}
              </div>
            </div>
          </div>
          {appt.notes && (
            <div className="text-xs text-muted-foreground border-t pt-2 whitespace-pre-wrap">{appt.notes}</div>
          )}
          {(appt.schedule_history || []).length > 0 && (
            <div className="border-t pt-2">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                <History className="h-3 w-3" /> Histórico de alterações
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {(appt.schedule_history || []).map((h, i) => (
                  <div key={i} className="text-xs text-muted-foreground">
                    {fmtDate(h.date)} · {h.time_type} · {h.calendar_name}
                    <span className="text-muted-foreground/70"> — alterado por {h.changed_by} em {fmtDateTime(h.changed_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!readOnly && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(true)}>
              <Save className="h-3.5 w-3.5" /> Editar Agendamento
            </Button>
          )}

          {/* Gerador de mensagens WhatsApp para OS de Manutenção */}
          {order?.type === "Manutenção" && client && (
            <MaintenanceWhatsAppCard order={order} client={client} appointment={appt} />
          )}
        </div>
      )}

      {!isLoading && appt && editing && (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Calendário</Label>
            <Select value={form.calendar_id} onValueChange={v => setForm(p => ({ ...p, calendar_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione o calendário" /></SelectTrigger>
              <SelectContent>
                {activeCalendars.map(c => {
                  const colors = getColorClasses(c.color);
                  return (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                        {c.name}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Período</Label>
              <div className="grid grid-cols-2 gap-1.5 mt-0.5">
                {timeTypeOptions.map(opt => {
                  const Icon = opt.icon;
                  const active = form.time_type === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm(p => ({ ...p, time_type: opt.value }))}
                      className={`flex items-center justify-center gap-1 py-1.5 rounded-lg border-2 text-xs font-medium transition ${active ? "border-primary bg-primary/5 text-primary" : "border-muted hover:bg-muted/50"}`}
                    >
                      <Icon className="h-3.5 w-3.5" /> {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <Label className="text-xs">Técnico</Label>
            <Select value={form.technician_id || "none"} onValueChange={v => setForm(p => ({ ...p, technician_id: v === "none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="Atribuir técnico (opcional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Não atribuído —</SelectItem>
                {technicians.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button size="sm" className="gap-1.5" disabled={!form.calendar_id || !form.date || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              <Save className="h-3.5 w-3.5" /> {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}