// Gerado de base44/functions/manageAgendamento/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, token } = body;

    // Público: retorna dados do agendamento para a página pública
    if (action === 'get_by_token') {
      if (!token) return Response.json({ error: 'token obrigatório' }, { status: 400 });
      const list = await base44.asServiceRole.entities.Agendamento.filter({ token });
      if (!list || list.length === 0) return Response.json({ error: 'Agendamento não encontrado' }, { status: 404 });
      const ag = list[0];
      return Response.json({
        agendamento: {
          id: ag.id,
          status: ag.status,
          client_name: ag.client_name,
          purifier_model: ag.purifier_model,
          equipment_code: ag.equipment_code,
          scheduled_date: ag.scheduled_date,
          window: ag.window,
          client_obs: ag.client_obs,
        },
      });
    }

    // Público: cliente confirma o agendamento (data + janela)
    if (action === 'confirm') {
      if (!token) return Response.json({ error: 'token obrigatório' }, { status: 400 });
      const { scheduled_date, window, client_obs } = body;
      if (!scheduled_date || !window) {
        return Response.json({ error: 'data e janela são obrigatórios' }, { status: 400 });
      }
      const list = await base44.asServiceRole.entities.Agendamento.filter({ token });
      if (!list || list.length === 0) return Response.json({ error: 'Agendamento não encontrado' }, { status: 404 });
      const ag = list[0];
      if (ag.status === 'Agendado') {
        return Response.json({ error: 'Este agendamento já foi confirmado' }, { status: 400 });
      }
      if (ag.status === 'Cancelado' || ag.status === 'Convertido') {
        return Response.json({ error: 'Este agendamento não está mais disponível' }, { status: 400 });
      }
      await base44.asServiceRole.entities.Agendamento.update(ag.id, {
        scheduled_date,
        window,
        client_obs: client_obs || '',
        status: 'Agendado',
        confirmed_at: new Date().toISOString(),
      });
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});