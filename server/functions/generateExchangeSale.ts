// Gerado de base44/functions/generateExchangeSale/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

// Gera um Pedido de Troca a partir de uma OS Reversa recebida com resolução "Troca".
// Cria uma nova venda com valor ZERADO (sem cobrança), contendo apenas os itens
// devolvidos (editáveis — o usuário pode trocar o produto, ex: voltagem errada).
// Gera a OS da troca (que vai para Produção/Expedição automaticamente).
export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { reverse_os_id, items, justification, anticipated } = await req.json();
    if (!reverse_os_id) return Response.json({ error: 'reverse_os_id é obrigatório' }, { status: 400 });
    if (!items || !Array.isArray(items) || items.length === 0) {
      return Response.json({ error: 'Informe pelo menos um item para a troca' }, { status: 400 });
    }
    if (!justification || !justification.trim()) {
      return Response.json({ error: 'Justificativa da troca é obrigatória' }, { status: 400 });
    }

    // Valida itens
    for (const it of items) {
      if (!it.product_id || !it.product_name || !it.quantity || it.quantity <= 0) {
        return Response.json({ error: 'Itens inválidos — verifique produto e quantidade' }, { status: 400 });
      }
    }

    // Carrega OS Reversa
    const reverseOs = await base44.entities.ServiceOrder.get(reverse_os_id);
    if (!reverseOs) return Response.json({ error: 'OS Reversa não encontrada' }, { status: 404 });
    if (!reverseOs.is_reverse) return Response.json({ error: 'Esta OS não é uma OS Reversa' }, { status: 400 });

    // Carrega OS pai → venda original
    if (!reverseOs.reverse_parent_os_id) {
      return Response.json({ error: 'OS Reversa sem OS pai vinculada' }, { status: 400 });
    }
    const parentOs = await base44.entities.ServiceOrder.get(reverseOs.reverse_parent_os_id);
    if (!parentOs) return Response.json({ error: 'OS pai não encontrada' }, { status: 404 });
    if (!parentOs.sale_id) return Response.json({ error: 'OS pai sem venda vinculada' }, { status: 400 });

    const originalSale = await base44.entities.Sale.get(parentOs.sale_id);
    if (!originalSale) return Response.json({ error: 'Venda original não encontrada' }, { status: 404 });

    // Verifica se já existe pedido de troca para esta OS Reversa
    const existing = await base44.entities.Sale.filter({ exchange_reverse_os_id: reverse_os_id });
    if (existing.length > 0) {
      return Response.json({
        error: 'Já existe um pedido de troca gerado para esta OS Reversa',
        sale: existing[0],
      }, { status: 400 });
    }

    // Gera número do pedido (P + sequencial)
    const allSales = await base44.entities.Sale.list('-created_date', 1000);
    const maxNum = allSales.reduce((max, s) => {
      const num = parseInt(s.order_number?.replace('P', '')) || 0;
      return num > max ? num : max;
    }, 0);
    const orderNumber = `P${String(maxNum + 1).padStart(3, '0')}`;

    // Itens da troca (valor zerado)
    const exchangeItems = items.map(it => ({
      product_id: it.product_id,
      product_name: it.product_name,
      quantity: it.quantity,
      unit_price: 0,
      total: 0,
    }));

    const today = new Date().toISOString().split('T')[0];

    // Cria a venda de troca
    const sale = await base44.entities.Sale.create({
      order_number: orderNumber,
      client_id: originalSale.client_id,
      client_name: originalSale.client_name || '',
      date: today,
      seller_id: originalSale.seller_id || '',
      seller_name: originalSale.seller_name || '',
      billing_location_id: originalSale.billing_location_id || '',
      billing_location_name: originalSale.billing_location_name || '',
      stock_location_id: originalSale.stock_location_id || '',
      stock_location_name: originalSale.stock_location_name || '',
      items: exchangeItems,
      total: 0,
      grand_total: 0,
      freight: 0,
      discount: 0,
      additions: 0,
      delivery_modality: originalSale.delivery_modality || 'Envio',
      delivery_address: originalSale.delivery_address || {},
      billing_address: originalSale.billing_address || {},
      stage: 'Confirmada',
      confirmation_type: 'Parcial',
      status: 'Confirmada',
      is_exchange: true,
      exchange_parent_sale_id: originalSale.id,
      exchange_parent_sale_number: originalSale.order_number || '',
      exchange_reverse_os_id: reverse_os_id,
      exchange_reverse_os_code: reverseOs.code || '',
      exchange_reason: justification,
      exchange_anticipated: !!anticipated,
      notes: `PEDIDO DE TROCA — Pedido original: ${originalSale.order_number || ''} | OS Reversa: ${reverseOs.code || ''} | Motivo: ${justification}`,
    });

    // Se antecipado, marca a resolução da OS Reversa como "Troca" (sem marcar recebimento)
    if (anticipated) {
      await base44.entities.ServiceOrder.update(reverse_os_id, {
        reverse_resolution: 'Troca',
        reverse_resolution_date: new Date().toISOString(),
      });
    }

    // Gera a OS da troca (replicando a lógica do generateServiceOrder)
    const typeMap: any = {
      'Envio': 'Expedição',
      'Entrega Própria': 'Entrega',
      'Entrega + Instalação': 'Entrega + Instalação',
    };
    const osType = typeMap[originalSale.delivery_modality] || 'Entrega';

    // Gera código da OS
    const allOS = await base44.entities.ServiceOrder.list('-created_date', 1000);
    const maxOsNum = allOS.reduce((max: number, o: any) => {
      const num = parseInt(o.code?.replace('OS', '')) || 0;
      return num > max ? num : max;
    }, 0);
    const osCode = `OS${String(maxOsNum + 1).padStart(6, '0')}`;

    const os = await base44.entities.ServiceOrder.create({
      code: osCode,
      client_id: sale.client_id,
      client_name: sale.client_name || '',
      sale_id: sale.id,
      sale_order_number: sale.order_number || '',
      type: osType,
      delivery_modality: sale.delivery_modality || '',
      delivery_address: sale.delivery_address || sale.billing_address || {},
      date: today,
      status: 'Produção/Expedição',
      has_pending_payment: false,
      pending_payment_amount: 0,
      technician_notes: `TROCA — Pedido original: ${originalSale.order_number} | Motivo: ${justification}`,
      service_description: `OS de Troca — Pedido ${sale.order_number} (orig: ${originalSale.order_number})`,
    });

    // Atualiza venda para "Em OS"
    await base44.entities.Sale.update(sale.id, { stage: 'Em OS' });

    return Response.json({
      success: true,
      sale,
      service_order: os,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});