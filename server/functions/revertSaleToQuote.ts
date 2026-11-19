// Gerado de base44/functions/revertSaleToQuote/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const role = user.role || '';
    const additionalRoles = Array.isArray(user.additional_roles) ? user.additional_roles : [];
    const allRoles = [role, ...additionalRoles].filter(Boolean);
    const isSupervisor = allRoles.length === 0 || allRoles.includes('admin') || allRoles.includes('supervisor');
    // Liberação individual (User.extra_permissions = 'estornar_pedido'): permite estornar pedidos sem alterar o perfil
    let hasIndividualRevert = Array.isArray(user.extra_permissions) && user.extra_permissions.includes('estornar_pedido');
    if (!isSupervisor && !hasIndividualRevert && user.id) {
      try {
        const fullUser = await base44.asServiceRole.entities.User.get(user.id);
        hasIndividualRevert = Array.isArray(fullUser?.extra_permissions) && fullUser.extra_permissions.includes('estornar_pedido');
      } catch (_e) { /* sem liberação individual */ }
    }
    if (!isSupervisor && !hasIndividualRevert) {
      return Response.json({ error: 'Apenas supervisores ou usuários liberados podem estornar pedidos' }, { status: 403 });
    }

    const { sale_id, reason } = await req.json();
    if (!sale_id) return Response.json({ error: 'sale_id é obrigatório' }, { status: 400 });
    const reasonStr = String(reason || '').trim();
    if (!reasonStr) return Response.json({ error: 'reason é obrigatório (justifique o estorno)' }, { status: 400 });

    const sale = await base44.entities.Sale.get(sale_id);
    if (!sale) return Response.json({ error: 'Venda não encontrada' }, { status: 404 });

    // Bloqueia pedidos já faturados / concluídos / cancelados
    const blockedStages = ['Faturada', 'Concluída', 'Cancelada'];
    if (blockedStages.includes(sale.stage)) {
      return Response.json({ error: `Não é possível estornar um pedido na etapa "${sale.stage}"` }, { status: 400 });
    }
    if (sale.stage === 'Orçamento') {
      return Response.json({ error: 'O pedido já está em orçamento' }, { status: 400 });
    }

    // Busca OS vinculadas e bloqueia apenas se houver NF-e efetivamente transmitida ou nota fiscal emitida
    const linkedOS = await base44.entities.ServiceOrder.filter({ sale_id });
    const fiscalOS = linkedOS.filter(o => o.nfe_transmitted || (o.invoiced && o.invoice_number));
    if (fiscalOS.length > 0) {
      return Response.json({ error: 'Não é possível estornar: existe nota fiscal faturada vinculada ao pedido' }, { status: 400 });
    }

    const reversedOsCodes = linkedOS.map(o => o.code).filter(Boolean);

    // OSs que já concluíram produção NÃO são deletadas — preserva o trabalho da fábrica.
    // A produção já foi feita; deletar a OS faria o item voltar à fila ao reconfirmar o pedido.
    // OSs que ainda não chegaram à produção (sem production_completed e sem production_liberated_date)
    // continuam sendo deletadas para permitir regeneração limpa.
    const preservedOsIds: string[] = [];
    for (const o of linkedOS) {
      const productionDone = o.production_completed === true || !!o.production_liberated_date;
      if (productionDone) {
        preservedOsIds.push(o.id);
      } else {
        try { await base44.entities.ServiceOrder.delete(o.id); } catch (e) { /* ignora falha individual */ }
      }
    }

    // Log append-only
    const logEntry = {
      date: new Date().toISOString(),
      user_id: user.id || '',
      user_name: user.full_name || user.email || '',
      previous_stage: sale.stage || '',
      previous_confirmation_type: sale.confirmation_type || '',
      reversed_os_codes: reversedOsCodes,
      preserved_os_ids: preservedOsIds,
      reason: reasonStr,
    };
    const supervisorLogs = Array.isArray(sale.supervisor_logs) ? sale.supervisor_logs : [];
    supervisorLogs.push(logEntry);

    // Reverte a venda ao orçamento (mantém itens, pagamentos e valores para reajuste)
    await base44.entities.Sale.update(sale_id, {
      stage: 'Orçamento',
      status: 'Pendente',
      confirmation_type: '',
      supervisor_logs: supervisorLogs,
    });

    return Response.json({
      success: true,
      previous_stage: sale.stage,
      reversed_os_codes: reversedOsCodes,
      log: logEntry,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});