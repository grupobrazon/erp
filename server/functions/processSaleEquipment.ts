// Gerado de base44/functions/processSaleEquipment/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Disparada por automação de entidade (evento de Sale create/update), contexto sem usuário.
    const body = await req.json();
    const saleId = body.sale_id || (body.event && body.event.entity_id) || (body.data && body.data.id);
    if (!saleId) return Response.json({ error: 'sale_id is required' }, { status: 400 });

    const sale = await base44.asServiceRole.entities.Sale.get(saleId);
    if (!sale) return Response.json({ error: 'Sale not found' }, { status: 404 });

    // Confirmada/Aprovada → cria registros + marca "Agendado" (NÃO atualiza data).
    // Faturada → atualiza a data da última/próxima troca.
    const validStages = ['Confirmada', 'Pagamento Aprovado', 'Faturada'];
    if (sale.stage && !validStages.includes(sale.stage)) {
      return Response.json({ success: true, message: 'Sale not in a processable stage, skipping', created: 0 });
    }
    const isFaturada = sale.stage === 'Faturada';
    const saleDate = sale.date || new Date().toISOString().split('T')[0];

    // ── 1. Equipamento vinculado (refil vendido pelo painel de manutenção) ──
    if (sale.linked_equipment_id) {
      const equip = await base44.asServiceRole.entities.Equipment.get(sale.linked_equipment_id);
      if (equip) {
        if (isFaturada) {
          const intervalMonths = equip.maintenance_interval_months || 6;
          const nextMaint = new Date(saleDate + 'T00:00:00');
          nextMaint.setMonth(nextMaint.getMonth() + intervalMonths);
          const partItem = (sale.items || []).find(it => it.product_id) || null;
          await base44.asServiceRole.entities.Equipment.update(equip.id, {
            last_maintenance_date: saleDate,
            next_maintenance_date: nextMaint.toISOString().split('T')[0],
            last_maintenance_part_id: partItem ? partItem.product_id : '',
            last_maintenance_part_name: partItem ? (partItem.product_name || '') : '',
            crm_status: 'Contato Realizado',
            crm_notes: (equip.crm_notes || '') + '\nTroca de refil faturada via venda ' + (sale.order_number || sale.id) + ' em ' + saleDate + '.',
          });
        } else {
          await base44.asServiceRole.entities.Equipment.update(equip.id, {
            crm_status: 'Agendado',
            crm_notes: (equip.crm_notes || '') + '\nTroca de refil agendada via venda ' + (sale.order_number || sale.id) + ' (aguarda faturamento).',
          });
        }
      }
    }

    const client = await base44.asServiceRole.entities.Client.get(sale.client_id);
    if (!client) return Response.json({ error: 'Client not found' }, { status: 404 });
    const clientCode = client.new_code || client.old_code || 'CLI';

    const existingEquip = await base44.asServiceRole.entities.Equipment.filter(
      { client_id: sale.client_id }, '-created_date', 500
    );
    let seqCounter = existingEquip.length;
    const results = [];

    // ── 2. Criação de registros (idempotente) ──
    for (const item of (sale.items || [])) {
      if (!item.product_id) continue;
      const product = await base44.asServiceRole.entities.Product.get(item.product_id);
      if (!product) continue;

      const generatesEquip = product.generates_maintenance || product.maintenance_role === 'Gera Patrimônio';
      const isPart = product.is_maintenance_part || product.maintenance_role === 'Peça de Manutenção';
      if (!generatesEquip && !isPart) continue;

      const alreadyExists = existingEquip.find(e => e.sale_id === sale.id && e.product_id === item.product_id);
      if (alreadyExists) continue;

      seqCounter++;
      const patrimonyCode = clientCode + '-' + String(seqCounter).padStart(2, '0');

      if (generatesEquip) {
        const intervalMonths = product.maintenance_interval_months || 6;
        const nextMaint = new Date(saleDate + 'T00:00:00');
        nextMaint.setMonth(nextMaint.getMonth() + intervalMonths);
        const equipment = await base44.asServiceRole.entities.Equipment.create({
          code: patrimonyCode, patrimony_code: patrimonyCode,
          client_id: sale.client_id, client_name: sale.client_name || client.name,
          product_id: item.product_id, product_name: item.product_name || product.name,
          brand: product.brand || '', model: product.name || '', category: product.group_name || '',
          sale_id: sale.id, sale_date: sale.date, status: 'Ativo', record_type: 'equipamento',
          maintenance_interval_months: intervalMonths,
          next_maintenance_date: nextMaint.toISOString().split('T')[0],
        });
        results.push(equipment);
      } else if (isPart) {
        const hasEquipamento = existingEquip.some(e => e.record_type === 'equipamento');
        if (!hasEquipamento) {
          // Cliente sem purificador: cria equipamento placeholder (patrimônio do cliente)
          // para o vendedor preencher o modelo depois na aba Peças Pendentes.
          // A data da próxima troca só é definida no faturamento.
          const placeholder = await base44.asServiceRole.entities.Equipment.create({
            code: patrimonyCode, patrimony_code: patrimonyCode,
            client_id: sale.client_id, client_name: sale.client_name || client.name,
            product_id: item.product_id, product_name: item.product_name || product.name,
            brand: '', model: '', category: product.group_name || '',
            sale_id: sale.id, sale_date: sale.date, status: 'Ativo', record_type: 'equipamento',
            pending_link: true,
            maintenance_interval_months: product.maintenance_interval_months || 6,
            crm_status: 'Agendado',
          });
          results.push(placeholder);
        } else {
          // Cliente já tem purificador: cria peça pendente para vinculação
          const partRecord = await base44.asServiceRole.entities.Equipment.create({
            code: patrimonyCode, patrimony_code: patrimonyCode,
            client_id: sale.client_id, client_name: sale.client_name || client.name,
            product_id: item.product_id, product_name: item.product_name || product.name,
            sale_id: sale.id, sale_date: sale.date, status: 'Ativo', record_type: 'peca',
            pending_link: true, brand: '', model: '',
          });
          results.push(partRecord);
        }
      }
    }

    // ── 3. Faturada: atualiza a data da próxima troca dos placeholders criados por esta venda ──
    if (isFaturada) {
      const saleEquip = await base44.asServiceRole.entities.Equipment.filter(
        { sale_id: sale.id, record_type: 'equipamento', status: 'Ativo' }, '-created_date', 100
      );
      for (const e of saleEquip) {
        if (!e.next_maintenance_date) {
          const intervalMonths = e.maintenance_interval_months || 6;
          const nextMaint = new Date(saleDate + 'T00:00:00');
          nextMaint.setMonth(nextMaint.getMonth() + intervalMonths);
          await base44.asServiceRole.entities.Equipment.update(e.id, {
            next_maintenance_date: nextMaint.toISOString().split('T')[0],
            crm_status: 'Contato Realizado',
          });
        }
      }
    }

    return Response.json({ success: true, created: results.length, equipment: results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});