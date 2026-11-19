// Gerado de base44/functions/syncServiceOrderTypeFromSale/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

// Tipo da OS gerado a partir da modalidade de entrega da venda
const TYPE_BY_MODALITY = {
  'Envio': 'Expedição',
  'Entrega Própria': 'Entrega',
  'Entrega + Instalação': 'Entrega + Instalação',
};

// A OS só troca de tipo enquanto ainda não entrou em rota, não teve etiqueta
// gerada e não foi faturada — depois disso o tipo já governa etapas reais.
const SYNCABLE_STATUSES = [
  'Aprovação Comercial',
  'Aprovação Financeira',
  'Produção/Expedição',
  'Aguardando Produção',
  'Produção Iniciada',
  'Produção Liberada',
];

// Chamada pelo workflow "Sincronizar Tipo da OS pela Modalidade" quando a
// modalidade de entrega da venda muda. Mantém o tipo da OS principal alinhado:
//   Envio → Expedição | Entrega Própria → Entrega | Entrega + Instalação → Entrega + Instalação
export default async function (req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const saleId = body.sale_id || body.entity_id;
    if (!saleId) return Response.json({ error: 'sale_id é obrigatório' }, { status: 400 });

    const sale = await base44.asServiceRole.entities.Sale.get(saleId);
    if (!sale) return Response.json({ error: 'Venda não encontrada' }, { status: 404 });

    const expectedType = TYPE_BY_MODALITY[sale.delivery_modality];
    if (!expectedType) return Response.json({ ok: true, skipped: 'Modalidade sem tipo de OS correspondente' });

    // OS principal da venda (nunca OS reversa, filha ou de manutenção)
    const page = await base44.asServiceRole.entities.ServiceOrder.filter({
      sale_id: saleId,
      status: { $ne: 'Cancelada' },
      is_reverse: { $ne: true },
      type: { $ne: 'Manutenção' },
      $or: [{ parent_os_id: { $exists: false } }, { parent_os_id: null }, { parent_os_id: '' }],
    }, { sort: '-created_date', limit: 1 });
    const os = (page.items || [])[0];
    if (!os) return Response.json({ ok: true, skipped: 'Venda ainda sem OS' });

    if (os.type === expectedType) return Response.json({ ok: true, unchanged: os.code });

    if (!SYNCABLE_STATUSES.includes(os.status)) {
      return Response.json({ ok: true, skipped: `OS ${os.code} já avançou (${os.status})` });
    }
    if (os.route_id || (os.melhor_envio_labels || []).length > 0 || os.invoiced || os.nfe_transmitted) {
      return Response.json({ ok: true, skipped: `OS ${os.code} já possui rota, etiqueta ou faturamento` });
    }

    const updates: any = {
      type: expectedType,
      delivery_modality: sale.delivery_modality || '',
    };
    // Só reescreve a descrição quando ela foi gerada no padrão da criação da OS
    if (typeof os.service_description === 'string' && os.service_description.startsWith('OS de ')) {
      updates.service_description = `OS de ${expectedType} — Pedido ${os.sale_order_number || sale.order_number || ''}`;
    }

    await base44.asServiceRole.entities.ServiceOrder.update(os.id, updates);

    return Response.json({
      ok: true,
      os_code: os.code,
      from: os.type,
      to: expectedType,
      delivery_modality: sale.delivery_modality,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}