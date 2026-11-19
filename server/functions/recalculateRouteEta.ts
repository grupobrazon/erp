// Gerado de base44/functions/recalculateRouteEta/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

// Recalcula a previsão de chegada das paradas restantes de uma rota em andamento,
// consultando o Google Maps Directions API com departure_time=now (tráfego em tempo real).
//
// SEGURANÇA: NÃO reordena as paradas, NÃO altera paradas já concluídas/checked-in,
// NÃO altera o status da rota, NÃO altera a estrutura. Apenas atualiza os campos
// de ETA (arrival_time, service_start_time, departure_time, travel_from_prev_min,
// distance_from_prev_km) das paradas que ainda não foram iniciadas, a partir da
// posição atual do técnico (último check-in ou partida da empresa).
//
// Retorna os novos ETAs calculados para exibição imediata no frontend.

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch (e) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { route_id, current_lat, current_lng } = body;
    if (!route_id) return Response.json({ error: 'route_id é obrigatório' }, { status: 400 });

    const route = await base44.asServiceRole.entities.TechnicianRoute.get(route_id);
    if (!route) return Response.json({ error: 'Rota não encontrada' }, { status: 404 });

    // Só recalcula rotas em andamento (check-in feito, sem check-out)
    if (!route.checkin_at || route.checkout_at) {
      return Response.json({ error: 'Rota não está em andamento' }, { status: 400 });
    }

    const API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!API_KEY) return Response.json({ error: 'Google Maps API key não configurada' }, { status: 500 });

    const stops = [...(route.stops || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    if (stops.length === 0) return Response.json({ error: 'Rota sem paradas' }, { status: 400 });

    // Determinar quais paradas já foram concluídas/checked-in (NÃO devem ser alteradas)
    const isStopDone = (stop) => {
      // Se tem TOS vinculada e está concluída
      if (stop.tos_id) {
        // Não temos o tosMap aqui, mas se stop.checked_in e já passou, presumimos feita
        // O frontend envia o estado; aqui usamos checked_in como proxy conservador
      }
      return stop.checked_in; // paradas com check-in já feito não são recalculadas
    };

    // Encontrar o índice da primeira parada não concluída (próxima a ser atendida)
    const firstPendingIdx = stops.findIndex(s => !isStopDone(s));
    if (firstPendingIdx === -1) {
      return Response.json({ message: 'Todas as paradas já foram iniciadas', updated: false });
    }

    // Origem para o cálculo: posição atual do técnico (GPS) ou último check-in ou partida da empresa
    let originLat: number | null = null;
    let originLng: number | null = null;
    if (current_lat != null && current_lng != null) {
      originLat = current_lat;
      originLng = current_lng;
    } else {
      // Usar o último check-in de parada como origem
      for (let i = firstPendingIdx - 1; i >= 0; i--) {
        if (stops[i].checkin_lat != null && stops[i].checkin_lng != null) {
          originLat = stops[i].checkin_lat;
          originLng = stops[i].checkin_lng;
          break;
        }
      }
      // Se não há check-in de parada, usar a partida da empresa
      if (originLat == null) {
        originLat = route.departure_lat;
        originLng = route.departure_lng;
      }
    }

    if (originLat == null || originLng == null) {
      return Response.json({ error: 'Não foi possível determinar a origem para o cálculo' }, { status: 400 });
    }

    // Paradas pendentes (a partir de firstPendingIdx) — estas terão o ETA recalculado
    const pendingStops = stops.slice(firstPendingIdx);
    const pendingCoords = pendingStops
      .filter(s => s.lat != null && s.lng != null)
      .map(s => `${s.lat},${s.lng}`);

    if (pendingCoords.length === 0) {
      return Response.json({ message: 'Sem paradas com coordenadas para recalcular', updated: false });
    }

    // Construir a URL da Directions API com departure_time=now para tráfego em tempo real
    // NÃO usamos optimize:true — preservamos a ordem original das paradas
    const origin = `${originLat},${originLng}`;
    const destination = pendingCoords[pendingCoords.length - 1];
    const waypoints = pendingCoords.length > 1 ? pendingCoords.slice(0, -1).join('|') : '';

    const params = new URLSearchParams({
      origin,
      destination,
      key: API_KEY,
      departure_time: 'now',
      traffic_model: 'best_guess',
      mode: 'driving',
    });
    if (waypoints) {
      // Sem optimize — preserva a ordem exata das paradas
      params.set('waypoints', waypoints);
    }

    const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== 'OK' || !data.routes?.[0]) {
      return Response.json({
        error: `Google Maps retornou: ${data.status}`,
        error_message: data.error_message || null,
        updated: false,
      }, { status: 502 });
    }

    const legs = data.routes[0].legs || [];

    // Mapear as legs para as paradas pendentes
    // A primeira leg vai da origem até a primeira parada pendente
    // As legs subsequentes vão de parada para parada
    const now = new Date();
    let cumulativeMinutes = 0; // minutos a partir de agora

    const updatedStops = [...stops]; // cópia para atualizar
    const etaUpdates = [];

    for (let i = 0; i < pendingStops.length; i++) {
      const stopIdx = firstPendingIdx + i;
      const leg = legs[i];
      if (!leg) continue;

      const travelSec = leg.duration_in_traffic?.value || leg.duration?.value || 0;
      const travelMin = Math.round(travelSec / 60);
      const distanceKm = Math.round((leg.distance?.value || 0) / 1000 * 10) / 10;

      // Tempo de chegada = agora + tempo acumulado de viagem
      const arrivalDate = new Date(now.getTime() + (cumulativeMinutes + travelMin) * 60 * 1000);
      const arrivalHHMM = arrivalDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      // Tempo de início do atendimento = tempo de chegada (sem buffer extra — o buffer já está no plano original)
      const serviceStartHHMM = arrivalHHMM;

      // Duração do atendimento (preservar a original da parada)
      const serviceDurationMin = pendingStops[i].service_duration_min || 45;

      // Saída = início + duração do atendimento
      const departureDate = new Date(arrivalDate.getTime() + serviceDurationMin * 60 * 1000);
      const departureHHMM = departureDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      // Atualizar a parada na cópia
      updatedStops[stopIdx] = {
        ...updatedStops[stopIdx],
        arrival_time: arrivalHHMM,
        service_start_time: serviceStartHHMM,
        departure_time: departureHHMM,
        travel_from_prev_min: travelMin,
        distance_from_prev_km: distanceKm,
      };

      etaUpdates.push({
        order: pendingStops[i].order,
        os_code: pendingStops[i].os_code,
        client_name: pendingStops[i].client_name,
        arrival_time: arrivalHHMM,
        service_start_time: serviceStartHHMM,
        departure_time: departureHHMM,
        travel_from_prev_min: travelMin,
        distance_from_prev_km: distanceKm,
      });

      // Acumular tempo para a próxima parada
      cumulativeMinutes += travelMin + serviceDurationMin;
    }

    // Calcular novo horário de término da rota
    const lastStop = updatedStops[updatedStops.length - 1];
    let estimatedEndTime = route.estimated_end_time;
    if (lastStop?.departure_time) {
      // Adicionar tempo da última parada até o destino final (empresa ou casa)
      const arrivalLat = route.arrival_lat;
      const arrivalLng = route.arrival_lng;
      if (arrivalLat != null && arrivalLng != null && lastStop.lat != null && lastStop.lng != null) {
        try {
          const retParams = new URLSearchParams({
            origin: `${lastStop.lat},${lastStop.lng}`,
            destination: `${arrivalLat},${arrivalLng}`,
            key: API_KEY,
            departure_time: 'now',
            traffic_model: 'best_guess',
            mode: 'driving',
          });
          const retUrl = `https://maps.googleapis.com/maps/api/directions/json?${retParams.toString()}`;
          const retRes = await fetch(retUrl);
          const retData = await retRes.json();
          if (retData.status === 'OK' && retData.routes?.[0]?.legs?.[0]) {
            const retSec = retData.routes[0].legs[0].duration_in_traffic?.value || retData.routes[0].legs[0].duration?.value || 0;
            const retMin = Math.round(retSec / 60);
            const endDate = new Date(now.getTime() + (cumulativeMinutes + retMin) * 60 * 1000);
            estimatedEndTime = endDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          }
        } catch (e) {}
      }
    }

    // Recalcular totais de deslocamento e atendimento (apenas das paradas pendentes)
    let totalTravelMin = 0;
    let totalServiceMin = 0;
    for (const s of updatedStops) {
      if (s.travel_from_prev_min) totalTravelMin += s.travel_from_prev_min;
      if (s.service_duration_min) totalServiceMin += s.service_duration_min;
    }

    // Atualizar a rota no banco — preservando TODOS os outros campos
    await base44.asServiceRole.entities.TechnicianRoute.update(route_id, {
      stops: updatedStops,
      estimated_end_time: estimatedEndTime,
      total_travel_min: totalTravelMin,
      total_service_min: totalServiceMin,
    });

    return Response.json({
      updated: true,
      recalculated_at: new Date().toISOString(),
      origin_used: { lat: originLat, lng: originLng },
      eta_updates: etaUpdates,
      estimated_end_time: estimatedEndTime,
      total_travel_min: totalTravelMin,
      total_service_min: totalServiceMin,
    });
  } catch (err) {
    return Response.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
});