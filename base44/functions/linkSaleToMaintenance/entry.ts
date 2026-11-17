import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Vincula retroativamente uma venda (cápsula/elemento filtrante) a um equipamento do cliente
 * e atualiza a data da última/próxima troca diretamente — funciona para qualquer etapa da venda,
 * inclusive as que o gatilho automático (processSaleEquipment) já teria ignorado.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Apenas administradores' }, { status: 403 });

    const body = await req.json();
    const { sale_id, equipment_id } = body;
    if (!sale_id || !equipment_id) {
      return Response.json({ error: 'sale_id e equipment_id são obrigatórios' }, { status: 400 });
    }

    const sale = await base44.asServiceRole.entities.Sale.get(sale_id);
    if (!sale) return Response.json({ error: 'Venda não encontrada' }, { status: 404 });
    const equip = await base44.asServiceRole.entities.Equipment.get(equipment_id);
    if (!equip) return Response.json({ error: 'Equipamento não encontrado' }, { status: 404 });

    const partItem = (sale.items || []).find((it) => it.product_id) || null;
    const saleDate = sale.date || new Date().toISOString().split('T')[0];
    const intervalMonths = equip.maintenance_interval_months || 6;
    const nextMaint = new Date(saleDate + 'T00:00:00');
    nextMaint.setMonth(nextMaint.getMonth() + intervalMonths);
    const nextDate = nextMaint.toISOString().split('T')[0];

    await base44.asServiceRole.entities.Equipment.update(equip.id, {
      last_maintenance_date: saleDate,
      next_maintenance_date: nextDate,
      last_maintenance_part_id: partItem ? partItem.product_id : '',
      last_maintenance_part_name: partItem ? (partItem.product_name || '') : '',
      crm_status: 'Contato Realizado',
      crm_notes: (equip.crm_notes || '') + '\nTroca de refil vinculada retroativamente à venda ' + (sale.order_number || sale.id) + ' em ' + saleDate + '.',
    });

    await base44.asServiceRole.entities.Sale.update(sale_id, {
      linked_equipment_id: equip.id,
      linked_equipment_code: equip.patrimony_code || equip.code || '',
    });

    return Response.json({ success: true, equipment_id: equip.id, next_maintenance_date: nextDate });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});