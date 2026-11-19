// Gerado de base44/functions/generateServiceOrder/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { sale_id } = await req.json();
    if (!sale_id) return Response.json({ error: 'sale_id é obrigatório' }, { status: 400 });

    const sale = await base44.entities.Sale.get(sale_id);
    if (!sale) return Response.json({ error: 'Venda não encontrada' }, { status: 404 });

    // PROIBIDO gerar OS com a venda em Orçamento
    if (sale.stage === 'Orçamento') {
      return Response.json({
        error: 'PROIBIDO gerar OS para venda em Orçamento. Confirme a venda antes de gerar a OS.',
      }, { status: 400 });
    }
    if (sale.stage === 'Cancelada' || sale.status === 'Cancelada') {
      return Response.json({ error: 'Não é possível gerar OS para uma venda cancelada.' }, { status: 400 });
    }
    // Repeated calls reuse the primary OS, including when the sale is already Em OS.
    // Reverse and maintenance child orders are independent and must not be selected/deleted.
    const mainOSQuery = {
      sale_id,
      status: { $ne: 'Cancelada' },
      is_reverse: { $ne: true },
      $or: [{ parent_os_id: { $exists: false } }, { parent_os_id: null }, { parent_os_id: '' }],
    };
    const existingPage = await base44.asServiceRole.entities.ServiceOrder.filter(mainOSQuery, { sort: '-created_date', limit: 1 });
    if (existingPage.items.length) {
      const prev = existingPage.items[0];
      if (['Confirmada', 'Pagamento Aprovado'].includes(sale.stage)) {
        await base44.entities.Sale.update(sale.id, { stage: 'Em OS' });
      }
      return Response.json({ success: true, service_order: prev, reused: true });
    }

    // Parcial: OS gerada imediatamente na confirmação (pagamentos pendentes na entrega/instalação —
    // o técnico recebe o pagamento na entrega). Total: OS gerada após aprovação financeira.
    const isParcialConfirmed = sale.confirmation_type === 'Parcial' && sale.stage === 'Confirmada';
    // 'Em OS' entra aqui porque a OS pode ter sido apagada depois de gerada — nesse caso a venda
    // fica travada em 'Em OS' sem OS nenhuma e precisa poder gerar de novo.
    const isTotalApproved = sale.stage === 'Pagamento Aprovado' || sale.stage === 'Em OS';
    if (!isParcialConfirmed && !isTotalApproved) {
      return Response.json({
        error: sale.confirmation_type === 'Parcial'
          ? 'Venda parcial deve estar em "Confirmada" para gerar a OS.'
          : 'Venda total precisa de aprovação financeira (Pagamento Aprovado) para gerar a OS.',
      }, { status: 400 });
    }

    // Determina o tipo de OS pela modalidade de entrega
    const typeMap = {
      'Envio': 'Expedição',
      'Entrega Própria': 'Entrega',
      'Entrega + Instalação': 'Entrega + Instalação',
    };
    const osType = typeMap[sale.delivery_modality] || 'Entrega';

    // Calcula pagamentos pendentes
    const pendingPayments = (sale.payments || []).filter(p => p.payment_status === 'Pendente');
    const hasPending = pendingPayments.length > 0;
    const pendingAmount = pendingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const pendingMoment = pendingPayments.find(p => p.payment_moment)?.payment_moment || '';

    // Status inicial: a OS nasce direto em Produção/Expedição (financeiro já aprovou).
    // A etapa "Aprovação Comercial" foi removida — não faz sentido a logística enviar para ela mesma.
    const status = 'Produção/Expedição';

    // Gera código da OS
    const lastOSPage = await base44.asServiceRole.entities.ServiceOrder.filter(
      { code: { $regex: '^OS[0-9]{6}$' } }, { sort: '-code', limit: 1, fields: ['code'] }
    );
    const maxNum = parseInt(lastOSPage.items[0]?.code?.slice(2), 10) || 0;
    const code = `OS${String(maxNum + 1).padStart(6, '0')}`;

    const today = new Date().toISOString().split('T')[0];

    // Re-check anti-race: outra chamada concorrente pode ter criado uma OS entre o
    // check inicial e aqui. Se existir, reutiliza ela em vez de criar duplicata.
    const recheck = await base44.asServiceRole.entities.ServiceOrder.filter(mainOSQuery, { sort: 'created_date', limit: 1 });
    if (recheck.items.length > 0) {
      const prev = recheck.items[0];
      await base44.entities.Sale.update(sale.id, { stage: 'Em OS' });
      return Response.json({ success: true, service_order: prev, reused: true });
    }

    // Cria a OS
    const os = await base44.entities.ServiceOrder.create({
      code,
      client_id: sale.client_id,
      client_name: sale.client_name || '',
      sale_id: sale.id,
      sale_order_number: sale.order_number || '',
      type: osType,
      delivery_modality: sale.delivery_modality || '',
      delivery_address: sale.delivery_address || sale.billing_address || {},
      date: today,
      status,
      has_pending_payment: hasPending,
      pending_payment_amount: pendingAmount,
      pending_payment_moment: pendingMoment,
      technician_notes: sale.cr_notes || '',
      service_description: `OS de ${osType} — Pedido ${sale.order_number || ''}`,
    });

    // Reconcile concurrent creates before linking anything. Only discard THIS call's
    // pristine new record; never delete historical, cancelled, routed or production OSs.
    let canonical = os;
    const concurrentPage = await base44.asServiceRole.entities.ServiceOrder.filter(mainOSQuery, { sort: 'created_date', limit: 50 });
    const ordered = concurrentPage.items.sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)) || a.id.localeCompare(b.id));
    if (ordered[0] && ordered[0].id !== os.id) {
      const fresh = await base44.asServiceRole.entities.ServiceOrder.get(os.id);
      const pristine = fresh.status === 'Produção/Expedição' && !fresh.route_id && !fresh.invoiced && !fresh.nfe_transmitted && !fresh.nfse_transmitted && !fresh.production_needed && !fresh.production_completed && !fresh.production_liberated_date && !(fresh.production_history || []).length;
      if (!pristine) return Response.json({ error: 'Foram detectadas OS concorrentes com movimentações. Revise o pedido antes de continuar.' }, { status: 409 });
      await base44.asServiceRole.entities.ServiceOrder.delete(os.id);
      canonical = ordered[0];
    }

    // Vincula a OS ao agendamento criado pelo vendedor na venda (a agenda passa a mostrar pedido + OS)
    // Usa asServiceRole para evitar falhas silenciosas por RLS
    try {
      const agendaEntries = await base44.asServiceRole.entities.AgendamentoRota.filter({ sale_id: sale.id });
      for (const ag of agendaEntries) {
        if (!ag.os_id) {
          await base44.asServiceRole.entities.AgendamentoRota.update(ag.id, { os_id: canonical.id, os_code: canonical.code });
        }
      }
    } catch (e) { /* ignore — agendamento é opcional */ }

    // Atualiza a venda para "Em OS"
    await base44.entities.Sale.update(sale.id, { stage: 'Em OS' });

    return Response.json({ success: true, service_order: canonical });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}