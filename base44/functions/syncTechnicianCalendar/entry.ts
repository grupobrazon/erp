import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

const CONNECTOR_ID = '6a566ba1f7924f994a4d589f';
const CALENDAR_NAME = 'Brazon - Agenda';
const TIMEZONE = 'America/Sao_Paulo';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Find the technician record matching this user by full_name
    const techs = await base44.entities.Technician.filter({ name: user.full_name || '__none__' });
    const technician = techs[0];
    if (!technician) {
      return Response.json({ error: 'Técnico não encontrado para este usuário. Solicite o vínculo ao administrador.' }, { status: 404 });
    }

    // Get the app user's Google Calendar OAuth connection
    let accessToken;
    try {
      const conn = await base44.asServiceRole.connectors.getCurrentAppUserConnection(CONNECTOR_ID);
      accessToken = conn.accessToken;
    } catch {
      return Response.json({ error: 'Google Calendar não conectado', not_connected: true }, { status: 400 });
    }

    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    // Find or create the dedicated "Brazon - Agenda" calendar
    let calendarId = technician.google_calendar_id;
    if (!calendarId) {
      const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', { headers });
      const listData = await listRes.json();
      const existing = (listData.items || []).find(c => c.summary === CALENDAR_NAME);
      if (existing) {
        calendarId = existing.id;
      } else {
        const createRes = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            summary: CALENDAR_NAME,
            description: 'Agenda de atendimentos e rotas da Brazon',
            timeZone: TIMEZONE
          })
        });
        const createData = await createRes.json();
        if (!createRes.ok) {
          return Response.json({ error: 'Erro ao criar agenda: ' + (createData.error?.message || 'desconhecido') }, { status: 500 });
        }
        calendarId = createData.id;
      }
      await base44.entities.Technician.update(technician.id, { google_calendar_id: calendarId });
    }

    // Fetch all OS assigned to this technician
    const orders = await base44.entities.ServiceOrder.filter({ technician: technician.name }, '-date', 500);

    const syncableStatuses = ['Liberado para Técnico', 'Em Execução', 'Agendamento/Rota'];
    const activeOrders = orders.filter(o => syncableStatuses.includes(o.status) && o.date);
    const activeIds = new Set(activeOrders.map(o => o.id));

    // Delete events for OS no longer active or no longer assigned
    let deleted = 0;
    for (const os of orders) {
      if (os.google_event_id && !activeIds.has(os.id)) {
        try {
          await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${os.google_event_id}`, {
            method: 'DELETE',
            headers
          });
          await base44.entities.ServiceOrder.update(os.id, { google_event_id: '' });
          deleted++;
        } catch { /* ignore */ }
      }
    }

    let created = 0, updated = 0, errors = 0;
    for (const os of activeOrders) {
      try {
        const addr = os.delivery_address || {};
        const locationParts = [addr.street, addr.number, addr.neighborhood, addr.city, addr.state].filter(Boolean);
        const location = locationParts.length > 0 ? locationParts.join(', ') : '';

        const isInstall = os.type === 'Entrega + Instalação';
        const durationMin = isInstall ? 90 : 45;

        // Estimate start time from route order: first stop at 08:00, each subsequent +duration+15min buffer
        const order = os.route_order || 1;
        const startMinutes = 8 * 60 + (order - 1) * (durationMin + 15);
        const endMinutes = startMinutes + durationMin;
        const pad = (n) => String(n).padStart(2, '0');
        const startISO = `${os.date}T${pad(Math.floor(startMinutes / 60))}:${pad(startMinutes % 60)}:00-03:00`;
        const endISO = `${os.date}T${pad(Math.floor(endMinutes / 60))}:${pad(endMinutes % 60)}:00-03:00`;

        const descParts = [`OS: ${os.code}`, `Cliente: ${os.client_name}`, `Tipo: ${os.type}`];
        if (os.sale_order_number) descParts.push(`Pedido: ${os.sale_order_number}`);
        if (os.has_pending_payment) {
          descParts.push(`⚠ Pagamento pendente: R$ ${(os.pending_payment_amount || 0).toFixed(2)} (${os.pending_payment_moment || ''})`);
        }
        if (os.technician_notes) descParts.push(`Obs vendedor: ${os.technician_notes}`);
        if (os.logistics_notes) descParts.push(`Obs logística: ${os.logistics_notes}`);

        const eventData = {
          summary: `${os.code} — ${os.client_name}`,
          location,
          description: descParts.join('\n'),
          start: { dateTime: startISO, timeZone: TIMEZONE },
          end: { dateTime: endISO, timeZone: TIMEZONE },
          colorId: isInstall ? '9' : '11'
        };

        if (os.google_event_id) {
          const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${os.google_event_id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(eventData)
          });
          if (res.ok) updated++;
          else { errors++; }
        } else {
          const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
            method: 'POST',
            headers,
            body: JSON.stringify(eventData)
          });
          const data = await res.json();
          if (res.ok) {
            await base44.entities.ServiceOrder.update(os.id, { google_event_id: data.id });
            created++;
          } else {
            errors++;
          }
        }
      } catch {
        errors++;
      }
    }

    return Response.json({
      calendar_id: calendarId,
      created,
      updated,
      deleted,
      errors,
      total: activeOrders.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});