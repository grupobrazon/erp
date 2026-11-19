// Gerado de base44/functions/decideProductionCancellation/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { os_id, decision, notes } = await req.json();
    if (!os_id) return Response.json({ error: 'os_id é obrigatório' }, { status: 400 });
    if (!['Suspensa', 'Continuar para Estoque'].includes(decision)) {
      return Response.json({ error: 'decision deve ser "Suspensa" ou "Continuar para Estoque"' }, { status: 400 });
    }
    const notesStr = String(notes || '').trim();

    const os = await base44.entities.ServiceOrder.get(os_id);
    if (!os) return Response.json({ error: 'OS não encontrada' }, { status: 404 });

    if (!os.production_cancellation_requested) {
      return Response.json({ error: 'Não há solicitação de cancelamento pendente para esta OS.' }, { status: 400 });
    }
    if (os.production_cancellation_decision && os.production_cancellation_decision !== 'Pendente') {
      return Response.json({ error: 'Esta solicitação já foi decidida.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const actor = user.full_name || user.email || 'Produção';

    const baseUpdate = {
      production_cancellation_decision: decision,
      production_cancellation_decided_by: actor,
      production_cancellation_decided_date: now,
      production_cancellation_decision_notes: notesStr,
      production_queue_removed: true,
      production_queue_removed_by: actor,
      production_queue_removed_date: now,
      production_history: [...(os.production_history || []), {
        date: now,
        event: decision === 'Suspensa' ? 'producao_suspensa' : 'producao_continuar_estoque',
        actor,
        notes: notesStr,
      }],
    };

    if (decision === 'Suspensa') {
      // Suspensa: item parcial é descartado/inutilizado. A OS deixa a fila de produção.
      await base44.entities.ServiceOrder.update(os_id, {
        ...baseUpdate,
        status: 'Produção Suspensa',
      });
      return Response.json({ success: true, status: 'Produção Suspensa' });
    }

    // Continuar para Estoque: a produção finaliza o item e ele vai para o estoque da empresa.
    // Gera um Romaneio de Troca de Demanda (novo documento separado).
    const lastPage = await base44.asServiceRole.entities.RomaneioTrocaDemanda.filter(
      { code: { $regex: '^RTD[0-9]{6}$' } }, { sort: '-code', limit: 1, fields: ['code'] }
    );
    const maxNum = parseInt(lastPage.items[0]?.code?.slice(3), 10) || 0;
    const code = `RTD${String(maxNum + 1).padStart(6, '0')}`;

    // Itens da OS (puxados da venda ou remessa vinculada)
    let items = [];
    if (os.sale_id) {
      try {
        const sale = await base44.asServiceRole.entities.Sale.get(os.sale_id);
        items = (sale?.items || []).map(i => ({
          product_id: i.product_id || '',
          product_name: i.product_name || '',
          quantity: i.quantity || 0,
        }));
      } catch (e) { /* ignora */ }
    }

    const romaneio = await base44.entities.RomaneioTrocaDemanda.create({
      code,
      os_id: os.id,
      os_code: os.code || '',
      sale_id: os.sale_id || '',
      sale_order_number: os.sale_order_number || '',
      client_id: os.client_id || '',
      client_name: os.client_name || '',
      items,
      date: today,
      status: 'Pendente',
      generated_by: actor,
      notes: notesStr,
    });

    await base44.entities.ServiceOrder.update(os_id, {
      ...baseUpdate,
      status: 'Produção para Estoque',
      troca_demanda_romaneio_id: romaneio.id,
    });

    return Response.json({ success: true, status: 'Produção para Estoque', romaneio_id: romaneio.id, romaneio_code: code });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}