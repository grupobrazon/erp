// Gerado de base44/functions/getCommercialDashboard/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { buildCommercialDashboard } from "../../base44/shared/commercialDashboard.ts";

// Dash Comercial — totais do mês (contagem, faturamento, ranking por vendedor e perda de oportunidade).
// As regras de contagem ficam em shared/commercialDashboard.ts para serem as mesmas usadas nas
// listas detalhadas de pedidos (getCommercialDashboardSales).
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dash = await buildCommercialDashboard(base44, body && body.month);

    return Response.json({
      month: dash.month,
      counted: dash.counted,
      direct: dash.direct,
      resale: dash.resale,
      pending: dash.pending,
      sellers: dash.sellers,
      resale_sellers: dash.resale_sellers,
      losses: dash.losses,
      quotes: dash.quotes,
      bonus: dash.bonus,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}