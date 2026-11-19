// Gerado de base44/functions/approveRequoteShipping/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

// Aprova ou rejeita a diferença de frete gerada pela recotação (alteração de empacotamento pós-faturamento).
// Acesso restrito a admin/supervisor.
//
// Aprovar: aplica o novo frete (da cotação selecionada no histórico), atualiza grand_total,
//   e marca a diferença como "Aprovado" (adicional por erro de cotação — empresa absorve).
// Rejeitar: marca como "Rejeitado" — o frete original permanece, os volumes novos ficam salvos
//   mas sem aplicação financeira. A logística pode selecionar outra transportadora pelo painel de troca.

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Apenas admin/supervisor pode aprovar/rejeitar
    if (user.role !== 'admin') {
      return Response.json({ error: 'Apenas administradores/supervisores podem aprovar ou rejeitar a diferença de frete.' }, { status: 403 });
    }

    const { sale_id, action, reason } = await req.json();
    if (!sale_id) return Response.json({ error: 'sale_id é obrigatório' }, { status: 400 });
    if (!action || !['approve', 'reject'].includes(action)) {
      return Response.json({ error: 'action deve ser "approve" ou "reject"' }, { status: 400 });
    }

    const sale = await base44.entities.Sale.get(sale_id);
    if (!sale) return Response.json({ error: 'Venda não encontrada' }, { status: 404 });

    if (sale.requote_diff_status !== 'Pendente Aprovação') {
      return Response.json({ error: 'Esta venda não possui recotação pendente de aprovação.' }, { status: 400 });
    }

    const userName = user.full_name || user.email || 'Supervisor';
    const now = new Date().toISOString();

    if (action === 'approve') {
      // Encontra a cotação selecionada no histórico (a recotação marcou a matched como selected)
      const history = sale.shipping_quote_history || [];
      const selectedQuote = [...history].reverse().find(q => q.selected);

      if (!selectedQuote) {
        return Response.json({ error: 'Nenhuma cotação selecionada encontrada no histórico. Selecione uma transportadora no painel de troca antes de aprovar.' }, { status: 400 });
      }

      const newFreight = Number(selectedQuote.price) || 0;
      const grandTotal = (sale.total || 0) + (sale.additions || 0) + newFreight + (sale.displacement_fee || 0) - (sale.discount || 0);

      await base44.entities.Sale.update(sale_id, {
        requote_diff_status: 'Aprovado',
        requote_approved_by: userName,
        requote_approved_date: now,
        requote_rejected_by: '',
        requote_rejected_date: '',
        requote_reject_reason: '',
        selected_carrier: selectedQuote.company_name,
        selected_service: selectedQuote.service_name,
        freight: newFreight,
        grand_total: grandTotal,
      });

      return Response.json({
        success: true,
        action: 'approved',
        sale_id,
        applied_freight: newFreight,
        grand_total: grandTotal,
        diff_amount: sale.requote_diff_amount || 0,
        approved_by: userName,
      });
    } else {
      // Rejeitar
      await base44.entities.Sale.update(sale_id, {
        requote_diff_status: 'Rejeitado',
        requote_rejected_by: userName,
        requote_rejected_date: now,
        requote_reject_reason: reason || '',
        requote_approved_by: '',
        requote_approved_date: '',
      });

      return Response.json({
        success: true,
        action: 'rejected',
        sale_id,
        rejected_by: userName,
      });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});