// Gerado de base44/functions/getProductionDashboard/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const productionStatuses = ['Aguardando Produção', 'Produção Iniciada', 'Produção Liberada'];

    // Fetch all OS in production statuses
    const allOS = [];
    for (const status of productionStatuses) {
      const osList = await base44.asServiceRole.entities.ServiceOrder.filter({ status });
      allOS.push(...osList);
    }

    if (allOS.length === 0) {
      return Response.json({ orders: [] });
    }

    // Fetch all products (for subgroup mapping)
    const products = await base44.asServiceRole.entities.Product.list('-created_date', 500);
    const productMap = {};
    for (const p of products) productMap[p.id] = p;

    // Fetch all sales (up to 500) and build map
    const sales = await base44.asServiceRole.entities.Sale.list('-created_date', 500);
    const saleMap = {};
    for (const s of sales) saleMap[s.id] = s;

    // Build response with joined items
    const orders = allOS.map(os => {
      const sale = saleMap[os.sale_id];
      const items = (sale?.items || []).map(item => {
        const product = productMap[item.product_id];
        return {
          product_id: item.product_id,
          product_code: product?.code || '',
          product_name: item.product_name || product?.name || 'Produto sem nome',
          quantity: item.quantity || 0,
          subgroup_id: product?.subgroup_id || '',
          subgroup_name: product?.subgroup_name || 'Sem Subgrupo',
          group_id: product?.group_id || '',
          group_name: product?.group_name || 'Sem Grupo',
          product_type: product?.product_type || '',
          purifier_model: item.purifier_model || '',
        };
      });
      return {
        id: os.id,
        code: os.code,
        client_name: os.client_name,
        status: os.status,
        type: os.type,
        sale_order_number: os.sale_order_number,
        production_sent_date: os.production_sent_date,
        production_started_date: os.production_started_date,
        production_forecast_date: os.production_forecast_date,
        production_deadline: os.production_deadline,
        production_liberated_date: os.production_liberated_date,
        items,
      };
    });

    return Response.json({ orders });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});