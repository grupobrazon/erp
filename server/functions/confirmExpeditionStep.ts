// Gerado de base44/functions/confirmExpeditionStep/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { appendStatusHistory } from '../shared/osStatusHistory.ts';
import { cascadeSaleStageFromOs } from '../shared/saleStageCascade.ts';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { os_id, action } = await req.json();
    if (!os_id || !action) {
      return Response.json({ error: 'os_id e action são obrigatórios' }, { status: 400 });
    }

    const os = await base44.asServiceRole.entities.ServiceOrder.get(os_id);
    if (!os) return Response.json({ error: 'OS não encontrada' }, { status: 404 });

    // GET — retorna dados da OS + itens da venda para a página pública
    if (action === 'get') {
      let items = [];
      let sale = null;
      if (os.sale_id) {
        try {
          sale = await base44.asServiceRole.entities.Sale.get(os.sale_id);
          items = sale?.items || [];
        } catch {}
      }
      return Response.json({
        os: {
          id: os.id,
          code: os.code,
          status: os.status,
          type: os.type,
          client_name: os.client_name,
          sale_order_number: os.sale_order_number,
          date: os.date,
          delivery_address: os.delivery_address,
          expedition_label_url: os.expedition_label_url,
          tracking_code: os.tracking_code,
          carrier: os.carrier,
          technician_notes: os.technician_notes,
          separation_date: os.separation_date,
          exit_date: os.exit_date,
          separation_signed_by: os.separation_signed_by,
        },
        items,
      });
    }

    const today = new Date().toISOString().slice(0, 10);

    // Trilha de auditoria das confirmações públicas (romaneio digital / QR)
    const audit = (newStatus, actor) => {
      const history = appendStatusHistory(os, { status: newStatus }, {
        actor: actor || 'Confirmação de expedição (QR/romaneio)',
        source: 'Expedição — romaneio digital',
      });
      return history ? { status_history: history } : {};
    };

    // Ações de confirmação de etapa (públicas — via QR Code / Romaneio digital)
    if (action === 'confirm_separation') {
      if (os.status !== 'Etiqueta Gerada') {
        return Response.json({ error: 'OS não está no status Etiqueta Gerada' }, { status: 400 });
      }
      await base44.asServiceRole.entities.ServiceOrder.update(os_id, { status: 'Separação', separation_date: today, ...audit('Separação') });
      return Response.json({ success: true, status: 'Separação' });
    }

    if (action === 'confirm_stock_exit') {
      if (os.status !== 'Separação') {
        return Response.json({ error: 'OS não está no status Separação' }, { status: 400 });
      }
      const body = await req.json().catch(() => ({}));
      await base44.asServiceRole.entities.ServiceOrder.update(os_id, {
        status: 'Saída do Estoque',
        separation_signed_by: body?.signed_by || os.separation_signed_by || '',
        ...audit('Saída do Estoque', body?.signed_by || ''),
      });
      return Response.json({ success: true, status: 'Saída do Estoque' });
    }

    if (action === 'confirm_transport') {
      if (os.status !== 'Saída do Estoque') {
        return Response.json({ error: 'OS não está no status Saída do Estoque' }, { status: 400 });
      }
      await base44.asServiceRole.entities.ServiceOrder.update(os_id, { status: 'Em Transporte', exit_date: today, ...audit('Em Transporte') });
      return Response.json({ success: true, status: 'Em Transporte' });
    }

    if (action === 'confirm_delivery') {
      if (os.status !== 'Em Transporte') {
        return Response.json({ error: 'OS não está no status Em Transporte' }, { status: 400 });
      }
      await base44.asServiceRole.entities.ServiceOrder.update(os_id, { status: 'Entregue', ...audit('Entregue') });
      try { await cascadeSaleStageFromOs(base44, { ...os, status: 'Entregue' }); } catch {}
      return Response.json({ success: true, status: 'Entregue' });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});