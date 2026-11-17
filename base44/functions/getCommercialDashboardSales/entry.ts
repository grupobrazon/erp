import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { buildCommercialDashboard } from "../../shared/commercialDashboard.ts";

const SCOPES = ["counted", "resale", "pending", "loss", "quote"];

// Lista detalhada de pedidos do mês para o gestor trabalhar o follow-up:
//  · scope "counted" → pedidos que estão contabilizando no faturamento (pode filtrar por vendedor)
//  · scope "pending" → pedidos do mês ainda não contabilizados (em andamento)
//  · scope "loss"    → perdas de oportunidade (técnico não concluiu o atendimento)
//  · scope "quote"   → orçamentos em aberto (etapa Orçamento), carteira de prospecção
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const scope = SCOPES.includes(body && body.scope) ? body.scope : "pending";
    const sellerId = body && body.seller_id ? String(body.seller_id) : "";

    const dash = await buildCommercialDashboard(base44, body && body.month);
    // "counted" = venda direta | "resale" = pedidos marcados como revenda
    let items: any[] = scope === "quote"
      ? dash.quotes.items
      : scope === "counted"
        ? dash.rows.filter((r: any) => r.kind === "counted" && !r.is_resale)
        : scope === "resale"
          ? dash.rows.filter((r: any) => r.kind === "counted" && r.is_resale)
          : dash.rows.filter((r: any) => r.kind === scope);
    if (sellerId) items = items.filter((r: any) => r.seller_id === sellerId);

    return Response.json({
      month: dash.month,
      scope,
      seller_id: sellerId,
      count: items.length,
      total: items.reduce((sum: number, r: any) => sum + (r.value || 0), 0),
      items,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}