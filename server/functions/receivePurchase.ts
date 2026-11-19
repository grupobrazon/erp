// Gerado de base44/functions/receivePurchase/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

function fmt(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function addDays(dateStr, days) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return fmt(dt);
}

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      purchase_order_id, received_date, fiscal_doc_url, invoice_number, invoice_chave,
      items, stock_location_id, stock_location_name,
    } = body;
    if (!purchase_order_id) return Response.json({ error: 'purchase_order_id obrigatório' }, { status: 400 });

    const po = await base44.entities.PurchaseOrder.get(purchase_order_id);
    if (!po) return Response.json({ error: 'Pedido de compra não encontrado' }, { status: 404 });

    // 1) Entrada no estoque: StockMovement (Entrada/Compra) com local + saldo por local + current_stock global
    const stockItems = (items || []).filter(it => it.product_id && it.quantity > 0);
    const effectiveLocationId = stock_location_id || po.stock_location_id || null;
    const effectiveLocationName = stock_location_name || po.stock_location_name || '';

    const movementPromises = stockItems.map(async it => {
      await base44.entities.StockMovement.create({
        product_id: it.product_id,
        product_name: it.product_name,
        type: 'Entrada',
        reason: 'Compra',
        quantity: it.quantity,
        date: received_date,
        stock_location_id: effectiveLocationId || null,
        stock_location_name: effectiveLocationName || '',
        notes: `Recebimento ${po.code}${effectiveLocationName ? ' · ' + effectiveLocationName : ''}`,
        reference_id: po.id,
      });
      try {
        const prod = await base44.entities.Product.get(it.product_id);
        if (prod) {
          await base44.entities.Product.update(it.product_id, {
            current_stock: (prod.current_stock || 0) + it.quantity,
          });
        }
      } catch (e) { /* produto pode não existir; ignora */ }
      // Mantém saldo por local (StockByLocation)
      if (effectiveLocationId) {
        try {
          const existing = await base44.entities.StockByLocation.filter({
            product_id: it.product_id,
            stock_location_id: effectiveLocationId,
          });
          const unit = existing && existing[0];
          if (unit) {
            await base44.entities.StockByLocation.update(unit.id, {
              quantity: (unit.quantity || 0) + it.quantity,
              product_name: it.product_name || unit.product_name,
              stock_location_name: effectiveLocationName || unit.stock_location_name,
            });
          } else {
            await base44.entities.StockByLocation.create({
              product_id: it.product_id,
              product_name: it.product_name,
              stock_location_id: effectiveLocationId,
              stock_location_name: effectiveLocationName,
              quantity: it.quantity,
            });
          }
        } catch (e) { /* ignora falha no saldo por local */ }
      }
    });
    await Promise.all(movementPromises);

    // 2) Geração do(s) contas a pagar conforme a condição de pagamento do pedido
    let condition = null;
    if (po.payment_condition_id) {
      try { condition = await base44.entities.PaymentCondition.get(po.payment_condition_id); } catch (e) { condition = null; }
    }
    const coaList = await base44.entities.ChartOfAccount.filter({ code: '8101' });
    const coa = coaList[0] || null;
    const grandTotal = po.grand_total || 0;
    const installments = condition && condition.payment_type === 'Parcelado' ? (condition.installments || 1) : 1;

    const payables = [];
    let remaining = grandTotal;
    for (let i = 1; i <= installments; i++) {
      let amt;
      if (i === installments) amt = Math.round(remaining * 100) / 100;
      else { amt = Math.round((grandTotal / installments) * 100) / 100; remaining -= amt; }
      const due = installments > 1 ? addDays(received_date, 30 * i) : received_date;
      payables.push({
        description: `Compra ${po.code} — ${po.supplier_name}${installments > 1 ? ` (${i}/${installments})` : ''}`,
        category: 'Fornecedor',
        chart_of_account_id: coa?.id || null,
        chart_of_account_code: coa?.code || '8101',
        chart_of_account_name: coa?.name || 'Estoque - Produção e revenda',
        supplier_name: po.supplier_name,
        supplier_document: po.supplier_document || '',
        amount: amt,
        due_date: due,
        status: 'Em Aberto',
        invoice_number: invoice_number || po.invoice_number || '',
        notes: `Parcela ${i}/${installments} — Pedido ${po.code}`,
        purchase_order_id: po.id,
        purchase_order_code: po.code,
      });
    }

    const payableIds = [];
    if (payables.length > 0) {
      const created = await base44.entities.AccountPayable.bulkCreate(payables);
      const arr = Array.isArray(created) ? created : (Array.isArray(created?.list) ? created.list : []);
      for (const p of arr) { if (p && p.id) payableIds.push(p.id); }
    }

    // 3) Atualiza o pedido de compra
    await base44.entities.PurchaseOrder.update(purchase_order_id, {
      status: 'Recebido',
      received_date,
      fiscal_doc_url: fiscal_doc_url || po.fiscal_doc_url || null,
      invoice_number: invoice_number || po.invoice_number || null,
      invoice_chave: invoice_chave || po.invoice_chave || null,
      accounts_payable_ids: payableIds,
      stock_location_id: stock_location_id || po.stock_location_id || null,
      stock_location_name: stock_location_name || po.stock_location_name || null,
    });

    return Response.json({
      success: true,
      stock_movements: stockItems.length,
      payables: payableIds.length,
      payable_ids: payableIds,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});