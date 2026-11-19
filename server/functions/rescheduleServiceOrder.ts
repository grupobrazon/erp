// Gerado de base44/functions/rescheduleServiceOrder/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

// Marca uma OS como Reagendada: libera o vínculo com a rota anterior (para que ela
// possa entrar em uma nova rota) e guarda o motivo + histórico em reschedule_history.
// Nada é apagado: a rota antiga concluída/cancelada mantém seu histórico intacto.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const osId = body && body.os_id ? String(body.os_id) : '';
    const reason = body && body.reason ? String(body.reason).trim() : '';
    const source = body && body.source ? String(body.source) : 'Reagendamento';
    const newDate = body && body.new_date ? String(body.new_date) : '';

    if (!osId) return Response.json({ error: 'os_id é obrigatório.' }, { status: 400 });
    if (!reason) return Response.json({ error: 'Informe o motivo do reagendamento.' }, { status: 400 });

    let os = null;
    try {
      os = await base44.asServiceRole.entities.ServiceOrder.get(osId);
    } catch {
      os = null;
    }
    if (!os) return Response.json({ error: 'OS não encontrada — o registro foi atualizado ou excluído por outro fluxo.' }, { status: 404 });
    if (['Concluída', 'Entregue', 'Cancelada'].includes(os.status)) {
      return Response.json({ error: `${os.code} está ${os.status} e não pode ser reagendada.` }, { status: 400 });
    }

    const now = new Date().toISOString();
    const actor = user.full_name || user.display_name || user.email || '';
    const previousRouteId = os.route_id || '';
    let previousRouteCode = '';

    // Remove a parada da rota anterior SOMENTE se ela ainda estiver ativa.
    // Rota concluída/cancelada é histórico — permanece intacta.
    if (previousRouteId) {
      try {
        const route = await base44.asServiceRole.entities.TechnicianRoute.get(previousRouteId);
        previousRouteCode = route?.code || '';
        const isActive = route && !['Concluída', 'Cancelada'].includes(route.status);
        if (isActive && Array.isArray(route.stops) && route.stops.some(s => s.os_id === os.id)) {
          const stops = route.stops
            .filter(s => s.os_id !== os.id)
            .map((s, i) => ({ ...s, order: i + 1 }));
          await base44.asServiceRole.entities.TechnicianRoute.update(route.id, { stops });
        }
      } catch {
        // A rota antiga pode não existir mais — segue liberando a OS.
      }
    }

    const history = [
      ...(Array.isArray(os.reschedule_history) ? os.reschedule_history : []),
      {
        date: now,
        actor,
        reason,
        source,
        previous_route_id: previousRouteId,
        previous_route_code: previousRouteCode,
        previous_status: os.status || '',
        new_date: newDate,
      },
    ];

    const updated = await base44.asServiceRole.entities.ServiceOrder.update(os.id, {
      route_id: null,
      route_order: 0,
      rescheduled: true,
      reschedule_reason: reason,
      reschedule_date: now,
      reschedule_by: actor,
      reschedule_history: history,
    });

    return Response.json({ success: true, service_order: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}