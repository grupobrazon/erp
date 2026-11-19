// Gerado de base44/functions/generateWarrantyReturnLabel/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import {
  sanitizeCep, isValidCep, sanitizeDoc, validateClientDocument, meErrorDetail,
  resolveMeBaseUrl, meHeaders,
} from '../shared/melhorEnvioCart.ts';

// Gera a etiqueta de envio do retorno de garantia via Melhor Envio.
// A remessa já deve ter sido criada e a NF-e autorizada (ou pelo menos transmitida).
// Envia o produto da empresa (billing_location) para o cliente (delivery_address).
export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = Deno.env.get('MELHOR_ENVIO_TOKEN');
    const userAgent = Deno.env.get('MELHOR_ENVIO_USER_AGENT') || 'ERP Brazon (contato@brazon.com.br)';
    if (!token) return Response.json({ error: 'Token do Melhor Envio não configurado' }, { status: 500 });

    const { os_id, environment, service_id } = await req.json();
    if (!os_id) return Response.json({ error: 'os_id é obrigatório' }, { status: 400 });

    const os = await base44.entities.ServiceOrder.get(os_id);
    if (!os) return Response.json({ error: 'OS não encontrada' }, { status: 404 });

    if (!os.warranty_remessa_id) {
      return Response.json({ error: 'Nenhuma remessa vinculada. Fature a remessa primeiro.' }, { status: 400 });
    }

    const remessa = await base44.entities.Remessa.get(os.warranty_remessa_id);
    if (!remessa) return Response.json({ error: 'Remessa não encontrada' }, { status: 404 });

    // Verifica se a NF-e foi autorizada (ou pelo menos transmitida)
    const nfeAuthorized = remessa.nfe_status === 'autorizado' || !!remessa.nfe_chave;
    if (!nfeAuthorized) {
      return Response.json({
        error: `NF-e da remessa ${remessa.code} ainda não autorizada (status: ${remessa.nfe_status || 'não transmitida'}). Aguarde a autorização ou consulte o status na remessa.`,
      }, { status: 400 });
    }

    // Cliente e endereço de entrega
    const client = await base44.entities.Client.get(remessa.client_id);
    if (!client) return Response.json({ error: 'Cliente não encontrado' }, { status: 404 });

    const destAddr = remessa.delivery_address || {};
    if (!destAddr.city || !destAddr.state) {
      return Response.json({ error: 'Endereço de entrega da remessa incompleto' }, { status: 400 });
    }

    // Billing location (origem — a empresa)
    let billingLoc = null;
    if (remessa.billing_location_id) {
      billingLoc = await base44.entities.BillingLocation.get(remessa.billing_location_id);
    }
    if (!billingLoc) return Response.json({ error: 'Local de faturamento não encontrado' }, { status: 400 });

    // Validação de CEPs antes de enviar ao Melhor Envio
    if (!isValidCep(billingLoc.zip_code)) {
      return Response.json({ error: `CEP de origem inválido no local de faturamento: "${billingLoc.zip_code || ''}".` }, { status: 400 });
    }
    if (!isValidCep(destAddr.zip_code)) {
      return Response.json({ error: `CEP de destino inválido: "${destAddr.zip_code || ''}". Verifique o endereço de entrega da remessa.` }, { status: 400 });
    }

    // Validação do documento do cliente
    const docCheck = validateClientDocument(client, { client_name: remessa.client_name } as any);
    if (!docCheck.ok) {
      return Response.json({ error: docCheck.error }, { status: 400 });
    }
    const clientDoc = docCheck.doc!;

    const { useSandbox, baseUrl } = resolveMeBaseUrl(environment);
    const headers = meHeaders(token, userAgent);

    // Constrói volumes a partir dos itens da remessa
    const remessaItems = Array.isArray(remessa.items) ? remessa.items : [];
    if (remessaItems.length === 0) {
      return Response.json({ error: 'Remessa sem itens' }, { status: 400 });
    }

    // Busca dimensões dos produtos
    const productIds = [...new Set(remessaItems.map(it => it.product_id).filter(Boolean))];
    const products: any[] = [];
    for (const pid of productIds) {
      try {
        const p = await base44.entities.Product.get(pid);
        if (p) products.push(p);
      } catch {}
    }
    const productMap = new Map(products.map(p => [p.id, p]));

    // Cria um volume por item da remessa
    const volumes = remessaItems.map((item, i) => {
      const product = productMap.get(item.product_id) || {};
      const qty = item.quantity || 1;
      return {
        index: i + 1,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: qty,
        weight: Number(product.weight) || 0.3,
        width: Number(product.width) || 15,
        height: Number(product.height) || 10,
        length: Number(product.length) || 15,
        insurance_value: Math.max(Number(item.unit_price) || 1, 1),
      };
    });

    // Determina o serviço (default: 2 = SEDEX)
    const service = Number(service_id) || 2;

    // Adiciona volumes ao carrinho do Melhor Envio
    const cartItems = [];
    for (const vol of volumes) {
      const cartPayload = {
        service,
        agency: null,
        from: {
          name: billingLoc.name || 'Brazon',
          company_document: sanitizeDoc(billingLoc.cnpj),
          state_register: billingLoc.state_registration || 'ISENTO',
          address: billingLoc.street || 'Rua',
          number: billingLoc.number || 'S/N',
          district: billingLoc.neighborhood || 'Centro',
          city: billingLoc.city || 'São Paulo',
          state_abbr: billingLoc.state || 'SP',
          postal_code: sanitizeCep(billingLoc.zip_code),
          phone: sanitizeDoc(billingLoc.phone) || '0000000000',
        },
        to: {
          name: client.name || remessa.client_name || 'Cliente',
          ...(clientDoc.length === 14
            ? {
                company_document: clientDoc,
                state_register: client.ie_exempt ? 'ISENTO' : (sanitizeDoc(client.state_registration) || 'ISENTO'),
              }
            : { document: clientDoc }),
          email: client.email || 'cliente@brazon.com.br',
          phone: sanitizeDoc(client.phone1) || '0000000000',
          address: destAddr.street || 'Rua',
          number: destAddr.number || 'S/N',
          district: destAddr.neighborhood || 'Centro',
          city: destAddr.city || 'São Paulo',
          state_abbr: destAddr.state || 'SP',
          postal_code: sanitizeCep(destAddr.zip_code),
        },
        products: [{
          name: vol.product_name || `Volume ${vol.index}`,
          quantity: vol.quantity,
          unitary_value: vol.insurance_value,
        }],
        package: {
          weight: vol.weight,
          width: vol.width,
          height: vol.height,
          length: vol.length,
        },
        options: {
          insurance_value: vol.insurance_value,
          receipt: false,
          own_hand: false,
          reverse: false,
          non_commercial: true,
        },
      };

      const cartRes = await fetch(`${baseUrl}/api/v2/me/cart`, {
        method: 'POST', headers, body: JSON.stringify(cartPayload),
      });
      const cartText = await cartRes.text();
      let cartData;
      try { cartData = JSON.parse(cartText); } catch { cartData = { raw: cartText }; }

      if (!cartRes.ok) {
        const detail = meErrorDetail(cartData);
        return Response.json({
          error: `Erro ao adicionar volume ${vol.index} (${vol.product_name}) no carrinho${detail ? ': ' + detail : ''}`,
          details: cartData,
        }, { status: 502 });
      }
      cartItems.push({ volume: vol, cartId: cartData.id });
    }

    const cartIds = cartItems.map(c => c.cartId).filter(Boolean);

    // Checkout
    const checkoutRes = await fetch(`${baseUrl}/api/v2/me/shipment/checkout`, {
      method: 'POST', headers, body: JSON.stringify({ orders: cartIds }),
    });
    const checkoutText = await checkoutRes.text();
    let checkoutData;
    try { checkoutData = JSON.parse(checkoutText); } catch { checkoutData = { raw: checkoutText }; }
    if (!checkoutRes.ok) {
      const detail = meErrorDetail(checkoutData);
      return Response.json({
        error: `Erro no checkout (verifique saldo/créditos)${detail ? ': ' + detail : ''}`,
        details: checkoutData,
      }, { status: 502 });
    }

    const checkoutOrders = checkoutData.orders || [];
    const trackingByCart: Record<string, string> = {};
    checkoutOrders.forEach((o: any) => { if (o.id) trackingByCart[o.id] = o.tracking_code || ''; });

    // Gerar etiquetas
    const generateRes = await fetch(`${baseUrl}/api/v2/me/shipment/generate`, {
      method: 'POST', headers, body: JSON.stringify({ orders: cartIds }),
    });
    const generateText = await generateRes.text();
    let generateData;
    try { generateData = JSON.parse(generateText); } catch { generateData = { raw: generateText }; }
    if (!generateRes.ok) {
      const detail = meErrorDetail(generateData);
      return Response.json({
        error: `Erro ao gerar etiquetas no Melhor Envio${detail ? ': ' + detail : ''}`,
        details: generateData,
      }, { status: 502 });
    }

    // Imprimir etiquetas
    let labelUrl = '';
    try {
      const printRes = await fetch(`${baseUrl}/api/v2/me/shipment/print`, {
        method: 'POST', headers, body: JSON.stringify({ orders: cartIds, mode: 'public' }),
      });
      const printText = await printRes.text();
      let printData;
      try { printData = JSON.parse(printText); } catch { printData = { raw: printText }; }
      if (printRes.ok) {
        labelUrl = printData.url || (typeof printData === 'string' ? printData : '');
      }
    } catch {}

    if (!labelUrl) {
      labelUrl = useSandbox
        ? 'https://sandbox.melhorenvio.com.br/painel/envios'
        : 'https://melhorenvio.com.br/painel/envios';
    }

    const now = new Date().toISOString();
    const firstTracking = Object.values(trackingByCart)[0] as string || '';
    const firstCart = cartItems[0];

    // Atualiza a OS com os dados do retorno
    const updates: any = {
      warranty_flow_status: 'Retornado ao Cliente',
      warranty_return_method: 'Melhor Envio',
      warranty_return_date: now,
      warranty_return_by: user.full_name || user.email || 'Usuário',
      warranty_return_label_url: labelUrl,
      warranty_return_tracking_code: firstTracking,
      warranty_return_shipment_id: String(firstCart?.cartId || ''),
      warranty_return_carrier: 'Correios',
    };

    // Atualiza a remessa com o rastreio
    await base44.entities.Remessa.update(remessa.id, {
      os_id: os.id,
      os_code: os.code,
    });

    await base44.entities.ServiceOrder.update(os_id, updates);

    return Response.json({
      success: true,
      label_url: labelUrl,
      tracking_code: firstTracking,
      volumes_count: cartItems.length,
      carrier: 'Correios',
      service_name: service === 1 ? 'PAC' : 'SEDEX',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});