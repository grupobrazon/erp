import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { cascadeSaleStageFromOs } from "../../shared/saleStageCascade.ts";

/**
 * Emite uma NF-e real via Focus NFe.
 * Suporta duas fontes:
 *  - os_id:    NF-e de venda (a partir de uma ordem de serviço / venda)
 *  - remessa_id: NF-e de operação não-venda (demonstração, remessa, consignação, devolução, retorno)
 *
 * Remessas NÃO podem usar CFOP de categoria "Venda" — validado contra a entidade Cfop.
 * Remessas não geram ordem de serviço.
 *
 * Body: { os_id?, remessa_id?, cfop? }
 */
const FOCUS_BASE = 'https://api.focusnfe.com.br/v2';
const onlyDigits = (s) => String(s || '').replace(/\D/g, '');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { os_id, remessa_id, cfop } = await req.json();
    if (!os_id && !remessa_id) {
      return Response.json({ error: 'os_id ou remessa_id é obrigatório' }, { status: 400 });
    }

    let source, entityId, client, billingLoc, itemsSource, grandTotal, discount, freight, naturezaOp, cfopOverride;

    if (remessa_id) {
      source = 'remessa';
      entityId = remessa_id;
      const remessa = await base44.entities.Remessa.get(remessa_id);
      if (!remessa) return Response.json({ error: 'Remessa não encontrada' }, { status: 404 });

      client = await base44.entities.Client.get(remessa.client_id);
      if (!client) return Response.json({ error: 'Cliente não encontrado' }, { status: 400 });

      billingLoc = remessa.billing_location_id
        ? await base44.entities.BillingLocation.get(remessa.billing_location_id)
        : null;
      if (!billingLoc) {
        return Response.json({ error: 'Local de faturamento (emitente) não configurado na remessa' }, { status: 400 });
      }

      itemsSource = remessa.items || [];
      grandTotal = remessa.grand_total;
      discount = remessa.discount || 0;
      freight = remessa.freight || 0;
      naturezaOp = remessa.natureza_operacao || 'Remessa de mercadoria';
      cfopOverride = remessa.cfop_code || cfop;

      // Bloquear CFOP de categoria Venda para remessas
      if (cfopOverride) {
        const cfops = await base44.entities.Cfop.list('-created_date', 200);
        const sel = cfops.find((c) => c.code === cfopOverride || c.code === onlyDigits(cfopOverride));
        if (sel && sel.categoria === 'Venda') {
          return Response.json({
            error: 'Remessas não podem usar CFOP de categoria Venda. Selecione um CFOP de Remessa, Demonstração, Devolução ou Outro.',
          }, { status: 400 });
        }
      }
    } else {
      source = 'os';
      entityId = os_id;
      const os = await base44.entities.ServiceOrder.get(os_id);
      if (!os) return Response.json({ error: 'OS não encontrada' }, { status: 404 });
      if (!os.sale_id) return Response.json({ error: 'OS sem venda vinculada' }, { status: 400 });

      const sale = await base44.entities.Sale.get(os.sale_id);
      client = await base44.entities.Client.get(os.client_id);
      if (!client) return Response.json({ error: 'Cliente não encontrado' }, { status: 400 });

      billingLoc = sale.billing_location_id
        ? await base44.entities.BillingLocation.get(sale.billing_location_id)
        : null;
      if (!billingLoc) {
        return Response.json({ error: 'Local de faturamento (emitente) não configurado na venda' }, { status: 400 });
      }

      itemsSource = sale.items || [];
      grandTotal = sale.grand_total;
      discount = sale.discount || 0;
      freight = sale.freight || 0;
      const isBonificacaoSale = (sale.payments || []).some((p) => p.payment_type === 'Bonificação');
      naturezaOp = isBonificacaoSale ? 'Bonificacao de mercadoria' : null;
      cfopOverride = cfop;

      // Validar frete para modalidade Envio (bloqueia NF-e sem frete cotado)
      if (sale.delivery_modality === 'Envio' && !sale.freight_exempt) {
        if (!sale.quote_completed) {
          return Response.json({
            error: 'Cotação de frete não realizada. Complete a cotação de frete no pedido antes de transmitir a NF-e.',
          }, { status: 400 });
        }
        if (!freight || freight <= 0) {
          return Response.json({
            error: 'Frete não informado no pedido. Informe o valor do frete antes de transmitir a NF-e.',
          }, { status: 400 });
        }
      }
    }

    const settingsList = await base44.asServiceRole.entities.SystemSetting.list('-created_date', 1);
    const S = settingsList[0] || {};

    // Produtos para NCM e código
    const productIds = itemsSource.map((i) => i.product_id).filter(Boolean);
    const products = productIds.length
      ? await Promise.all(productIds.map((pid) => base44.entities.Product.get(pid).catch(() => null)))
      : [];
    const prodMap = {};
    products.forEach((p) => { if (p) prodMap[p.id] = p; });

    const isPF = client.person_type === 'Física';
    // Non-contribuinte (sem IE) deve ser marcado como consumidor final (regra SEFAZ).
    // PJ sem Inscrição Estadual = não contribuinte → consumidor_final = 1.
    const isConsumidorFinal = client.client_type === 'Consumidor Final' || client.ie_exempt === true || (client.person_type === 'Jurídica' && !client.state_registration);
    const emitUF = billingLoc.state || '';
    const destUF = client.state || '';
    const isInternal = !!emitUF && !!destUF && emitUF === destUF;

    const deriveCfop = (base, internal) => {
      const b = String(base || '');
      if (!b) return internal ? '5102' : '6102';
      if (internal && b.startsWith('6')) return '5' + b.slice(1);
      if (!internal && b.startsWith('5')) return '6' + b.slice(1);
      return b;
    };
    const cfopBase = cfopOverride || (source === 'remessa' ? '' : S.cfop_internal) || '5102';
    const cfopFinal = deriveCfop(cfopBase, isInternal);

    // SEFAZ valida que a soma do frete/desconto dos itens = total (rejeição 535/510)
    // e que o desconto de cada item não pode exceder o valor do item (rejeição 483).
    // Frete vai no primeiro item (sempre menor que o valor do item).
    // Desconto é distribuído proporcionalmente (bonificação/troca podem ter 100% de desconto).
    const totalFreight = Number(freight) || 0;
    const totalDiscount = Number(discount) || 0;
    const valorProdutosCalc = itemsSource.reduce((s, it) => {
      const qtde = Number(it.quantity) || 1;
      const vUnit = Number(it.unit_price) || 0;
      return s + (Number(it.total) || (qtde * vUnit));
    }, 0);
    let discountAccum = 0;
    const items = itemsSource.map((it, idx) => {
      const prod = prodMap[it.product_id] || {};
      const qtde = Number(it.quantity) || 1;
      const vUnit = Number(it.unit_price) || 0;
      const itemBruto = Number(it.total) || (qtde * vUnit);
      let itemDiscount;
      if (idx === itemsSource.length - 1) {
        itemDiscount = Math.round((totalDiscount - discountAccum) * 100) / 100;
      } else {
        const proportion = valorProdutosCalc > 0 ? itemBruto / valorProdutosCalc : 0;
        itemDiscount = Math.round(totalDiscount * proportion * 100) / 100;
        discountAccum += itemDiscount;
      }
      return {
        numero_item: idx + 1,
        codigo_produto: String(prod.code || it.product_id || '').slice(0, 60),
        descricao: String(it.product_name || prod.name || 'Produto').slice(0, 120),
        codigo_ncm: onlyDigits(prod.ncm) || S.ncm_padrao || '84212100',
        cfop: cfopFinal,
        unidade_comercial: prod.unit || 'UN',
        quantidade_comercial: qtde,
        valor_unitario_comercial: vUnit,
        valor_bruto: itemBruto,
        valor_frete: idx === 0 ? totalFreight : 0,
        valor_desconto: itemDiscount,
        inclui_no_total: 1,
        icms_origem: 0,
        icms_situacao_tributaria: S.csosn_default || '102',
        pis_situacao_tributaria: S.pis_cst || '08',
        cofins_situacao_tributaria: S.cofins_cst || '08',
      };
    });

    if (items.length === 0) {
      return Response.json({ error: 'Operação sem itens' }, { status: 400 });
    }

    const valorProdutos = items.reduce((s, i) => s + i.valor_bruto, 0);
    // SEFAZ exige: valor_total = valor_produtos - valor_desconto + valor_frete
    // (não podemos usar grandTotal direto pois pode incluir taxa de deslocamento/acréscimos
    //  não declarados na NF-e, e o operador || falha quando grandTotal é 0 — vendas bonificadas/troca)
    const valorTotal = valorProdutos - totalDiscount + totalFreight;
    const ref = `${source}-${entityId}-${Date.now()}`;
    const now = new Date().toISOString();

    const payload = {
      natureza_operacao: naturezaOp || S.natureza_operacao || 'Venda de mercadoria',
      data_emissao: now,
      tipo_documento: 1,
      local_destino: isInternal ? 1 : 2,
      finalidade_emissao: 1,
      consumidor_final: (isPF || isConsumidorFinal) ? 1 : 0,
      presenca_comprador: S.presenca_comprador || 2,
      cnpj_emitente: onlyDigits(billingLoc.cnpj),
      nome_emitente: billingLoc.name,
      nome_fantasia_emitente: billingLoc.name,
      logradouro_emitente: billingLoc.street,
      numero_emitente: billingLoc.number,
      bairro_emitente: billingLoc.neighborhood,
      municipio_emitente: billingLoc.city,
      uf_emitente: billingLoc.state,
      cep_emitente: onlyDigits(billingLoc.zip_code),
      inscricao_estadual_emitente: billingLoc.state_registration || 'ISENTO',
      regime_tributario_emitente: 1,
      nome_destinatario: client.name,
      indicador_inscricao_estadual_destinatario: (isPF || isConsumidorFinal) ? 9 : (client.state_registration ? 1 : (client.ie_exempt ? 2 : 9)),
      logradouro_destinatario: client.street,
      numero_destinatario: client.number,
      bairro_destinatario: client.neighborhood,
      municipio_destinatario: client.city,
      uf_destinatario: client.state,
      cep_destinatario: onlyDigits(client.zip_code),
      telefone_destinatario: onlyDigits(client.phone1),
      valor_produtos: valorProdutos,
      valor_total: valorTotal,
      valor_desconto: Number(discount) || 0,
      valor_frete: Number(freight) || 0,
      modalidade_frete: Number(freight) > 0 ? 1 : 9,
      items,
    };

    if (isPF) {
      payload.cpf_destinatario = onlyDigits(client.document);
    } else {
      payload.cnpj_destinatario = onlyDigits(client.document);
      if (!client.ie_exempt && client.state_registration) {
        payload.inscricao_estadual_destinatario = client.state_registration;
      }
    }

    const token = Deno.env.get('FOCUSNFE_TOKEN');
    if (!token) return Response.json({ error: 'FOCUSNFE_TOKEN não configurado' }, { status: 500 });
    const auth = btoa(`${token}:`);

    const resp = await fetch(`${FOCUS_BASE}/nfe?ref=${encodeURIComponent(ref)}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();

    // FocusNFe pode retornar erros como array de objetos {mensagem, campo} — garantir string
    const strMsg = (v) => {
      if (!v) return '';
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) return v.map((e) => e?.mensagem || e?.campo || JSON.stringify(e)).join('; ');
      if (typeof v === 'object') return v.mensagem || JSON.stringify(v);
      return String(v);
    };

    const applyUpdate = async (update) => {
      if (source === 'os') {
        await base44.entities.ServiceOrder.update(entityId, update);
      } else {
        await base44.entities.Remessa.update(entityId, update);
      }
    };

    // 201 = autorizada (síncrona)
    if (resp.status === 201) {
      const update = {
        invoice_type: 'Nota Fiscal',
        invoice_number: data.numero,
        invoice_date: now.slice(0, 10),
        nfe_cfop: cfopFinal,
        nfe_transmitted: true,
        nfe_status: 'autorizado',
        nfe_chave: data.chave_nfe,
        nfe_danfe_url: data.caminho_danfe,
        nfe_xml_url: data.caminho_xml_nota_fiscal || '',
        nfe_ref: ref,
        nfe_serie: data.serie,
        nfe_mensagem_sefaz: strMsg(data.mensagem_sefaz),
      };
      if (source === 'remessa') {
        update.status = 'Faturada';
      } else if (source === 'os') {
        // Marca a OS como faturada
        update.invoiced = true;
        // Se a OS estava aguardando faturamento final (pós-rota), conclui a OS e a venda
        if (os && os.status === 'Aguardando Faturamento Final') {
          update.status = 'Concluída';
        }
      }
      await applyUpdate(update);
      // Cascata: se a OS foi concluída pelo faturamento pós-rota, finaliza a venda
      if (source === 'os' && update.status === 'Concluída') {
        try {
          const updatedOs = await base44.entities.ServiceOrder.get(entityId);
          await cascadeSaleStageFromOs(base44, updatedOs);
        } catch { /* não bloqueia */ }
      }
      return Response.json({ status: 'autorizado', ...update });
    }

    // 202 = em processamento (assíncrona)
    if (resp.status === 202) {
      const update = {
        invoice_type: 'Nota Fiscal',
        invoice_date: now.slice(0, 10),
        nfe_status: 'processando',
        nfe_ref: ref,
      };
      // NÃO marca a remessa como 'Faturada' enquanto a NF-e apenas está em processamento:
      // se a SEFAZ rejeitar depois, a remessa ficaria presa em 'Faturada' sem nota emitida.
      // O status só vira 'Faturada' quando a NF-e for efetivamente autorizada.
      await applyUpdate(update);
      return Response.json({ status: 'processando', ref });
    }

    // Erro: FocusNFe/SEFAZ retornou detalhes do problema. Extrair motivo, campo e código
    // de todas as estruturas possíveis (erros[], mensagem, mensagem_sefaz, codigo, error).
    const errosArr = Array.isArray(data?.erros) ? data.erros : [];
    const primeiroErro = errosArr[0] || {};
    const motivos = errosArr.map((e) => {
      const parts = [];
      if (e?.campo) parts.push(`campo "${e.campo}"`);
      if (e?.mensagem) parts.push(e.mensagem);
      if (!parts.length && e?.codigo) parts.push(`código ${e.codigo}`);
      return parts.join(": ") || (e ? JSON.stringify(e) : "");
    }).filter(Boolean);
    const motivo =
      motivos.join("; ") ||
      strMsg(data?.mensagem) ||
      strMsg(data?.mensagem_sefaz) ||
      strMsg(data?.error) ||
      "";
    const campo = primeiroErro.campo || "";
    const codigo = data?.codigo || primeiroErro.codigo || "";

    return Response.json({
      status: 'erro',
      error: motivo || `Erro HTTP ${resp.status} ao transmitir a NF-e. Verifique os dados da NF-e e do cadastro do cliente/emitente.`,
      motivo,
      campo,
      codigo,
      http_status: resp.status,
      raw: data,
    }, { status: 400 });
  } catch (error) {
    return Response.json({
      error: error.message,
      motivo: error.message,
      http_status: 500,
    }, { status: 500 });
  }
});