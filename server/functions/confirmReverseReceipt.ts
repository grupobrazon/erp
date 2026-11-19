// Gerado de base44/functions/confirmReverseReceipt/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { appendStatusHistory } from '../shared/osStatusHistory.ts';

// Confirma o recebimento da mercadoria devolvida na empresa (romaneio de entrada).
// Marca a OS Reversa como recebida e muda o status para "Recebida na Empresa".
export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { reverse_os_id, resolution } = await req.json();
    if (!reverse_os_id) return Response.json({ error: 'reverse_os_id é obrigatório' }, { status: 400 });

    if (resolution && !['Troca', 'Cancelamento'].includes(resolution)) {
      return Response.json({ error: 'Resolução inválida. Use "Troca" ou "Cancelamento".' }, { status: 400 });
    }

    const reverseOs = await base44.entities.ServiceOrder.get(reverse_os_id);
    if (!reverseOs) return Response.json({ error: 'OS Reversa não encontrada' }, { status: 404 });
    if (!reverseOs.is_reverse) return Response.json({ error: 'Esta OS não é uma OS Reversa' }, { status: 400 });

    // Bloqueia o recebimento se nenhuma etiqueta reversa foi postada pelo cliente ainda.
    // O status do envio reverso no Melhor Envio precisa estar pelo menos "posted" (pacote
    // em trânsito) para que o recebimento possa ser confirmado. Isso evita marcação
    // indevida de "Recebida na Empresa" quando o cliente nem chegou a postar a devolução.
    const reverseShipments = Array.isArray(reverseOs.reverse_shipments) ? reverseOs.reverse_shipments : [];
    if (reverseShipments.length === 0) {
      return Response.json({
        error: 'Nenhuma etiqueta reversa foi gerada ainda. Gere a etiqueta de coleta reversa antes de confirmar o recebimento.',
      }, { status: 400 });
    }
    const anyPosted = reverseShipments.some(s =>
      s.status === 'posted' || s.status === 'delivered'
    );
    if (!anyPosted) {
      return Response.json({
        error: 'O cliente ainda não postou a devolução. O status do envio reverso no Melhor Envio ainda é "generated" (etiqueta gerada, aguardando postagem). Aguarde a sincronização automática confirmar a postagem para então confirmar o recebimento.',
      }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Se já foi recebida, apenas atualiza a resolução (se fornecida)
    if (reverseOs.reverse_received) {
      if (!resolution) {
        return Response.json({ error: 'Mercadoria já recebida. Forneça uma resolução para atualizar.' }, { status: 400 });
      }
      await base44.entities.ServiceOrder.update(reverse_os_id, {
        reverse_resolution: resolution,
        reverse_resolution_date: now,
      });
      if (resolution === 'Cancelamento') {
        await handleCancellationIntegration(base44, reverseOs, user, now);
      }
      return Response.json({ success: true, reverse_os_id, resolution });
    }

    const updates: any = {
      reverse_received: true,
      reverse_received_date: now,
      reverse_received_by: user.full_name || user.email || 'Usuário',
      status: 'Recebida na Empresa',
    };
    if (resolution) {
      updates.reverse_resolution = resolution;
      updates.reverse_resolution_date = now;
    }
    const history = appendStatusHistory(reverseOs, updates, {
      actor: user.full_name || user.email || 'Usuário',
      source: 'OS Reversa — confirmação de recebimento',
    });
    if (history) updates.status_history = history;

    await base44.entities.ServiceOrder.update(reverse_os_id, updates);

    if (resolution === 'Cancelamento') {
      await handleCancellationIntegration(base44, reverseOs, user, now);
    }

    return Response.json({
      success: true,
      reverse_os_id: reverse_os_id,
      status: 'Recebida na Empresa',
      resolution: resolution || null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Integração com cancelamento de venda: se a OS Reversa foi gerada por um
// cancelamento de venda e a resolução for "Cancelamento", devolve os itens ao
// estoque e avança o cancelamento para "Aguardando Estorno Financeiro".
async function handleCancellationIntegration(base44: any, reverseOs: any, user: any, now: string) {
  if (!reverseOs.reverse_parent_os_id) return;
  try {
    const parentOs = await base44.entities.ServiceOrder.get(reverseOs.reverse_parent_os_id);
    if (!parentOs || !parentOs.sale_id) return;
    const sale = await base44.entities.Sale.get(parentOs.sale_id);
    if (!sale) return;
    if (!['Aguardando Retorno Logístico', 'Aguardando Recebimento'].includes(sale.cancellation_status)) return;

    const today = now.split('T')[0];
    const userName = user.full_name || user.email || 'Usuário';

    // Devolver itens ao estoque
    for (const item of (sale.items || [])) {
      if (item.product_id) {
        try {
          const product = await base44.entities.Product.get(item.product_id);
          if (product) {
            await base44.entities.Product.update(item.product_id, {
              current_stock: (product.current_stock || 0) + (item.quantity || 0),
            });
          }
        } catch (_e) { /* ignora erro de produto */ }
      }
    }

    // Atualizar venda
    const saleHistory = sale.cancellation_history || [];
    await base44.entities.Sale.update(sale.id, {
      cancellation_status: 'Aguardando Estorno Financeiro',
      cancellation_stock_received_date: today,
      cancellation_stock_received_by: userName,
      cancellation_reverse_tracking_code: reverseOs.tracking_code || sale.cancellation_reverse_tracking_code || '',
      cancellation_history: [
        ...saleHistory,
        {
          date: now,
          status: 'Aguardando Estorno Financeiro',
          actor: userName,
          notes: `Mercadoria recebida via OS Reversa ${reverseOs.code} e devolvida ao estoque.`,
        },
      ],
    });
  } catch (_e) { /* integração com cancelamento é best-effort */ }
}