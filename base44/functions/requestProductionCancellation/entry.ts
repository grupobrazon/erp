import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { os_id, reason } = await req.json();
    if (!os_id) return Response.json({ error: 'os_id é obrigatório' }, { status: 400 });
    const reasonStr = String(reason || '').trim();
    if (!reasonStr) return Response.json({ error: 'reason é obrigatório (justifique a solicitação)' }, { status: 400 });

    const os = await base44.entities.ServiceOrder.get(os_id);
    if (!os) return Response.json({ error: 'OS não encontrada' }, { status: 404 });

    // Só faz sentido solicitar cancelamento se a OS está em produção
    const inProduction = ['Aguardando Produção', 'Produção Iniciada', 'Produção/Expedição'].includes(os.status);
    if (!inProduction) {
      return Response.json({ error: `A OS não está em produção (status atual: ${os.status}).` }, { status: 400 });
    }

    // Se já foi decidido, não permite nova solicitação
    if (os.production_cancellation_decision && os.production_cancellation_decision !== 'Pendente') {
      return Response.json({ error: 'A produção já decidiu sobre esta solicitação.' }, { status: 400 });
    }

    await base44.entities.ServiceOrder.update(os_id, {
      production_cancellation_requested: true,
      production_cancellation_reason: reasonStr,
      production_cancellation_requested_by: user.full_name || user.email || '',
      production_cancellation_requested_date: new Date().toISOString(),
      production_cancellation_decision: 'Pendente',
      production_history: [...(os.production_history || []), {
        date: new Date().toISOString(),
        event: 'solicitacao_cancelamento_producao',
        actor: user.full_name || user.email || 'Logística',
        notes: reasonStr,
      }],
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}