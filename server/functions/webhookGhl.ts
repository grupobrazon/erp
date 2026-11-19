// Gerado de base44/functions/webhookGhl/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { secrets } from "../runtime.ts";
import { ghlFetch, fetchGhlOpportunity, fetchGhlContact, sendGhlWhatsAppMessage } from '../shared/ghlClient.ts';
import { resolveClientByContact } from '../shared/clientMatch.ts';
import { extractInboundMessage, matchesVipInterest, matchesNoConditions, matchesNoEquipment, replyNoConditions, replyVipClick } from '../shared/vipCampaign.ts';

// Webhook do GoHighLevel (Atlas) → ERP.
// Barreira de segurança: valida o locationId (ID da conta GHL) recebido no payload
// contra o ghl_location_id configurado no ERP. Sem token custom na URL.
// Trata eventos de Contato (ContactCreate/Update/Delete), Oportunidade (OpportunityCreate/Update/Delete)
// e mensagem recebida (InboundMessage) — resposta automática do botão "QUERO SER VIP".

export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const logErro = async (mensagem, status_http, payload) => {
      await base44.asServiceRole.entities.IntegracaoLog.create({
        origem: 'webhook', mensagem, status_http, payload_resumido: payload || {},
      }).catch(() => {});
    };

    const body = await req.json().catch(() => null);
    if (!body) {
      await logErro('Body inválido no webhook do GHL', 400, {});
      return Response.json({ error: 'Body inválido' }, { status: 400 });
    }

    // --- Barreira: locationId (ID da conta GHL) ---
    const settings = await base44.asServiceRole.entities.SystemSetting.list('-created_date', 1);
    const cfg = settings[0] || {};
    const expectedLocationId = secrets.get("ghl_location_id") || cfg.ghl_location_id || "";
    if (!expectedLocationId) {
      await logErro('ghl_location_id não configurado (secret/SystemSetting) — webhook rejeitado', 400, {});
      return Response.json({ error: 'GHL não configurado' }, { status: 400 });
    }
    cfg.ghl_location_id = expectedLocationId;
    const payloadLocationId = body.locationId || (body.location && body.location.id);
    if (!payloadLocationId) {
      await logErro('Webhook GHL sem locationId no payload', 403, { type: body.type });
      return Response.json({ error: 'locationId ausente' }, { status: 403 });
    }
    if (payloadLocationId !== expectedLocationId) {
      await logErro('Webhook GHL rejeitado: locationId divergente', 403, { recebido: payloadLocationId });
      return Response.json({ error: 'Location ID divergente' }, { status: 403 });
    }

    const eventType = String(body.type || body.event || '');

    // --- Mensagem recebida (resposta do cliente no WhatsApp) ---
    // Precisa vir antes do ramo de contato: o payload de mensagem também traz contactId.
    if (/Message/i.test(eventType) || body.message || body.messageId) {
      return await handleInboundMessage(body, cfg, base44, logErro);
    }

    // --- Oportunidade (deal) ---
    if (/Opportunit/i.test(eventType) || body.opportunity || body.opportunityId) {
      return await handleOpportunity(body, cfg, base44, logErro);
    }

    // --- Contato ---
    if (/Contact/i.test(eventType) || body.contact || body.contactId) {
      return await handleContact(body, cfg, base44, logErro);
    }

    await logErro('Webhook GHL com tipo de evento não tratado', 0, { type: eventType, ...rawBody(body) });
    return Response.json({ ok: true, ignored: `unhandled type: ${eventType}` });
  } catch (error) {
    await base44.asServiceRole.entities.IntegracaoLog.create({
      origem: 'webhook', mensagem: error.message, status_http: 500, payload_resumido: { etapa: 'execucao' },
    }).catch(() => {});
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Diagnóstico temporário: guarda o payload cru recebido do CRM (para mapear eventos fora do padrão do Atlas).
function rawBody(body) {
  try {
    return { raw: JSON.stringify(body || {}).slice(0, 1800) };
  } catch (e) {
    return {};
  }
}

// ---- Contato ----
// Extrai o ID do contato dos formatos possíveis de payload (eventos nativos do GHL e webhook customizado do Atlas).
function extractContactId(body) {
  const cands = [
    body.contactId, body.contact_id, body.id,
    body.contact && (body.contact.id || body.contact.contactId || body.contact.contact_id),
    body.data && (body.data.contactId || (body.data.contact && (body.data.contact.id || body.data.contact.contactId))),
    body.customData && (body.customData.contactId || body.customData.contact_id),
  ];
  for (const c of cands) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

async function handleContact(body, cfg, base44, logErro) {
  const contactId = extractContactId(body);
  if (!contactId) {
    await logErro('Webhook de contato GHL sem contactId', 0, rawBody(body));
    return Response.json({ ok: true, ignored: 'no contactId' });
  }

  // Delete: apenas registra, não busca
  if (/Delete/i.test(body.type || '')) {
    return Response.json({ ok: true, ignored: 'contact deleted (sem ação no ERP)' });
  }

  const res = await ghlFetch(`/contacts/${contactId}`, {
    method: "GET",
    query: { locationId: cfg.ghl_location_id },
    secrets,
    version: "2021-07-28",
  });
  if (!res.ok) {
    await logErro(`GHL fetch falhou (${res.status}) ao buscar contato`, res.status, { contactId, ...rawBody(body) });
    return Response.json({ error: `GHL fetch falhou (${res.status})` }, { status: 502 });
  }
  const data = await res.json();
  const ghl = data.contact || data;
  if (!ghl || !ghl.id) {
    await logErro('Contato não encontrado no GHL', 404, { contactId });
    return Response.json({ ok: true, ignored: 'contact not found in GHL' });
  }

  const { client, match, candidates } = await resolveClientByContact(base44.asServiceRole.entities, ghl);
  if (!client) {
    await logErro(
      match === 'ambíguo'
        ? 'Webhook GHL (contato) com vínculo ambíguo: mais de um cliente do ERP casa por telefone/e-mail — nada foi vinculado'
        : 'Webhook GHL (contato) sem match no ERP (telefone/e-mail não casaram)',
      0,
      { contactId, email: ghl.email, telefone: ghl.phone, nome: ghl.name, candidatos: candidates },
    );
    return Response.json({ ok: true, ignored: match === 'ambíguo' ? 'ambiguous ERP match' : 'no ERP match' });
  }

  const now = new Date().toISOString();
  await base44.asServiceRole.entities.Client.update(client.id, {
    ghl_contact_id: ghl.id,
    ghl_tags: Array.isArray(ghl.tags) ? ghl.tags : [],
    ghl_last_activity_date: ghl.dateAdded || ghl.dateUpdatedAt || now,
    ghl_last_sync_date: now,
  });

  return Response.json({ ok: true, matched: client.id });
}

// ---- Oportunidade (deal) ----
async function handleOpportunity(body, cfg, base44, logErro) {
  const oppId = (body.opportunity && body.opportunity.id) || body.opportunityId || body.id;
  if (!oppId) {
    await logErro('Webhook de oportunidade GHL sem opportunityId', 0, { type: body.type });
    return Response.json({ ok: true, ignored: 'no opportunityId' });
  }

  let opp = body.opportunity;
  if (!opp || !opp.id || !opp.contactId) {
    try {
      opp = await fetchGhlOpportunity(oppId, cfg.ghl_location_id, secrets);
    } catch (e) {
      await logErro(`Falha ao buscar oportunidade ${oppId} no GHL: ${e.message}`, 502, { oppId });
      return Response.json({ error: 'GHL fetch falhou' }, { status: 502 });
    }
  }
  if (!opp || !opp.id) {
    await logErro('Oportunidade não encontrada no GHL', 404, { oppId });
    return Response.json({ ok: true, ignored: 'opportunity not found' });
  }

  const ghlContactId = opp.contactId;
  if (!ghlContactId) {
    await logErro('Oportunidade GHL sem contactId vinculado', 0, { oppId });
    return Response.json({ ok: true, ignored: 'opportunity without contact' });
  }

  // 1. Tenta casar pelo ghl_contact_id já vinculado a um cliente do ERP
  let client = null;
  const byGhl = await base44.asServiceRole.entities.Client.filter({ ghl_contact_id: ghlContactId });
  if (byGhl && byGhl.length > 0) client = byGhl[0];

  // 2. Fallback: busca o contato no GHL e casa por email → nome
  if (!client) {
    try {
      const res = await ghlFetch(`/contacts/${ghlContactId}`, {
        method: "GET", query: { locationId: cfg.ghl_location_id }, secrets, version: "2021-07-28",
      });
      if (res.ok) {
        const data = await res.json();
        const ghl = data.contact || data;
        if (ghl && ghl.id) {
          client = (await resolveClientByContact(base44.asServiceRole.entities, ghl)).client;
        }
      }
    } catch (e) { /* ignora — fallback best-effort */ }
  }

  if (!client) {
    await logErro('Oportunidade GHL sem cliente correspondente no ERP', 0, { oppId, ghlContactId });
    return Response.json({ ok: true, ignored: 'no ERP client for opportunity' });
  }

  const now = new Date().toISOString();
  const dealCount = (client.ghl_deal_count || 0) + 1;
  await base44.asServiceRole.entities.Client.update(client.id, {
    ghl_contact_id: client.ghl_contact_id || ghlContactId,
    ghl_deal_id: opp.id,
    ghl_deal_title: opp.name || opp.title || '',
    ghl_deal_status: opp.status || '',
    ghl_deal_value: typeof opp.monetaryValue === 'number' ? opp.monetaryValue : Number(opp.monetaryValue) || 0,
    ghl_deal_count: dealCount,
    ghl_last_deal_date: opp.dateUpdated || opp.dateAdded || now,
    ghl_last_sync_date: now,
  });

  return Response.json({ ok: true, client: client.id, deal: opp.id });
}

// ---- Mensagem recebida: cliques dos botões da campanha (Atlas) ----
// "QUERO SER VIP" → o ERP gera o link de adesão no cadastro do cliente e responde
//   com a imagem, o áudio e o link.
// "SEM CONDIÇÕES AGORA" → o ERP devolve a condição especial de troca de refil.
async function handleInboundMessage(body, cfg, base44, logErro) {
  const svc = base44.asServiceRole.entities;
  const { text, contactId } = extractInboundMessage(body);

  const vip = matchesVipInterest(text);
  const semCondicoes = matchesNoConditions(text);
  if (!vip && !semCondicoes) {
    // Diagnóstico temporário: registra o que o cliente escreveu/clicou para ajustar o gatilho.
    await logErro('Mensagem recebida sem clique da campanha (diagnóstico)', 0, { texto: String(text || '').slice(0, 200), ...rawBody(body) });
    return Response.json({ ok: true, ignored: 'mensagem sem clique da campanha' });
  }
  // "SEM EQUIPAMENTO" (cliente não tem mais o purificador): a oferta de troca de
  // refil não é enviada, mesmo que a mensagem também fale em condições.
  if (!vip && matchesNoEquipment(text)) {
    await logErro('Resposta automática ignorada: o cliente informou que não tem mais o equipamento', 0, { texto: String(text || '').slice(0, 200), contactId });
    return Response.json({ ok: true, ignored: 'cliente sem equipamento' });
  }
  if (!contactId) {
    await logErro('Resposta automática sem contactId no webhook', 0, { text });
    return Response.json({ ok: true, ignored: 'no contactId' });
  }

  const settings = await svc.SystemSetting.list('-created_date', 1);
  const s = (settings && settings[0]) || {};
  if (semCondicoes && !s.noconf_reply_enabled) {
    return Response.json({ ok: true, ignored: 'resposta automática "sem condições" desativada' });
  }
  if (vip && !s.vip_reply_enabled) {
    return Response.json({ ok: true, ignored: 'resposta automática VIP desativada' });
  }

  const contact = await fetchGhlContact(contactId, cfg.ghl_location_id, secrets);
  if (!contact) {
    await logErro('Resposta automática: contato não encontrado no CRM', 404, { contactId });
    return Response.json({ ok: true, ignored: 'contact not found in GHL' });
  }

  const result = semCondicoes
    ? await replyNoConditions({ svc, cfg, settings: s, contact, log: logErro })
    : await replyVipClick({
      svc, cfg, settings: s, contact, createdBy: 'Resposta automática (Campanha)', log: logErro,
    });
  if (!result.ok && result.motivo === 'falha no envio') {
    return Response.json({ ok: false, client: result.client && result.client.id, token: result.token, envio_status: result.envio_status });
  }
  if (!result.ok) {
    return Response.json({ ok: true, ignored: result.motivo });
  }
  return Response.json({ ok: true, client: result.client.id, token: result.token, link_gerado: result.link_gerado, midias: result.midias });
}