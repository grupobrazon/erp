import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wrench, Calendar, ExternalLink } from "lucide-react";
import TechnicianOSForm from "./technician-os/TechnicianOSForm";
import WhatsAppMessageCard from "@/components/sales/WhatsAppMessageCard";

export default function ExpeditionTechnicianOSSection({ order }) {
  const [showForm, setShowForm] = useState(false);

  const { data: existingTOS, isLoading } = useQuery({
    queryKey: ["technician-os-by-parent", order?.id],
    queryFn: () => base44.entities.TechnicianServiceOrder.filter({ parent_os_id: order.id }, "-created_date", 5),
    enabled: !!order?.id,
  });

  const tos = existingTOS?.[0] || null;

  const { data: appointment } = useQuery({
    queryKey: ["appointment", tos?.appointment_id],
    queryFn: () => base44.entities.AgendamentoRota.get(tos.appointment_id),
    enabled: !!tos?.appointment_id,
  });

  const { data: client } = useQuery({
    queryKey: ["client", order?.client_id],
    queryFn: () => base44.entities.Client.get(order.client_id),
    enabled: !!order?.client_id && !!tos,
  });

  const { data: sale } = useQuery({
    queryKey: ["sale", order?.sale_id],
    queryFn: () => base44.entities.Sale.get(order.sale_id),
    enabled: !!order?.sale_id && !!tos,
  });

  // Cliente para a mensagem de WhatsApp: usa o endereço de entrega da OS (expedição)
  // combinado com os telefones do cliente cadastrado.
  const whatsappClient = useMemo(() => {
    if (!client) return null;
    const addr = order.delivery_address || {};
    return {
      ...client,
      name: order.client_name || client.name,
      street: addr.street || client.street,
      number: addr.number || client.number,
      complement: addr.complement || client.complement,
      neighborhood: addr.neighborhood || client.neighborhood,
      city: addr.city || client.city,
      state: addr.state || client.state,
      zip_code: addr.zip_code || client.zip_code,
    };
  }, [client, order]);

  // OS de Envio não oferece OS do Técnico manual — o bloco só aparece quando já existe uma TOS vinculada
  if (!isLoading && !tos) return null;

  return (
    <div className="rounded-md border border-cyan-200 bg-cyan-50/30 p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Wrench className="h-4 w-4 text-primary" /> OS do Técnico (Manual)
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : tos ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <code className="font-mono bg-cyan-100 text-cyan-800 px-2 py-0.5 rounded">{tos.code}</code>
              <Badge variant="outline">{tos.status}</Badge>
              {tos.appointment_date && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> {new Date(tos.appointment_date + "T00:00:00").toLocaleDateString("pt-BR")} — {tos.appointment_time_type}
                </span>
              )}
            </div>
            {(tos.service_detail_types || []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tos.service_detail_types.map((st, i) => (
                  <Badge key={i} variant="outline" className="text-xs bg-cyan-50">{st.service_type_name}</Badge>
                ))}
              </div>
            )}
            {tos.service_detail_notes && (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{tos.service_detail_notes}</p>
            )}
            <Button size="sm" variant="default" onClick={() => setShowForm(true)}>
              <ExternalLink className="h-3 w-3" /> Abrir OS do Técnico
            </Button>
          </div>

          {appointment && whatsappClient && (
            <WhatsAppMessageCard
              client={whatsappClient}
              date={appointment.date}
              timeType={appointment.time_type}
              specificTime={appointment.specific_time}
              serviceDetailTypes={tos.service_detail_types}
              serviceDetailNotes={tos.service_detail_notes}
              items={sale?.items || []}
              services={sale?.services || []}
              deliveryModality="Atendimento Técnico"
            />
          )}
        </div>
      ) : null}

      {showForm && tos && (
        <TechnicianOSForm open={showForm} onOpenChange={setShowForm} tosId={tos.id} />
      )}
    </div>
  );
}