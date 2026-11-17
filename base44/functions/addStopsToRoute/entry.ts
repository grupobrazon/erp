import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { haversineKm, geocodeAddress } from '../../shared/zoneGeo.ts';

// Adiciona NOVOS atendimentos a uma rota de técnico que já existe — inclusive quando ela
// já está Em Andamento. É uma operação SOMENTE DE INCLUSÃO: nenhuma parada existente é
// removida, reordenada ou resetada, e o status da rota é preservado.
// Permitida apenas para administradores e para usuários com a permissão individual
// "adicionar_atendimentos_rota" (User.extra_permissions).

const PERMISSION = 'adicionar_atendimentos_rota';

function hhmmToMin(value) {
  if (!value || typeof value !== 'string') return null;
  const m = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function minToHhmm(min) {
  const total = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function formatAddress(addr) {
  if (!addr) return '';
  return [addr.street, addr.number, addr.neighborhood, addr.city, addr.state].filter(Boolean).join(', ');
}

function mapOSTypeToTOS(type) {
  if (type === 'Manutenção') return 'Manutenção/Garantia';
  if (type === 'Entrega + Instalação') return 'Entrega + Instalação';
  return 'Entrega';
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = !user.role || user.role === 'admin';
    const extra = Array.isArray(user.extra_permissions) ? user.extra_permissions : [];
    if (!isAdmin && !extra.includes(PERMISSION)) {
      return Response.json({ error: 'Você não tem permissão para adicionar atendimentos a uma rota.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const routeId = body && body.route_id ? String(body.route_id) : '';
    const osIds = Array.isArray(body && body.os_ids) ? body.os_ids.filter(Boolean) : [];
    if (!routeId) return Response.json({ error: 'route_id é obrigatório.' }, { status: 400 });
    if (osIds.length === 0) return Response.json({ error: 'Selecione ao menos um atendimento.' }, { status: 400 });

    let route = null;
    try {
      route = await base44.asServiceRole.entities.TechnicianRoute.get(routeId);
    } catch (e) {
      route = null;
    }
    if (!route) return Response.json({ error: 'Rota não encontrada — ela foi excluída ou substituída. Atualize a lista e tente novamente.' }, { status: 404 });
    if (['Concluída', 'Cancelada'].includes(route.status)) {
      return Response.json({ error: `${route.code} está ${route.status} e não pode receber novos atendimentos.` }, { status: 400 });
    }

    const existingStops = [...(route.stops || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    const alreadyInRoute = new Set(existingStops.map(s => s.os_id).filter(Boolean));

    const osPage = await base44.asServiceRole.entities.ServiceOrder.filter({ id: { $in: osIds } }, { limit: 100 });
    const fetched = osPage.items || [];
    // Preserva a ordem em que os atendimentos foram selecionados na tela
    const orders = osIds
      .map(id => fetched.find(o => o.id === id))
      .filter(o => o && !alreadyInRoute.has(o.id));

    if (orders.length === 0) {
      return Response.json({ success: true, added: 0, message: 'Os atendimentos selecionados já estão nesta rota.' });
    }

    // Bloqueio: pedidos que ainda não passaram pela produção (ou não estão aguardando rota)
    // não podem ser adicionados à rota.
    const ROUTE_READY_STATUSES = ['Produção Liberada', 'Aguardando Rota', 'Rota Enviada', 'Agendamento/Rota'];
    const blocked = orders.filter(o => o.type !== 'Expedição' && !ROUTE_READY_STATUSES.includes(o.status));
    if (blocked.length > 0) {
      return Response.json({
        error: `Bloqueado: ${blocked.map(o => `${o.code} (${o.status})`).join(', ')} — somente pedidos com produção liberada (ou aguardando rota) podem entrar na rota.`,
      }, { status: 400 });
    }

    // TOS já existentes para estes atendimentos
    const tosPage = await base44.asServiceRole.entities.TechnicianServiceOrder.filter(
      { parent_os_id: { $in: orders.map(o => o.id) } }, { limit: 100 }
    );
    const tosByOs = {};
    (tosPage.items || []).forEach(t => { if (!tosByOs[t.parent_os_id]) tosByOs[t.parent_os_id] = t; });

    // Agendamentos vinculados (data, duração, detalhamento do serviço)
    const apptPage = await base44.asServiceRole.entities.AgendamentoRota.filter(
      { os_id: { $in: orders.map(o => o.id) } }, { limit: 100 }
    );
    const apptByOs = {};
    (apptPage.items || []).forEach(a => { if (!apptByOs[a.os_id]) apptByOs[a.os_id] = a; });

    const allTOS = await base44.asServiceRole.entities.TechnicianServiceOrder.list('-created_date', 2000);
    let tosMaxNum = allTOS.reduce((max, t) => Math.max(max, parseInt(String(t.code || '').replace('TOS', ''), 10) || 0), 0);

    // Garante a OS do Técnico (TOS) de cada atendimento novo — sem ela o app do técnico não executa
    for (const os of orders) {
      if (tosByOs[os.id]) continue;
      const appt = apptByOs[os.id];
      let sale = null;
      if (os.sale_id) {
        try { sale = await base44.asServiceRole.entities.Sale.get(os.sale_id); } catch (e) { /* segue sem a venda */ }
      }
      const itemsToDeliver = (sale?.items || []).map(i => ({
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: i.quantity,
      }));
      const pendingAmount = (sale?.payments || [])
        .filter(p => p.payment_status === 'Pendente' && (p.payment_moment === 'Na Entrega' || p.payment_moment === 'Na Instalação'))
        .reduce((sum, p) => sum + (p.amount || 0), 0);

      tosMaxNum += 1;
      const tosCode = `TOS${String(tosMaxNum).padStart(6, '0')}`;
      try {
        const newTOS = await base44.asServiceRole.entities.TechnicianServiceOrder.create({
          code: tosCode,
          parent_os_id: os.id,
          parent_os_code: os.code,
          parent_os_type: mapOSTypeToTOS(os.type),
          client_id: os.client_id,
          client_name: os.client_name || '',
          sale_id: os.sale_id || '',
          sale_order_number: os.sale_order_number || '',
          appointment_id: appt?.id || '',
          appointment_date: appt?.date || '',
          appointment_time_type: appt?.time_type || '',
          appointment_specific_time: appt?.specific_time || '',
          technician_id: route.technician_id || '',
          technician_name: route.technician || '',
          status: 'Pendente',
          items_to_deliver: itemsToDeliver,
          service_detail_types: sale?.service_detail_types || appt?.service_detail_types || os.service_detail_types || [],
          service_detail_notes: sale?.service_detail_notes || appt?.service_detail_notes || os.service_detail_notes || '',
          pending_payment_amount: pendingAmount,
          checklist_results: [],
          technician_sale_items: [],
        });
        tosByOs[os.id] = newTOS;
        await base44.asServiceRole.entities.ServiceOrder.update(os.id, { technician_os_code: tosCode });
      } catch (e) {
        return Response.json({ error: `Falha ao gerar a OS do Técnico para ${os.code}. Detalhe: ${e.message || e}` }, { status: 400 });
      }
    }

    // Monta as novas paradas (com endereço geocodificado e previsão de horário)
    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    const lastStop = existingStops[existingStops.length - 1] || null;
    let prevLat = lastStop?.lat ?? route.departure_lat ?? null;
    let prevLng = lastStop?.lng ?? route.departure_lng ?? null;
    let cursorMin = hhmmToMin(lastStop?.departure_time)
      ?? hhmmToMin(route.departure_time)
      ?? hhmmToMin(route.estimated_end_time)
      ?? 8 * 60;

    const newStops = [];
    let order = existingStops.length;

    for (const os of orders) {
      const appt = apptByOs[os.id];
      const address = formatAddress(os.delivery_address);
      let coords = null;
      try { coords = await geocodeAddress(address, apiKey); } catch (e) { /* segue sem coordenadas */ }
      const lat = coords?.lat ?? null;
      const lng = coords?.lng ?? null;

      const duration = appt?.duration_minutes > 0
        ? appt.duration_minutes
        : (os.type === 'Entrega + Instalação' ? 90 : 45);

      let distanceKm = 0;
      let travelMin = 0;
      if (prevLat != null && prevLng != null && lat != null && lng != null) {
        distanceKm = Math.round(haversineKm(prevLat, prevLng, lat, lng) * 10) / 10;
        travelMin = Math.max(1, Math.round((distanceKm / 30) * 60));
      }

      cursorMin += travelMin;
      const arrival = minToHhmm(cursorMin);
      cursorMin += duration;

      order += 1;
      const tos = tosByOs[os.id];
      newStops.push({
        order,
        os_id: os.id,
        os_code: os.code,
        tos_id: tos?.id || '',
        tos_code: tos?.code || '',
        client_name: os.client_name || '',
        address,
        lat,
        lng,
        service_type: os.type,
        service_duration_min: duration,
        travel_from_prev_min: travelMin,
        distance_from_prev_km: distanceKm,
        arrival_time: arrival,
        service_start_time: arrival,
        departure_time: minToHhmm(cursorMin),
        appointment_id: appt?.id || '',
        has_payment: !!os.has_pending_payment,
        payment_amount: os.pending_payment_amount || 0,
        checked_in: false,
      });

      prevLat = lat;
      prevLng = lng;
    }

    const updatedStops = [...existingStops, ...newStops].map((s, i) => ({ ...s, order: i + 1 }));

    const updatedRoute = await base44.asServiceRole.entities.TechnicianRoute.update(route.id, {
      stops: updatedStops,
      total_distance_km: Math.round(updatedStops.reduce((sum, s) => sum + (s.distance_from_prev_km || 0), 0) * 10) / 10,
      total_travel_min: updatedStops.reduce((sum, s) => sum + (s.travel_from_prev_min || 0), 0),
      total_service_min: updatedStops.reduce((sum, s) => sum + (s.service_duration_min || 0), 0),
      estimated_end_time: minToHhmm(cursorMin),
    });

    // Grava o histórico de status ao mudar para "Rota Enviada" — sem ele, a fila da
    // Produção não detecta a saída da OS e ela desaparece da tela da Produção.
    const osById = {};
    for (const o of orders) osById[o.id] = o;
    await base44.asServiceRole.entities.ServiceOrder.bulkUpdate(
      newStops.map(s => {
        const os = osById[s.os_id];
        const history = Array.isArray(os?.status_history) ? [...os.status_history] : [];
        if (os && os.status !== 'Rota Enviada') {
          history.push({
            date: new Date().toISOString(),
            actor: user.full_name || '',
            source: 'Adicionar Paradas à Rota',
            previous_status: os.status,
            new_status: 'Rota Enviada',
          });
        }
        return {
          id: s.os_id,
          route_id: route.id,
          route_order: s.order,
          technician: route.technician || '',
          status: 'Rota Enviada',
          status_history: history,
        };
      })
    );

    return Response.json({ success: true, added: newStops.length, route: updatedRoute });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}