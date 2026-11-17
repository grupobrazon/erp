// Shared helpers for GoHighLevel (LeadConnector) API integration.
// Used by pullGhlUpdates and webhookGhl backend functions.

import { contactPhones, phoneE164, samePhone } from "./phoneMatch.ts";

const GHL_BASE_URL = "https://services.leadconnectorhq.com";

export function getGhlToken(secrets) {
  const token = secrets.get("GHL_API_TOKEN");
  if (!token) throw new Error("GHL_API_TOKEN não configurado. Cadastre o secret no painel do app.");
  return token;
}

export async function ghlFetch(path, { method = "GET", query = {}, body, secrets, version = "2021-07-28" }) {
  const token = getGhlToken(secrets);
  const url = new URL(GHL_BASE_URL + path);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  let attempt = 0;
  while (true) {
    const res = await fetch(url.toString(), {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
        "Version": version,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && attempt < 3) {
      const wait = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, wait));
      attempt++;
      continue;
    }
    return res;
  }
}

// Normalize email for matching
export function normalizeEmail(email) {
  if (!email) return "";
  return String(email).trim().toLowerCase();
}

// Normalize name for matching (uppercase, remove accents/special chars, collapse spaces)
export function normalizeName(name) {
  if (!name) return "";
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Fetch all contacts from GHL with cursor pagination (startAfterId/startAfter)
export async function fetchAllGhlContacts(locationId, secrets) {
  const all = [];
  const limit = 100;
  let startAfterId = undefined;
  let startAfter = undefined;
  let total = Infinity;
  let safety = 0;
  while (all.length < total && safety < 1000) {
    safety++;
    const query = { locationId, limit };
    if (startAfterId) query.startAfterId = startAfterId;
    if (startAfter !== undefined) query.startAfter = startAfter;
    const res = await ghlFetch("/contacts/", {
      method: "GET",
      query,
      secrets,
      version: "2021-07-28",
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`GHL GET /contacts/ falhou (${res.status}): ${txt}`);
    }
    const data = await res.json();
    const contacts = data.contacts || [];
    // O total vem em meta.total (a API não devolve mais "count" na raiz). Sem isso a
    // leitura parava na primeira página e o pull enxergava só 100 contatos.
    const totalCount = Number(data?.meta?.total ?? data?.count ?? 0);
    if (totalCount > 0) total = totalCount;
    all.push(...contacts);
    if (contacts.length < limit) break;
    const last = contacts[contacts.length - 1];
    if (!last || !last.id || last.id === startAfterId) break;
    startAfterId = last.id;
    startAfter = last.dateAdded ? new Date(last.dateAdded).getTime() : undefined;
  }
  return all;
}

// Uma página da lista de contatos, com paginação por cursor (startAfterId + startAfter).
// Usada pela auditoria de vínculos, que lê a lista por partes para não estourar o tempo.
export async function fetchGhlContactPage(locationId, secrets, { limit = 100, startAfterId, startAfter } = {}) {
  const query = { locationId, limit };
  if (startAfterId) query.startAfterId = startAfterId;
  if (startAfter !== undefined && startAfter !== null) query.startAfter = startAfter;
  const res = await ghlFetch("/contacts/", { method: "GET", query, secrets, version: "2021-07-28" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GHL GET /contacts/ falhou (${res.status}): ${txt}`);
  }
  const data = await res.json().catch(() => ({}));
  const contacts = Array.isArray(data.contacts) ? data.contacts : [];
  const total = Number(data?.meta?.total ?? 0);
  return { contacts, total };
}

// Envia uma mensagem de WhatsApp para um contato do GHL via Conversations API.
// Best-effort: retorna { ok, status, data } sem lançar — quem chama decide o que fazer com a falha.
// Requer que o contato exista no GHL (ghl_contact_id) e que a conta tenha WhatsApp configurado.
// Nota: mensagens business-initiated fora da janela de 24h do Meta podem exigir template aprovado.
export async function sendGhlWhatsAppMessage(contactId, message, locationId, secrets, attachments = []) {
  try {
    const body = { type: "WhatsApp", contactId, message, locationId };
    // Mídia (imagem/áudio) vai por link público — o WhatsApp baixa o arquivo da URL.
    const media = (Array.isArray(attachments) ? attachments : []).filter(Boolean);
    if (media.length) body.attachments = media;
    const res = await ghlFetch("/conversations/messages", {
      method: "POST",
      body,
      secrets,
      version: "2021-07-28",
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: e.message } };
  }
}

// Envia um MODELO de mensagem aprovado. É o único jeito de iniciar conversa de WhatsApp
// fora da janela de atendimento do Meta (mensagem comum é recusada nesse caso).
// Duas formas aceitas pelo CRM: pelo ID do modelo (templateId) ou pelo nome + idioma, que é
// o formato que a API do WhatsApp entende (whatsapp.template). "variables" preenche as
// variáveis na ordem ({{1}} = primeiro nome, {{2}} = segundo valor, ...).
export async function sendGhlWhatsAppTemplate(contactId, ref, locationId, secrets) {
  const dados = typeof ref === "string" ? { id: ref } : (ref || {});
  const variaveis = dados.variables || {};
  const corpoModelo = {
    type: "WhatsApp",
    contactId,
    locationId,
    // O CRM recusa o envio sem um texto no corpo, mesmo usando modelo ("no message or
    // attachments"): vai o texto do próprio modelo como conteúdo de apoio.
    message: String(dados.message || '').trim() || 'Mensagem automática',
    whatsapp: {
      type: "template",
      template: { name: dados.name, lang: dados.language },
      placeholders: {
        header: [],
        body: Object.keys(variaveis).sort().map((chave) => variaveis[chave]),
        buttons: [],
      },
    },
  };
  try {
    const res = await ghlFetch("/conversations/messages", {
      method: "POST",
      body: dados.id ? { type: "WhatsApp", contactId, locationId, templateId: dados.id } : corpoModelo,
      secrets,
      version: "2021-07-28",
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: e.message } };
  }
}

// Conversa de um contato no CRM. O campo lastInboundWhatsappMessageDate diz quando o
// cliente escreveu pela última vez — é o que indica que a janela de 24h reabriu.
export async function findContactConversation(contactId, locationId, secrets) {
  if (!contactId) return null;
  const res = await ghlFetch("/conversations/search", {
    method: "GET",
    query: { locationId, contactId, limit: 5 },
    secrets,
    version: "2021-07-28",
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const lista = Array.isArray(data.conversations) ? data.conversations : [];
  return lista.find(c => c.contactId === contactId) || lista[0] || null;
}

// Busca um contato no GHL (nome, email, telefone, tags). Retorna null quando não existe.
export async function fetchGhlContact(contactId, locationId, secrets) {
  const res = await ghlFetch(`/contacts/${contactId}`, {
    method: "GET",
    query: { locationId },
    secrets,
    version: "2021-07-28",
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.contact || data || null;
}

// Constrói a mensagem de "produto postado" com o(s) link(s) de rastreio do Melhor Envio.
// Aceita uma string única (1 volume) ou um array de URLs (múltiplos volumes).
// Espelha o template do MelhorEnvioStatusCard.jsx (UI) — manter os dois sincronizados.
export function buildShippingNotificationMessage(clientName, trackingUrls) {
  const nome = clientName || "cliente";
  const links = Array.isArray(trackingUrls)
    ? trackingUrls.filter(Boolean)
    : (trackingUrls ? [trackingUrls] : []);

  let rastreioSection;
  if (links.length === 0) {
    rastreioSection = "🔎 Acompanhe seu pedido:\n(será enviado em breve)";
  } else if (links.length === 1) {
    rastreioSection = `🔎 Acompanhe seu pedido:\n${links[0]}`;
  } else {
    const volLines = links.map((url, i) => `📦 Volume ${i + 1}: ${url}`).join("\n");
    rastreioSection = `🔎 Acompanhe seus pedidos (${links.length} volumes):\n${volLines}`;
  }

  return `Olá, ${nome}! 😊

Temos uma ótima notícia: seu produto já foi postado e está a caminho! 📦✨

Agradecemos sinceramente pela confiança em escolher a Brazon e, principalmente, pela compreensão durante esse período.

Sabemos que, em alguns casos, não conseguimos proporcionar a experiência que gostaríamos até aqui, especialmente em relação aos prazos de entrega, e pedimos desculpas por qualquer transtorno causado.

Estamos trabalhando intensamente para normalizar nossas operações e aprimorar nossos processos. A sua confiança é muito importante para nós.

Você pode acompanhar todas as atualizações da entrega pelo link abaixo:

${rastreioSection}

Após a conclusão da sua entrega, enviaremos uma pesquisa de satisfação. Sua opinião será muito importante para entendermos onde podemos melhorar e continuarmos evoluindo para proporcionar uma experiência cada vez melhor aos nossos clientes.

Mais uma vez, obrigada pela confiança, pela compreensão e por escolher a Brazon. 💙`;
}

// Fetch a single opportunity (deal) from GHL by id
export async function fetchGhlOpportunity(opportunityId, locationId, secrets) {
  const res = await ghlFetch(`/opportunities/${opportunityId}`, {
    method: "GET",
    query: { locationId },
    secrets,
    version: "2021-07-28",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GHL GET /opportunities falhou (${res.status}): ${txt}`);
  }
  const data = await res.json();
  return data.opportunity || data;
}

// --- Contatos (sincronização de vendas ganhas) ---

// Busca contatos no GHL por nome, e-mail ou telefone (telefone com DDI, ex: +5511999990000).
export async function searchGhlContacts({ locationId, query, secrets }) {
  const term = String(query || "").trim();
  if (!term) return [];
  const res = await ghlFetch("/contacts/", {
    method: "GET",
    query: { locationId, query: term, limit: 20 },
    secrets,
    version: "2021-07-28",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GHL GET /contacts/ (busca) falhou (${res.status}): ${txt}`);
  }
  const data = await res.json();
  return data.contacts || [];
}

// Primeiro contato que casa com o termo.
export async function searchGhlContact({ locationId, query, secrets }) {
  const list = await searchGhlContacts({ locationId, query, secrets });
  return list[0] || null;
}

// Contato do CRM de um cliente do ERP: usa o vínculo já salvo no cadastro e, quando
// ainda não existe, procura pelo telefone. Só devolve contato quando UM único
// contato do CRM tem exatamente esse telefone — com dois ou mais candidatos
// devolve "" (melhor não enviar do que enviar no contato de outra pessoa).
export async function resolveGhlContactId({ client, phone, locationId, secrets }) {
  const vinculado = (client && client.ghl_contact_id) || "";
  if (vinculado) return vinculado;
  if (!phone) return "";
  const query = phoneE164(phone);
  if (!query) return "";
  const encontrados = await searchGhlContacts({ locationId, query, secrets }).catch(() => []);
  const hits = (encontrados || []).filter(
    (contact) => contact && contact.id && contactPhones(contact).some((stored) => samePhone(stored, phone)),
  );
  return hits.length === 1 ? hits[0].id : "";
}

// Atualiza o contato quando já existe (contactId) ou cria um novo contato.
export async function upsertGhlContact({ locationId, contactId, body, secrets }) {
  // A conta (locationId) só é aceita na criação; a atualização rejeita o campo.
  const res = await ghlFetch(contactId ? `/contacts/${contactId}` : "/contacts/", {
    method: contactId ? "PUT" : "POST",
    body: contactId ? { ...body } : { ...body, locationId },
    secrets,
    version: "2021-07-28",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detalhe = data.message || data.error || JSON.stringify(data).slice(0, 300);
    throw new Error(`GHL ${contactId ? "PUT" : "POST"} /contacts falhou (${res.status}): ${detalhe}`);
  }
  return data.contact || data;
}

// --- Oportunidades (valor do negócio + status Ganho) ---

// Pipelines e etapas configurados na conta.
export async function fetchGhlPipelines(locationId, secrets) {
  const res = await ghlFetch("/opportunities/pipelines", {
    method: "GET",
    query: { locationId },
    secrets,
    version: "2021-07-28",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GHL GET /opportunities/pipelines falhou (${res.status}): ${txt}`);
  }
  const data = await res.json();
  return data.pipelines || [];
}

// Pipeline/etapa padrão das vendas ganhas do ERP.
export const GHL_WON_PIPELINE = "Comercial";
export const GHL_WON_STAGE = "Venda Concretizada";

// Localiza o pipeline Comercial e a etapa Venda Concretizada na conta (comparação sem acento/maiúscula).
// Retorna null quando a conta não tem esse pipeline/etapa (quem chama registra o motivo e não cria nada).
export async function findGhlWonTarget({ locationId, secrets }) {
  const pipelines = await fetchGhlPipelines(locationId, secrets);
  const pipeline = pipelines.find((p) => normalizeName(p.name) === normalizeName(GHL_WON_PIPELINE));
  if (!pipeline) return null;
  const stage = (pipeline.stages || []).find((s) => normalizeName(s.name) === normalizeName(GHL_WON_STAGE));
  if (!stage) return null;
  return { pipelineId: pipeline.id, pipelineName: pipeline.name, stageId: stage.id, stageName: stage.name };
}

// Última etapa do pipeline do próprio negócio (etapa final configurada na conta).
// Usada para avançar a oportunidade de uma venda ganha dentro da pipeline em que ela já está.
export async function findGhlLastStage({ locationId, pipelineId, secrets }) {
  const pipelines = await fetchGhlPipelines(locationId, secrets);
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const stages = pipeline?.stages || [];
  const last = stages[stages.length - 1];
  if (!last) return null;
  return { pipelineId: pipeline.id, pipelineName: pipeline.name, stageId: last.id, stageName: last.name };
}

// Oportunidades existentes de um contato (para reaproveitar em vez de duplicar).
export async function searchGhlOpportunitiesByContact({ locationId, contactId, secrets }) {
  const res = await ghlFetch("/opportunities/search", {
    method: "GET",
    query: { location_id: locationId, contact_id: contactId, limit: 20 },
    secrets,
    version: "2021-07-28",
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return data.opportunities || [];
}

// Atualiza a oportunidade existente gravando o valor do negócio e o status (won = Ganho).
export async function updateGhlOpportunity({ opportunityId, pipelineId, pipelineStageId, name, status, monetaryValue, secrets }) {
  const body = { pipelineId, name, status, monetaryValue };
  // A etapa só pode ser trocada dentro do mesmo pipeline.
  if (pipelineStageId) body.pipelineStageId = pipelineStageId;
  const res = await ghlFetch(`/opportunities/${opportunityId}`, {
    method: "PUT",
    body,
    secrets,
    version: "2021-07-28",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detalhe = data.message || data.error || JSON.stringify(data).slice(0, 300);
    throw new Error(`GHL PUT /opportunities/${opportunityId} falhou (${res.status}): ${detalhe}`);
  }
  return data.opportunity || data;
}

// Cria a oportunidade no pipeline/etapa informados (vendas ganhas e sinal de teste).
export async function createGhlOpportunity({ locationId, pipelineId, pipelineStageId, contactId, name, status, monetaryValue, secrets }) {
  const res = await ghlFetch("/opportunities/", {
    method: "POST",
    body: { locationId, pipelineId, pipelineStageId, contactId, name, status, monetaryValue },
    secrets,
    version: "2021-07-28",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detalhe = data.message || data.error || JSON.stringify(data).slice(0, 300);
    throw new Error(`GHL POST /opportunities falhou (${res.status}): ${detalhe}`);
  }
  return data.opportunity || data;
}

// --- Conversas (resposta automática da campanha VIP) ---

// Conversas mais recentes da conta (mais recentes primeiro).
export async function fetchRecentConversations(locationId, secrets, limit = 100) {
  const res = await ghlFetch("/conversations/search", {
    method: "GET",
    query: { locationId, limit },
    secrets,
    version: "2021-07-28",
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return data.conversations || [];
}

// Página do histórico de conversas (mais recentes primeiro).
// startAfterDate em epoch ms continua a leitura a partir de uma data, andando
// para trás no tempo — é o que permite ler além das 100 conversas devolvidas de
// uma vez só (formato ISO é rejeitado pela API).
export async function fetchConversationPage(locationId, secrets, { limit = 100, startAfterDate } = {}) {
  const res = await ghlFetch("/conversations/search", {
    method: "GET",
    query: { locationId, limit, sort: "desc", startAfterDate },
    secrets,
    version: "2021-07-28",
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return data.conversations || [];
}

// Mensagens de uma conversa em ordem cronológica (mais antiga primeiro).
export async function fetchConversationMessages(conversationId, secrets, limit = 30) {
  const res = await ghlFetch(`/conversations/${conversationId}/messages`, {
    method: "GET",
    query: { limit },
    secrets,
    version: "2021-07-28",
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  const list = (data && data.messages && data.messages.messages) || (data && data.messages) || [];
  return (Array.isArray(list) ? list : [])
    .filter((m) => m && typeof m.body === "string")
    .sort((a, b) => new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime());
}