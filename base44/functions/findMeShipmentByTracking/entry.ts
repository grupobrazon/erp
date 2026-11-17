import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { resolveMeBaseUrl, meHeaders, meErrorDetail } from '../../shared/melhorEnvioCart.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = Deno.env.get('MELHOR_ENVIO_TOKEN');
    const userAgent = Deno.env.get('MELHOR_ENVIO_USER_AGENT') || 'ERP Brazon (contato@brazon.com.br)';
    if (!token) return Response.json({ error: 'Token do Melhor Envio não configurado' }, { status: 500 });

    const { tracking_code, os_id, environment, nfe_key } = await req.json();
    if (!tracking_code && !nfe_key) return Response.json({ error: 'tracking_code ou nfe_key é obrigatório' }, { status: 400 });

    const { baseUrl } = resolveMeBaseUrl(environment || 'production');
    const headers = meHeaders(token, userAgent);

    // Busca o envio no Melhor Envio — lista envios recentes e filtra pelo tracking_code ou chave da NF-e.
    // O endpoint /api/v2/me/shipment/search retorna envios paginados.
    // A chave da NF-e no ME vem sem o prefixo "NFe" (44 dígitos numéricos).
    const nfeKeyClean = nfe_key ? String(nfe_key).replace(/^NFe/i, '') : '';
    let shipment: any = null;
    const debugResults = [];

    // Tenta buscar por tracking code primeiro (endpoint de orders/search)
    if (tracking_code) {
      const trackSearchRes = await fetch(`${baseUrl}/api/v2/me/orders/search?q=${encodeURIComponent(tracking_code)}`, { headers });
      if (trackSearchRes.ok) {
        const trackData = await trackSearchRes.json();
        const orders = Array.isArray(trackData) ? trackData : (trackData.data || []);
        // O orders/search retorna objetos com { id, tracking_code, ... } — encontra o match
        shipment = (orders || []).find((o: any) => o.tracking_code === tracking_code) || (orders || [])[0] || null;
      }
    }

    // Se não encontrou por tracking code, busca no carrinho e nos envios recentes do ME
    // A chave da NF-e pode estar vinculada a um item do carrinho (pending) ou a um envio já pago
    if (!shipment) {
      // 1. Lista o carrinho do ME — itens pending podem ter a NF-e vinculada
      const cartRes = await fetch(`${baseUrl}/api/v2/me/cart`, { headers });
      if (cartRes.ok) {
        const cartText = await cartRes.text();
        debugResults.push({ endpoint: 'cart', status: cartRes.status, bodyPreview: cartText.slice(0, 500) });
        let cartData;
        try { cartData = JSON.parse(cartText); } catch { cartData = null; }
        if (cartData) {
          const cartItems = cartData.data || cartData || [];
          for (const item of cartItems) {
            const invKey = item.options?.invoice?.key || '';
            if (nfeKeyClean && (invKey === nfeKeyClean || String(invKey).replace(/^NFe/i, '') === nfeKeyClean)) {
              shipment = item;
              break;
            }
          }
        }
      }

      // 2. Lista envios recentes (com diferentes status) e filtra pela chave da NF-e
      if (!shipment && nfeKeyClean) {
        for (const status of ['generated', 'released', 'posted', 'pending', 'paid']) {
          if (shipment) break;
          const listRes = await fetch(`${baseUrl}/api/v2/me/shipment?status=${status}`, { headers });
          const listText = await listRes.text();
          debugResults.push({ endpoint: `shipment?status=${status}`, status: listRes.status, bodyPreview: listText.slice(0, 200) });
          if (!listRes.ok) continue;
          let listData;
          try { listData = JSON.parse(listText); } catch { continue; }
          const items = listData.data || listData || [];
          for (const s of items) {
            const invKey = s.options?.invoice?.key || '';
            if (invKey === nfeKeyClean || String(invKey).replace(/^NFe/i, '') === nfeKeyClean) {
              shipment = s;
              break;
            }
          }
        }
      }
    }

    if (!shipment) {
      return Response.json({ error: 'Envio não encontrado no Melhor Envio', tracking_code, nfe_key: nfeKeyClean, debug: debugResults }, { status: 404 });
    }

    // Se os_id foi fornecido, atualiza a OS com os dados da etiqueta encontrada
    let updated = false;
    if (os_id) {
      const os = await base44.entities.ServiceOrder.get(os_id);
      if (!os) return Response.json({ error: 'OS não encontrada' }, { status: 404 });

      // Busca o PDF da etiqueta (print) para este shipment
      let labelUrl = '';
      try {
        const printRes = await fetch(`${baseUrl}/api/v2/me/shipment/print`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ orders: [shipment.id], mode: 'public' }),
        });
        if (printRes.ok) {
          const printData = await printRes.json();
          labelUrl = printData.url || '';
        }
      } catch {}

      // Busca a venda/remessa para montar o label_tag e product_name
      let sale: any = null;
      let remessa: any = null;
      if (os.sale_id) {
        sale = await base44.entities.Sale.get(os.sale_id);
      } else if (os.remessa_id) {
        remessa = await base44.entities.Remessa.get(os.remessa_id);
      }

      const volumes = sale?.shipping_volumes || remessa?.items || [];
      const labels = (volumes.length > 0 ? volumes : [{ index: 1, product_name: 'Volume', quantity: 1 }]).map((vol: any, i: number) => ({
        volume_index: vol.index || i + 1,
        product_id: vol.product_id || '',
        product_name: vol.product_name || `Volume ${i + 1}`,
        quantity: vol.quantity || 1,
        label_tag: vol.label_tag || `Vol. ${i + 1}`,
        shipment_id: String(shipment.id),
        tracking_code: shipment.tracking_code || tracking_code,
        carrier: shipment.company?.name || os.carrier || '',
        label_url: labelUrl,
        generated_at: new Date().toISOString(),
      }));

      await base44.entities.ServiceOrder.update(os_id, {
        expedition_label_url: labelUrl,
        tracking_code: shipment.tracking_code || tracking_code,
        carrier: shipment.company?.name || os.carrier || '',
        melhor_envio_shipment_id: String(shipment.id),
        melhor_envio_labels: labels,
        melhor_envio_status: shipment.status || 'generated',
        melhor_envio_status_date: new Date().toISOString(),
        status: 'Etiqueta Gerada',
      });
      updated = true;
    }

    return Response.json({
      success: true,
      shipment: {
        id: shipment.id,
        tracking_code: shipment.tracking_code,
        status: shipment.status,
        carrier: shipment.company?.name || '',
        label_url: shipment.label_url || '',
      },
      updated,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});