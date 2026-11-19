// Gerado de base44/functions/syncTechnicianReceipts/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

// Sincroniza automaticamente os recebimentos registrados pelo técnico (OS do Técnico)
// nos pagamentos da venda vinculada.
//
// Critério para sincronizar (respeitando a regra financeira):
//   - OS do Técnico concluída pelo técnico (status Concluída Técnico / Aguardando Faturamento - Pós / Finalizada)
//   - com valor recebido informado
//   - E critério obrigatório atendido: forma de recebimento (received_method) + comprovante (payment_receipt_url)
//
// Não sincroniza em caso de divergência de valor:
//   - soma dos pagamentos "Pendente" da venda deve ser igual ao recebido pelo técnico (tolerância de 1 centavo)
//   - divergentes ficam de fora e são reportados na resposta (auditoria manual)
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;

    const db = base44.asServiceRole;

    // 1. Busca OSs do técnico concluídas (paginação por cursor)
    const statuses = ['Concluída Técnico', 'Aguardando Faturamento - Pós', 'Finalizada'];
    const tosList = [];
    let cursor = undefined;
    do {
      const page = await db.entities.TechnicianServiceOrder.filter(
        { status: { $in: statuses } },
        { limit: 200, cursor, fields: ['code', 'status', 'sale_id', 'parent_os_id', 'received_amount', 'received_method', 'received_installments', 'payment_condition_id', 'payment_condition_name', 'payment_receipt_url'] }
      );
      tosList.push(...page.items);
      cursor = page.next_cursor;
    } while (cursor);

    const sincronizados = [];
    const semCriterio = [];
    const divergencias = [];
    const semVenda = [];

    // 2. Agrupa por venda: uma venda pode ter várias OSs — só sincroniza quando pendente
    const saleIds = new Set();
    const tosBySale = new Map(); // sale_id -> TOS (preferindo a mais recente)
    const parentsToResolve = [];

    for (const tos of tosList) {
      if (Number(tos.received_amount || 0) <= 0) continue;
      if (tos.sale_id) saleIds.add(tos.sale_id);
      else parentsToResolve.push(tos);
    }

    // Resolve venda pela OS pai quando a OS do técnico não tem sale_id
    const parentIds = [...new Set(parentsToResolve.map(t => t.parent_os_id).filter(Boolean))];
    const parentOsById = new Map();
    for (let i = 0; i < parentIds.length; i += 100) {
      const chunk = parentIds.slice(i, i + 100);
      const page = await db.entities.ServiceOrder.filter({ id: { $in: chunk } }, { limit: 100, fields: ['id', 'sale_id'] });
      page.items.forEach(os => parentOsById.set(os.id, os));
    }

    for (const tos of tosList) {
      if (Number(tos.received_amount || 0) <= 0) continue;
      const saleId = tos.sale_id || (parentOsById.get(tos.parent_os_id) || {}).sale_id || null;
      if (!saleId) { semVenda.push({ tos: tos.code, motivo: 'OS sem venda vinculada' }); continue; }
      saleIds.add(saleId);
      const existing = tosBySale.get(saleId);
      if (!existing || String(tos.updated_date || '') > String(existing.updated_date || '')) {
        tosBySale.set(saleId, tos);
      }
    }

    // 3. Carrega vendas pendentes
    const ids = [...saleIds];
    const saleById = new Map();
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const page = await db.entities.Sale.filter({ id: { $in: chunk } }, { limit: 100, fields: ['order_number', 'payments', 'received_amount'] });
      page.items.forEach(s => saleById.set(s.id, s));
    }

    // 4. Avalia e aplica
    for (const [saleId, tos] of tosBySale.entries()) {
      const sale = saleById.get(saleId);
      if (!sale) continue;

      const pendentes = (sale.payments || []).filter(p => p.payment_status === 'Pendente');
      if (!pendentes.length) continue; // já sincronizada

      // Critério obrigatório: forma + comprovante na OS do técnico
      if (!tos.received_method || !tos.payment_receipt_url) {
        semCriterio.push({
          tos: tos.code, pedido: sale.order_number,
          motivo: !tos.received_method ? 'Sem forma de recebimento na OS' : 'Sem comprovante na OS',
        });
        continue;
      }

      // Sem divergência de valor: recebido pelo técnico = soma dos pendentes da venda
      const pendenteTotal = pendentes.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const recebido = Number(tos.received_amount || 0);
      if (Math.abs(pendenteTotal - recebido) > 0.01) {
        divergencias.push({
          tos: tos.code, pedido: sale.order_number,
          pendente_venda: pendenteTotal, recebido_tecnico: recebido,
          diferenca: Number((recebido - pendenteTotal).toFixed(2)),
        });
        continue;
      }

      const payments = (sale.payments || []).map(p => {
        if (p.payment_status !== 'Pendente') return p;
        return {
          ...p,
          payment_status: 'Realizada',
          receipt_url: p.receipt_url || tos.payment_receipt_url || null,
          ...(tos.received_method ? { received_method: tos.received_method } : {}),
          ...(tos.received_installments != null ? { received_installments: tos.received_installments } : {}),
          ...(tos.payment_condition_id ? { condition_id: tos.payment_condition_id } : {}),
          ...(tos.payment_condition_name ? { condition_name: tos.payment_condition_name } : {}),
        };
      });

      if (!dryRun) {
        await db.entities.Sale.update(sale.id, {
          payments,
          received_amount: recebido,
        });
      }

      sincronizados.push({
        tos: tos.code, pedido: sale.order_number,
        forma: tos.received_method, valor: recebido,
        comprovante: 'sim', simulacao: dryRun,
      });
    }

    return Response.json({
      ok: true, dry_run: dryRun,
      os_avaliadas: tosList.length,
      sincronizados, sem_criterio: semCriterio, divergencias, sem_venda: semVenda,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}