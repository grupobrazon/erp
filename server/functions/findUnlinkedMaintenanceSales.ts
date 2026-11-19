// Gerado de base44/functions/findUnlinkedMaintenanceSales/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

/**
 * Vistoria de vendas de cápsulas/elementos filtrantes lançadas diretamente no menu Vendas
 * (sem vínculo ao Painel de Manutenção). Retorna cada venda órfã + os equipamentos ativos
 * do cliente, para vinculação manual retroativa.
 */
export default async function handler(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Apenas administradores' }, { status: 403 });

    // 1. Conjunto de IDs de produtos que são peça de manutenção (cápsula/elemento filtrante)
    const partProductNames = new Map();
    let pOff = 0;
    while (pOff < 5000) {
      const ps = await base44.asServiceRole.entities.Product.list('-created_date', 500, pOff);
      if (!ps || ps.length === 0) break;
      for (const p of ps) {
        if (p.is_maintenance_part || p.maintenance_role === 'Peça de Manutenção') {
          partProductNames.set(p.id, p.name);
        }
      }
      pOff += ps.length;
      if (ps.length < 500) break;
    }

    // 2. Varredura das vendas confirmadas/avançadas sem linked_equipment_id
    const validStages = ['Confirmada', 'Pagamento Aprovado', 'Em OS', 'Faturada', 'Concluída'];
    const results = [];
    const seen = new Set();
    let offset = 0;
    const PAGE = 500;
    let guard = 0;

    while (guard++ < 50 && results.length < 500) {
      const batch = await base44.asServiceRole.entities.Sale.list('-created_date', PAGE, offset);
      if (!batch || batch.length === 0) break;
      for (const s of batch) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        if (!validStages.includes(s.stage)) continue;
        if (s.linked_equipment_id) continue;
        const partItem = (s.items || []).find((it) => it.product_id && partProductNames.has(it.product_id));
        if (!partItem) continue;

        const equip = await base44.asServiceRole.entities.Equipment.filter(
          { client_id: s.client_id, status: 'Ativo' }, '-created_date', 200
        );
        const equipamentos = equip
          .filter((e) => e.record_type !== 'peca')
          .map((e) => ({
            id: e.id,
            patrimony_code: e.patrimony_code || e.code,
            product_name: e.product_name,
            next_maintenance_date: e.next_maintenance_date,
            maintenance_interval_months: e.maintenance_interval_months || 6,
          }));

        results.push({
          sale_id: s.id,
          order_number: s.order_number,
          client_id: s.client_id,
          client_name: s.client_name,
          date: s.date,
          stage: s.stage,
          part_item: {
            product_id: partItem.product_id,
            product_name: partItem.product_name || partProductNames.get(partItem.product_id),
            quantity: partItem.quantity,
          },
          equipamentos,
        });
        if (results.length >= 500) break;
      }
      offset += batch.length;
      if (batch.length < PAGE) break;
    }

    return Response.json({ total: results.length, sales: results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
