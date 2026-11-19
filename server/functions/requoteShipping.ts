// Gerado de base44/functions/requoteShipping/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { sanitizeCep, isValidCep } from '../shared/melhorEnvioCart.ts';

// Regenera os volumes de frete a partir dos itens ATUAIS da venda e re-cota no Melhor Envio.
// Usado quando o pedido foi alterado após a última cotação (volumes desatualizados) —
// o usuário dispara a partir do detalhe da OS quando a validação bloqueia a geração de etiqueta.
//
// Preserva a transportadora/serviço selecionado anteriormente: se a nova cotação contiver o
// mesmo serviço, ele é marcado como selected automaticamente. Caso contrário, o usuário
// seleciona manualmente no painel de troca de transportadora.

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = Deno.env.get('MELHOR_ENVIO_TOKEN');
    const userAgent = Deno.env.get('MELHOR_ENVIO_USER_AGENT') || 'ERP Brazon (contato@brazon.com.br)';
    if (!token) return Response.json({ error: 'Token do Melhor Envio não configurado (MELHOR_ENVIO_TOKEN).' }, { status: 500 });

    const { sale_id, environment, packing_mode, item_packing, unify_dims } = await req.json();
    if (!sale_id) return Response.json({ error: 'sale_id é obrigatório' }, { status: 400 });

    const sale = await base44.entities.Sale.get(sale_id);
    if (!sale) return Response.json({ error: 'Venda não encontrada' }, { status: 404 });

    const items = sale.items || [];
    if (items.length === 0) return Response.json({ error: 'A venda não possui itens de produto.' }, { status: 400 });

    // Origem (local de faturamento)
    let origin = null;
    if (sale.billing_location_id) {
      origin = await base44.entities.BillingLocation.get(sale.billing_location_id);
    }
    if (!origin) return Response.json({ error: 'Local de faturamento (origem) não encontrado na venda.' }, { status: 400 });

    const destAddr = sale.delivery_address || sale.billing_address || {};
    const originZip = sanitizeCep(origin.zip_code);
    const destZip = sanitizeCep(destAddr.zip_code);
    if (!isValidCep(originZip)) return Response.json({ error: `CEP de origem inválido no local de faturamento: "${origin.zip_code || ''}". Verifique o cadastro do local de faturamento.` }, { status: 400 });
    if (!isValidCep(destZip)) return Response.json({ error: `CEP de destino inválido na venda: "${destAddr.zip_code || ''}". Verifique o endereço de entrega da venda.` }, { status: 400 });

    // --- Regenera os volumes a partir dos itens atuais (espelha o generateVolumes do frontend) ---
    // Permite override do modo de empacotamento: quando a venda já foi faturada/está em OS,
    // o usuário pode alterar o empacotamento (ex: unify_all → per_item para separar 2 volumes)
    // diretamente do detalhe da OS sem precisar editar a venda.
    const packingMode = packing_mode || sale.packing_mode || 'per_item';
    const itemPacking = item_packing || sale.item_packing || {};

    // Pré-carrega produtos + grupos + subgrupos para dimensões
    const productIds = items.map(i => i.product_id).filter(Boolean);
    const products = [];
    for (const pid of productIds) {
      try { const p = await base44.entities.Product.get(pid); if (p) products.push(p); } catch {}
    }
    const groupIds = [...new Set(products.map(p => p.group_id).filter(Boolean))];
    const groups = [];
    for (const gid of groupIds) {
      try { const g = await base44.entities.ProductGroup.get(gid); if (g) groups.push(g); } catch {}
    }
    const subgroupIds = [...new Set(products.map(p => p.subgroup_id).filter(Boolean))];
    const subgroups = [];
    for (const sid of subgroupIds) {
      try { const s = await base44.entities.ProductSubgroup.get(sid); if (s) subgroups.push(s); } catch {}
    }

    const getDims = (prod) => {
      const grp = groups.find(g => g.id === prod.group_id) || {};
      const sub = subgroups.find(s => s.id === prod.subgroup_id) || {};
      return {
        weight: Number(prod.weight) || Number(sub.weight) || Number(grp.weight) || 0,
        width: Number(prod.width) || Number(sub.width) || Number(grp.width) || 0,
        height: Number(prod.depth) || Number(sub.height) || Number(grp.height) || 0,
        length: Number(prod.length) || Number(sub.length) || Number(grp.length) || 0,
      };
    };

    // Preserva dimensões editadas manualmente de volumes anteriores (por label_tag)
    const prevByTag = {};
    (sale.shipping_volumes || []).forEach(v => { if (v.label_tag) prevByTag[v.label_tag] = v; });

    const volumes = [];
    let idx = 1;
    if (packingMode === 'unify_all') {
      const totalQty = items.reduce((s, i) => s + (i.quantity || 1), 0);
      const insurance = items.reduce((s, i) => s + ((i.unit_price || 0) * (i.quantity || 1)), 0);
      const tag = 'Vol. 1 — Pedido Completo';
      const prev = prevByTag[tag] || {};
      // Dimensões customizadas enviadas pelo frontend têm prioridade; depois preserva as anteriores; senão usa defaults
      const ud = unify_dims || {};
      volumes.push({
        index: 1, product_id: null, product_name: 'Volume Único (todos os itens)',
        quantity: totalQty,
        height: Number(ud.height) || prev.height || 10,
        width: Number(ud.width) || prev.width || 10,
        length: Number(ud.length) || prev.length || 10,
        weight: Number(ud.weight) || prev.weight || 0.3,
        insurance_value: insurance,
        label_tag: tag, custom_dimensions: true,
      });
    } else {
      items.forEach((item, i) => {
        const prod = products.find(p => p.id === item.product_id) || {};
        const dims = getDims(prod);
        const qty = item.quantity || 1;
        const mode = itemPacking[String(i)] || (qty === 1 ? 'individual' : 'grouped');
        const prodName = item.product_name || prod.name || `Item ${i + 1}`;
        if (mode === 'grouped') {
          const tag = `Vol. ${idx} — ${prodName} (x${qty})`;
          const prev = prevByTag[tag] || {};
          volumes.push({
            index: idx, product_id: item.product_id, product_name: prodName, quantity: qty,
            height: prev.custom_dimensions ? prev.height : (dims.height || 10),
            width: prev.custom_dimensions ? prev.width : (dims.width || 10),
            length: prev.custom_dimensions ? prev.length : (dims.length || 10),
            weight: prev.custom_dimensions ? prev.weight : Number((dims.weight * qty).toFixed(2)) || 0.3,
            insurance_value: (item.unit_price || 0) * qty,
            label_tag: tag, custom_dimensions: prev.custom_dimensions || false,
          });
          idx++;
        } else {
          for (let u = 0; u < qty; u++) {
            const tag = `Vol. ${idx} — ${prodName}`;
            const prev = prevByTag[tag] || {};
            volumes.push({
              index: idx, product_id: item.product_id, product_name: prodName, quantity: 1,
              height: prev.custom_dimensions ? prev.height : (dims.height || 10),
              width: prev.custom_dimensions ? prev.width : (dims.width || 10),
              length: prev.custom_dimensions ? prev.length : (dims.length || 10),
              weight: prev.custom_dimensions ? prev.weight : (dims.weight || 0.3),
              insurance_value: item.unit_price || 0,
              label_tag: tag, custom_dimensions: prev.custom_dimensions || false,
            });
            idx++;
          }
        }
      });
    }

    if (volumes.length === 0) return Response.json({ error: 'Não foi possível gerar volumes a partir dos itens.' }, { status: 400 });

    // --- Cota cada volume no Melhor Envio ---
    const useSandbox = (environment || 'production') !== 'production';
    const baseUrl = useSandbox ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';
    const headers = {
      'Accept': 'application/json', 'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`, 'User-Agent': userAgent,
    };

    const volQuotes = await Promise.all(volumes.map(async (vol) => {
      const payload = {
        from: { postal_code: originZip },
        to: { postal_code: destZip },
        products: [{
          id: String(vol.index),
          width: Number(vol.width) || 10, height: Number(vol.height) || 10,
          length: Number(vol.length) || 10, weight: Number(vol.weight) || 0.3,
          insurance_value: Math.max(Number(vol.insurance_value) || 0, 1), quantity: 1,
        }],
        options: { receipt: false, own_hand: false },
      };
      const res = await fetch(`${baseUrl}/api/v2/me/shipment/calculate`, {
        method: 'POST', headers, body: JSON.stringify(payload),
      });
      const text = await res.text();
      let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!res.ok) {
        let meMessage = '';
        if (data?.errors && typeof data.errors === 'object') {
          meMessage = Object.entries(data.errors)
            .map(([campo, msgs]) => `${campo}: ${Array.isArray(msgs) ? msgs.join('; ') : msgs}`)
            .join(' | ');
        } else if (data?.message) {
          meMessage = String(data.message);
        } else {
          meMessage = text.slice(0, 200);
        }
        return { volumeIndex: vol.index, quotes: [], error: meMessage };
      }
      const qs = (Array.isArray(data) ? data : (data.data || []))
        .map(q => ({
          service_id: q.id, service_name: q.name,
          company_name: q.company?.name,
          price: q.custom_price ?? q.price,
          delivery_time: q.custom_delivery_time ?? q.delivery_time,
        }))
        .filter(q => q.price && !q.error);
      return { volumeIndex: vol.index, quotes: qs };
    }));

    const failed = volQuotes.filter(r => r.quotes.length === 0);
    if (failed.length > 0) {
      const details = failed.map(r => `Vol. ${r.volumeIndex}: ${r.error || 'nenhuma transportadora disponível'}`).join(' | ');
      return Response.json({ error: `O frete não pôde ser recalculado. ${details}` }, { status: 422 });
    }

    // Serviços comuns a todos os volumes (interseção por service_id)
    const validIdxs = volQuotes.map((qs, i) => qs.quotes.length > 0 ? i : -1).filter(i => i >= 0);
    const first = volQuotes[validIdxs[0]].quotes;
    const common = first.filter(q => validIdxs.every(vi => volQuotes[vi].quotes.some(qq => qq.service_id === q.service_id)));
    const uniqueQuotes = (common.length > 0 ? common : first).map(q => {
      // Soma o preço do serviço em todos os volumes (frete total do pedido)
      let totalPrice = 0;
      volumes.forEach(vol => {
        const qq = (volQuotes.find(vq => vq.volumeIndex === vol.index)?.quotes || []).find(x => x.service_id === q.service_id);
        if (qq) totalPrice += Number(qq.price) || 0;
      });
      return {
        service_id: String(q.service_id ?? ''),
        service_name: String(q.service_name ?? ''),
        company_name: String(q.company_name ?? ''),
        price: Number(totalPrice.toFixed(2)),
        delivery_time: String(q.delivery_time ?? ''),
        selected: false,
        date: new Date().toISOString(),
        volumes_count: volumes.length,
      };
    });

    if (uniqueQuotes.length === 0) return Response.json({ error: 'Nenhuma cotação disponível para os CEPs/volumes informados.' }, { status: 422 });

    // Marca a cotação da transportadora anteriormente selecionada como default (highlight no frontend).
    const prevCarrier = sale.selected_carrier || '';
    const prevService = sale.selected_service || '';
    let matchedNew = uniqueQuotes.find(q => q.company_name === prevCarrier && q.service_name === prevService);
    if (!matchedNew && prevCarrier) matchedNew = uniqueQuotes.find(q => q.company_name === prevCarrier);
    if (matchedNew) matchedNew.selected = true;

    // Histórico: preserva cotações anteriores, adiciona as novas.
    const oldHistory = (sale.shipping_quote_history || []).map(q => ({ ...q, selected: false }));
    const updatedHistory = [...oldHistory, ...uniqueQuotes];

    // Atualiza a venda: novos volumes + novo histórico + packing overrides.
    // NÃO aplica o frete nem seta aprovação aqui — o usuário escolhe a transportadora
    // no diálogo e a seleção é aplicada por applyRequoteCarrier (com lógica de aprovação).
    // Limpa qualquer aprovação pendente de recotação anterior — o usuário está
    // re-cotando novamente, então a aprovação anterior perde o sentido.
    const saleUpdate = {
      shipping_volumes: volumes,
      shipping_quote_history: updatedHistory,
      quote_completed: true,
      requote_diff_status: 'Não Aplicável',
      requote_diff_amount: 0,
      requote_original_freight: 0,
      requote_new_freight: 0,
      requote_original_carrier: '',
      requote_original_volumes_count: 0,
      requote_new_volumes_count: 0,
      requote_reason: '',
      requote_requested_by: '',
      requote_requested_date: '',
      requote_approved_by: '',
      requote_approved_date: '',
      requote_rejected_by: '',
      requote_rejected_date: '',
      requote_reject_reason: '',
    };
    if (packing_mode) {
      saleUpdate.packing_mode = packing_mode;
    }
    if (item_packing) {
      saleUpdate.item_packing = item_packing;
    }

    await base44.entities.Sale.update(sale_id, saleUpdate);

    return Response.json({
      success: true,
      volumes_count: volumes.length,
      quotes_count: uniqueQuotes.length,
      all_quotes: uniqueQuotes.map(q => ({
        service_id: q.service_id,
        service_name: q.service_name,
        company_name: q.company_name,
        price: q.price,
        delivery_time: q.delivery_time,
        selected: q.selected,
      })),
      default_selected: matchedNew ? { company_name: matchedNew.company_name, service_name: matchedNew.service_name, price: matchedNew.price } : null,
      volumes: volumes.map(v => ({ index: v.index, label_tag: v.label_tag, quantity: v.quantity, product_name: v.product_name })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});