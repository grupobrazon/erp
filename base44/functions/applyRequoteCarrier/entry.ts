import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Aplica a transportadora selecionada pelo usuário após a recotação (requoteShipping).
// O requoteShipping apenas regenera volumes e cota — não aplica o frete.
// Esta função recebe a transportadora/serviço escolhido pelo usuário e:
//   - Se o novo frete <= frete original → aplica imediatamente (atualiza freight, grand_total, carrier, service)
//   - Se o novo frete > frete original → seta "Pendente Aprovação" (aguarda supervisor/adm no Dashboard de Fretes)

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { sale_id, carrier, service, price } = await req.json();
    if (!sale_id) return Response.json({ error: 'sale_id é obrigatório' }, { status: 400 });
    if (!carrier || !service) return Response.json({ error: 'carrier e service são obrigatórios' }, { status: 400 });

    const sale = await base44.entities.Sale.get(sale_id);
    if (!sale) return Response.json({ error: 'Venda não encontrada' }, { status: 404 });

    const newFreight = Number(price) || 0;
    const originalFreight = Number(sale.freight) || 0;
    const freightDiff = Number((newFreight - originalFreight).toFixed(2));
    const hasDiff = freightDiff > 0.01;
    const userName = user?.full_name || user?.email || 'Logística';

    // Marca a cotação selecionada no histórico
    const updatedHistory = (sale.shipping_quote_history || []).map(q => ({
      ...q,
      selected: q.company_name === carrier && q.service_name === service,
    }));

    const saleUpdate = {
      shipping_quote_history: updatedHistory,
    };

    if (hasDiff) {
      // DIFERENÇA POSITIVA → exige aprovação do supervisor/adm.
      saleUpdate.requote_diff_status = 'Pendente Aprovação';
      saleUpdate.requote_diff_amount = freightDiff;
      saleUpdate.requote_original_freight = originalFreight;
      saleUpdate.requote_new_freight = newFreight;
      saleUpdate.requote_original_carrier = sale.selected_carrier || '';
      saleUpdate.requote_original_volumes_count = (sale.shipping_volumes || []).length;
      saleUpdate.requote_new_volumes_count = (sale.shipping_volumes || []).length;
      saleUpdate.requote_reason = 'Erro de cotação — empacotamento/volumes incorretos na cotação original';
      saleUpdate.requote_requested_by = userName;
      saleUpdate.requote_requested_date = new Date().toISOString();
      saleUpdate.requote_approved_by = '';
      saleUpdate.requote_approved_date = '';
      saleUpdate.requote_rejected_by = '';
      saleUpdate.requote_rejected_date = '';
      saleUpdate.requote_reject_reason = '';
      // Salva a transportadora/serviço selecionados mas NÃO aplica o frete
      saleUpdate.selected_carrier = carrier;
      saleUpdate.selected_service = service;
    } else {
      // Sem diferença (ou frete diminuiu) → aplica imediatamente.
      saleUpdate.requote_diff_status = 'Não Aplicável';
      saleUpdate.requote_diff_amount = 0;
      saleUpdate.requote_original_freight = 0;
      saleUpdate.requote_new_freight = 0;
      saleUpdate.requote_original_carrier = '';
      saleUpdate.requote_original_volumes_count = 0;
      saleUpdate.requote_new_volumes_count = 0;
      saleUpdate.requote_reason = '';
      saleUpdate.requote_requested_by = '';
      saleUpdate.requote_requested_date = '';
      saleUpdate.requote_approved_by = '';
      saleUpdate.requote_approved_date = '';
      saleUpdate.requote_rejected_by = '';
      saleUpdate.requote_rejected_date = '';
      saleUpdate.requote_reject_reason = '';
      saleUpdate.selected_carrier = carrier;
      saleUpdate.selected_service = service;
      saleUpdate.freight = newFreight;
      saleUpdate.grand_total = (sale.total || 0) + (sale.additions || 0) + newFreight + (sale.displacement_fee || 0) - (sale.discount || 0);
    }

    await base44.entities.Sale.update(sale_id, saleUpdate);

    return Response.json({
      success: true,
      applied: !hasDiff,
      sale_id,
      carrier,
      service,
      freight: hasDiff ? originalFreight : newFreight,
      grand_total: hasDiff ? (sale.grand_total || 0) : (sale.total || 0) + (sale.additions || 0) + newFreight + (sale.displacement_fee || 0) - (sale.discount || 0),
      diff_amount: hasDiff ? freightDiff : 0,
      freight_diff: hasDiff ? {
        status: 'Pendente Aprovação',
        original_freight: originalFreight,
        new_freight: newFreight,
        diff_amount: freightDiff,
      } : null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});