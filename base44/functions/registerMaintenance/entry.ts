import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      equipment_id, product_id, quantity, unit_price,
      technician, date, notes,
      seller_id, seller_name, billing_location_id, stock_location_id,
    } = body;

    if (!equipment_id || !product_id || !date) {
      return Response.json({ error: 'equipment_id, product_id, and date are required' }, { status: 400 });
    }

    const equipment = await base44.asServiceRole.entities.Equipment.get(equipment_id);
    if (!equipment) return Response.json({ error: 'Equipment not found' }, { status: 404 });

    const product = await base44.asServiceRole.entities.Product.get(product_id);
    if (!product) return Response.json({ error: 'Product not found' }, { status: 404 });

    const qty = Number(quantity) || 1;
    const price = Number(unit_price) || Number(product.sale_price) || 0;
    const total = qty * price;

    // Generate order number
    const lastSales = await base44.asServiceRole.entities.Sale.list('-created_date', 1);
    const lastNum = lastSales && lastSales.length > 0
      ? parseInt((lastSales[0].order_number || 'P000').replace(/\D/g, '')) + 1
      : 1;
    const orderNumber = 'P' + String(lastNum).padStart(3, '0');

    // Create sale for the filter element
    const sale = await base44.asServiceRole.entities.Sale.create({
      order_number: orderNumber,
      client_id: equipment.client_id,
      client_name: equipment.client_name,
      date: date,
      seller_id: seller_id || '',
      seller_name: seller_name || '',
      billing_location_id: billing_location_id || '',
      stock_location_id: stock_location_id || '',
      items: [{
        product_id: product_id,
        product_name: product.name,
        quantity: qty,
        unit_price: price,
        total: total,
        generate_equipment: false,
      }],
      total: total,
      grand_total: total,
      freight: 0,
      additions: 0,
      discount: 0,
      delivery_modality: 'Entrega Própria',
      stage: 'Confirmada',
      status: 'Confirmada',
      notes: notes || ('Manutenção do patrimônio ' + (equipment.patrimony_code || equipment.code)),
    });

    // Calculate next maintenance date
    const maintDate = new Date(date);
    const intervalMonths = Number(equipment.maintenance_interval_months) || 6;
    const nextMaint = new Date(maintDate);
    nextMaint.setMonth(nextMaint.getMonth() + intervalMonths);
    const nextMaintStr = nextMaint.toISOString().split('T')[0];

    // Create maintenance record
    const maintenance = await base44.asServiceRole.entities.Maintenance.create({
      equipment_id: equipment_id,
      equipment_code: equipment.patrimony_code || equipment.code,
      client_id: equipment.client_id,
      client_name: equipment.client_name,
      technician: technician || '',
      date: date,
      type: 'Troca de Elemento Filtrante',
      description: 'Troca de ' + product.name + ' — Pedido ' + orderNumber,
      parts_used: [{
        product_id: product_id,
        product_name: product.name,
        quantity: qty,
      }],
      result: 'Realizada',
      service_order_id: '',
      notes: notes || '',
    });

    // Update equipment dates
    await base44.asServiceRole.entities.Equipment.update(equipment_id, {
      last_maintenance_date: date,
      next_maintenance_date: nextMaintStr,
      last_maintenance_part_id: product_id,
      last_maintenance_part_name: product.name,
      status: 'Ativo',
      pending_link: false,
    });

    // Create stock movement (saída)
    await base44.asServiceRole.entities.StockMovement.create({
      product_id: product_id,
      product_name: product.name,
      type: 'Saída',
      reason: 'Manutenção',
      quantity: qty,
      date: date,
      reference_id: sale.id,
      notes: 'Manutenção ' + (equipment.patrimony_code || equipment.code),
    });

    return Response.json({
      success: true,
      sale_id: sale.id,
      order_number: orderNumber,
      maintenance_id: maintenance.id,
      next_maintenance_date: nextMaintStr,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});