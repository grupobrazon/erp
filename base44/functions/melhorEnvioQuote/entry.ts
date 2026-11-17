import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { sanitizeCep, isValidCep } from '../../shared/melhorEnvioCart.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = Deno.env.get('MELHOR_ENVIO_TOKEN');
    const userAgent = Deno.env.get('MELHOR_ENVIO_USER_AGENT') || 'ERP Brazon (contato@brazon.com.br)';
    if (!token) {
      return Response.json({ error: 'Token do Melhor Envio não configurado (MELHOR_ENVIO_TOKEN).' }, { status: 500 });
    }

    const body = await req.json();
    const { from_postal_code, to_postal_code, products, options, environment } = body || {};

    if (!from_postal_code || !to_postal_code) {
      return Response.json({ error: 'CEP de origem e destino são obrigatórios.' }, { status: 400 });
    }
    if (!isValidCep(from_postal_code)) {
      return Response.json({ error: `CEP de origem inválido: "${from_postal_code}".` }, { status: 400 });
    }
    if (!isValidCep(to_postal_code)) {
      return Response.json({ error: `CEP de destino inválido: "${to_postal_code}".` }, { status: 400 });
    }
    if (!Array.isArray(products) || products.length === 0) {
      return Response.json({ error: 'Informe ao menos um produto para a cotação.' }, { status: 400 });
    }

    const useSandbox = (environment || 'sandbox') !== 'production';
    const baseUrl = useSandbox
      ? 'https://sandbox.melhorenvio.com.br'
      : 'https://melhorenvio.com.br';

    const payload = {
      from: { postal_code: sanitizeCep(from_postal_code) },
      to: { postal_code: sanitizeCep(to_postal_code) },
      products: products.map((p, i) => ({
        id: p.id || String(i),
        width: Number(p.width) || 10,
        height: Number(p.height) || 10,
        length: Number(p.length) || 10,
        weight: Number(p.weight) || 0.3,
        insurance_value: Number(p.insurance_value) || 0,
        quantity: Number(p.quantity) || 1,
      })),
      options: { receipt: false, own_hand: false, ...(options || {}) },
    };

    console.log('[melhorEnvioQuote] URL:', `${baseUrl}/api/v2/me/shipment/calculate`);
    console.log('[melhorEnvioQuote] Ambiente:', useSandbox ? 'sandbox' : 'production');
    console.log('[melhorEnvioQuote] Payload:', JSON.stringify({
      from: payload.from,
      to: payload.to,
      products: payload.products,
      options: payload.options,
    }));
    console.log('[melhorEnvioQuote] Headers:', { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer ***', 'User-Agent': userAgent });

    const apiRes = await fetch(`${baseUrl}/api/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': userAgent,
      },
      body: JSON.stringify(payload),
    });

    const text = await apiRes.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    console.log('[melhorEnvioQuote] ME status:', apiRes.status);
    console.log('[melhorEnvioQuote] ME resposta:', text.slice(0, 1000));

    if (!apiRes.ok) {
      // Extrai a mensagem real do Melhor Envio para exibir ao usuário (em vez de "Request failed with status code 502")
      let meMessage = '';
      if (data?.errors && typeof data.errors === 'object') {
        meMessage = Object.entries(data.errors)
          .map(([campo, msgs]) => `${campo}: ${Array.isArray(msgs) ? msgs.join('; ') : msgs}`)
          .join(' | ');
      } else if (data?.message) {
        meMessage = String(data.message);
      } else if (data?.raw) {
        meMessage = String(data.raw).slice(0, 300);
      }
      const statusLabel = apiRes.status === 422 ? 'Dados inválidos' : `HTTP ${apiRes.status}`;
      const userMessage = meMessage
        ? `Melhor Envio (${statusLabel}): ${meMessage}`
        : `Erro ao cotar frete no Melhor Envio (${statusLabel}).`;
      return Response.json({
        error: userMessage,
        me_status: apiRes.status,
        details: data,
      }, { status: apiRes.status === 502 ? 502 : 422 });
    }

    // Normaliza resposta: lista de cotações por transportadora/serviço
    const quotes = Array.isArray(data) ? data : (data.data || []);
    const normalized = quotes.map((q) => ({
      service_id: q.id,
      service_name: q.name,
      company_id: q.company?.id,
      company_name: q.company?.name,
      company_picture: q.company?.picture,
      price: q.price,
      custom_price: q.custom_price ?? q.price,
      delivery_time: q.delivery_time,
      custom_delivery_time: q.custom_delivery_time ?? q.delivery_time,
      delivery_range: q.delivery_range || null,
      currency: q.currency || 'R$',
      packages: q.packages || null,
      error: q.error || null,
    }));

    return Response.json({
      quotes: normalized,
      environment: useSandbox ? 'sandbox' : 'production',
      requested_payload: { from: payload.from, to: payload.to, items: payload.products.length },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});