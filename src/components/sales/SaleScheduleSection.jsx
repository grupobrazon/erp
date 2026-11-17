import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarIcon, Clock, Sun, Sunset, MapPin, AlertTriangle, CheckCircle2, XCircle, Loader2, Plus } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { usePermissions } from "@/lib/permissions";
import { getColorClasses } from "@/lib/calendarColors";
import { format } from "date-fns";
import { getAvailableTimeTypes, getDefaultTimeType } from "@/lib/preScheduleRules";
import WhatsAppMessageCard from "@/components/sales/WhatsAppMessageCard";
import { resolveAppointmentLinks } from "@/lib/appointmentSaleLink";

/**
 * Seção de Agenda dentro da aba Relacionamento da venda.
 * Permite agendar um atendimento do cliente da venda em um calendário de rota (Agenda de Rotas).
 * Regras:
 *  - Primeiro seleciona o calendário; o cliente da venda é o cliente do agendamento.
 *  - O sistema valida se o cliente pertence à região do calendário (route_assignments).
 *  - Clientes sem região atribuída não podem ser agendados, A MENOS que o calendário
 *    marque allow_any_region = true (calendário avulso/genérico).
 */
export default function SaleScheduleSection({ client, saleId, orderNumber, osId, osCode, serviceDetailTypes, serviceDetailNotes, items, services, deliveryModality, maintenanceMode, deliveryDifferent, deliveryAddress, deliveryZoneId, deliveryZoneName, deliveryCalendarId, deliveryCalendarName }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const perms = usePermissions();
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);
  const [selectedAddressType, setSelectedAddressType] = useState(deliveryDifferent ? "delivery" : "client");
  const [form, setForm] = useState({
    calendar_id: "",
    date: format(new Date(), "yyyy-MM-dd"),
    time_type: "Dia Inteiro",
    specific_time: "08:00",
    duration_minutes: 60,
    service_id: "",
    service_name: "",
    vehicle_type: "",
    notes: "",
    pre_schedule_type: "Normal",
    pre_schedule_reason: "",
  });

  const { data: calendars = [] } = useQuery({
    queryKey: ["calendarioRotas"],
    queryFn: () => base44.entities.CalendarioRota.list("-created_date", 200),
  });
  const activeCalendars = calendars.filter(c => c.is_active !== false);

  const { data: appointments = [] } = useQuery({
    queryKey: ["sale-appointments", client?.id],
    queryFn: () => base44.entities.AgendamentoRota.filter(
      { client_name: client?.name },
      "-date",
      50
    ),
    enabled: !!client?.name,
  });

  // Agendamento vinculado a ESTA venda (não pode criar mais de um por venda)
  const saleAppointment = appointments.find(a => a.sale_id === saleId && a.status !== "Cancelado");
  const hasAppointment = !!saleAppointment;

  // Self-healing: se existir um agendamento do cliente com os_id vinculado a esta venda
  // mas com sale_id vazio (criado sem vincular a venda), corrige automaticamente o sale_id.
  // Isto garante que o badge verde de Agendamento apareça na Produção e evita duplicidade.
  useEffect(() => {
    if (!saleId || !appointments.length) return;
    const orphan = appointments.find(a =>
      !a.sale_id && a.os_id && a.status !== "Cancelado" &&
      (a.os_id === osId || a.os_code === osCode)
    );
    if (orphan) {
      base44.entities.AgendamentoRota.update(orphan.id, {
        sale_id: saleId,
        sale_order_number: orderNumber || "",
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["sale-appointments", client?.id] });
      }).catch(() => {});
    }
  }, [appointments, saleId, osId, osCode, orderNumber, client?.id, queryClient]);

  const { data: calendarAppointments = [] } = useQuery({
    queryKey: ["calendar-appointments", form.calendar_id],
    queryFn: () => base44.entities.AgendamentoRota.filter({ calendar_id: form.calendar_id }, "-date", 500),
    enabled: !!form.calendar_id,
  });

  // Busca os tipos de serviço cadastrados para obter a duração de cada um
  const { data: allServiceTypes = [] } = useQuery({
    queryKey: ["serviceTypes"],
    queryFn: () => base44.entities.ServiceType.list("order", 500),
  });

  // O agendamento fica bloqueado até o detalhamento do serviço estar salvo na venda
  const hasServiceDetail = !!(serviceDetailTypes && serviceDetailTypes.length > 0);

  // Duração total = soma das durações dos tipos de serviço selecionados no detalhamento
  const computedDuration = useMemo(() => {
    if (!hasServiceDetail) return 60;
    const ids = serviceDetailTypes.map(t => t.service_type_id).filter(Boolean);
    const sum = allServiceTypes
      .filter(st => ids.includes(st.id))
      .reduce((acc, st) => acc + (st.duration_minutes || 60), 0);
    return sum || 60;
  }, [hasServiceDetail, serviceDetailTypes, allServiceTypes]);

  // Nome do serviço para o agendamento = concatenação dos tipos selecionados
  const computedServiceName = useMemo(() => {
    if (!hasServiceDetail) return "";
    return serviceDetailTypes.map(t => t.service_type_name).join(" + ");
  }, [hasServiceDetail, serviceDetailTypes]);

  // Constrói as route_assignments do endereço de entrega (se houver)
  const deliveryRouteAssignments = (deliveryDifferent && deliveryZoneId)
    ? [{ zone_id: deliveryZoneId, zone_name: deliveryZoneName, calendar_id: deliveryCalendarId, calendar_name: deliveryCalendarName }]
    : (deliveryDifferent && deliveryCalendarId)
      ? [{ zone_id: "", zone_name: "", calendar_id: deliveryCalendarId, calendar_name: deliveryCalendarName }]
      : [];

  // Endereço efetivo: se o usuário escolheu "delivery" e há endereço de entrega, usa ele; senão usa o do cliente
  const useDeliveryAddress = deliveryDifferent && selectedAddressType === "delivery" && !!deliveryAddress?.city;
  const effectiveClient = useDeliveryAddress
    ? { ...client, street: deliveryAddress.street, number: deliveryAddress.number, complement: deliveryAddress.complement, neighborhood: deliveryAddress.neighborhood, city: deliveryAddress.city, state: deliveryAddress.state, zip_code: deliveryAddress.zip_code }
    : client;
  const effectiveRouteAssignments = useDeliveryAddress ? deliveryRouteAssignments : ((client?.route_assignments) || []);

  const routeAssignments = effectiveRouteAssignments;
  // Atribuições com zona específica (sub-região) — apenas estas permitem agendamento.
  // Atribuições só de calendário (zone_id vazio) = macrorregião (ex: "Grande BH") sem sub-zona definida.
  const zoneAssignments = routeAssignments.filter(a => a.zone_id);
  const clientCalendarIdsWithZone = new Set(zoneAssignments.map(a => a.calendar_id).filter(Boolean));
  const hasCalendarOnly = routeAssignments.some(a => a.calendar_id && !a.zone_id);
  const hasZoneAssignment = zoneAssignments.length > 0;

  const selectedCalendar = activeCalendars.find(c => c.id === form.calendar_id);
  const calendarServices = selectedCalendar?.calendar_services || [];
  const minAdvanceDays = selectedCalendar?.min_advance_business_days ?? 2;
  const minBookableDate = useMemo(() => {
    const d = new Date();
    let count = 0;
    while (count < minAdvanceDays) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) count++;
    }
    return d.toISOString().split("T")[0];
  }, [minAdvanceDays]);
  const tooSoon = form.date && form.date < minBookableDate;
  const calendarAllowsAny = !!selectedCalendar?.allow_any_region;
  const clientInCalendarWithZone = form.calendar_id ? clientCalendarIdsWithZone.has(form.calendar_id) : false;
  const canSchedule = !!form.calendar_id && (clientInCalendarWithZone || calendarAllowsAny);
  // O agendamento só é liberado quando existe um pedido (ou uma OS) para amarrá-lo —
  // assim o atendimento nunca fica solto na agenda.
  const hasOrderLink = !!(saleId || osId);
  const periodMode = selectedCalendar?.period_mode || "Dia Inteiro";
  const availableTimeTypes = getAvailableTimeTypes(form.pre_schedule_type, periodMode);

  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  // Atualiza a duração do form quando o detalhamento do serviço muda
  useEffect(() => {
    if (hasServiceDetail) {
      setForm(p => ({ ...p, duration_minutes: computedDuration }));
    }
  }, [computedDuration, hasServiceDetail]);

  const conflictDates = useMemo(() => {
    if (!form.calendar_id || !form.date || !client?.regional) return [];
    const regional = client.regional;
    // Datas passadas não são conflito: só agenda futura (a partir de hoje) disputa o período.
    const todayStr = new Date().toISOString().split("T")[0];
    const dates = new Set();
    for (const a of calendarAppointments) {
      if (a.status === "Cancelado") continue;
      if (a.regional && a.regional === regional && a.date && a.date >= todayStr && a.date !== form.date) {
        dates.add(a.date);
      }
    }
    return Array.from(dates).sort();
  }, [calendarAppointments, form.calendar_id, form.date, client?.regional]);

  const blockedReason = useMemo(() => {
    if (!form.calendar_id) return null;
    if (clientInCalendarWithZone) return null;
    if (calendarAllowsAny) return null;
    if (!hasZoneAssignment && hasCalendarOnly) {
      const calName = routeAssignments.find(a => !a.zone_id)?.calendar_name || "a macrorregião";
      return useDeliveryAddress
        ? `O endereço de entrega está atribuído apenas à macrorregião "${calName}" sem sub-zona específica. Recalcule a zona do endereço de entrega no pedido para atribuir a sub-zona.`
        : `O cliente está atribuído apenas à macrorregião "${calName}" sem uma sub-zona específica. "${calName}" é uma macrorregião dividida em várias sub-regiões — é preciso atribuir o cliente a uma sub-zona específica antes de agendar. Vá no cadastro do cliente, aba "Rota", e clique em "Recalcular Rota".`;
    }
    if (!hasZoneAssignment) {
      return useDeliveryAddress
        ? "O endereço de entrega está sem zona atribuída. Recalcule a zona no endereço de entrega do pedido antes de agendar."
        : "Este cliente está sem região/zona atribuída. Atualize o endereço do cliente no cadastro para que o sistema atribua a rota automaticamente antes de agendar.";
    }
    const calName = selectedCalendar?.name || "este calendário";
    const assignedNames = zoneAssignments
      .map(a => a.zone_name || a.calendar_name)
      .filter(Boolean)
      .join(", ") || "nenhuma";
    return useDeliveryAddress
      ? `O endereço de entrega não pertence à sub-zona de "${calName}". Zona atribuída: ${assignedNames}. Recalcule a zona do endereço de entrega ou selecione um calendário da região.`
      : `O cliente não pertence à sub-zona de "${calName}". Zonas atribuídas ao cliente: ${assignedNames}. Corrija o endereço do cliente ou selecione um calendário da região dele.`;
  }, [form.calendar_id, clientInCalendarWithZone, calendarAllowsAny, hasZoneAssignment, hasCalendarOnly, selectedCalendar, routeAssignments, zoneAssignments]);

  useEffect(() => {
    if (!client?.id || !form.calendar_id || !form.date || !canSchedule) {
      setValidation(null);
      return;
    }
    if (form.time_type === "Horário Específico") {
      setValidation(null);
      return;
    }
    let cancelled = false;
    setValidating(true);
    base44.functions.invoke("validatePreAgendamento", {
      client_id: client.id,
      date: form.date,
      time_type: form.time_type,
      calendar_id: form.calendar_id,
      vehicle_type: form.vehicle_type,
      pre_schedule_type: form.pre_schedule_type,
    }).then(res => {
      if (!cancelled) setValidation(res.data);
    }).catch(() => {
      if (!cancelled) setValidation(null);
    }).finally(() => {
      if (!cancelled) setValidating(false);
    });
    return () => { cancelled = true; };
  }, [client?.id, form.calendar_id, form.date, form.time_type, form.vehicle_type, form.pre_schedule_type, canSchedule]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const cal = selectedCalendar;
      // Todo agendamento nasce sabendo a qual pedido (e a qual OS) pertence,
      // independentemente da tela onde foi criado.
      const links = await resolveAppointmentLinks({ clientId: client?.id, saleId, saleOrderNumber: orderNumber, osId, osCode });
      const payload = {
        calendar_id: cal.id,
        calendar_name: cal.name || "",
        calendar_color: cal.color || "blue",
        title: client?.name || "Agendamento",
        client_name: client?.name || "",
        client_phone: client?.phone1 || client?.phone2 || "",
        client_id: client?.id || "",
        regional: client?.regional || "",
        address: [effectiveClient?.street, effectiveClient?.number, effectiveClient?.neighborhood].filter(Boolean).join(", "),
        city: effectiveClient?.city || "",
        date: form.date,
        time_type: form.time_type,
        specific_time: form.time_type === "Horário Específico" ? form.specific_time : "",
        service_id: "",
        service_name: computedServiceName || form.service_name || "",
        duration_minutes: computedDuration || Number(form.duration_minutes) || 60,
        notes: form.notes
          ? `${form.notes}${links.sale_order_number ? ` [Pedido ${links.sale_order_number}]` : ""}`
          : (links.sale_order_number ? `[Pedido ${links.sale_order_number}]` : ""),
        sale_id: links.sale_id,
        sale_order_number: links.sale_order_number,
        os_id: links.os_id,
        os_code: links.os_code,
        vehicle_type: form.vehicle_type || "",
        pre_schedule_type: form.pre_schedule_type || "Normal",
        pre_schedule_reason: form.pre_schedule_type !== "Normal" ? form.pre_schedule_reason.trim() : "",
        pending_approval: conflictDates.length > 0 && overrideConfirmed,
        approval_reason: conflictDates.length > 0 && overrideConfirmed ? overrideReason.trim() : "",
        relocation_note: validation?.relocation_required ? validation.relocation_note : "",
        service_detail_types: serviceDetailTypes || [],
        service_detail_notes: serviceDetailNotes || "",
        status: "Agendado",
      };
      return await base44.entities.AgendamentoRota.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agendamentoRotas"] });
      queryClient.invalidateQueries({ queryKey: ["sale-appointments", client?.id] });
      // Quando criado a partir da OS, recarrega a seção de agendamento da OS
      if (osId) queryClient.invalidateQueries({ queryKey: ["os-agendamento", saleId] });
      toast({ title: "Agendamento criado", description: conflictDates.length > 0 && overrideConfirmed ? "Atendimento incluído e enviado para aprovação do supervisor." : "O atendimento foi incluído na Agenda de Rotas." });
      setForm(p => ({ ...p, notes: "" }));
      setOverrideConfirmed(false);
      setOverrideReason("");
    },
    onError: (err) => toast({ title: "Erro ao agendar", description: err?.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!client?.name) {
      toast({ title: "Selecione um cliente na venda primeiro", variant: "destructive" });
      return;
    }
    if (!hasOrderLink) {
      toast({ title: "Salve o pedido antes de agendar", description: "O atendimento precisa ficar vinculado ao número do pedido. Salve a venda e agende em seguida.", variant: "destructive" });
      return;
    }
    // Detalhamento do serviço é obrigatório para agendar (Entrega/Entrega+Instalação)
    if (!serviceDetailTypes || serviceDetailTypes.length === 0) {
      toast({ title: "Detalhe o serviço antes de agendar", description: "Selecione pelo menos um tipo de serviço na aba 'Detalhamento do Serviço' antes de agendar o atendimento.", variant: "destructive" });
      return;
    }
    if (!serviceDetailNotes || !serviceDetailNotes.trim()) {
      toast({ title: "Observação do serviço obrigatória", description: "Preencha a observação do detalhamento do serviço antes de agendar.", variant: "destructive" });
      return;
    }
    if (!form.calendar_id) {
      toast({ title: "Selecione um calendário", variant: "destructive" });
      return;
    }
    if (!canSchedule) {
      toast({ title: "Não é possível agendar", description: blockedReason, variant: "destructive" });
      return;
    }
    if (!form.vehicle_type) {
      toast({ title: "Selecione o veículo", description: "Informe se o atendimento é de moto ou carro.", variant: "destructive" });
      return;
    }
    if (!form.date) {
      toast({ title: "Informe a data", variant: "destructive" });
      return;
    }
    if (tooSoon && !perms.canOverrideScheduleBlock) {
      toast({ title: "Antecedência mínima", description: `A data mais próxima disponível é ${new Date(minBookableDate + "T00:00:00").toLocaleDateString("pt-BR")} (${minAdvanceDays} dias úteis). Vendedores precisam de antecedência mínima; gestores podem agendar no dia ou véspera.`, variant: "destructive" });
      return;
    }
    if (form.pre_schedule_type !== "Normal" && !form.pre_schedule_reason.trim()) {
      toast({ title: "Justifique o pré-agendamento", description: "Informe o motivo do cliente precisar deste tipo de agendamento especial.", variant: "destructive" });
      return;
    }
    if (conflictDates.length > 0 && !overrideConfirmed) {
      toast({ title: "Conflito de região", description: `A região já tem agenda em ${conflictDates.map(d => new Date(d + "T00:00:00").toLocaleDateString("pt-BR")).join(", ")}. Verifique com o cliente ou marque a opção de justificativa.`, variant: "destructive" });
      return;
    }
    if (conflictDates.length > 0 && overrideConfirmed && !overrideReason.trim()) {
      toast({ title: "Justifique o agendamento", description: "Informe o motivo de não usar a data existente.", variant: "destructive" });
      return;
    }
    if (validation?.is_day_block) {
      toast({ title: "Período bloqueado", description: validation.message, variant: "destructive" });
      return;
    }
    if (validation?.level === "red" && !perms.canOverrideScheduleBlock) {
      toast({ title: "Agendamento bloqueado", description: validation.message, variant: "destructive" });
      return;
    }
    createMutation.mutate();
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-primary" />
          <h3 className="font-medium">Agenda de Atendimento</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Agende o atendimento do cliente na Agenda de Rotas. O sistema valida se o cliente pertence à região do calendário selecionado.
        </p>

        {!hasServiceDetail && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-amber-900 font-medium">Detalhe o serviço antes de agendar.</p>
              <p className="text-amber-800 text-xs mt-0.5">
                {maintenanceMode
                  ? <>Preencha o <strong>Detalhamento do Serviço</strong> acima (selecione os tipos de serviço e a observação para o técnico) e clique em <strong>Salvar Detalhamento</strong> para liberar o agendamento.</>
                  : <>Preencha o <strong>Detalhamento do Serviço</strong> (selecione os tipos de serviço e a observação para o técnico) e salve a venda para liberar o agendamento.</>
                }
              </p>
            </div>
          </div>
        )}

        {!hasOrderLink && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-amber-900 font-medium">Salve o pedido para liberar o agendamento.</p>
              <p className="text-amber-800 text-xs mt-0.5">
                Todo atendimento fica amarrado ao número do pedido (e à OS), em qualquer tela. Depois de salvar a venda, o agendamento é liberado aqui e já sai vinculado ao pedido.
              </p>
            </div>
          </div>
        )}

        {/* Status da região do cliente */}
        <div className={`rounded-lg border p-3 text-sm flex items-start gap-2 ${hasZoneAssignment ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
          {hasZoneAssignment ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          )}
          <div className="flex-1">
            <p className={hasZoneAssignment ? "text-emerald-800" : "text-amber-800"}>
              {hasZoneAssignment
                ? (useDeliveryAddress ? "Endereço de entrega com zona atribuída — pode ser agendado nos calendários da região." : "Cliente com sub-zona atribuída — pode ser agendado nos calendários da sua região.")
                : hasCalendarOnly
                  ? (useDeliveryAddress ? "Endereço de entrega atribuído apenas à macrorregião (sem sub-zona) — não pode ser agendado. Recalcule a zona do endereço de entrega no pedido." : "Cliente atribuído apenas à macrorregião (sem sub-zona específica) — não pode ser agendado. Vá no cadastro do cliente, aba \"Rota\", e clique em \"Recalcular Rota\" para atribuir a sub-zona.")
                  : (useDeliveryAddress ? "Endereço de entrega sem zona atribuída — recalcule a zona no endereço de entrega do pedido antes de agendar." : "Cliente sem região/zona atribuída — é preciso corrigir o endereço no cadastro do cliente para que a rota seja atribuída automaticamente.")}
            </p>
            {hasZoneAssignment && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {zoneAssignments.map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs bg-white border rounded-full px-2 py-0.5">
                    <MapPin className="h-3 w-3 text-primary" />
                    {a.zone_name || "—"}
                    {a.calendar_name && <span className="text-muted-foreground">· {a.calendar_name}</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Seletor de endereço: cliente vs endereço de entrega do pedido */}
        {deliveryDifferent && deliveryAddress?.city && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <Label className="text-xs font-medium text-primary">Endereço do Atendimento</Label>
            <p className="text-xs text-muted-foreground">O pedido tem endereço de entrega diferente do cadastro do cliente. Qual endereço usar no agendamento?</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectedAddressType("client")}
                className={`text-left p-2.5 rounded-lg border-2 text-sm transition ${selectedAddressType === "client" ? "border-primary bg-primary/10 text-primary" : "border-muted hover:bg-muted/50"}`}
              >
                <div className="flex items-center gap-1.5 font-medium">
                  <MapPin className="h-3.5 w-3.5" />
                  Endereço de Cadastro
                </div>
                <p className="text-xs mt-1 text-muted-foreground">
                  {client?.street ? `${client.street}, ${client.number || "s/n"}` : "—"}
                  {client?.neighborhood ? ` · ${client.neighborhood}` : ""}
                  {" · "}{client?.city || "—"}/{client?.state || "—"}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setSelectedAddressType("delivery")}
                className={`text-left p-2.5 rounded-lg border-2 text-sm transition ${selectedAddressType === "delivery" ? "border-primary bg-primary/10 text-primary" : "border-muted hover:bg-muted/50"}`}
              >
                <div className="flex items-center gap-1.5 font-medium">
                  <MapPin className="h-3.5 w-3.5" />
                  Endereço de Entrega do Pedido
                </div>
                <p className="text-xs mt-1 text-muted-foreground">
                  {deliveryAddress?.street ? `${deliveryAddress.street}, ${deliveryAddress.number || "s/n"}` : "—"}
                  {deliveryAddress?.neighborhood ? ` · ${deliveryAddress.neighborhood}` : ""}
                  {" · "}{deliveryAddress?.city || "—"}/{deliveryAddress?.state || "—"}
                </p>
                {deliveryZoneName && (
                  <p className="text-xs mt-1 text-emerald-600 font-medium">Zona: {deliveryZoneName}</p>
                )}
              </button>
            </div>
          </div>
        )}

        <div>
          <Label className="text-xs">Calendário *</Label>
          <Select disabled={!hasServiceDetail} value={form.calendar_id} onValueChange={v => setForm(p => ({ ...p, calendar_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Selecione o calendário" /></SelectTrigger>
            <SelectContent>
              {activeCalendars.map(c => {
                const colors = getColorClasses(c.color);
                const hasZone = clientCalendarIdsWithZone.has(c.id);
                const anyRegion = !!c.allow_any_region;
                return (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                      {c.name}
                      {hasZone && <span className="text-xs text-emerald-600">(sub-zona do cliente)</span>}
                      {anyRegion && <span className="text-xs text-muted-foreground">(qualquer região)</span>}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Serviço puxado do Detalhamento do Serviço (aba acima) — sem seletor manual */}
        {hasServiceDetail && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Serviços do atendimento: </span>
            <span className="font-medium">{computedServiceName}</span>
            <span className="text-xs text-muted-foreground ml-2">· {computedDuration} min total</span>
          </div>
        )}

        {form.calendar_id && (
          <div>
            <Label className="text-xs">Veículo do Atendimento *</Label>
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
                    disabled={!hasServiceDetail}
                    onClick={() => setForm(p => ({ ...p, vehicle_type: opt.value }))}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 text-sm font-medium transition ${active ? "border-primary bg-primary/5 text-primary" : "border-muted hover:bg-muted/50"} ${!hasServiceDetail ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <Label className="text-xs">Tipo de Pré-Agendamento</Label>
          <Select
            disabled={!hasServiceDetail}
            value={form.pre_schedule_type}
            onValueChange={v => {
              const newTimeType = getDefaultTimeType(v, form.time_type, selectedCalendar?.period_mode);
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

        {conflictDates.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-amber-900 font-medium">
                  A região <strong>{client?.regional}</strong> já tem agenda nestas datas: {conflictDates.map(d => new Date(d + "T00:00:00").toLocaleDateString("pt-BR")).join(", ")}.
                </p>
                <p className="text-amber-800 text-xs mt-1">
                  Verifique com o cliente se pode ser feita em uma destas datas. Se não puder, justifique abaixo para enviar para aprovação do supervisor/pós-venda.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={overrideConfirmed} onCheckedChange={setOverrideConfirmed} />
              <span className="text-sm">Cliente não pode fazer nas datas existentes — agendar em data diferente com justificativa</span>
            </label>
            {overrideConfirmed && (
              <Input
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="Justifique o motivo (ex: cliente viaja, só recebe no dia 19)"
              />
            )}
          </div>
        )}

        {blockedReason && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-destructive">{blockedReason}</p>
          </div>
        )}

        {validating && (
          <div className="rounded-lg border border-muted bg-muted/30 p-3 text-sm flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Validando compatibilidade da região...
          </div>
        )}

        {validation && !validating && (
          <div className={`rounded-lg border p-3 text-sm flex items-start gap-2 ${
            validation.level === "green" ? "bg-emerald-50 border-emerald-200" :
            validation.level === "yellow" ? "bg-amber-50 border-amber-200" :
            "bg-red-50 border-red-200"
          }`}>
            {validation.level === "green" ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" /> :
             validation.level === "yellow" ? <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" /> :
             <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />}
            <div className="flex-1">
              <p className={
                validation.level === "green" ? "text-emerald-800" :
                validation.level === "yellow" ? "text-amber-800" :
                "text-red-800"
              }>{validation.message}</p>
              {validation.regional_base && (
                <p className="text-xs mt-1 text-muted-foreground">
                  Regional Base do período: <strong>{validation.regional_base}</strong> · Cliente: {validation.client_regional || "—"}
                </p>
              )}
              {validation.min_distance_km != null && (
                <p className="text-xs text-muted-foreground">
                  Distância mínima aos demais: {validation.min_distance_km} km
                  {validation.min_duration_s != null && ` · ~${Math.round(validation.min_duration_s / 60)} min`}
                  {" "}({validation.distance_method === "google_maps_road" ? "estrada" : "linha reta"})
                </p>
              )}
              {validation.vehicle_capacity && (
                <p className="text-xs text-muted-foreground">
                  Capacidade do período ({validation.vehicle_capacity.useTarde ? "tarde" : "manhã/dia"}):
                  {" "}Moto {validation.vehicle_capacity.existingMoto}/{validation.vehicle_capacity.capMoto}
                  {validation.vehicle_capacity.motoOverflow > 0 && ` (+${validation.vehicle_capacity.motoOverflow} em slots de carro)`}
                  {" · "}Carro {validation.vehicle_capacity.carroSlotsUsed}/{validation.vehicle_capacity.capCarro}
                  {form.vehicle_type === "Moto" && validation.vehicle_capacity.existingMoto >= validation.vehicle_capacity.capMoto && validation.vehicle_capacity.carroSlotsUsed < validation.vehicle_capacity.capCarro && (
                    <span className="text-amber-600"> · moto em overflow para slots de carro</span>
                  )}
                </p>
              )}
              {validation.level === "red" && validation.can_override && perms.canOverrideScheduleBlock && (
                <p className="text-xs mt-1 text-red-600 font-medium">
                  Você tem permissão de gestor — pode liberar este agendamento excepcionalmente.
                </p>
              )}
              {validation.relocation_required && (
                <div className="mt-2 rounded-md border border-amber-300 bg-amber-100/60 p-2 text-xs text-amber-900">
                  <strong>⚠ Remanejamento necessário:</strong> {validation.relocation_note}
                  <p className="mt-1 font-medium">O agendamento do cliente de carro será liberado. O pós-venda verá esta observação e remanejará o(s) cliente(s) de moto para outra data.</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Data *</Label>
            <Input type="date" disabled={!hasServiceDetail} min={perms.canOverrideScheduleBlock ? undefined : minBookableDate} value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Cidade do atendimento</Label>
            <Input value={effectiveClient?.city || ""} disabled className="bg-muted" />
          </div>
        </div>

        {tooSoon && !perms.canOverrideScheduleBlock && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm flex items-start gap-2">
            <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-red-800 font-medium">Antecedência mínima de {minAdvanceDays} dias úteis</p>
              <p className="text-red-700 text-xs mt-0.5">
                A data mais próxima disponível é {new Date(minBookableDate + "T00:00:00").toLocaleDateString("pt-BR")}. A logística precisa de pelo menos {minAdvanceDays} dias úteis para organizar as agendas.
              </p>
            </div>
          </div>
        )}

        <div>
          <Label className="text-xs">Horário</Label>
          {availableTimeTypes.length === 0 ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-primary shrink-0" />
              <span className="text-primary font-medium">Dia Inteiro — o técnico atende apenas este cliente durante todo o dia. A rota será montada em torno dele.</span>
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
                    disabled={!hasServiceDetail}
                    onClick={() => setForm(p => ({ ...p, time_type: opt.value }))}
                    className={`flex flex-col items-center gap-1 py-2 rounded-lg border-2 text-xs font-medium transition ${active ? "border-primary bg-primary/5 text-primary" : "border-muted hover:bg-muted/50"} ${!hasServiceDetail ? "opacity-50 cursor-not-allowed" : ""}`}
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
              <Input type="time" value={form.specific_time} onChange={e => setForm(p => ({ ...p, specific_time: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Duração (min)</Label>
              <Input type="number" value={form.duration_minutes} onChange={e => setForm(p => ({ ...p, duration_minutes: Number(e.target.value) }))} />
            </div>
          </div>
        )}

        <div>
          <Label className="text-xs">Observações</Label>
          <Textarea rows={2} disabled={!hasServiceDetail} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notas sobre este agendamento" />
        </div>

        {hasAppointment && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-emerald-900 font-medium">Agendamento já realizado para esta venda.</p>
              <p className="text-emerald-800 text-xs mt-0.5">
                {saleAppointment.calendar_name} · {new Date(saleAppointment.date + "T00:00:00").toLocaleDateString("pt-BR")} · {saleAppointment.time_type === "Horário Específico" ? saleAppointment.specific_time : saleAppointment.time_type}
                {" "}— não é possível criar um novo agendamento para o mesmo pedido. Cancele o agendamento atual na Agenda de Rotas se precisar remarcar.
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="button" disabled={!hasServiceDetail || !canSchedule || !hasOrderLink || createMutation.isPending || hasAppointment} onClick={handleSubmit} className="gap-2">
            <Plus className="h-4 w-4" />
            {createMutation.isPending ? "Agendando..." : "Agendar Atendimento"}
          </Button>
        </div>

        {hasServiceDetail && hasAppointment && (
          <WhatsAppMessageCard
            client={client}
            date={saleAppointment.date}
            timeType={saleAppointment.time_type}
            specificTime={saleAppointment.specific_time}
            serviceDetailTypes={saleAppointment.service_detail_types || serviceDetailTypes}
            serviceDetailNotes={saleAppointment.service_detail_notes || serviceDetailNotes}
            items={items}
            services={services}
            deliveryModality={deliveryModality}
          />
        )}

        {appointments.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Agendamentos do cliente</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {appointments.map(a => {
                const colors = getColorClasses(a.calendar_color);
                return (
                  <div key={a.id} className="flex items-center gap-2 text-sm p-2 rounded-lg bg-muted/40">
                    <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                    <span className="font-medium">{a.calendar_name || "—"}</span>
                    <span className="text-muted-foreground">{a.date}</span>
                    <span className="text-muted-foreground text-xs">{a.time_type === "Horário Específico" ? a.specific_time : a.time_type}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{a.status}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}