// Gerado de base44/functions/sendWonSaleToCrm/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { secrets } from "../runtime.ts";
import {
  searchGhlContacts,
  upsertGhlContact,
  fetchGhlOpportunity,
  fetchGhlPipelines,
  searchGhlOpportunitiesByContact,
  updateGhlOpportunity,
  createGhlOpportunity,
  findGhlWonTarget,
  findGhlLastStage,
} from '../shared/ghlClient.ts';
import { resolveUniqueGhlContact } from '../shared/ghlContactMatch.ts';

// Sincroniza uma venda ganha com o CRM (GoHighLevel) pela API REST:
// 1) localiza o contato do cliente (vínculo salvo, e-mail, telefone ou nome) e atualiza/cria o contato;
// 2) localiza a oportunidade do cliente (vínculo salvo ou oportunidade do contato no CRM),
//    grava o valor do negócio e marca o status como Ganho (won).
// Chamada pela automação "Enviar Venda Ganha para o CRM" e por sinais de teste ({ test: true }).

const WON_STATUS = 'won';
const TEST_VALUE = 230;
const TEST_CONTACT = {
  firstName: 'TESTE',
  lastName: 'MAPEAMENTO CRM',
  email: 'teste.mapeamento@exemplo.com',
  phone: '+5511999990000',
};

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

