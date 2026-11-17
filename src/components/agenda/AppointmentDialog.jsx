import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Sun, Sunset, Calendar as CalendarIcon, Trash2, FileText, Lock, ClipboardCheck, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const PRE_SCHEDULE_LABELS = {
  "Normal": "Normal (1 horário)",
  "Dia Inteiro": "Dia Inteiro (agenda fechada o dia todo)",
  "Meio Período": "Meio Período (bloqueia manhã OU tarde)",
  "2 Horários": "2 Horários",
  "3 Horários": "3 Horários",
};
import { useToast } from "@/components/ui/use-toast";
import { getColorClasses } from "@/lib/calendarColors";
import { format } from "date-fns";
import { getAvailableTimeTypes, getDefaultTimeType } from "@/lib/preScheduleRules";
import AppointmentTechnicianOSSection from "@/components/agenda/AppointmentTechnicianOSSection";
import { usePermissions } from "@/lib/permissions";
import { findClientForAppointment, resolveAppointmentLinks } from "@/lib/appointmentSaleLink";

export default function AppointmentDialog({ open, onOpenChange, calendars, prefillDate, editAppt }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const perms = usePermissions();
  const [validating, setValidating] = useState(false);
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [form, setForm] = useState({
    calendar_id: "",
    title: "",
    client_name: "",
    client_id: "",
    client_phone: "",
    address: "",
    city: "",
    date: format(new Date(), "yyyy-MM-dd"),
    time_type: "Dia Inteiro",
    specific_time: "08:00",
    duration_minutes: 60,
    service_id: "",
    service_name: "",
    vehicle_type: "",
    notes: "",
    status: "Agendado",
    pre_schedule_type: "Normal",
    pre_schedule_reason: "",
  });

  useEffect(() => {
    if (editAppt) {
      setForm({
        calendar_id: editAppt.calendar_id || "",
        title: editAppt.title || "",
        client_name: editAppt.client_name || "",
        client_id: editAppt.client_id || "",
        client_phone: editAppt.client_phone || "",
        address: editAppt.address || "",
        city: editAppt.city || "",
        date: editAppt.date || format(new Date(), "yyyy-MM-dd"),
        time_type: editAppt.time_type || "Dia Inteiro",
        specific_time: editAppt.specific_time || "08:00",
        duration_minutes: editAppt.duration_minutes || 60,
        service_id: editAppt.service_id || "",
        service_name: editAppt.service_name || "",
        vehicle_type: editAppt.vehicle_type || "",
        notes: editAppt.notes || "",
        status: editAppt.status || "Agendado",
        pre_schedule_type: editAppt.pre_schedule_type || "Normal",
        pre_schedule_reason: editAppt.pre_schedule_reason || "",
      });
    } else if (prefillDate) {
      setForm(p => ({
        ...p,
        date: typeof prefillDate === "string" ? prefillDate : format(prefillDate, "yyyy-MM-dd"),
        calendar_id: p.calendar_id || (calendars[0]?.id || ""),
      }));
    }
  }, [editAppt, prefillDate, calendars]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const cal = calendars.find(c => c.id === form.calendar_id);
      const payload = {
        ...form,
        calendar_name: cal?.name || "",
        calendar_color: cal?.color || "blue",
        specific_time: form.time_type === "Horário Específico" ? form.specific_time : "",
        service_name: cal?.calendar_services?.find(s => s.service_id === form.service_id)?.service_name || form.service_name || "",
      };
      let result;
      if (editAppt) {
        // Agendamento antigo sem pedido/OS: localiza e amarra automaticamente ao editá-lo
        if (!editAppt.sale_id && !editAppt.os_id && editAppt.client_id) {
          const links = await resolveAppointmentLinks({ clientId: editAppt.client_id });
          if (links.sale_id) {
            Object.assign(payload, {
              sale_id: links.sale_id,
              sale_order_number: links.sale_order_number,
              os_id: links.os_id,
              os_code: links.os_code,
            });
          }
        }
        result = await base44.entities.AgendamentoRota.update(editAppt.id, payload);
        try { await base44.functions.invoke("syncAgendaToTOS", { appointment_id: editAppt.id }); } catch (e) {}
        const changed = editAppt.date !== form.date || editAppt.time_type !== form.time_type;
        if (changed && editAppt.os_id) {
          try {
            await base44.functions.invoke("rescheduleServiceOrder", {
              os_id: editAppt.os_id,
              reason: rescheduleReason.trim() || "Reagendamento na agenda",
              source: "Agenda de Rotas",
              new_date: form.date,
            });
          } catch (e) { console.warn("Falha ao registrar reagendamento:", e); }
        }
      } else {
        // O agendamento sempre localiza de qual pedido se trata: procura o cliente
        // digitado na agenda e amarra o pedido em aberto (e a OS dele) ao atendimento.
        const client = form.client_id ? null : await findClientForAppointment({ name: form.client_name, phone: form.client_phone });
        const links = await resolveAppointmentLinks({
          clientId: form.client_id || client?.id,
          osId: form.os_id,
        });
        result = await base44.entities.AgendamentoRota.create({
          ...payload,
          client_id: form.client_id || client?.id || "",
          sale_id: links.sale_id,
          sale_order_number: links.sale_order_number,
          os_id: links.os_id,
          os_code: links.os_code,
        });
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agendamentoRotas"] });
      toast({ title: editAppt ? "Agendamento atualizado" : "Agendamento criado" });
      onOpenChange(false);
    },
    onError: (err) => toast({ title: "Erro", description: err?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.AgendamentoRota.delete(editAppt.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agendamentoRotas"] });
      toast({ title: "Agendamento excluído" });
      onOpenChange(false);
    },
    onError: (err) => toast({ title: "Erro", description: err?.message, variant: "destructive" }),
  });

  const selectedCalendar = calendars.find(c => c.id === form.calendar_id);
  const calendarServices = selectedCalendar?.calendar_services || [];
  const periodMode = selectedCalendar?.period_mode || "Dia Inteiro";

  // Fetch ServiceType records for duration lookup (fallback when calendar has no calendar_services)
  const { data: serviceTypes = [] } = useQuery({
    queryKey: ["serviceTypes"],
    queryFn: () => base44.entities.ServiceType.list("-order", 100),
  });
  const availableTimeTypes = getAvailableTimeTypes(form.pre_schedule_type, periodMode);
  const scheduleChanged = !!(editAppt && (editAppt.date !== form.date || editAppt.time_type !== form.time_type));
  const needsRescheduleReason = scheduleChanged && !!editAppt?.os_id;

  // Busca a venda vinculada para puxar o detalhamento do serviço e observações do técnico
  const saleId = editAppt?.sale_id;
  const { data: linkedSale } = useQuery({
    queryKey: ["sale-for-appointment", saleId],
    queryFn: () => base44.entities.Sale.get(saleId),
    enabled: !!saleId && !!(editAppt && (!editAppt.service_detail_types?.length || !editAppt.service_detail_notes)),
  });

  // Pré-visualização do vínculo: mostra de qual pedido é o atendimento que está sendo criado
  const clientKey = `${form.client_name || ""}|${form.client_phone || ""}`;
  const { data: linkPreview } = useQuery({
    queryKey: ["appointment-link-preview", clientKey],
    queryFn: async () => {
      const client = await findClientForAppointment({ name: form.client_name, phone: form.client_phone });
      if (!client) return null;
      const links = await resolveAppointmentLinks({ clientId: client.id });
      return links.sale_id ? { ...links } : null;
    },
    enabled: !editAppt && (form.client_name || "").trim().length > 3,
    staleTime: 30000,
  });

  // Prioriza os dados do próprio agendamento; fallback para a venda vinculada
  const displayServiceTypes = editAppt?.service_detail_types?.length > 0
    ? editAppt.service_detail_types
    : linkedSale?.service_detail_types || [];
  const displayServiceNotes = editAppt?.service_detail_notes || linkedSale?.service_detail_notes || "";
  const displayServiceName = displayServiceTypes.length > 0
    ? displayServiceTypes.map(t => t.service_type_name).join(" + ")
    : (editAppt?.service_name || "");

  const handleCalendarChange = (calId) => {
    const cal = calendars.find(c => c.id === calId);
    const pm = cal?.period_mode || "Dia Inteiro";
    let newTimeType = form.time_type;
    if (pm === "Dia Inteiro" && (newTimeType === "Manhã" || newTimeType === "Tarde")) newTimeType = "Dia Inteiro";
    if (pm === "Periodos" && newTimeType === "Dia Inteiro") newTimeType = "Manhã";
    setForm(p => ({ ...p, calendar_id: calId, time_type: newTimeType, service_id: "", service_name: "", duration_minutes: p.duration_minutes }));
  };

  const handleServiceChange = (serviceId) => {
    const svc = calendarServices.find(s => s.service_id === serviceId);
    // Fallback: look up duration from ServiceType when calendar_services is empty
    const svcType = !svc ? serviceTypes.find(st => st.id === serviceId) : null;
    setForm(p => ({
      ...p,
      service_id: serviceId,
      service_name: svc?.service_name || svcType?.name || "",
      duration_minutes: svc?.duration_minutes || svcType?.duration_minutes || p.duration_minutes,
    }));
  };

  const handleSubmit = async () => {
    if (!form.calendar_id) { toast({ title: "Selecione um calendário", variant: "destructive" }); return; }
    if (!form.title) { toast({ title: "Informe um título", variant: "destructive" }); return; }
    if (!form.date) { toast({ title: "Informe a data", variant: "destructive" }); return; }

    // Verificação de dia bloqueado — roda SEMPRE (com ou sem cliente vinculado).
    // Um dia bloqueado (status "Bloqueado") é bloqueio hard: nem admin pode sobrescrever.
    try {
      setValidating(true);
      const blockFilter = {
        $and: [
          { date: form.date },
          { calendar_id: form.calendar_id },
          { status: "Bloqueado" },
          { $or: [{ time_type: form.time_type }, { time_type: "Dia Inteiro" }] },
        ],
      };
      const blocked = await base44.entities.AgendamentoRota.filter(blockFilter, "created_date", 10);
      if (blocked && blocked.length > 0) {
        const b = blocked[0];
        const bNotes = b.notes ? ` — Motivo: ${b.notes}` : "";
        toast({ title: "Período bloqueado", description: `Este período está bloqueado para agendamentos${bNotes}. Selecione outra data ou período.`, variant: "destructive" });
        return;
      }

      // Validação regional (igual ao SaleScheduleSection) — só se houver cliente vinculado
      if (form.client_id && form.time_type !== "Horário Específico") {
        const validation = await base44.functions.invoke("validatePreAgendamento", {
          client_id: form.client_id,
          date: form.date,
          time_type: form.time_type,
          calendar_id: form.calendar_id,
          vehicle_type: form.vehicle_type || undefined,
          pre_schedule_type: form.pre_schedule_type || "Normal",
          address: form.address ? `${form.address}${form.city ? ", " + form.city : ""}` : undefined,
        });
        // Bloqueio de dia (is_day_block) é hard — não pode ser sobrescrito por ninguém
        if (validation?.is_day_block) {
          toast({ title: "Período bloqueado", description: validation.message, variant: "destructive" });
          return;
        }
        if (validation?.level === "red" && !perms.canOverrideScheduleBlock) {
          toast({ title: "Agendamento bloqueado", description: validation.message, variant: "destructive" });
          return;
        }
        if (validation?.level === "red" && perms.canOverrideScheduleBlock) {
          toast({ title: "Atenção: conflito regional", description: validation.message, variant: "warning" });
        }
      }
    } catch (e) {
      // Validação indisponível — não bloqueia o agendamento
    } finally {
      setValidating(false);
    }
    saveMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            {editAppt ? "Editar Agendamento" : "Novo Agendamento"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {(editAppt?.sale_order_number || editAppt?.os_code) && (
            <div className="flex items-center gap-2 text-xs rounded-lg border bg-muted/40 p-2 flex-wrap">
              <FileText className="h-3.5 w-3.5 text-primary" />
              {editAppt.sale_order_number && <Badge variant="outline">Pedido {editAppt.sale_order_number}</Badge>}
              {editAppt.os_code ? (
                <Badge className="bg-cyan-600 text-white">
                  <ClipboardCheck className="h-3 w-3 mr-1" /> OS {editAppt.os_code}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">Sem OS gerada</Badge>
              )}
            </div>
          )}
          {editAppt && <AppointmentTechnicianOSSection appointment={editAppt} />}
          {editAppt && form.pre_schedule_type && form.pre_schedule_type !== "Normal" && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm space-y-1">
              <div className="flex items-start gap-2">
                <Lock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-amber-900 font-medium">Pré-agendamento: {PRE_SCHEDULE_LABELS[form.pre_schedule_type] || form.pre_schedule_type}</p>
                  {form.pre_schedule_reason && (
                    <p className="text-amber-800 text-xs mt-1">Justificativa: {form.pre_schedule_reason}</p>
                  )}
                  {form.vehicle_type === "Carro" && (
                    <p className="text-amber-800 text-xs mt-0.5">Atendimento de <strong>Carro</strong> — bloqueia slots de carro do técnico.</p>
                  )}
                </div>
              </div>
            </div>
          )}
          {editAppt && form.vehicle_type && (
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <Badge variant="outline" className={form.vehicle_type === "Carro" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}>
                Veículo: {form.vehicle_type}
              </Badge>
              {editAppt.calendar_name && (
                <Badge variant="outline" className="bg-primary/5">
                  <MapPin className="h-3 w-3 mr-1" /> {editAppt.calendar_name}
                </Badge>
              )}
              {editAppt.regional && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700">
                  Regional: {editAppt.regional}
                </Badge>
              )}
            </div>
          )}
          <div>
            <Label className="text-xs">Calendário *</Label>
            <Select value={form.calendar_id} onValueChange={handleCalendarChange}>
              <SelectTrigger><SelectValue placeholder="Selecione o calendário" /></SelectTrigger>
              <SelectContent>
                {calendars.filter(c => c.is_active !== false).map(c => {
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

          <div>
            <Label className="text-xs">Título do Agendamento *</Label>
            <Input
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="Ex: João Silva, Instalação Purificador"
            />
          </div>

          <div>
            <Label className="text-xs">Serviço</Label>
            {(displayServiceTypes.length > 0 || displayServiceName) ? (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <div className="font-medium">{displayServiceName}</div>
                {(editAppt?.duration_minutes || linkedSale) && (
                  <div className="text-xs text-muted-foreground mt-0.5">Duração: {editAppt?.duration_minutes || 60}min</div>
                )}
              </div>
            ) : (calendarServices.length > 0 || serviceTypes.length > 0) ? (
              <Select value={form.service_id || "none"} onValueChange={v => handleServiceChange(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar serviço" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nenhum —</SelectItem>
                  {calendarServices.map(s => (
                    <SelectItem key={s.service_id} value={s.service_id}>
                      {s.service_name} ({s.duration_minutes}min)
                    </SelectItem>
                  ))}
                  {serviceTypes.filter(st => !calendarServices.some(cs => cs.service_id === st.id)).map(st => (
                    <SelectItem key={st.id} value={st.id}>
                      {st.name} ({st.duration_minutes || 60}min)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground italic">
                Serviço não detalhado pelo vendedor.
              </div>
            )}
          </div>

          {displayServiceNotes && (
            <div>
              <Label className="text-xs">Observações do Serviço (Técnico)</Label>
              <div className="rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 text-sm whitespace-pre-wrap">
                {displayServiceNotes}
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Veículo</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {[
                { value: "Moto", label: "Moto" },
                { value: "Carro", label: "Carro" },
              ].map(opt => {
                const active = form.vehicle_type === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, vehicle_type: opt.value }))}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 text-sm font-medium transition ${active ? "border-primary bg-primary/5 text-primary" : "border-muted hover:bg-muted/50"}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Cliente (opcional)</Label>
              <Input
                value={form.client_name}
                onChange={e => setForm(p => ({ ...p, client_name: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Telefone (opcional)</Label>
              <Input
                value={form.client_phone}
                onChange={e => setForm(p => ({ ...p, client_phone: e.target.value }))}
              />
            </div>
          </div>

          {!editAppt && (form.client_name || "").trim().length > 3 && (
            <div className="flex items-center gap-2 text-xs rounded-lg border bg-muted/40 p-2">
              <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
              {linkPreview ? (
                <span>
                  Vinculado ao pedido <strong>{linkPreview.sale_order_number || "—"}</strong>
                  {linkPreview.os_code ? ` · OS ${linkPreview.os_code}` : " · sem OS gerada ainda"}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Nenhum pedido em aberto encontrado para este cliente — o atendimento será criado sem pedido vinculado.
                </span>
              )}
            </div>
          )}

          <div>
            <Label className="text-xs">Endereço (opcional)</Label>
            <Input
              value={form.address}
              onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
              placeholder="Rua, número, bairro"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Data *</Label>
              <Input
                type="date"
                value={form.date}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Cidade (opcional)</Label>
              <Input
                value={form.city}
                onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Tipo de Pré-Agendamento</Label>
            <Select
              value={form.pre_schedule_type}
              onValueChange={v => {
                const newTimeType = getDefaultTimeType(v, form.time_type, periodMode);
                setForm(p => ({ ...p, pre_schedule_type: v, time_type: newTimeType }));
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Normal">Normal (1 horário)</SelectItem>
                <SelectItem value="Dia Inteiro">Dia Inteiro (bloqueia agenda o dia todo)</SelectItem>
                <SelectItem value="Meio Período">Meio Período (bloqueia manhã ou tarde)</SelectItem>
                <SelectItem value="2 Horários">2 Horários</SelectItem>
                <SelectItem value="3 Horários">3 Horários</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.pre_schedule_type !== "Normal" && (
            <div>
              <Label className="text-xs">Justificativa do Pré-Agendamento *</Label>
              <Textarea
                rows={2}
                value={form.pre_schedule_reason}
                onChange={e => setForm(p => ({ ...p, pre_schedule_reason: e.target.value }))}
                placeholder="Explique o motivo (ex: cliente só recebe no dia todo, precisa de 2 horários para instalar múltiplos equipamentos)"
              />
            </div>
          )}

          <div>
            <Label className="text-xs">Horário</Label>
            {availableTimeTypes.length === 0 ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-primary shrink-0" />
                <span className="text-primary font-medium">Dia Inteiro — o técnico atende apenas este cliente durante todo o dia.</span>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 mt-1">
                {[
                  { value: "Horário Específico", icon: Clock, label: "Horário" },
                  { value: "Manhã", icon: Sun, label: "Manhã" },
                  { value: "Tarde", icon: Sunset, label: "Tarde" },
                  { value: "Dia Inteiro", icon: CalendarIcon, label: "Dia todo" },
                ].filter(opt => availableTimeTypes.includes(opt.value)).map(opt => {
                  const Icon = opt.icon;
                  const active = form.time_type === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm(p => ({ ...p, time_type: opt.value }))}
                      className={`flex flex-col items-center gap-1 py-2 rounded-lg border-2 text-xs font-medium transition ${active ? "border-primary bg-primary/5 text-primary" : "border-muted hover:bg-muted/50"}`}
                    >
                      <Icon className="h-4 w-4" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {form.time_type === "Horário Específico" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Horário *</Label>
                <Input
                  type="time"
                  value={form.specific_time}
                  onChange={e => setForm(p => ({ ...p, specific_time: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Duração (min)</Label>
                <Input
                  type="number"
                  value={form.duration_minutes}
                  onChange={e => setForm(p => ({ ...p, duration_minutes: Number(e.target.value) }))}
                />
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Status</Label>
            <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Agendado">Agendado</SelectItem>
                <SelectItem value="Confirmado">Confirmado</SelectItem>
                <SelectItem value="Concluído">Concluído</SelectItem>
                <SelectItem value="Cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2}
              placeholder="Notas sobre este agendamento"
            />
          </div>

          {needsRescheduleReason && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
              <p className="text-xs text-amber-900 font-medium">
                A data/período mudou — este atendimento será marcado como Reagendado e liberado da rota anterior.
              </p>
              <div>
                <Label className="text-xs">Motivo do reagendamento *</Label>
                <Textarea
                  rows={2}
                  value={rescheduleReason}
                  onChange={e => setRescheduleReason(e.target.value)}
                  placeholder="Ex: cliente pediu para remarcar"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {editAppt && (
            <Button variant="ghost" onClick={() => deleteMutation.mutate()} className="text-destructive mr-auto">
              <Trash2 className="h-4 w-4 mr-1" /> Excluir
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!form.title || !form.calendar_id || !form.date || (needsRescheduleReason && !rescheduleReason.trim()) || saveMutation.isPending || validating}
            onClick={handleSubmit}
          >
            {validating ? "Validando..." : saveMutation.isPending ? "Salvando..." : editAppt ? "Salvar" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}