import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Cria uma OS Reversa (cópia da OS original com código + "R") para acompanhar
// a devolução/coleta reversa de um produto que chegou errado ou com defeito ao cliente.
// Valida: OS original entregue/concluída, dentro de 30 dias da entrega (bloqueio rígido — admin override).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { os_id, reason } = await req.json();
    if (!os_id) return Response.json({ error: 'os_id é obrigatório' }, { status: 400 });

    const os = await base44.entities.ServiceOrder.get(os_id);
    if (!os) return Response.json({ error: 'OS não encontrada' }, { status: 404 });

    // Não pode gerar reversa de outra reversa
    if (os.is_reverse) {
      return Response.json({ error: 'Não é possível gerar OS Reversa de outra OS Reversa.' }, { status: 400 });
    }

    // Valida status: só pode gerar reversa de OS entregue/concluída
    const validStatuses = ['Concluída', 'Entregue'];
    if (!validStatuses.includes(os.status)) {
      return Response.json({
        error: `Só é possível gerar OS Reversa de OS entregue/concluída. Status atual: ${os.status}.`
      }, { status: 400 });
    }

    // Valida prazo de 30 dias (bloqueio rígido — admin pode override)
    const deliveryDate = findDeliveryDate(os);
    if (deliveryDate) {
      const daysSince = Math.floor((Date.now() - new Date(deliveryDate).getTime()) / 86400000);
      if (daysSince > 30 && user.role !== 'admin') {
        return Response.json({
          error: `Fora do prazo de 30 dias para coleta reversa (entrega há ${daysSince} dias). Apenas administradores podem autorizar fora do prazo.`
        }, { status: 403 });
      }
    }

    // Verifica se já existe OS Reversa para esta OS pai
    const existing = await base44.entities.ServiceOrder.filter({ reverse_parent_os_id: os_id }, '-created_date', 1);
    if (existing && existing.length > 0) {
      return Response.json({
        error: `Já existe uma OS Reversa para esta OS: ${existing[0].code}. Acompanhe a devolução por lá.`
      }, { status: 400 });
    }

    // Cria a OS Reversa (cópia da OS original)
    const reverseCode = (os.code || 'OS') + 'R';
    const now = new Date().toISOString();
    const reverseOs = await base44.entities.ServiceOrder.create({
      code: reverseCode,
      client_id: os.client_id,
      client_name: os.client_name,
      sale_id: os.sale_id,
      sale_order_number: os.sale_order_number,
      type: os.type,
      delivery_modality: os.delivery_modality,
      delivery_address: os.delivery_address,
      date: now.slice(0, 10),
      status: 'Aguardando Coleta Reversa',
      is_reverse: true,
      reverse_parent_os_id: os.id,
      reverse_parent_os_code: os.code,
      reverse_reason: reason || '',
      reverse_generated_by: user.full_name || user.email || 'Usuário',
      reverse_generated_date: now,
      reverse_received: false,
      reverse_resolution: 'Pendente',
      status_history: [{
        date: now,
        actor: user.full_name || user.email || 'Usuário',
        source: 'OS Reversa — geração',
        previous_status: '',
        new_status: 'Aguardando Coleta Reversa',
      }],
    });

    return Response.json({
      success: true,
      reverse_os: reverseOs,
      reverse_os_id: reverseOs.id,
      reverse_code: reverseCode,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Encontra a data de entrega: última movimentação para "Entregue"/"Concluída" no histórico,
// ou tech_completion_date, ou a data da OS.
function findDeliveryDate(os: any): string | null {
  const history = Array.isArray(os?.status_history) ? os.status_history : [];
  for (let i = history.length - 1; i >= 0; i--) {
    if (['Entregue', 'Concluída'].includes(history[i].new_status)) {
      return history[i].date;
    }
  }
  if (os?.tech_completion_date) return os.tech_completion_date;
  return os?.date || null;
}