import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import {
  sanitizeCep, isValidCep, sanitizeDoc, validateClientDocument, meErrorDetail,
  resolveSelectedQuote, resolveMeBaseUrl, meHeaders,
} from '../../shared/melhorEnvioCart.ts';

// Gera etiqueta reversa (coleta/devolução) no Melhor Envio para uma OS que já teve envio forward.
// O produto chegou errado ao cliente e precisa retornar para a empresa.
//
// Usa o endpoint dedicado de logística reversa: POST /api/v2/me/cart/reverse
// A logística reversa do Melhor Envio SÓ funciona com Correios (PAC=1 ou SEDEX=2),
// independente da transportadora original da entrega.
//
// Aceita selected_volume_indexes: array de índices (1-based) dos volumes da OS pai
// (melhor_envio_labels) que devem ser devolvidos. Se vazio, devolve todos os volumes.
//
// Quando o envio original foi feito via Melhor Envio (tem shipment_id no label),
// usa o fluxo simplificado com order_id. Caso contrário, usa o fluxo completo com from/to.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = Deno.env.get('MELHOR_ENVIO_TOKEN');
    const userAgent = Deno.env.get('MELHOR_ENVIO_USER_AGENT') || 'ERP Brazon (contato@brazon.com.br)';
    if (!token) return Response.json({ error: 'Token do Melhor Envio não configurado (MELHOR_ENVIO_TOKEN).' }, { status: 500 });

    const { os_id, reason, environment, selected_volume_indexes, reverse_service } = await req.json();
    if (!os_id) return Response.json({ error: 'os_id é obrigatório' }, { status: 400 });

    // Service da coleta reversa: só Correios PAC (1) ou SEDEX (2). Default: SEDEX (2)
    const service = Number(reverse_service) === 1 ? 1 : 2;

    const os = await base44.entities.ServiceOrder.get(os_id);
    if (!os) return Response.json({ error: 'OS não encontrada' }, { status: 404 });
    if (!os.sale_id) return Response.json({ error: 'OS não possui venda vinculada' }, { status: 400 });

    const sale = await base44.entities.Sale.get(os.sale_id);
    if (!sale) return Response.json({ error: 'Venda não encontrada' }, { status: 404 });

    // OS pai (original) — onde estão as etiquetas do Melhor Envio (shipment_id por volume)
    let parentOs: any = null;
    if (os.reverse_parent_os_id) {
      parentOs = await base44.entities.ServiceOrder.get(os.reverse_parent_os_id);
    }
    const meLabels = Array.isArray(parentOs?.melhor_envio_labels) ? parentOs.melhor_envio_labels : [];

    // Filtra os volumes selecionados (ou todos se nenhum índice foi passado)
    const selectedIndexSet = new Set(
      Array.isArray(selected_volume_indexes) ? selected_volume_indexes.map(Number) : []
    );
    const volumesToReturn = meLabels.filter(l => {
      if (selectedIndexSet.size === 0) return true; // sem seleção = todos
      return selectedIndexSet.has(Number(l.volume_index));
    });

    if (volumesToReturn.length === 0) {
      return Response.json({
        error: 'Nenhum volume selecionado para devolução. Selecione pelo menos um item.',
      }, { status: 400 });
    }

    // Local de faturamento (destino da coleta reversa — a empresa recebe o produto de volta)
    let origin = null;
    if (sale.billing_location_id) {
      origin = await base44.entities.BillingLocation.get(sale.billing_location_id);
    }

    // Cliente (remetente da coleta reversa — o cliente envia o produto de volta)
    let client = null;
    if (sale.client_id) {
      client = await base44.entities.Client.get(sale.client_id);
    }

    const destAddr = sale.delivery_address || sale.billing_address || {};
    const { useSandbox, baseUrl } = resolveMeBaseUrl(environment);
    const headers = meHeaders(token, userAgent);

    // Validação do documento do cliente (necessário para o fluxo completo sem order_id)
    const docCheck = validateClientDocument(client, sale);
    const clientDoc = docCheck.ok ? docCheck.doc! : '';

    const cartItems = [];

    // Validações obrigatórias para o fluxo completo (from/to)
    if (!origin) {
      return Response.json({
        error: 'Local de faturamento (destino da devolução) não encontrado na venda.',
      }, { status: 400 });
    }
    if (!docCheck.ok) {
      return Response.json({ error: docCheck.error }, { status: 400 });
    }

    // Validação de CEPs antes de enviar ao Melhor Envio
    if (!isValidCep(destAddr.zip_code || client?.zip_code)) {
      return Response.json({ error: `CEP de origem (cliente) inválido: "${destAddr.zip_code || client?.zip_code || ''}". Verifique o endereço de entrega.` }, { status: 400 });
    }
    if (!isValidCep(origin.zip_code)) {
      return Response.json({ error: `CEP de destino (empresa) inválido: "${origin.zip_code || ''}". Verifique o cadastro do local de faturamento.` }, { status: 400 });
    }

    for (const vol of volumesToReturn) {
      const volInsurance = Math.min(Math.max(Number(vol.insurance_value) || 0, 1), 1000);

      // Fluxo completo com from/to — sempre usado para máxima compatibilidade.
      // O fluxo simplificado (order_id) só funciona quando o envio original foi
      // via Correios no Melhor Envio; envios via Jadlog/outras transportadoras
      // são rejeitados. O fluxo completo funciona para qualquer origem.
      const reversePayload = {
        service,
        new_sender_mail: client?.email || 'cliente@brazon.com.br',
        new_sender_phone: sanitizeDoc(client?.phone1) || '0000000000',
        insurance_value: volInsurance,
        from: {
          name: client?.name || sale.client_name || 'Cliente',
          ...(clientDoc.length === 14
            ? {
                company_document: clientDoc,
                state_register: client?.ie_exempt ? 'ISENTO' : (sanitizeDoc(client?.state_registration) || 'ISENTO'),
              }
            : { document: clientDoc }),
          address: destAddr.street || 'Rua',
          number: destAddr.number || 'S/N',
          district: destAddr.neighborhood || 'Centro',
          city: destAddr.city || 'São Paulo',
          state_abbr: destAddr.state || 'SP',
          postal_code: sanitizeCep(destAddr.zip_code || client?.zip_code),
        },
        to: {
          name: origin.name || 'Brazon',
          company_document: sanitizeDoc(origin.cnpj),
          state_register: origin.state_registration || 'ISENTO',
          address: origin.street || 'Rua',
          number: origin.number || 'S/N',
          district: origin.neighborhood || 'Centro',
          city: origin.city || 'São Paulo',
          state_abbr: origin.state || 'SP',
          postal_code: sanitizeCep(origin.zip_code),
          phone: sanitizeDoc(origin.phone) || '0000000000',
        },
        products: [{
          name: vol.product_name || `Volume ${vol.volume_index}`,
          quantity: vol.quantity || 1,
          unitary_value: volInsurance,
        }],
        package: {
          weight: Number(vol.weight) || 0.3,
          width: Number(vol.width) || 10,
          height: Number(vol.height) || 10,
          length: Number(vol.length) || 10,
        },
        options: {
          own_hand: false,
          receipt: false,
        },
      };

      const cartRes = await fetch(`${baseUrl}/api/v2/me/cart/reverse`, {
        method: 'POST', headers, body: JSON.stringify(reversePayload),
      });
      const cartText = await cartRes.text();
      let cartData;
      try { cartData = JSON.parse(cartText); } catch { cartData = { raw: cartText }; }

      if (!cartRes.ok) {
        const detail = meErrorDetail(cartData);
        return Response.json({
          error: `Erro ao adicionar volume ${vol.volume_index} na coleta reversa${detail ? ': ' + detail : ''}. A logística reversa do Melhor Envio só funciona com Correios (PAC ou SEDEX).`,
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
        error: `Erro no checkout da coleta reversa (verifique saldo/créditos)${detail ? ': ' + detail : ''}`,
        details: checkoutData,
      }, { status: 502 });
    }

    const checkoutOrders = checkoutData.orders || [];
    const trackingByCart = {};
    checkoutOrders.forEach(o => { if (o.id) trackingByCart[o.id] = o.tracking_code || ''; });

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
        error: `Erro ao gerar etiquetas reversas no Melhor Envio${detail ? ': ' + detail : ''}`,
        details: generateData,
      }, { status: 502 });
    }

    // Logística reversa dos Correios NÃO gera etiqueta PDF — gera um "código de devolução"
    // que o cliente apresenta no balcão dos Correios. Buscamos o código via GET /api/v2/me/orders/{id}
    // (o campo "tracking" contém o código de devolução dos Correios).
    // O código de devolução pode demorar alguns segundos para ficar disponível após o
    // generate. Tentamos até 4 vezes com espera de 1,5s entre cada tentativa.
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    for (const ci of cartItems) {
      if (trackingByCart[ci.cartId]) continue; // já tem rastreio do checkout
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const showRes = await fetch(`${baseUrl}/api/v2/me/orders/${ci.cartId}`, { headers });
          if (showRes.ok) {
            const showData = await showRes.json();
            const code = showData?.tracking || showData?.self_tracking;
            if (code) { trackingByCart[ci.cartId] = code; break; }
          }
        } catch {}
        await sleep(1500);
      }
    }

    // Imprimir etiquetas — o endpoint regular de impressão NÃO suporta logística reversa
    // ("Não é possível imprimir logística reversa"). A etiqueta reversa fica disponível
    // no painel do Melhor Envio após a geração. Tentamos o print, mas se falhar, retornamos
    // o link do painel do ME onde a etiqueta pode ser visualizada/impressa.
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
      // Se o print falhar (logística reversa não é suportada no print regular),
      // não é um erro fatal — a etiqueta foi gerada e está no painel do ME.
    } catch {
      // Print falhou — não é fatal; a etiqueta está disponível no painel do ME.
    }

    // Link do painel do Melhor Envio onde a etiqueta reversa pode ser visualizada/impressa
    if (!labelUrl) {
      labelUrl = useSandbox
        ? 'https://sandbox.melhorenvio.com.br/painel/envios'
        : 'https://melhorenvio.com.br/painel/envios';
    }
    const carrier = 'Correios';
    const serviceName = service === 1 ? 'PAC' : 'SEDEX';
    const now = new Date().toISOString();

    const reverseShipments = cartItems.map(ci => ({
      tracking_code: trackingByCart[ci.cartId] || '',
      carrier,
      label_url: labelUrl,
      shipment_id: String(ci.cartId || ''),
      reason: reason || '',
      generated_by: user.full_name || user.email || 'Usuário',
      generated_at: now,
      status: 'generated',
      volume_index: ci.volume.volume_index,
      volume_label_tag: ci.volume.label_tag || `Vol. ${ci.volume.volume_index}`,
      service_name: serviceName,
    }));

    // Adiciona ao histórico de envios reversos da OS
    const existingReverse = Array.isArray(os.reverse_shipments) ? os.reverse_shipments : [];
    await base44.entities.ServiceOrder.update(os_id, {
      reverse_shipments: [...existingReverse, ...reverseShipments],
    });

    return Response.json({
      success: true,
      label_url: labelUrl,
      reverse_shipments: reverseShipments,
      volumes_count: reverseShipments.length,
      service_name: serviceName,
      environment: useSandbox ? 'sandbox' : 'production',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});