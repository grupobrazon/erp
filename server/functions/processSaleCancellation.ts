// Gerado de base44/functions/processSaleCancellation/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      action,
      sale_id,
      reason,
      reverse_tracking_code,
      reverse_carrier,
      collection_type,
      refund_forecast_date,
      refund_amount,
      refund_receipt_url,
      refund_receipt_urls,
      refund_method,
      refund_details,
    } = body || {};

    if (!sale_id) return Response.json({ error: 'sale_id é obrigatório' }, { status: 400 });
    if (!action) return Response.json({ error: 'action é obrigatório' }, { status: 400 });

    const sale = await base44.entities.Sale.get(sale_id);
    if (!sale) return Response.json({ error: 'Venda não encontrada' }, { status: 404 });

    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const userName = user.display_name || user.full_name || user.email || 'Sistema';
    const history = sale.cancellation_history || [];
    const addHistory = (status, notes) => [
      ...history,
      { date: now, status, actor: userName, notes },
    ];

    // ── Helpers de alertas do fluxo de cancelamento ──
    const ALERT_APPROVAL = 'Cancelamento - Aprovação';
    const ALERT_FINANCE = 'Cancelamento - Estorno';
    const APPROVAL_ROLES = ['admin', 'supervisor'];
    const FINANCE_ROLES = ['admin', 'financeiro', 'contas_receber'];

    const getUsersByRoles = async (rolesNeeded) => {
      const users = await base44.asServiceRole.entities.User.list('-created_date', 200);
      return users.filter(u => {
        const roles = [u.role, ...(u.additional_roles || [])].filter(Boolean);
        return roles.some(r => rolesNeeded.includes(r));
      });
    };

    const ensureCancellationAlerts = async (type, title, message, rolesNeeded) => {
      try {
        const targetUsers = await getUsersByRoles(rolesNeeded);
        const existing = await base44.asServiceRole.entities.Alert.filter(
          { related_sale_id: sale_id, type, read: false },
          '-created_date',
          200
        );
        const existingUserIds = new Set(existing.map(a => a.user_id));
        for (const u of targetUsers) {
          if (existingUserIds.has(u.id)) continue;
          await base44.asServiceRole.entities.Alert.create({
            user_id: u.id,
            user_name: u.display_name || u.full_name || u.email || '',
            type,
            title,
            message,
            related_sale_id: sale_id,
            related_order_number: sale.order_number || '',
            read: false,
            created_by_name: 'Sistema',
          });
        }
      } catch (_e) { /* alertas são best-effort */ }
    };

    const resolveCancellationAlerts = async (type) => {
      try {
        const existing = await base44.asServiceRole.entities.Alert.filter(
          { related_sale_id: sale_id, type, read: false },
          '-created_date',
          200
        );
        for (const a of existing) {
          await base44.asServiceRole.entities.Alert.update(a.id, {
            read: true,
            read_date: now,
          });
        }
      } catch (_e) { /* alertas são best-effort */ }
    };

    // ── REQUEST: vendedor solicita cancelamento ──
    if (action === 'request') {
      if (!reason?.trim()) {
        return Response.json({ error: 'Motivo do cancelamento é obrigatório' }, { status: 400 });
      }
      await base44.entities.Sale.update(sale_id, {
        cancellation_status: 'Aguardando Aprovação',
        cancellation_requested_by: userName,
        cancellation_requested_date: now,
        cancellation_reason: reason.trim(),
        cancellation_previous_stage: sale.stage || '',
        cancellation_history: addHistory('Aguardando Aprovação', `Cancelamento solicitado: ${reason.trim()}`),
      });
      await ensureCancellationAlerts(
        ALERT_APPROVAL,
        'Cancelamento pendente de aprovação',
        `O pedido ${sale.order_number || sale_id} (cliente ${sale.client_name || '—'}) teve cancelamento solicitado por ${userName}. Motivo: ${reason.trim()}. Aguarda análise do responsável.`,
        APPROVAL_ROLES
      );
      return Response.json({ ok: true, message: 'Cancelamento solicitado — aguardando aprovação do gerente.' });
    }

    // ── APPROVE: gerente aprova o cancelamento ──
    if (action === 'approve') {
      const osList = await base44.entities.ServiceOrder.filter({ sale_id });

      // Determinar se a mercadoria já foi despachada
      const dispatchedStatuses = ['Saída do Estoque', 'Em Transporte', 'Entregue'];
      // Considera despachada a OS que já saiu em romaneio de expedição, tem data de
      // saída do estoque, está em transporte/entregue ou foi postada no Melhor Envio.
      const wasDispatched = osList.some(os =>
        !!os.romaneio_date ||
        os.romaneio_dispatched === true ||
        !!os.exit_date ||
        dispatchedStatuses.includes(os.status) ||
        ['posted', 'delivered'].includes(os.melhor_envio_status)
      );

      // Determinar se houve pagamento (para estorno financeiro)
      const paidAmount = (sale.payments || [])
        .filter(p => p.payment_status === 'Realizada')
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      const hasPayment = paidAmount > 0;

      // Determinar se houve NF-e emitida (precisa cancelar)
      const hasNFe = osList.some(os => os.nfe_transmitted && !os.nfe_cancelled);

      // Gerar OS Reversa para cada OS despachada (rastrear retorno da mercadoria)
      const reverseOsCodes = [];
      if (wasDispatched) {
        for (const os of osList) {
          const osDispatched = os.exit_date || dispatchedStatuses.includes(os.status);
          if (!osDispatched || os.is_reverse) continue;
          try {
            const existing = await base44.entities.ServiceOrder.filter({ reverse_parent_os_id: os.id }, '-created_date', 1);
            if (existing && existing.length > 0) {
              reverseOsCodes.push(existing[0].code);
              continue;
            }
            const reverseCode = (os.code || 'OS') + 'R';
            await base44.entities.ServiceOrder.create({
              code: reverseCode,
              client_id: os.client_id,
              client_name: os.client_name,
              sale_id: os.sale_id,
              sale_order_number: os.sale_order_number,
              type: os.type,
              delivery_modality: os.delivery_modality,
              delivery_address: os.delivery_address,
              date: today,
              status: 'Aguardando Coleta Reversa',
              is_reverse: true,
              reverse_parent_os_id: os.id,
              reverse_parent_os_code: os.code,
              reverse_reason: `Cancelamento da venda ${sale.order_number || ''} — ${sale.cancellation_reason || ''}`.trim(),
              reverse_generated_by: userName,
              reverse_generated_date: now,
              reverse_received: false,
              reverse_resolution: 'Cancelamento',
              status_history: [{
                date: now,
                actor: userName,
                source: 'Cancelamento de venda — geração automática',
                previous_status: '',
                new_status: 'Aguardando Coleta Reversa',
              }],
            });
            reverseOsCodes.push(reverseCode);
          } catch (_e) { /* ignora erro individual */ }
        }
      }

      // Cancelar todas as OS da venda
      for (const os of osList) {
        if (os.status !== 'Cancelada' && os.status !== 'Concluída') {
          await base44.entities.ServiceOrder.update(os.id, {
            status: 'Cancelada',
            production_needed: false,
            notes: (os.notes ? os.notes + '\n' : '') +
              `Pedido cancelado por ${userName}. Motivo: ${sale.cancellation_reason || 'Cancelamento solicitado'}`,
          });
        }
      }

      // Estornar data de manutenção do equipamento vinculado (refil/cápsula)
      let equipmentReverted = false;
      let equipmentRevertNotes = '';
      if (sale.linked_equipment_id) {
        try {
          const equip = await base44.entities.Equipment.get(sale.linked_equipment_id);
          if (equip && equip.last_maintenance_date) {
            const intervalMonths = equip.maintenance_interval_months || 6;
            const currentLastMaint = new Date(equip.last_maintenance_date + 'T00:00:00');
            const prevLastMaint = new Date(currentLastMaint);
            prevLastMaint.setMonth(prevLastMaint.getMonth() - intervalMonths);
            const prevNextMaint = new Date(prevLastMaint);
            prevNextMaint.setMonth(prevNextMaint.getMonth() + intervalMonths);
            const prevLastStr = prevLastMaint.toISOString().split('T')[0];
            const prevNextStr = prevNextMaint.toISOString().split('T')[0];

            await base44.entities.Equipment.update(equip.id, {
              last_maintenance_date: prevLastStr,
              next_maintenance_date: prevNextStr,
              crm_status: 'Aguardando Contato',
              crm_notes: (equip.crm_notes || '') + '\nEstorno de manutenção: venda ' + (sale.order_number || sale.id) + ' cancelada por ' + userName + '. Data de manutenção revertida de ' + equip.last_maintenance_date + ' para ' + prevLastStr + '.',
            });
            equipmentReverted = true;
            equipmentRevertNotes = 'Equipamento ' + (equip.patrimony_code || equip.id) + ': data de manutenção revertida de ' + equip.last_maintenance_date + ' para ' + prevLastStr + '.';
          }
        } catch (_e) { /* ignora erro de equipamento */ }
      }

      // Inativar equipamentos criados por esta venda
      const saleEquipment = await base44.entities.Equipment.filter({ sale_id });
      for (const equip of saleEquipment) {
        if (equip.status === 'Ativo' && equip.id !== sale.linked_equipment_id) {
          try {
            await base44.entities.Equipment.update(equip.id, {
              status: 'Inativo',
              inactive_reason: 'Venda cancelada — ' + (sale.cancellation_reason || 'cancelamento'),
              inactive_date: today,
            });
            equipmentReverted = true;
            equipmentRevertNotes += (equipmentRevertNotes ? ' | ' : '') + 'Equipamento ' + (equip.patrimony_code || equip.id) + ' inativado.';
          } catch (_e) { /* ignora erro */ }
        }
      }

      // Decidir próximo status baseado em: despacho? pagamento? NF-e?
      let nextStatus;
      let historyNote;
      if (wasDispatched) {
        nextStatus = 'Aguardando Retorno Logístico';
        historyNote = `Mercadoria já despachada — aguardando retorno logístico.${reverseOsCodes.length ? ` OS Reversa(s) gerada(s): ${reverseOsCodes.join(', ')}.` : ''}`;
      } else if (hasPayment) {
        nextStatus = 'Aguardando Estorno Financeiro';
        historyNote = 'Mercadoria não despachada, pagamento recebido — aguardando estorno financeiro.';
      } else if (hasNFe) {
        nextStatus = 'Aguardando Cancelamento NF-e';
        historyNote = 'Mercadoria não despachada, sem pagamento recebido — aguardando cancelamento da NF-e.';
      } else {
        nextStatus = 'Cancelamento Concluído';
        historyNote = 'Mercadoria não despachada, sem pagamento, sem NF-e — cancelamento concluído.';
      }

      const updateData = {
        status: 'Cancelada',
        stage: 'Cancelada',
        cancellation_status: nextStatus,
        cancellation_approved_by: userName,
        cancellation_approved_date: now,
        cancellation_dispatched: wasDispatched,
        cancellation_needs_stock_return: wasDispatched,
        cancellation_equipment_reverted: equipmentReverted,
        cancellation_equipment_revert_notes: equipmentRevertNotes,
        cancellation_history: addHistory(
          nextStatus,
          `Cancelamento aprovado por ${userName}. ${historyNote}${equipmentRevertNotes ? ' ' + equipmentRevertNotes : ''}`
        ),
      };

      if (nextStatus === 'Cancelamento Concluído') {
        updateData.cancellation_completed_date = now;
      }
      if (nextStatus === 'Aguardando Cancelamento NF-e') {
        updateData.cancellation_nfe_requested_date = now;
      }

      await base44.entities.Sale.update(sale_id, updateData);

      // Alertas do fluxo de cancelamento
      await resolveCancellationAlerts(ALERT_APPROVAL);
      const needsFinance = nextStatus === 'Aguardando Estorno Financeiro' || nextStatus === 'Aguardando Cancelamento NF-e';
      if (needsFinance) {
        await ensureCancellationAlerts(
          ALERT_FINANCE,
          'Cancelamento pendente de execução financeira',
          `O pedido ${sale.order_number || sale_id} (cliente ${sale.client_name || '—'}) foi aprovado para cancelamento por ${userName}. Etapa atual: ${nextStatus}. Aguarda execução do setor financeiro (estorno${nextStatus === 'Aguardando Cancelamento NF-e' ? '/cancelamento de NF-e' : ''}).`,
          FINANCE_ROLES
        );
      }

      return Response.json({
        ok: true,
        dispatched: wasDispatched,
        hasPayment,
        hasNFe,
        message: historyNote,
      });
    }

    // ── REJECT: gerente rejeita a solicitação ──
    if (action === 'reject') {
      const previousStage = sale.cancellation_previous_stage || sale.stage || '';
      await base44.entities.Sale.update(sale_id, {
        cancellation_status: 'Não Solicitado',
        cancellation_reason: '',
        cancellation_requested_by: '',
        cancellation_requested_date: null,
        cancellation_previous_stage: '',
        stage: previousStage,
        cancellation_history: addHistory('Não Solicitado', `Solicitação rejeitada por ${userName}. Motivo: ${reason || 'não informado'}. Venda restaurada para: ${previousStage}`),
      });
      await resolveCancellationAlerts(ALERT_APPROVAL);
      return Response.json({ ok: true, message: 'Solicitação de cancelamento rejeitada.' });
    }

    // ── SET_REVERSE_CODE: logística gera código reverso ──
    if (action === 'set_reverse_code') {
      if (!reverse_tracking_code?.trim()) {
        return Response.json({ error: 'Código de rastreio reverso é obrigatório' }, { status: 400 });
      }
      await base44.entities.Sale.update(sale_id, {
        cancellation_status: 'Aguardando Recebimento',
        cancellation_reverse_tracking_code: reverse_tracking_code.trim(),
        cancellation_reverse_carrier: reverse_carrier || '',
        cancellation_collection_type: collection_type || '',
        cancellation_history: addHistory(
          'Aguardando Recebimento',
          `Código reverso gerado: ${reverse_tracking_code.trim()} (${reverse_carrier || 'N/A'}). Coleta: ${collection_type || 'N/A'}.`
        ),
      });
      return Response.json({ ok: true, message: 'Código reverso registrado — aguardando recebimento da mercadoria.' });
    }

    // ── CONFIRM_STOCK_RECEIPT: logística/estoque confirma recebimento e devolve ao estoque ──
    if (action === 'confirm_stock_receipt') {
      // Devolver itens ao estoque
      for (const item of (sale.items || [])) {
        if (item.product_id) {
          try {
            const product = await base44.entities.Product.get(item.product_id);
            if (product) {
              await base44.entities.Product.update(item.product_id, {
                current_stock: (product.current_stock || 0) + (item.quantity || 0),
              });
            }
          } catch (_e) { /* ignora erro de produto */ }
        }
      }

      await base44.entities.Sale.update(sale_id, {
        cancellation_status: 'Aguardando Estorno Financeiro',
        cancellation_stock_received_date: today,
        cancellation_stock_received_by: userName,
        cancellation_history: addHistory('Aguardando Estorno Financeiro', 'Mercadoria recebida e devolvida ao estoque.'),
      });
      await ensureCancellationAlerts(
        ALERT_FINANCE,
        'Cancelamento pendente de execução financeira',
        `O pedido ${sale.order_number || sale_id} (cliente ${sale.client_name || '—'}) teve a mercadoria devolvida ao estoque por ${userName}. Aguarda execução do estorno financeiro.`,
        FINANCE_ROLES
      );
      return Response.json({ ok: true, message: 'Mercadoria recebida e devolvida ao estoque — aguardando estorno financeiro.' });
    }

    // ── SET_REFUND_FORECAST: financeiro define previsão de estorno ──
    if (action === 'set_refund_forecast') {
      if (!refund_forecast_date) {
        return Response.json({ error: 'Previsão de estorno é obrigatória' }, { status: 400 });
      }
      await base44.entities.Sale.update(sale_id, {
        cancellation_refund_forecast_date: refund_forecast_date,
        cancellation_history: addHistory('Aguardando Estorno Financeiro', `Previsão de estorno definida: ${refund_forecast_date}`),
      });
      return Response.json({ ok: true, message: 'Previsão de estorno registrada.' });
    }

    // ── COMPLETE_REFUND: financeiro conclui o estorno ──
    if (action === 'complete_refund') {
      const osList = await base44.entities.ServiceOrder.filter({ sale_id });
      const hasNFe = osList.some(os => os.nfe_transmitted && !os.nfe_cancelled);

      const paidAmount = (sale.payments || [])
        .filter(p => p.payment_status === 'Realizada')
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      const finalRefundAmount = refund_amount || paidAmount;

      const updateData = {
        cancellation_refund_completed_date: today,
        cancellation_refund_amount: finalRefundAmount,
        cancellation_refund_completed_by: userName,
        cancellation_history: addHistory(
          hasNFe ? 'Aguardando Cancelamento NF-e' : 'Cancelamento Concluído',
          `Estorno financeiro realizado por ${userName}: R$ ${finalRefundAmount.toFixed(2)}.`
        ),
      };

      const receiptUrls = Array.isArray(refund_receipt_urls)
        ? refund_receipt_urls.filter(Boolean)
        : (refund_receipt_url ? [refund_receipt_url] : []);
      if (receiptUrls.length > 0) {
        updateData.cancellation_refund_receipt_urls = receiptUrls;
        updateData.cancellation_refund_receipt_url = receiptUrls[0];
      }
      if (refund_method) {
        updateData.cancellation_refund_method = refund_method;
      }
      if (refund_details !== undefined) {
        updateData.cancellation_refund_details = refund_details.trim();
      }

      if (hasNFe) {
        updateData.cancellation_status = 'Aguardando Cancelamento NF-e';
        updateData.cancellation_nfe_requested_date = now;
      } else {
        updateData.cancellation_status = 'Cancelamento Concluído';
        updateData.cancellation_completed_date = now;
      }

      await base44.entities.Sale.update(sale_id, updateData);
      if (!hasNFe) {
        await resolveCancellationAlerts(ALERT_FINANCE);
      }
      return Response.json({
        ok: true,
        message: hasNFe
          ? 'Estorno realizado — aguardando cancelamento da NF-e.'
          : 'Estorno realizado — cancelamento concluído.',
      });
    }

    // ── COMPLETE_NFE: financeiro conclui cancelamento da NF-e ──
    if (action === 'complete_nfe') {
      await base44.entities.Sale.update(sale_id, {
        cancellation_status: 'Cancelamento Concluído',
        cancellation_nfe_completed_date: now,
        cancellation_completed_date: now,
        cancellation_history: addHistory('Cancelamento Concluído', 'NF-e cancelada — cancelamento 100% concluído.'),
      });
      await resolveCancellationAlerts(ALERT_FINANCE);
      return Response.json({ ok: true, message: 'Cancelamento concluído.' });
    }

    return Response.json({ error: `Ação desconhecida: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}