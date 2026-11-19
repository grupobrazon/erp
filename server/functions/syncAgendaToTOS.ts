// Gerado de base44/functions/syncAgendaToTOS/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch (e) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { appointment_id } = body;
    if (!appointment_id) return Response.json({ error: 'appointment_id é obrigatório' }, { status: 400 });

    // Get the appointment
    const appt = await base44.asServiceRole.entities.AgendamentoRota.get(appointment_id);
    if (!appt) return Response.json({ error: 'Agendamento não encontrado' }, { status: 404 });

    // Find linked TOSs by appointment_id
    let tosList = [];
    try {
      tosList = await base44.asServiceRole.entities.TechnicianServiceOrder.filter(
        { appointment_id }, "-created_date", 10
      );
    } catch (e) {}

    // Also find by sale_id → parent_os_id → TOS
    if (tosList.length === 0 && appt.sale_id) {
      const osList = await base44.asServiceRole.entities.ServiceOrder.filter({ sale_id: appt.sale_id }, "-created_date", 5);
      for (const os of osList) {
        try {
          const tosForOs = await base44.asServiceRole.entities.TechnicianServiceOrder.filter(
            { parent_os_id: os.id }, "-created_date", 1
          );
          tosList.push(...tosForOs);
        } catch (e) {}
      }
    }

    if (tosList.length === 0) {
      return Response.json({ success: true, synced: 0, message: 'Nenhuma OS do Técnico vinculada encontrada.' });
    }

    // Update each TOS with the new appointment date/time
    const updateData = {
      appointment_date: appt.date,
      appointment_time_type: appt.time_type,
      appointment_specific_time: appt.specific_time || "",
    };

    for (const tos of tosList) {
      try {
        await base44.asServiceRole.entities.TechnicianServiceOrder.update(tos.id, updateData);
      } catch (e) {}
    }

    return Response.json({
      success: true,
      synced: tosList.length,
      tos_codes: tosList.map(t => t.code),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});