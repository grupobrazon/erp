// Gerado de base44/functions/generateMelhorEnvioLabel/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { secrets } from "../runtime.ts";
import { syncMeLabelsStatus } from '../shared/melhorEnvio.js';
import { appendStatusHistory } from '../shared/osStatusHistory.ts';
import { sendGhlWhatsAppMessage, buildShippingNotificationMessage } from '../shared/ghlClient.ts';
import {
  sanitizeCep, isValidCep, sanitizeDoc, validateClientDocument, meErrorDetail,
  resolveSelectedQuote, resolveMeBaseUrl, meHeaders,
} from '../shared/melhorEnvioCart.ts';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = Deno.env.get('MELHOR_ENVIO_TOKEN');
    const userAgent = Deno.env.get('MELHOR_ENVIO_USER_AGENT') || 'ERP Brazon (contato@brazon.com.br)';
    if (!token) return Response.json({ error: 'Token do Melhor Envio não configurado (MELHOR_ENVIO_TOKEN).' }, { status: 500 });

    const { os_id, environment, service_id: forcedServiceId } = await req.json();
    if (!os_id) return Response.json({ error: 'os_id é obrigatório' }, { status: 400 });

    const os = await base44.entities.ServiceOrder.get(os_id);
    if (!os) return Response.json({ error: 'OS não encontrada' }, { status: 404 });
    const isRemessaOS = !os.sale_id && !!os.remessa_id;
    if (!os.sale_id && !os.remessa_id) return Response.json({ error: 'OS não possui venda nem remessa vinculada' }, { status: 400 });

    // Antes de gerar uma nova etiqueta, sincroniza o status das etiquetas existentes no Melhor Envio.
    // Se houver etiquetas canceladas no Melhor Envio, elas são arquivadas no histórico (melhor_envio_canceled_labels)
    // e o pedido é liberado para a geração de uma nova etiqueta. Se ainda existirem etiquetas ativas (não canceladas),
    // bloqueia a reemissão para evitar cobrança dupla.
    const useSandboxSync = (environment || 'production') !== 'production';
    const syncResult = await syncMeLabelsStatus(base44, os, token, userAgent, useSandboxSync);
    if (syncResult.remaining && syncResult.remaining.length > 0) {
      const active = syncResult.remaining.map(l => l.label_tag || l.shipment_id).join(', ');
      return Response.json({
        error: `Já existe etiqueta ativa vinculada a este pedido (${active}). Cancele a etiqueta no Melhor Envio e clique em "Verificar status" para desvincular antes de gerar uma nova.`,
      }, { status: 400 });
    }

    // Re-busca a OS após a sincronização (o status pode ter sido alterado pelo sync).
    const osCurrent = await base44.entities.ServiceOrder.get(os_id);

    // Carrega a venda OU a remessa vinculada (a OS pode ser originada de uma ou outra).
    // Para remessas, constrói um objeto "sale-like" com os campos que o restante da função espera.
    let sale: any = null;
    let remessa: any = null;
    if (os.sale_id) {
      sale = await base44.entities.Sale.get(os.sale_id);
      if (!sale) return Response.json({ error: 'Venda não encontrada' }, { status: 404 });
    } else if (os.remessa_id) {
      remessa = await base44.entities.Remessa.get(os.remessa_id);
      if (!remessa) return Response.json({ error: 'Remessa não encontrada' }, { status: 404 });
      sale = {
        items: remessa.items || [],
        delivery_address: remessa.delivery_address || {},
        billing_location_id: remessa.billing_location_id,
        client_id: remessa.client_id,
        client_name: remessa.client_name || '',
        grand_total: remessa.grand_total || 0,
        total: remessa.grand_total || 0,
        delivery_modality: remessa.delivery_modality || 'Envio',
        selected_carrier: '',
        shipping_volumes: [],
        shipping_quote_history: [],
        packing_mode: 'per_item',
      };
    }

    // --- Validação: os volumes salvos devem ser coerentes com os itens atuais do pedido ---
    // Se itens/quantidades foram alterados após a última cotação, os volumes salvos estão
    // desatualizados — bloqueia a geração para não emitir etiqueta incompleta.
    // (Pedidos legado sem shipping_volumes usam o fallback que deriva da composição atual — não validáveis aqui.)
    // Respeita o modo de empacotamento: volumes COMPARTILHADOS (product_id vazio — ex.: volume
    // único do unify_all, onde dois ou mais produtos compartilham o mesmo volume) são válidos e
    // cobrem a quantidade restante dos itens. Bloqueia somente divergência real de composição.
    const validateVolumesAgainstItems = (saleItems: any[], vols: any[], packingMode?: string): { ok: boolean; reason: string } => {
      const items = saleItems || [];
      const volumes = vols || [];
      if (items.length === 0) return { ok: true, reason: '' };
      if (volumes.length === 0) {
        return { ok: false, reason: 'o pedido possui itens de produto, mas não possui volumes de frete salvos' };
      }
      const expected: Record<string, number> = {};
      const names: Record<string, string> = {};
      items.forEach(i => {
        const pid = i.product_id || `sem-id:${i.product_name}`;
        expected[pid] = (expected[pid] || 0) + (Number(i.quantity) || 1);
        names[pid] = i.product_name || 'Item';
      });
      const found: Record<string, number> = {};
      let sharedQty = 0;
      let orphanName: string | null = null;
      for (const v of volumes) {
        const qty = Number(v.quantity) || 1;
        if (!v.product_id) {
          sharedQty += qty;
          continue;
        }
        if (!(v.product_id in expected)) {
          orphanName = v.label_tag || v.product_name || v.product_id;
        }
        found[v.product_id] = (found[v.product_id] || 0) + qty;
      }
      if (orphanName) {
        return { ok: false, reason: `os volumes salvos contêm o volume "${orphanName}" de um produto que não está mais no pedido` };
      }
      let deficit = 0;
      let excessMsg: string | null = null;
      for (const [pid, qty] of Object.entries(expected)) {
        const f = found[pid] || 0;
        if (f < qty) deficit += qty - f;
        else if (f > qty) excessMsg = `o item "${names[pid]}" tem ${qty} un. no pedido, mas ${f} un. nos volumes salvos`;
      }
      if (excessMsg) return { ok: false, reason: excessMsg };
      if (sharedQty !== deficit) {
        const totalItemQty = items.reduce((s, i) => s + (Number(i.quantity) || 1), 0);
        const totalVolQty = volumes.reduce((s, v) => s + (Number(v.quantity) || 1), 0);
        return { ok: false, reason: `a quantidade total dos volumes salvos (${totalVolQty} un.) diverge da composição atual do pedido (${totalItemQty} un.)` };
      }
      return { ok: true, reason: '' };
    };
    if (Array.isArray(sale.shipping_volumes) && sale.shipping_volumes.length > 0) {
      const check = validateVolumesAgainstItems(sale.items, sale.shipping_volumes, sale.packing_mode);
      if (!check.ok) {
        return Response.json({
          error: `Este pedido foi alterado após a última cotação de frete. Os volumes salvos estão desatualizados. Revise os volumes e faça uma nova cotação antes de gerar as etiquetas. Motivo: ${check.reason}.`,
        }, { status: 400 });
      }
    }

    // Busca o local de faturamento (origem)
    let origin = null;
    if (sale.billing_location_id) {
      origin = await base44.entities.BillingLocation.get(sale.billing_location_id);
    }
    if (!origin) return Response.json({ error: 'Local de faturamento (origem) não encontrado na venda. Configure o local de faturamento.' }, { status: 400 });

    // Busca o cliente (destino)
    let client = null;
    if (sale.client_id) {
      client = await base44.entities.Client.get(sale.client_id);
    }

    // Service id a partir do histórico de cotações (helper compartilhado com a coleta reversa).
    // Para remessas (sem cotação prévia), aceita service_id no request ou cota automaticamente.
    const selectedQuote = resolveSelectedQuote(sale);
    let serviceId = forcedServiceId ? String(forcedServiceId) : selectedQuote?.service_id;
    let autoQuotedCarrier = '';
    if (!serviceId && isRemessaOS) {
      // Cota automaticamente no Melhor Envio e usa o serviço mais barato.
      const originCep = sanitizeCep(origin?.zip_code);
      const destCep = sanitizeCep(destAddr.zip_code || client?.zip_code);
      if (!originCep || !destCep) {
        return Response.json({ error: 'CEP de origem ou destino não encontrado para cotar o frete da remessa.' }, { status: 400 });
      }
      // Carrega produtos para obter dimensões/peso
      const productIds = (sale.items || []).map(i => i.product_id).filter(Boolean);
      const products = [];
      for (const pid of productIds) {
        try { const p = await base44.entities.Product.get(pid); if (p) products.push(p); } catch {}
      }
      const quoteProducts = (sale.items || []).map((item, i) => {
        const p = products.find(pr => pr.id === item.product_id);
        return {
          id: item.product_id || String(i),
          width: Number(p?.width) || 10,
          height: Number(p?.depth) || 10,
          length: Number(p?.length) || 10,
          weight: Number(p?.weight) || 0.3,
          insurance_value: Math.max(Number(item.unit_price) || 0, 1),
          quantity: Number(item.quantity) || 1,
        };
      });
      const { baseUrl: quoteBaseUrl } = resolveMeBaseUrl(environment);
      const quoteRes = await fetch(`${quoteBaseUrl}/api/v2/me/shipment/calculate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          from: { postal_code: originCep },
          to: { postal_code: destCep },
          products: quoteProducts,
          options: { receipt: false, own_hand: false },
        }),
      });
      const quoteText = await quoteRes.text();
      let quoteData;
      try { quoteData = JSON.parse(quoteText); } catch { quoteData = []; }
      const quotes = Array.isArray(quoteData) ? quoteData : (quoteData || []);
      // Filtra serviços válidos (com preço > 0) e pega o mais barato
      const valid = quotes.filter((q: any) => q && q.price > 0 && q.id);
      if (valid.length === 0) {
        return Response.json({ error: 'Não foi possível cotar o frete da remessa no Melhor Envio. Verifique o CEP e tente novamente.' }, { status: 400 });
      }
      valid.sort((a: any, b: any) => (a.price || 0) - (b.price || 0));
      const cheapest = valid[0];
      serviceId = String(cheapest.id);
      autoQuotedCarrier = cheapest.company?.name || cheapest.name || '';
    }
    if (!serviceId) {
      return Response.json({
        error: 'Nenhum serviço de frete selecionado na venda. Selecione um serviço na cotação antes de gerar a etiqueta.',
      }, { status: 400 });
    }

    const destAddr = sale.delivery_address || sale.billing_address || {};

    // --- Validação de CEPs (origem e destino) antes de enviar ao Melhor Envio ---
    const originCepCheck = sanitizeCep(origin?.zip_code);
    const destCepCheck = sanitizeCep(destAddr.zip_code || client?.zip_code);
    if (!isValidCep(originCepCheck)) {
      return Response.json({ error: `CEP de origem inválido no local de faturamento: "${origin?.zip_code || ''}". Verifique o cadastro do local de faturamento.` }, { status: 400 });
    }
    if (!isValidCep(destCepCheck)) {
      return Response.json({ error: `CEP de destino inválido: "${destAddr.zip_code || client?.zip_code || ''}". Verifique o endereço de entrega da venda.` }, { status: 400 });
    }

    // --- Validação do documento do destinatário (CPF ou CNPJ) ---
    const docCheck = validateClientDocument(client, sale);
    if (!docCheck.ok) {
      return Response.json({ error: docCheck.error }, { status: 400 });
    }
    const destDoc = docCheck.doc!;

    const { useSandbox, baseUrl } = resolveMeBaseUrl(environment);
    const FOCUS_BASE = 'https://api.focusnfe.com.br';

    const headers = meHeaders(token, userAgent);

    // --- NF-e vinculada à OS: classifica o envio como COMERCIAL no Melhor Envio ---
    // Sem options.invoice.key + from.state_register, o ME classifica o envio como
    // "não comercial" (declaração de conteúdo) e limita o valor segurado a R$ 1.000,00 (E-CRT-0001).
    // Com a NF-e vinculada, o envio é comercial e o valor segurado pode ser o valor real da mercadoria.
    const nfeTransmitted = !!osCurrent.nfe_transmitted && !!osCurrent.nfe_chave;
    const isAzul = /azul|latam/i.test(sale.selected_carrier || selectedQuote?.company_name || '');

    // Baixa o XML da NF-e no FocusNFe (exigência da Azul Cargo Express para envios comerciais:
    // options.invoice.xml_content). Consulta o caminho do XML se ainda não estiver cacheado na OS.
    const fetchNfeXml = async () => {
      const focusToken = Deno.env.get('FOCUSNFE_TOKEN');
      if (!focusToken || !osCurrent.nfe_ref) return null;
      try {
        const focusAuth = btoa(`${focusToken}:`);
        let xmlUrl = osCurrent.nfe_xml_url || '';
        if (!xmlUrl) {
          const consultRes = await fetch(`${FOCUS_BASE}/v2/nfe/${encodeURIComponent(osCurrent.nfe_ref)}`, {
            headers: { Authorization: `Basic ${focusAuth}`, Accept: 'application/json' },
          });
          if (consultRes.ok) {
            const consultData = await consultRes.json();
            xmlUrl = consultData.caminho_xml_nota_fiscal || '';
          }
        }
        if (!xmlUrl) return null;
        const xmlRes = await fetch(`${FOCUS_BASE}${xmlUrl}`, {
          headers: { Authorization: `Basic ${focusAuth}` },
        });
        if (!xmlRes.ok) return null;
        return await xmlRes.text();
      } catch { return null; }
    };

    let azulXml = null;
    if (nfeTransmitted && isAzul) {
      azulXml = await fetchNfeXml();
    }
    // A chave da NF-e no FocusNFe vem com prefixo "NFe" (47 chars). O Melhor Envio exige
    // apenas os 44 dígitos numéricos da chave de acesso (modelo 55).
    const nfeKey = nfeTransmitted ? String(osCurrent.nfe_chave).replace(/^NFe/i, '') : '';
    const nfeInvoice = nfeTransmitted
      ? { key: nfeKey, ...(azulXml ? { xml_content: azulXml } : {}) }
      : null;

    // Determina os volumes a partir do shipping_volumes da venda
    // (fallback: 1 volume com todos os itens, comportamento legado)
    let volumes = Array.isArray(sale.shipping_volumes) && sale.shipping_volumes.length > 0
      ? sale.shipping_volumes
      : null;

    if (!volumes) {
      // Legacy fallback: single volume with all items
      const productIds = (sale.items || []).map(i => i.product_id).filter(Boolean);
      const products = [];
      for (const pid of productIds) {
        try { const p = await base44.entities.Product.get(pid); if (p) products.push(p); } catch {}
      }
      const pkgWeight = Math.max((sale.items || []).reduce((s, item) => {
        const p = products.find(pr => pr.id === item.product_id);
        return s + (Number(p?.weight) || 0.3) * (item.quantity || 1);
      }, 0), 0.3);
      const pkgWidth = Math.max(...(sale.items || []).map(item => {
        const p = products.find(pr => pr.id === item.product_id);
        return Number(p?.width) || 0;
      }), 10);
      const pkgHeight = Math.max(...(sale.items || []).map(item => {
        const p = products.find(pr => pr.id === item.product_id);
        return Number(p?.depth) || 0;
      }), 10);
      const pkgLength = Math.max((sale.items || []).reduce((s, item) => {
        const p = products.find(pr => pr.id === item.product_id);
        return s + (Number(p?.length) || 0);
      }, 0), 10);
      volumes = [{
        index: 1,
        product_id: null,
        product_name: 'Volume único',
        quantity: 1,
        height: pkgHeight,
        width: pkgWidth,
        length: pkgLength,
        weight: pkgWeight,
        insurance_value: sale.grand_total || sale.total || 0,
        label_tag: os.code || 'OS',
      }];
    }

    // Step 1: Adicionar cada volume ao carrinho (1 cart por volume).
    // Classificação dinâmica POR PEDIDO (lida dos campos da OS/venda a cada geração):
    //  - COMERCIAL (NF-e real transmitida com nfe_chave): invoice.key no primeiro volume +
    //    state_register + non_commercial:false + valor segurado real (sem teto). Demais volumes
    //    ficam comerciais via state_register + non_commercial:false (passam do limite de R$ 1.000).
    //  - NÃO COMERCIAL (Nota Simples / sem NF-e real): non_commercial:true + valor segurado
    //    limitado a R$ 1.000,00 (teto do Melhor Envio para envios não comerciais).
    // A chave da NF-e só pode ser vinculada a UM cart do pedido (o ME rejeita chave duplicada).
    // Limpa o carrinho do Melhor Envio antes de gerar novas etiquetas.
    // Tentativas anteriores que falharam (ex: erro de seguro) deixam itens órfãos no carrinho,
    // que causam "chave de NF-e já em outro item" ao tentar novamente.
    try {
      const listRes = await fetch(`${baseUrl}/api/v2/me/cart`, { headers });
      if (listRes.ok) {
        const listData = await listRes.json();
        const pending = (listData.data || []).filter((item: any) => item.status === 'pending' || !item.paid);
        for (const item of pending) {
          try {
            await fetch(`${baseUrl}/api/v2/me/cart/${item.id}`, { method: 'DELETE', headers });
          } catch {}
        }
      }
    } catch {}

    // --- Resolução de agência para LATAM Cargo / Azul Cargo / Buslog ---
    // O campo `agency` é obrigatório para essas transportadoras em integrações com token
    // gerado no painel do Melhor Envio. Sem a agência, o ME rejeita com
    // "Envios sem solicitação de coleta requerem uma unidade LATAM Cargo válida selecionada".
    const carrierName = sale.selected_carrier || selectedQuote?.company_name || autoQuotedCarrier || '';
    const isLatamAzul = /latam|azul|buslog/i.test(carrierName);
    let resolvedAgency: number | null = null;
    if (isLatamAzul) {
      try {
        const agencyRes = await fetch(
          `${baseUrl}/api/v2/me/shipment/agencies?country=BR&state=${encodeURIComponent(origin?.state || 'SP')}`,
          { headers },
        );
        if (agencyRes.ok) {
          const agencyData = await agencyRes.json();
          const agencyList: any[] = Array.isArray(agencyData) ? agencyData : (agencyData.data || []);
          const match = agencyList.find((a: any) =>
            /latam|azul|buslog/i.test(a.company?.name || a.company_name || a.label || ''),
          );
          resolvedAgency = match ? Number(match.id) : (agencyList.length > 0 ? Number(agencyList[0].id) : null);
        }
      } catch {}
      if (!resolvedAgency) {
        return Response.json({
          error: `Não foi possível encontrar uma agência da ${carrierName} no estado ${origin?.state || ''} no Melhor Envio. Verifique se há agências da transportadora cadastradas para o estado de origem ou selecione outra transportadora.`,
        }, { status: 400 });
      }
      // CNAE obrigatório para LATAM Cargo / Azul Cargo quando o remetente é PJ (CNPJ).
      if (!origin.cnae) {
        return Response.json({
          error: `O CNAE é obrigatório para envios com a ${carrierName} no Melhor Envio. Acesse Cadastros > Locais de Faturamento, edite o local "${origin?.name || ''}" e preencha o campo CNAE (código de 7 dígitos).`,
        }, { status: 400 });
      }
    }

    const cartItems = []; // { volume, cartId }
    let invoiceUsed = false;
    let insuranceCapped = false;
    for (const vol of volumes) {
      const useInvoice = !!nfeInvoice && !invoiceUsed;
      if (useInvoice) invoiceUsed = true;
      // O Melhor Envio exige valor segurado >= R$ 1,00.
      const rawInsurance = Math.max(Number(vol.insurance_value) || 0, 1);
      // COMERCIAL (volume com invoice.key vinculada): valor segurado = valor real (sem teto).
      // NÃO COMERCIAL (sem invoice.key neste volume — ME classifica como declaração de conteúdo,
      // mesmo que nfeTransmitted=true, pois a chave só pode ser vinculada a 1 cart do pedido):
      // o ME limita o valor segurado a R$ 1.500,00 (E-CRT-0001).
      // Arredonda para 2 casas decimais — o ME rejeita valores com precisão excessiva (ex: 248.86363636).
      const volInsurance = Number((useInvoice ? rawInsurance : Math.min(rawInsurance, 1500)).toFixed(2));
      if (!useInvoice && rawInsurance > 1500) insuranceCapped = true;
      const cartPayload = {
        from: {
          name: origin.name || 'Brazon',
          company_document: sanitizeDoc(origin.cnpj),
          postal_code: sanitizeCep(origin.zip_code),
          address: origin.street || 'Rua',
          number: origin.number || 'S/N',
          district: origin.neighborhood || 'Centro',
          city: origin.city || 'São Paulo',
          state: origin.state || 'SP',
          phone: sanitizeDoc(origin.phone) || '0000000000',
          // Inscrição Estadual do emitente — obrigatória para envios COMERCIAIS no Melhor Envio.
          // Sem IE real (ou "ISENTO"), o ME classifica o envio como "não comercial".
          state_register: origin.state_registration || 'ISENTO',
          // CNAE obrigatório para LATAM Cargo / Azul Cargo no Melhor Envio
          ...(isLatamAzul && origin.cnae ? { economic_activity_code: origin.cnae } : {}),
        },
        to: {
          name: client?.name || sale.client_name || 'Cliente',
          ...(destDoc.length === 14
            ? {
                company_document: destDoc,
                state_register: client?.ie_exempt ? 'ISENTO' : (sanitizeDoc(client?.state_registration) || 'ISENTO'),
              }
            : { document: destDoc }),
          postal_code: sanitizeCep(destAddr.zip_code || client?.zip_code),
          address: destAddr.street || 'Rua',
          number: destAddr.number || 'S/N',
          district: destAddr.neighborhood || 'Centro',
          city: destAddr.city || 'São Paulo',
          state: destAddr.state || 'SP',
          phone: sanitizeDoc(client?.phone1) || '0000000000',
        },
        products: [{
          id: vol.product_id || String(vol.index),
          name: vol.product_name || `Volume ${vol.index}`,
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
          // Valor segurado = valor real da mercadoria do volume (deve ser igual ao valor da NF-e).
          // Sem teto artificial: o envio é COMERCIAL (NF-e vinculada via options.invoice.key),
          // portanto o limite de R$ 1.000,00 para envios não comerciais NÃO se aplica.
          insurance_value: volInsurance,
          receipt: false,
          own_hand: false,
          reverse: false,
          // true quando o pedido NÃO possui NF-e real (Nota Simples / não faturado via NF-e).
          non_commercial: !nfeTransmitted,
          ...(useInvoice ? { invoice: { ...nfeInvoice, value: volInsurance } } : {}),
        },
        service: Number(serviceId),
        agency: resolvedAgency,
        tags: [{ tag: vol.label_tag || `Vol. ${vol.index}` }],
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
          error: `Erro ao adicionar volume ${vol.index} ao carrinho Melhor Envio${detail ? ': ' + detail : ''}`,
          details: cartData,
        }, { status: 502 });
      }
      cartItems.push({ volume: vol, cartId: cartData.id });
    }

    const cartIds = cartItems.map(c => c.cartId).filter(Boolean);

    // Step 2: Checkout (pagar todas as etiquetas de uma vez)
    const checkoutRes = await fetch(`${baseUrl}/api/v2/me/shipment/checkout`, {
      method: 'POST', headers, body: JSON.stringify({ orders: cartIds }),
    });
    const checkoutText = await checkoutRes.text();
    let checkoutData;
    try { checkoutData = JSON.parse(checkoutText); } catch { checkoutData = { raw: checkoutText }; }

    if (!checkoutRes.ok) {
      const detail = meErrorDetail(checkoutData);
      return Response.json({
        error: `Erro no checkout Melhor Envio (verifique saldo/créditos)${detail ? ': ' + detail : ''}`,
        details: checkoutData,
      }, { status: 502 });
    }

    // Mapeia tracking por cartId
    const checkoutOrders = checkoutData.orders || [];
    const trackingByCart = {};
    checkoutOrders.forEach(o => { if (o.id) trackingByCart[o.id] = o.tracking_code || ''; });

    // Step 3: Gerar as etiquetas (obrigatório antes da impressão).
    // Sem este passo, o endpoint de impressão retorna um link que abre o painel do Melhor Envio
    // ("ainda gerar a etiqueta") em vez do PDF. Após comprar (checkout), é necessário gerar
    // as etiquetas para que o link de impressão aponte direto para o PDF.
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

    // Step 4: Imprimir etiquetas (PDF único com todas as etiquetas)
    // mode:"public" gera um link de impressão público — por padrão o Melhor Envio retorna um link
    // PRIVADO que só é acessível logado na plataforma, o que faz o botão "Visualizar/Imprimir"
    // abrir o painel do Melhor Envio em vez do PDF. Com mode:"public" qualquer pessoa com o link
    // consegue acessar o PDF diretamente.
    const printRes = await fetch(`${baseUrl}/api/v2/me/shipment/print`, {
      method: 'POST', headers, body: JSON.stringify({ orders: cartIds, mode: 'public' }),
    });
    const printText = await printRes.text();
    let printData;
    try { printData = JSON.parse(printText); } catch { printData = { raw: printText }; }

    if (!printRes.ok) {
      const detail = meErrorDetail(printData);
      return Response.json({
        error: `Erro ao gerar PDF das etiquetas Melhor Envio${detail ? ': ' + detail : ''}`,
        details: printData,
      }, { status: 502 });
    }

    const labelUrl = printData.url || (typeof printData === 'string' ? printData : '');
    const carrier = sale.selected_carrier || selectedQuote?.company_name || autoQuotedCarrier || '';

    // Monta o array de labels por volume
    const labels = cartItems.map(ci => ({
      volume_index: ci.volume.index,
      product_id: ci.volume.product_id || '',
      product_name: ci.volume.product_name || '',
      quantity: ci.volume.quantity || 1,
      label_tag: ci.volume.label_tag || `Vol. ${ci.volume.index}`,
      shipment_id: String(ci.cartId || ''),
      tracking_code: trackingByCart[ci.cartId] || '',
      carrier,
      label_url: labelUrl,
      generated_at: new Date().toISOString(),
    }));

    // Atualiza a OS. A geração da etiqueta NÃO despacha a OS — ela fica em "Etiqueta Gerada"
    // até que um romaneio (impresso ou digital/QR) a avance para "Saída do Estoque".
    // Preserva status já avançados (Separação/Saída/Em Transporte/Entregue) quando a etiqueta
    // é regenerada no meio do fluxo — evita regredir o progresso de separação/logística.
    // O sync do Melhor Envio (syncMelhorEnvioOsStatus) prevalece sobre o status independentemente,
    // avançando conforme o rastreio da transportadora (posted → Em Transporte, delivered → Entregue).
    const preserveStatuses = ['Separação', 'Saída do Estoque', 'Em Transporte', 'Entregue', 'Concluída', 'Faturada', 'Concluída pelo Técnico', 'Cancelada'];
    const targetStatus = preserveStatuses.includes(osCurrent.status) ? osCurrent.status : 'Etiqueta Gerada';
    const historyUpdate = appendStatusHistory(osCurrent, { status: targetStatus }, {
      actor: user?.full_name || user?.email || '',
      source: 'Expedição — geração de etiqueta Melhor Envio',
    });
    await base44.entities.ServiceOrder.update(os_id, {
      expedition_label_url: labelUrl,
      tracking_code: labels[0]?.tracking_code || '',
      carrier,
      melhor_envio_shipment_id: labels[0]?.shipment_id || '',
      melhor_envio_labels: labels,
      melhor_envio_status: 'generated',
      melhor_envio_status_date: new Date().toISOString(),
      status: targetStatus,
      ...(historyUpdate ? { status_history: historyUpdate } : {}),
    });

    // --- Dispara mensagem de WhatsApp automática para o cliente via GHL (Atlas) ---
    // Envia o template de "produto postado" com o link de rastreio sempre que uma
    // etiqueta é gerada. Best-effort: falhas são logadas em IntegracaoLog mas NÃO
    // bloqueiam a geração da etiqueta. Requer ghl_contact_id no cadastro do cliente
    // (vinculado pelo pull do GHL ou webhook). Mensagens fora da janela de 24h do
    // Meta podem ser rejeitadas — nesse caso o erro é logado para análise.
    let whatsappSent = false;
    let whatsappError = null;
    try {
      const settings = await base44.entities.SystemSetting.list('-created_date', 1);
      const cfg = settings[0] || {};
      const ghlLocationId = secrets.get("ghl_location_id") || cfg.ghl_location_id || "";
      if (ghlLocationId && client?.ghl_contact_id) {
        const trackingCodes = (labels || []).map(l => l.tracking_code).filter(Boolean);
        const trackingUrls = trackingCodes.map(tc => `https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(tc)}`);
        if (trackingUrls.length > 0) {
          const msg = buildShippingNotificationMessage(
            client?.name || sale.client_name || 'cliente',
            trackingUrls,
          );
          const sendResult = await sendGhlWhatsAppMessage(
            client.ghl_contact_id, msg, ghlLocationId, secrets,
          );
          whatsappSent = sendResult.ok;
          if (!sendResult.ok) {
            whatsappError = `(${sendResult.status}) ${JSON.stringify(sendResult.data).slice(0, 300)}`;
            await base44.entities.IntegracaoLog.create({
              origem: 'pull',
              mensagem: `Falha ao enviar WhatsApp de rastreio via GHL: ${whatsappError}`,
              status_http: sendResult.status,
              payload_resumido: { os_id, client_id: client.id, ghl_contact_id: client.ghl_contact_id },
            }).catch(() => {});
          }
        }
      } else if (client && !client.ghl_contact_id) {
        whatsappError = 'cliente sem ghl_contact_id (execute o pull do GHL para vincular)';
      }
    } catch (e) {
      whatsappError = e.message;
      await base44.entities.IntegracaoLog.create({
        origem: 'pull',
        mensagem: `Erro inesperado ao enviar WhatsApp de rastreio via GHL: ${e.message}`,
        status_http: 0,
        payload_resumido: { os_id },
      }).catch(() => {});
    }

    return Response.json({
      success: true,
      label_url: labelUrl,
      labels,
      volumes_count: labels.length,
      environment: useSandbox ? 'sandbox' : 'production',
      whatsapp_sent: whatsappSent,
      ...(whatsappError ? { whatsapp_error: whatsappError } : {}),
      ...(insuranceCapped ? {
        warning: 'Um ou mais volumes sem chave de NF-e vinculada tiveram o valor segurado limitado a R$ 1.500,00 (teto do Melhor Envio para envios não comerciais). O Melhor Envio aceita a chave da NF-e em apenas 1 volume por pedido.',
      } : {}),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});