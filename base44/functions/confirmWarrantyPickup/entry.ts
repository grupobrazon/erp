import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { appendStatusHistory } from '../../shared/osStatusHistory.ts';

// Confirma que o cliente buscou o produto de garantia pessoalmente na empresa.
// Usado quando o retorno é "Busca Pessoal" (sem Melhor Envio).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { os_id } = await req.json();
    if (!os_id) return Response.json({ error: 'os_id é obrigatório' }, { status: 400 });

    const os = await base44.entities.ServiceOrder.get(os_id);
    if (!os) return Response.json({ error: 'OS não encontrada' }, { status: 404 });
    if (os.type !== 'Manutenção') {
      return Response.json({ error: 'Esta OS não é de Manutenção/Garantia' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const userName = user.full_name || user.email || 'Usuário';

    const updates: any = {
      warranty_flow_status: 'Retornado ao Cliente',
      warranty_return_method: 'Busca Pessoal',
      warranty_return_date: now,
      warranty_return_by: userName,
    };

    const history = appendStatusHistory(os, updates, {
      actor: userName,
      source: 'Garantia — confirmação de busca pessoal',
    });
    if (history) updates.status_history = history;

    await base44.entities.ServiceOrder.update(os_id, updates);

    return Response.json({
      success: true,
      os_id,
      warranty_flow_status: 'Retornado ao Cliente',
      warranty_return_method: 'Busca Pessoal',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});