// Telefone no formato E.164 (Brasil) — o CRM só encontra o contato com o DDI.
function toE164(value) {
  const digits = onlyDigits(value);
  if (!digits) return '';
  if (digits.length <= 11) return `+55${digits}`;
  return `+${digits}`;
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function itemsSummary(items) {
  return (items || [])
    .map((item) => `${item.product_name || 'Item'} x${item.quantity || 1}`)
    .join('; ');
}

// Nome do negócio no CRM (pedido + cliente).
function opportunityTitle(sale, clientName) {
  const pedido = String(sale?.order_number || '').trim();
  const nome = String(clientName || '').trim();
  if (pedido && nome) return `Pedido ${pedido} - ${nome}`;
  return pedido ? `Pedido ${pedido}` : nome || 'Venda ERP Brazon';
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}

function buildContactBody(client, sale) {
  const name = client?.name || sale?.client_name || '';
  const { first, last } = splitName(name);
  const phone = toE164(client?.phone1 || client?.phone2 || '');
  const body = {
    firstName: first,
    lastName: last,
    name,
    address1: client?.street || '',
    city: client?.city || '',
    state: client?.state || '',
    postalCode: client?.zip_code || '',
    country: 'BR',
    companyName: client?.person_type === 'Jurídica' ? client?.fantasy_name || '' : '',
    source: 'ERP Brazon',
  };
  // E-mail/telefone inválidos no ERP fariam o CRM recusar o contato inteiro (422): envia só o que é válido.
  if (isEmail(client?.email)) body.email = String(client.email).trim();
  if (onlyDigits(phone).length >= 10) body.phone = phone;
  return body;
}

// Contato no CRM: vínculo salvo no ERP → e-mail único → telefone único
// (ver shared/ghlContactMatch.ts). Nome não decide vínculo e o "primeiro
// resultado da busca" nunca é usado: com dois ou mais candidatos a venda
// segue sem contato vinculado, para não juntar dois clientes no mesmo cadastro.

// Oportunidade no CRM: vínculo salvo no ERP → oportunidade do contato (prioriza a aberta).
async function resolveOpportunityId({ locationId, client, contactId, overrideId }) {
  if (overrideId) return { opportunityId: overrideId, match: 'informada' };
  if (client?.ghl_deal_id) return { opportunityId: client.ghl_deal_id, match: 'vínculo do ERP' };
  if (!contactId) return { opportunityId: '', match: '' };

  const list = await searchGhlOpportunitiesByContact({ locationId, contactId, secrets });
  const open = list.find((o) => o.status === 'open');
  const chosen = open || list[0];
  if (!chosen?.id) return { opportunityId: '', match: '' };
  return { opportunityId: chosen.id, match: open ? 'contato (em aberto)' : 'contato' };
}

// Sinal de teste: grava contato e oportunidade claramente marcados como teste, sem tocar em vendas reais.
async function sendTestSignal({ locationId }) {
  const testBody = {
    firstName: TEST_CONTACT.firstName,
    lastName: TEST_CONTACT.lastName,
    name: `${TEST_CONTACT.firstName} ${TEST_CONTACT.lastName}`,
    email: TEST_CONTACT.email,
    phone: TEST_CONTACT.phone,
    city: 'São Paulo',
    state: 'SP',
    country: 'BR',
    source: 'ERP Brazon (teste)',
    tags: ['erp-brazon', 'teste'],
  };

  const foundContacts = await searchGhlContacts({ locationId, query: TEST_CONTACT.email, secrets });
  const existingContact = foundContacts[0] || null;
  const contact = await upsertGhlContact({
    locationId,
    contactId: existingContact?.id || '',
    body: testBody,
    secrets,
  });
  const contactId = contact?.id || existingContact?.id || '';

  const foundOpportunities = contactId
    ? await searchGhlOpportunitiesByContact({ locationId, contactId, secrets })
    : [];
  const existingOpportunity = foundOpportunities[0] || null;

  let opportunityId = existingOpportunity?.id || '';
  if (opportunityId) {
    const current = await fetchGhlOpportunity(opportunityId, locationId, secrets);
    await updateGhlOpportunity({
      opportunityId,
      pipelineId: current?.pipelineId || existingOpportunity.pipelineId,
      name: current?.name || existingOpportunity.name || 'TESTE MAPEAMENTO CRM',
      status: WON_STATUS,
      monetaryValue: TEST_VALUE,
      secrets,
    });
  } else {
    const pipelines = await fetchGhlPipelines(locationId, secrets);
    const pipeline = pipelines[0];
    if (!pipeline) throw new Error('Nenhum pipeline encontrado no CRM para registrar a oportunidade de teste.');
    const created = await createGhlOpportunity({
      locationId,
      pipelineId: pipeline.id,
      pipelineStageId: (pipeline.stages || [])[0]?.id,
      contactId,
      name: 'TESTE MAPEAMENTO CRM - ERP Brazon',
      status: WON_STATUS,
      monetaryValue: TEST_VALUE,
      secrets,
    });
    opportunityId = created?.id || '';
  }

  return Response.json({
    success: true,
    test: true,
    contact_id: contactId,
    contact_action: existingContact ? 'atualizado' : 'criado',
    opportunity_id: opportunityId,
    opportunity_action: existingOpportunity ? 'atualizada' : 'criada',
    opportunity_status: WON_STATUS,
    monetary_value: TEST_VALUE,
  });
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const locationId = secrets.get('ghl_location_id');
    if (!locationId) return Response.json({ error: 'ghl_location_id não configurado.' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    if (body.test === true) return await sendTestSignal({ locationId });

    const svc = base44.asServiceRole.entities;
    const saleId = String(body.sale_id || '').trim();
    if (!saleId) return Response.json({ error: 'sale_id obrigatório.' }, { status: 400 });

    const sales = await svc.Sale.filter({ id: saleId });
    const sale = sales && sales[0];
    if (!sale) return Response.json({ error: 'Venda não encontrada.' }, { status: 404 });

    // Só sincroniza venda declarada como ganho: fora do Orçamento e não cancelada.
    if (sale.stage === 'Orçamento' || sale.stage === 'Cancelada' || sale.status === 'Cancelada') {
      return Response.json({ success: true, skipped: 'venda ainda não declarada como ganho' });
    }

    // Idempotência: cada venda é sincronizada uma única vez (erros permitem nova tentativa).
    const sent = await svc.CrmLeadSync.filter({ sale_id: saleId, status: 'Enviado' });
    if (sent && sent.length > 0) {
      return Response.json({ success: true, skipped: 'venda já sincronizada com o CRM', sent_at: sent[0].sent_at });
    }

    const clients = sale.client_id ? await svc.Client.filter({ id: sale.client_id }) : [];
    const client = (clients && clients[0]) || null;
    const clientName = client?.name || sale.client_name || '';
    const total = Number(sale.grand_total || 0);
    const problems = [];

    // 1) Contato no CRM — vínculo salvo → e-mail único → telefone único
    const contactBody = buildContactBody(client, sale);
    let contactId = '';
    let contactMatch = '';
    let contactAction = '';
    try {
      const resolved = await resolveUniqueGhlContact({ locationId, client, secrets });
      contactMatch = resolved.match;
      // O contato já existente no CRM é preservado mesmo se a atualização falhar — o negócio segue sendo sincronizado.
      contactId = resolved.contactId || '';
      const hasKey = Boolean(contactBody.email || contactBody.phone);
      if (resolved.match === 'ambíguo') {
        // Vários contatos do CRM casam com este cliente: nada é vinculado nem criado.
        await svc.IntegracaoLog.create({
          origem: 'vinculo',
          mensagem: `Venda ${sale.order_number || saleId}: ${resolved.candidates.length} contatos do CRM correspondem ao cliente ${clientName} (telefone/e-mail). Nada foi vinculado.`,
          status_http: 0,
          payload_resumido: {
            sale_id: saleId,
            client_id: client?.id || '',
            client_name: clientName,
            candidatos: resolved.candidates.slice(0, 5),
          },
        }).catch(() => {});
        problems.push('Contato não vinculado: mais de um contato do CRM corresponde a este cliente (telefone/e-mail). Ajuste o cadastro no CRM antes de reenviar.');
      } else if (!contactId && !hasKey) {
        problems.push('Contato não sincronizado: cliente sem e-mail e sem telefone cadastrado.');
      } else {
        const saved = await upsertGhlContact({
          locationId,
          contactId: resolved.contactId,
          body: contactBody,
          secrets,
        });
        contactAction = contactId ? 'atualizado' : 'criado';
        contactId = saved?.id || contactId;
      }
    } catch (error) {
      problems.push(`Contato: ${error.message}`);
    }

    // 2) Oportunidade: grava o valor do negócio e marca como Ganho
    let opportunityId = '';
    let opportunityMatch = '';
    let opportunityStage = '';
    let opportunity = null;
    // Alvo padrão das vendas ganhas: pipeline Comercial › etapa Venda Concretizada (resolvido sob demanda, 1x).
    let wonTarget;
    const getWonTarget = async () => {
      if (wonTarget === undefined) wonTarget = await findGhlWonTarget({ locationId, secrets });
      return wonTarget;
    };
    try {
      const resolved = await resolveOpportunityId({
        locationId,
        client,
        contactId,
        overrideId: String(body.opportunity_id || '').trim(),
      });
      opportunityId = resolved.opportunityId;
      opportunityMatch = resolved.match;

      if (!opportunityId) {
        // Sem oportunidade no CRM: cria no pipeline Comercial › etapa Venda Concretizada.
        const target = await getWonTarget();
        if (!target) {
          problems.push('Oportunidade não criada: pipeline "Comercial" com a etapa "Venda Concretizada" não encontrado no CRM.');
        } else if (!contactId) {
          problems.push('Oportunidade não criada: o contato do cliente não foi sincronizado.');
        } else {
          opportunity = await createGhlOpportunity({
            locationId,
            pipelineId: target.pipelineId,
            pipelineStageId: target.stageId,
            contactId,
            name: opportunityTitle(sale, clientName),
            status: WON_STATUS,
            monetaryValue: total,
            secrets,
          });
          opportunityId = opportunity?.id || '';
          opportunityMatch = 'criada';
          opportunityStage = `${target.pipelineName} › ${target.stageName}`;
        }
      } else {
        const current = await fetchGhlOpportunity(opportunityId, locationId, secrets);
        if (!current?.pipelineId) {
          problems.push('Oportunidade não sincronizada: pipeline do negócio não identificado no CRM.');
        } else {
          // Avança o negócio para a última etapa da própria pipeline, com status e valor atualizados.
          const lastStage = await findGhlLastStage({ locationId, pipelineId: current.pipelineId, secrets });
          opportunity = await updateGhlOpportunity({
            opportunityId,
            pipelineId: current.pipelineId,
            pipelineStageId: lastStage?.stageId,
            name: current.name || opportunityTitle(sale, clientName),
            status: WON_STATUS,
            monetaryValue: total,
            secrets,
          });
          if (lastStage) opportunityStage = `${lastStage.pipelineName} › ${lastStage.stageName}`;
        }
      }
    } catch (error) {
      problems.push(`Oportunidade: ${error.message}`);
    }

    // 3) Cache local do vínculo com o CRM
    const now = new Date().toISOString();
    if (client?.id) {
      const patch = { ghl_last_sync_date: now };
      if (contactId) patch.ghl_contact_id = contactId;
      if (opportunity) {
        patch.ghl_deal_id = opportunity.id || opportunityId;
        patch.ghl_deal_title = opportunity.name || client.ghl_deal_title || '';
        patch.ghl_deal_status = WON_STATUS;
        patch.ghl_deal_value = total;
        patch.ghl_last_deal_date = now;
      }
      await svc.Client.update(client.id, patch);
    }

    const allDone = Boolean(contactId) && Boolean(opportunity) && problems.length === 0;

    await svc.CrmLeadSync.create({
      sale_id: saleId,
      order_number: sale.order_number || '',
      client_id: sale.client_id || '',
      client_name: clientName,
      stage: sale.stage || '',
      status: allDone ? 'Enviado' : 'Erro',
      mensagem: allDone ? '' : problems.join(' | ').slice(0, 900),
      payload_resumido: {
        event: 'venda_ganha',
        origem: 'ERP Brazon',
        contact_id: contactId,
        contact_action: contactAction,
        contact_match: contactMatch,
        opportunity_id: opportunityId,
        opportunity_match: opportunityMatch,
        opportunity_pipeline_stage: opportunityStage,
        opportunity_status: opportunity ? WON_STATUS : '',
        monetary_value: total,
        order_number: sale.order_number || '',
        seller_name: sale.seller_name || '',
        items_summary: itemsSummary(sale.items),
        tags: ['venda-ganha', 'erp-brazon'],
      },
      sent_at: now,
    });

    if (!allDone) {
      return Response.json({ error: 'Sincronização parcial com o CRM.', problems }, { status: 502 });
    }

    return Response.json({
      success: true,
      sale_id: saleId,
      order_number: sale.order_number || '',
      client_name: clientName,
      contact_id: contactId,
      contact_action: contactAction,
      contact_match: contactMatch,
      opportunity_id: opportunityId,
      opportunity_match: opportunityMatch,
      opportunity_status: WON_STATUS,
      monetary_value: total,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}