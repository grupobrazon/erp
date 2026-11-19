// Gerado de base44/functions/generateWarrantyRemessa/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { appendStatusHistory } from '../shared/osStatusHistory.ts';

// Cria uma Remessa de Retorno para a OS de Garantia e emite a NF-e.
// O produto de garantia precisa retornar ao cliente via Melhor Envio.
// Antes de gerar a etiqueta, é necessário faturar a nota de remessa.
// A remessa vai para a fila de faturamento (status "Aguardando Financeiro").
export default (async (req) => {
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

    // Já existe remessa vinculada?
    if (os.warranty_remessa_id) {
      const existing = await base44.entities.Remessa.get(os.warranty_remessa_id);
      if (existing) {
        return Response.json({
          error: `Já existe remessa ${existing.code} vinculada a esta OS.`,
          remessa: existing,
        }, { status: 400 });
      }
    }

    // Precisa de venda para obter cliente e endereço
    if (!os.sale_id) {
      return Response.json({ error: 'OS não possui venda vinculada — não é possível obter cliente e endereço' }, { status: 400 });
    }
    const sale = await base44.entities.Sale.get(os.sale_id);
    if (!sale) return Response.json({ error: 'Venda não encontrada' }, { status: 404 });

    const client = await base44.entities.Client.get(sale.client_id);
    if (!client) return Response.json({ error: 'Cliente não encontrado' }, { status: 404 });

    // Local de faturamento (emitente da NF-e)
    let billingLoc = null;
    if (sale.billing_location_id) {
      billingLoc = await base44.entities.BillingLocation.get(sale.billing_location_id);
    }
    if (!billingLoc) {
      return Response.json({ error: 'Local de faturamento não configurado na venda' }, { status: 400 });
    }

    // Endereço de entrega (destino do retorno — o cliente)
    const destAddr = sale.delivery_address || sale.billing_address || {};
    if (!destAddr.city || !destAddr.state) {
      return Response.json({ error: 'Endereço de entrega do cliente incompleto' }, { status: 400 });
    }

    // Itens para retorno (produtos da venda original — retornam ao cliente)
    const saleItems = Array.isArray(sale.items) ? sale.items : [];
    if (saleItems.length === 0) {
      return Response.json({ error: 'Venda não possui itens para retornar' }, { status: 400 });
    }

    // Determina CFOP: 5.949 (interno) ou 6.949 (interestadual) — Remessa de retorno
    const isInterstate = (client.state || '') !== (billingLoc.state || '');
    const cfopCode = isInterstate ? '6.949' : '5.949';

    // Gera código da remessa (REM000001)
    const existingRemessas = await base44.entities.Remessa.filter({}, '-created_date', 5000);
    const maxRemessaNum = existingRemessas.reduce((max, r) => {
      const num = parseInt((r.code || '').replace('REM', '')) || 0;
      return num > max ? num : max;
    }, 0);
    const remessaCode = `REM${String(maxRemessaNum + 1).padStart(6, '0')}`;

    const today = new Date().toISOString().split('T')[0];

    // Cria a Remessa com valor zerado (garantia — sem cobrança)
    const remessaItems = saleItems.map(it => ({
      product_id: it.product_id,
      product_name: it.product_name,
      quantity: it.quantity,
      unit_price: 0,
      total: 0,
    }));

    const remessa = await base44.entities.Remessa.create({
      code: remessaCode,
      remessa_type: 'Retorno',
      client_id: sale.client_id,
      client_name: sale.client_name || client.name,
      date: today,
      items: remessaItems,
      delivery_modality: 'Envio',
      delivery_address: {
        zip_code: destAddr.zip_code || '',
        street: destAddr.street || '',
        number: destAddr.number || '',
        neighborhood: destAddr.neighborhood || '',
        city: destAddr.city || '',
        state: destAddr.state || '',
      },
      billing_location_id: sale.billing_location_id,
      billing_location_name: sale.billing_location_name || billingLoc.name,
      freight: 0,
      discount: 0,
      grand_total: 0,
      cfop_code: cfopCode,
      natureza_operacao: 'Remessa de retorno de produto de garantia',
      status: 'Aguardando Financeiro',
      return_status: 'Não Aplicável',
      notes: `Remessa de retorno gerada a partir da OS de Garantia ${os.code}.`,
    });

    // Vincula a remessa à OS
    const updates: any = {
      warranty_remessa_id: remessa.id,
      warranty_remessa_code: remessa.code,
      warranty_flow_status: 'Aguardando Retorno',
    };
    const history = appendStatusHistory(os, updates, {
      actor: user.full_name || user.email || 'Usuário',
      source: 'Garantia — faturar remessa de retorno',
    });
    if (history) updates.status_history = history;
    await base44.entities.ServiceOrder.update(os_id, updates);

    return Response.json({
      success: true,
      remessa,
      remessa_code: remessa.code,
      message: `Remessa ${remessa.code} criada e enviada para a fila de faturamento. Acesse a remessa para aprovação financeira e transmissão da NF-e. Após a NF-e ser autorizada, volte aqui para gerar a etiqueta.`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});