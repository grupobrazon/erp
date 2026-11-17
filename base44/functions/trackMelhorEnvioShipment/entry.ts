import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Consulta o rastreio de um envio pelo código de rastreio.
// Usa o endpoint "Pesquisar etiqueta" do Melhor Envio (GET /api/v2/me/orders/search?q=...),
// que retorna o status do ciclo de vida do pedido (created_at, posted_at, delivered_at).
// Converte esses marcos em eventos para exibição na timeline da UI.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = Deno.env.get('MELHOR_ENVIO_TOKEN');
    const userAgent = Deno.env.get('MELHOR_ENVIO_USER_AGENT') || 'ERP Brazon (contato@brazon.com.br)';
    if (!token) return Response.json({ error: 'Token do Melhor Envio não configurado.' }, { status: 500 });

    const { tracking_code, environment } = await req.json();
    if (!tracking_code) return Response.json({ error: 'tracking_code é obrigatório' }, { status: 400 });

    const useSandbox = (environment || 'production') !== 'production';
    const baseUrl = useSandbox ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';

    const apiRes = await fetch(`${baseUrl}/api/v2/me/orders/search?q=${encodeURIComponent(tracking_code)}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': userAgent,
      },
    });

    const text = await apiRes.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!apiRes.ok) {
      return Response.json({ error: 'Erro ao rastrear envio', details: data }, { status: 502 });
    }

    // A resposta é um array de orders que correspondem ao tracking_code.
    // Pegamos o primeiro match (ou o que tem delivered_at) e convertemos os marcos
    // do ciclo de vida em eventos para a timeline.
    const orders = Array.isArray(data) ? data : (data.data || []);
    const match = (orders || []).find((o: any) => o.delivered_at) || (orders || [])[0];

    if (!match) {
      return Response.json({ events: [], tracking_code });
    }

    const events: any[] = [];
    if (match.created_at) {
      events.push({
        date: match.created_at,
        status: 'created',
        description: 'Etiqueta gerada no Melhor Envio',
      });
    }
    if (match.posted_at) {
      events.push({
        date: match.posted_at,
        status: 'posted',
        description: 'Objeto postado',
      });
    }
    if (match.delivered_at) {
      events.push({
        date: match.delivered_at,
        status: 'delivered',
        description: 'Objeto entregue ao destinatário',
      });
    }

    // Status bruto do ME como evento final (caso não tenha marcos de data)
    if (events.length === 0 && match.status) {
      events.push({
        date: match.updated_at || match.created_at || new Date().toISOString(),
        status: match.status,
        description: `Status no Melhor Envio: ${match.status}`,
      });
    }

    // Ordena por data crescente
    events.sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

    return Response.json({
      events,
      tracking_code,
      me_status: match.delivered_at ? 'delivered' : (match.posted_at ? 'posted' : match.status),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});