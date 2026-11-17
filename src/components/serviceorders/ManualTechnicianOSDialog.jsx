import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wrench } from "lucide-react";
import { createWithCode } from "@/lib/codeGeneration";
import { useToast } from "@/components/ui/use-toast";

export default function ManualTechnicianOSDialog({ open, onOpenChange, order }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [calendarId, setCalendarId] = useState("");
  const [date, setDate] = useState("");
  const [timeType, setTimeType] = useState("Dia Inteiro");
  const [specificTime, setSpecificTime] = useState("");
  const [vehicleType, setVehicleType] = useState("Moto");
  const [selectedServiceTypes, setSelectedServiceTypes] = useState([]);
  const [serviceNotes, setServiceNotes] = useState("");

  const { data: calendars = [] } = useQuery({
    queryKey: ["calendars", "manual-tos"],
    queryFn: () => base44.entities.CalendarioRota.filter({ is_active: true }, "name", 100),
    enabled: !!open,
  });

  const { data: serviceTypes = [] } = useQuery({
    queryKey: ["serviceTypes", "manual-tos"],
    queryFn: () => base44.entities.ServiceType.filter({ is_active: true }, "order", 50),
    enabled: !!open,
  });

  const { data: client } = useQuery({
    queryKey: ["client", order?.client_id],
    queryFn: () => base44.entities.Client.get(order.client_id),
    enabled: !!open && !!order?.client_id,
  });

  const selectedCalendar = useMemo(() => calendars.find(c => c.id === calendarId), [calendars, calendarId]);

  const canSubmit = calendarId && date && timeType && selectedServiceTypes.length > 0 &&
    (timeType !== "Horário Específico" || specificTime);

  const reset = () => {
    setCalendarId("");
    setDate("");
    setTimeType("Dia Inteiro");
    setSpecificTime("");
    setVehicleType("Moto");
    setSelectedServiceTypes([]);
    setServiceNotes("");
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      const clientPhone = client?.phone1 || client?.phone2 || client?.phone3 || "";
      const calService = selectedCalendar?.calendar_services?.[0] || null;
      const durationMinutes = calService?.duration_minutes || 60;
      const addr = order.delivery_address || {};
      const fullAddress = addr.street
        ? `${addr.street || ""}, ${addr.number || ""} — ${addr.neighborhood || ""}, ${addr.city || ""}/${addr.state || ""}`
        : "";

      // 1. Criar AgendamentoRota no calendário selecionado
      const appointment = await base44.entities.AgendamentoRota.create({
        calendar_id: calendarId,
        calendar_name: selectedCalendar?.name || "",
        calendar_color: selectedCalendar?.color || "blue",
        title: order.client_name || "Atendimento",
        client_name: order.client_name || "",
        client_id: order.client_id || "",
        client_phone: clientPhone,
        regional: client?.regional || "",
        address: fullAddress,
        city: addr.city || "",
        date,
        time_type: timeType,
        specific_time: timeType === "Horário Específico" ? specificTime : "",
        duration_minutes: durationMinutes,
        service_id: calService?.service_id || "",
        service_name: calService?.service_name || "",
        service_detail_types: selectedServiceTypes.map(st => ({ service_type_id: st.id, service_type_name: st.name })),
        service_detail_notes: serviceNotes,
        vehicle_type: vehicleType,
        os_id: order.id,
        os_code: order.code,
        sale_id: order.sale_id || "",
        sale_order_number: order.sale_order_number || "",
        status: "Agendado",
      });

      // 2. Criar TechnicianServiceOrder vinculada à OS pai e ao agendamento
      const payload = {
        parent_os_id: order.id,
        parent_os_code: order.code,
        parent_os_type: "Manutenção/Garantia",
        client_id: order.client_id || "",
        client_name: order.client_name || "",
        appointment_id: appointment.id,
        appointment_date: date,
        appointment_time_type: timeType,
        appointment_specific_time: timeType === "Horário Específico" ? specificTime : "",
        service_detail_types: selectedServiceTypes.map(st => ({ service_type_id: st.id, service_type_name: st.name })),
        service_detail_notes: serviceNotes,
        status: "Pendente",
        checklist_results: [],
        technician_sale_items: [],
      };
      const { record } = await createWithCode("technician_os", payload);

      // 3. Vincular o código da OS do Técnico na OS pai
      await base44.entities.ServiceOrder.update(order.id, { technician_os_code: record.code });

      return record;
    },
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: ["technician-os-by-parent", order.id] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["agendamentoRotas"] });
      toast({ title: "OS do Técnico gerada", description: `${record.code} — agendamento criado para ${new Date(date + "T00:00:00").toLocaleDateString("pt-BR")}` });
      reset();
      onOpenChange(false);
    },
    onError: (err) => toast({ title: "Erro ao gerar OS do Técnico", description: err?.message, variant: "destructive" }),
  });

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" /> Gerar OS do Técnico — {order.code}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
            Criação manual de OS do Técnico para cliente que comprou via expedição. O agendamento será criado automaticamente no calendário selecionado.
          </div>

          <div>
            <Label>Cliente</Label>
            <div className="text-sm font-medium">{order.client_name}</div>
          </div>

          <div>
            <Label>Calendário (Agenda) *</Label>
            <Select value={calendarId} onValueChange={setCalendarId}>
              <SelectTrigger><SelectValue placeholder="Selecione o calendário" /></SelectTrigger>
              <SelectContent>
                {calendars.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Data *</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Tipo de Horário *</Label>
              <Select value={timeType} onValueChange={setTimeType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dia Inteiro">Dia Inteiro</SelectItem>
                  <SelectItem value="Manhã">Manhã</SelectItem>
                  <SelectItem value="Tarde">Tarde</SelectItem>
                  <SelectItem value="Horário Específico">Horário Específico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {timeType === "Horário Específico" && (
              <div>
                <Label>Horário *</Label>
                <Input type="time" value={specificTime} onChange={e => setSpecificTime(e.target.value)} />
              </div>
            )}
          </div>

          <div>
            <Label>Veículo *</Label>
            <Select value={vehicleType} onValueChange={setVehicleType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Moto">Moto</SelectItem>
                <SelectItem value="Carro">Carro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Tipos de Serviço * (o que o técnico fará)</Label>
            <div className="space-y-1 max-h-32 overflow-y-auto border rounded p-2">
              {serviceTypes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum tipo de serviço cadastrado.</p>
              ) : serviceTypes.map(st => {
                const selected = selectedServiceTypes.find(s => s.id === st.id);
                return (
                  <label key={st.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/30 rounded px-1 py-0.5">
                    <input
                      type="checkbox"
                      checked={!!selected}
                      onChange={e => {
                        if (e.target.checked) setSelectedServiceTypes([...selectedServiceTypes, st]);
                        else setSelectedServiceTypes(selectedServiceTypes.filter(s => s.id !== st.id));
                      }}
                    />
                    {st.name}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Observações do Serviço</Label>
            <Textarea rows={2} value={serviceNotes} onChange={e => setServiceNotes(e.target.value)} placeholder="Detalhes do que o técnico precisa fazer na casa do cliente" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!canSubmit || generateMutation.isPending} onClick={() => generateMutation.mutate()}>
            {generateMutation.isPending ? "Gerando..." : "Gerar OS do Técnico e Agendamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}