// Gerado de base44/functions/emitNFSe/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

/**
 * Emite uma NFS-e Nacional (Nota Fiscal de Serviço) via Focus NFe.
 *
 * Usa o endpoint da NFS-e Nacional (/v2/nfsen). Florestal/MG (IBGE 3126000)
 * é município aderente ao Ambiente Nacional, confirmado ativo no FocusNFe.
 *
 * Fonte: uma OS (os_id) que tenha itens de serviço (LC 116) na venda vinculada.
 * Quando o pedido é misto (produtos + serviços), a NF-e de produtos é emitida
 * pelo fluxo normal (emitNFe) e a NFS-e de serviços por esta função — gerando
 * duas notas para o mesmo faturamento.
 *
 * Body: { os_id }
 */
const FOCUS_BASE = 'https://api.focusnfe.com.br/v2';
const onlyDigits = (s) => String(s || '').replace(/\D/g, '');

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { os_id } = await req.json();
    if (!os_id) {
      return Response.json({ error: 'os_id é obrigatório' }, { status: 400 });
    }

    const os = await base44.entities.ServiceOrder.get(os_id);
    if (!os) return Response.json({ error: 'OS não encontrada' }, { status: 404 });
    if (!os.sale_id) return Response.json({ error: 'OS sem venda vinculada' }, { status: 400 });

    const sale = await base44.entities.Sale.get(os.sale_id);
    const client = await base44.entities.Client.get(os.client_id);
    if (!client) return Response.json({ error: 'Cliente não encontrado' }, { status: 400 });

    const services = (sale && sale.services) ? sale.services : [];
    if (services.length === 0) {
      return Response.json({ error: 'Esta venda não possui itens de serviço (LC 116) para emitir NFS-e' }, { status: 400 });
    }

    if (!sale.billing_location_id) {
      return Response.json({ error: 'Local de faturamento (emitente) não configurado na venda' }, { status: 400 });
    }
    const billingLoc = await base44.entities.BillingLocation.get(sale.billing_location_id);
    if (!billingLoc) {
      return Response.json({ error: 'Local de faturamento não encontrado' }, { status: 400 });
    }
    if (!billingLoc.municipal_registration) {
      return Response.json({ error: 'Inscrição Municipal do emitente não cadastrada no local de faturamento' }, { status: 400 });
    }
    if (!billingLoc.ibge_code) {
      return Response.json({ error: 'Código IBGE do município do emitente não cadastrado no local de faturamento' }, { status: 400 });
    }

    // Buscar detalhes dos serviços (código LC 116, alíquota ISS, código municipal)
    const serviceIds = services.map((s) => s.service_id).filter(Boolean);
    const serviceEntities = serviceIds.length
      ? await Promise.all(serviceIds.map((sid) => base44.entities.Service.get(sid).catch(() => null)))
      : [];
    const svcMap = {};
    serviceEntities.forEach((s) => { if (s) svcMap[s.id] = s; });

    const isPF = client.person_type === 'Física';
    const isSimplesNacional = billingLoc.tax_regime === 'Simples Nacional' || billingLoc.tax_regime === 'Simples Nacional - Sublimite';

    // Monta a discriminação detalhada de todos os serviços do pedido
    const valorServicos = services.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    const discriminacao = services.map((s) => {
      const qtd = Number(s.quantity) || 1;
      const svc = svcMap[s.service_id] || {};
      const lcCode = svc.code || s.code || '';
      const nome = s.service_name || svc.name || 'Serviço';
      return `${qtd}x ${nome}${lcCode ? ` (LC116 ${lcCode})` : ''}`;
    }).join('; ');
    const descricaoServico = `${discriminacao} — Pedido ${sale.order_number || ''}`.slice(0, 2000);

    // Alíquota ISS: usa a do primeiro serviço com alíquota definida; senão 0
    const aliquotaIss = (() => {
      for (const s of services) {
        const svc = svcMap[s.service_id] || {};
        if (svc.aliquot_iss && svc.aliquot_iss > 0) return Number(svc.aliquot_iss);
      }
      return 0;
    })();

    // Item da lista de serviço (LC 116) — do primeiro serviço
    const primeiroSvc = svcMap[services[0].service_id] || {};

    // cTribNac: código de tributação nacional (6 dígitos) da NFS-e Nacional.
    // Usa national_tributation_code do cadastro de serviço; fallback deriva do LC 116.
    const codigoTributacaoNacionalIss = String(primeiroSvc.national_tributation_code || '').padStart(6, '0').slice(0, 6)
      || (() => {
        const lcParts = String(primeiroSvc.code || services[0].code || '').split('.');
        return (lcParts[0] || '0').padStart(2, '0') + (lcParts[1] || '00').padStart(2, '0') + '00';
      })();

    // Data de emissão no fuso do Brasil (UTC-3) — SEFAZ rejeita datas futuras ao processamento
    const nowUtc = new Date();
    const now = new Date(nowUtc.getTime() - 3 * 60 * 60 * 1000).toISOString().replace('Z', '-03:00');
    const ref = `nfse-${os.id}-${Date.now()}`;

    // Payload flat — NFS-e Nacional (DPS)
    const payload = {
      ref,
      data_emissao: now,
      data_competencia: now.slice(0, 10),
      cnpj_prestador: onlyDigits(billingLoc.cnpj),
      codigo_municipio_emissora: Number(onlyDigits(billingLoc.ibge_code)),
      codigo_opcao_simples_nacional: isSimplesNacional ? 3 : 1, // 1=Não Optante, 2=MEI, 3=ME/EPP
      regime_especial_tributacao: isSimplesNacional ? 6 : 0,
      codigo_municipio_prestacao: onlyDigits(billingLoc.ibge_code),
      codigo_tributacao_nacional_iss: codigoTributacaoNacionalIss,
      descricao_servico: descricaoServico,
      valor_servico: Number(valorServicos.toFixed(2)),
      // tributacao_iss = situação tributária (1=Operação tributável, 2=Imunidade, 3=Exportação, 4=Não Incidência)
      tributacao_iss: 1,
      // tipo_retencao_iss fornece tpRetISSQN — elemento filho obrigatório de tribMun
      tipo_retencao_iss: 1, // 1 = Não Retido
      // null suprime indTotTrib e pTotTribSN dentro de totTrib (proibidos para Não Optante).
      // Os percentuais abaixo mantêm o elemento totTrib presente (exigido pelo schema da DPS).
      indicador_total_tributacao: null,
      percentual_total_tributos_federais: '0.00',
      percentual_total_tributos_estaduais: '0.00',
      percentual_total_tributos_municipais: '0.00',
    };

    if (isPF) {
      payload.cpf_tomador = onlyDigits(client.document);
    } else {
      payload.cnpj_tomador = onlyDigits(client.document);
    }

    // Tomador — nome/razão social e endereço (campos opcionais da NFS-e Nacional)
    if (client.name) payload.razao_social_tomador = client.name;
    if (client.email) payload.email_tomador = client.email;
    if (client.street) payload.logradouro_tomador = client.street;
    if (client.number) payload.numero_tomador = client.number;
    if (client.complement) payload.complemento_tomador = client.complement;
    if (client.neighborhood) payload.bairro_tomador = client.neighborhood;
    if (client.state) payload.uf_tomador = client.state;

    // SEFAZ exige cMun quando CEP é informado — consulta ViaCEP para obter o IBGE correto do tomador
    const cepTomador = onlyDigits(client.zip_code);
    if (cepTomador && cepTomador.length === 8) {
      payload.cep_tomador = Number(cepTomador);
      try {
        const viacepResp = await fetch(`https://viacep.com.br/ws/${cepTomador}/json/`);
        const viacepData = await viacepResp.json();
        if (!viacepData.erro && viacepData.ibge) {
          payload.codigo_municipio_tomador = Number(viacepData.ibge);
        }
      } catch { /* CEP inválido — FocusNFe/SEFAZ validarão */ }
    }

    const token = Deno.env.get('FOCUSNFE_TOKEN');
    if (!token) return Response.json({ error: 'FOCUSNFE_TOKEN não configurado' }, { status: 500 });
    const auth = btoa(`${token}:`);

    const resp = await fetch(`${FOCUS_BASE}/nfsen`, {
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

    // 202 = em processamento (NFS-e Nacional é sempre assíncrona)
    if (resp.status === 202 || resp.status === 201) {
      const update = {
        nfse_transmitted: true,
        nfse_status: data.status === 'autorizado' ? 'autorizado' : 'processando',
        nfse_ref: ref,
        nfse_data: now.slice(0, 10),
        nfse_numero: String(data.numero || ''),
        nfse_codigo_verificacao: data.codigo_verificacao || '',
        nfse_url: data.url || data.caminho_nfse || '',
        nfse_mensagem_sefaz: strMsg(data.mensagem_sefaz),
      };
      await base44.entities.ServiceOrder.update(os_id, update);
      return Response.json({ status: update.nfse_status, ref, ...update });
    }

    return Response.json({
      status: 'erro',
      error: strMsg(data.erros || data.error) || `HTTP ${resp.status}`,
      data,
    }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}