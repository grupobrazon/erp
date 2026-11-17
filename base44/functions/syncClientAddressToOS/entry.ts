import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Statuses considerados "finalizados" — a OS já passou da etapa em que o endereço importa.
// Para essas OS, NÃO atualizamos o endereço (preservamos o histórico da entrega realizada).
const FINAL_STATUSES = ['Concluída', 'Entregue', 'Cancelada', 'Em Transporte'];

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { client_id, sales_only } = await req.json();
    if (!client_id) return Response.json({ error: 'client_id é obrigatório' }, { status: 400 });

    const client = await base44.entities.Client.get(client_id);
    if (!client) return Response.json({ error: 'Cliente não encontrado' }, { status: 404 });

    // Monta o endereço padronizado a partir do cadastro do cliente
    const updatedAddress = {
      zip_code: client.zip_code || '',
      street: client.street || '',
      number: client.number || '',
      complement: client.complement || '',
      neighborhood: client.neighborhood || '',
      city: client.city || '',
      state: client.state || '',
    };

    // sales_only = true → sincroniza apenas o endereço de faturamento dos pedidos
    // (usado pela automação disparada quando o cadastro do cliente muda).
    const allOS = sales_only ? [] : await base44.entities.ServiceOrder.filter({ client_id }, '-created_date', 500);

    // Filtra apenas as OS ativas (não finalizadas)
    const activeOS = allOS.filter(os => !FINAL_STATUSES.includes(os.status));

    // Somente pedidos ainda pendentes de faturamento: pedido já faturado (Faturada/Concluída)
    // ou cancelado mantém o endereço que foi usado na nota.
    const SALE_INVOICED_STAGES = ['Faturada', 'Concluída', 'Cancelada'];
    const allSales = await base44.entities.Sale.filter({ client_id }, '-created_date', 500);
    const activeSales = allSales.filter(s =>
      !SALE_INVOICED_STAGES.includes(s.stage) && !s.invoice_number && !s.nota_simples_number
    );

    if (activeOS.length === 0 && activeSales.length === 0) {
      return Response.json({ success: true, message: 'Nenhuma OS ou venda ativa encontrada para atualizar', updated_count: 0 });
    }

    // Atualiza o delivery_address de cada OS ativa
    const osUpdates = sales_only ? [] : await Promise.all(
      activeOS.map(os =>
        base44.entities.ServiceOrder.update(os.id, { delivery_address: updatedAddress })
          .then(() => ({ id: os.id, code: os.code, ok: true }))
          .catch(err => ({ id: os.id, code: os.code, ok: false, error: err.message }))
      )
    );

    // Atualiza billing_address (sempre) e delivery_address (quando entrega = faturamento)
    // das vendas ativas do cliente. A geração de etiquetas do Melhor Envio lê o endereço
    // da VENDA, não da OS — sem sincronizar a venda, o CEP correto no cadastro do cliente
    // nunca chega à etiqueta.
    const saleUpdates = await Promise.all(
      activeSales.map(sale => {
        const patch = { billing_address: updatedAddress } as any;
        if (!sale.delivery_different) {
          patch.delivery_address = updatedAddress;
        }
        return base44.entities.Sale.update(sale.id, patch)
          .then(() => ({ id: sale.id, order: sale.order_number, ok: true }))
          .catch(err => ({ id: sale.id, order: sale.order_number, ok: false, error: err.message }));
      })
    );

    const successCount = osUpdates.filter(u => u.ok).length;
    const failures = osUpdates.filter(u => !u.ok);

    return Response.json({
      success: true,
      updated_count: successCount,
      total_active: activeOS.length,
      updated_os: osUpdates.map(u => ({ code: u.code, ok: u.ok, error: u.error || null })),
      updated_sales: saleUpdates.map(u => ({ order: u.order, ok: u.ok, error: u.error || null })),
      failures: failures.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}