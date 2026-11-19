// Cópia de base44/shared/vipCampaign.ts gerada por tools/port_function.py.
// Resposta automática do botão "QUERO SER VIP" (campanha de WhatsApp no Atlas/GHL).
// Quando o cliente clica no botão, o ERP gera/reaproveita o link de adesão VIP no
// cadastro dele e responde com imagem, áudio e link. Usado pelo webhookGhl.

// Endereço público do app — manter igual a src/lib/publicAppUrl.js
import { secrets } from "../runtime.ts";
import { sendGhlWhatsAppMessage } from "./ghlClient.ts";
import { resolveClientByContact } from "./clientMatch.ts";

export const PUBLIC_APP_URL = "https://sistemabrazon.com.br";

export const programLink = (token) => `${PUBLIC_APP_URL}/programa/${token}`;

export function onlyDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

// Telefone sem DDI (padrão do ERP: DDD + número)
export function localPhone(value) {
  const digits = onlyDigits(value);
  if (digits.length >= 12 && digits.startsWith("55")) return digits.slice(2);
  return digits;
}

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

// O clique no botão do WhatsApp chega como texto no webhook.
export function matchesVipInterest(text) {
  const normalized = normalizeText(text);
  return !!normalized && normalized.includes("QUERO SER VIP");
}

// Texto e contato de um evento de mensagem recebida.
export function extractInboundMessage(body) {
  const message = body && typeof body.message === "object" && body.message ? body.message : {};
  const candidates = [body?.body, message.body, body?.text, message.text, body?.messageBody, message.message];
  const text = candidates.find((value) => typeof value === "string" && value.trim()) || "";
  const custom = body?.customData || body?.data || {};
  const contactId =
    body?.contactId || body?.contact_id || body?.contact?.id || body?.contact?.contactId ||
    message.contactId || message.contact?.id ||
    custom.contactId || custom.contact_id || custom.contact?.id || "";
  return {
    text: String(text).trim(),
    contactId: typeof contactId === "string" ? contactId.trim() : "",
  };
}

// Nome completo do contato do CRM (o CRM costuma mandar nome e sobrenome separados).
export function contactName(contact) {
  const full = String(contact?.name || "").trim();
  if (full) return full;
  return [contact?.firstName, contact?.lastName]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

// Cliente do ERP correspondente ao contato do CRM (vínculo salvo → e-mail único →
// telefone único — ver clientMatch). Ambiguidade não gera vínculo: melhor não
// responder do que mandar o link de adesão do cadastro de outra pessoa.
export async function findVipClient(svc, contact) {
  const { client } = await resolveClientByContact(svc, contact);
  return client;
}

// Token do link de adesão (mesmo formato usado na ficha do cliente).
function makeAdhesionToken(category) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(8);
  crypto.getRandomValues(bytes);
  let suffix = "";
  bytes.forEach((n) => { suffix += chars[n % chars.length]; });
  return `${category === "Programa VIP" ? "VIP" : "PRO"}-${suffix}`;
}

// Um link por programa/cliente: reaproveita o existente e só cria outro quando não há.
export async function ensureVipAdhesion({ svc, client, promotion, createdBy, phone, existing }) {
  const lista = existing || (await svc.PromotionAdhesion.filter({ client_id: client.id, promotion_id: promotion.id }));
  const current = (lista || []).find((adhesion) => adhesion.status !== "Cancelada");
  if (current) return { adhesion: current, created: false };

  const clientPhone = localPhone(phone) ||
    [client.phone1, client.phone2, client.phone3, client.phone4, client.phone5].find(Boolean) || "";

  const adhesion = await svc.PromotionAdhesion.create({
    promotion_id: promotion.id,
    promotion_name: promotion.name,
    promotion_category: promotion.category,
    client_id: client.id,
    client_name: client.name || "",
    client_document: client.document || "",
    client_email: client.email || "",
    client_phone: clientPhone,
    token: makeAdhesionToken(promotion.category),
    status: "Link Gerado",
    generated_by: createdBy,
    generated_date: new Date().toISOString(),
  });
  return { adhesion, created: true };
}

export function buildVipReplyMessage(template, { clientName, link, token }) {
  const full = String(clientName || "").trim();
  const firstName = full.split(/\s+/)[0] || "cliente";
  return String(template || "")
    .replace(/\{cliente\}/g, firstName)
    .replace(/\{link\}/g, link)
    .replace(/\{codigo\}/g, token || "");
}

// Programa VIP configurado no ERP (senão o primeiro programa VIP ativo).
export async function loadVipPromotion(svc, settings) {
  if (settings && settings.vip_reply_promotion_id) {
    const byId = await svc.Promotion.filter({ id: settings.vip_reply_promotion_id });
    if (byId && byId[0]) return byId[0];
  }
  const list = await svc.Promotion.filter({ category: "Programa VIP", status: "Ativa" });
  return (list && list[0]) || null;
}

// Resposta automática do clique "QUERO SER VIP" para um contato do CRM.
// Usada pelo webhook (clique em tempo real) e pela varredura das conversas.
// Responde todo contato que clicou no botão — a tag da campanha no CRM não é
// exigida: quem clica e fica sem a tag também precisa receber o link.
// dryRun = true avalia tudo (cliente, programa) sem gerar link nem enviar.
export async function replyVipClick({ svc, cfg, settings, contact, createdBy, dryRun = false, log }) {
  const logar = typeof log === "function" ? log : async () => {};
  const contactId = contact && contact.id;

  const { client, match, candidates } = await resolveClientByContact(svc, contact);
  if (!client) {
    const ambiguo = match === "ambíguo";
    await logar(
      ambiguo
        ? "Resposta VIP não enviada: mais de um cliente do ERP casa com este contato do CRM (telefone/e-mail) — vínculo ambíguo, nada foi vinculado"
        : "Resposta VIP sem cliente correspondente no ERP (telefone/e-mail não casaram)",
      0,
      { contactId, nome: contactName(contact), email: contact && contact.email, telefone: contact && contact.phone, candidatos: candidates },
    );
    return {
      ok: false,
      motivo: ambiguo ? "vínculo ambíguo" : "no ERP match",
      contato: contactName(contact),
      telefone: contact && contact.phone,
    };
  }

  const promotion = await loadVipPromotion(svc, settings);
  if (!promotion) {
    await logar("Resposta VIP sem programa VIP ativo configurado", 0, { promotion_id: (settings && settings.vip_reply_promotion_id) || null });
    return { ok: false, motivo: "sem programa VIP", cliente: client.name };
  }

  // Uma consulta só por cliente: reaproveita a adesão existente e evita responder
  // de novo quando o cliente conversa mais depois do clique, quando a IA do Atlas
  // já respondeu antes da varredura passar ou quando o vendedor já gerou o link
  // manualmente na ficha do cliente (nesse caso a adesão já foi encaminhada).
  const existentes = await svc.PromotionAdhesion.filter({ client_id: client.id, promotion_id: promotion.id });
  const atual = (existentes || []).find((a) => a.status !== "Cancelada");
  if (atual) {
    const enviadoPelaAutomacao = !!atual.sent_at;
    await logar(
      enviadoPelaAutomacao
        ? "Resposta VIP ignorada: o link já havia sido enviado a este cliente"
        : "Resposta VIP ignorada: o cliente já possui link de adesão gerado (envio manual pelo vendedor)",
      0,
      { contactId, cliente: client.name, status: atual.status, gerado_em: atual.generated_date, enviado_em: atual.sent_at || null },
    );
    return { ok: false, motivo: enviadoPelaAutomacao ? "link já enviado" : "link já gerado", ja_enviado: true, client };
  }

  if (dryRun) {
    return { ok: true, simulado: true, client, motivo: atual ? "link já existe" : "link seria gerado" };
  }

  const phone = localPhone(contact.phone);
  const { adhesion, created } = await ensureVipAdhesion({ svc, client, promotion, createdBy, phone, existing: existentes });
  const link = programLink(adhesion.token);
  const message = buildVipReplyMessage(settings && settings.vip_reply_message, {
    clientName: client.name || contactName(contact), link, token: adhesion.token,
  });
  const attachments = [(settings && settings.vip_reply_image_url), (settings && settings.vip_reply_audio_url)].filter(Boolean);
  const send = await sendGhlWhatsAppMessage(contactId, message, cfg.ghl_location_id, secrets, attachments);

  if (!send.ok) {
    await logar(`Falha ao enviar a resposta automática VIP (${send.status})`, send.status || 502, { contactId, envio: send.data });
    return { ok: false, motivo: "falha no envio", client, token: adhesion.token, envio_status: send.status };
  }

  const now = new Date().toISOString();
  await svc.PromotionAdhesion.update(adhesion.id, { sent_at: now, sent_to: phone || "WhatsApp (Atlas)" });
  await svc.Client.update(client.id, {
    ghl_contact_id: client.ghl_contact_id || contactId,
    ghl_tags: Array.isArray(contact.tags) ? contact.tags : (client.ghl_tags || []),
    ghl_last_sync_date: now,
  });

  return { ok: true, client, token: adhesion.token, link_gerado: created, midias: attachments.length };
}

// ---- Resposta automática de recuperação ("SEM CONDIÇÕES AGORA") ----
// Quem responde à campanha que não tem condições no momento recebe de volta a
// condição especial de troca de refil. Não gera link de adesão: o controle de
// "já respondido" usa o começo do próprio texto enviado.

// O clique no botão chega como texto no webhook. Cobre também quem escreve por
// extenso ("não tenho condições no momento").
export function matchesNoConditions(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  return normalized.includes("SEM CONDICOES")
    || normalized.includes("SEM CONDICAO")
    || normalized.includes("NAO TENHO CONDICOES")
    || normalized.includes("NAO TENHO CONDICAO");
}

// Quem avisa que não tem mais o equipamento não entra na recuperação: a oferta é
// de troca de refil do purificador, então não faz sentido para esse cliente.
export function matchesNoEquipment(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  return normalized.includes("SEM EQUIPAMENTO")
    || normalized.includes("SEM O EQUIPAMENTO")
    || normalized.includes("NAO TENHO O EQUIPAMENTO")
    || normalized.includes("NAO TENHO EQUIPAMENTO")
    || normalized.includes("NAO TENHO MAIS O EQUIPAMENTO")
    || normalized.includes("NAO TENHO MAIS EQUIPAMENTO");
}

// Marca da mensagem enviada (primeiro trecho do texto, sem acento/pontuação).
export function replyMarker(message) {
  return normalizeText(message).slice(0, 60);
}

export function buildNoConditionsReply(template, { clientName } = {}) {
  const firstName = String(clientName || "").trim().split(/\s+/)[0] || "cliente";
  return String(template || "").replace(/\{cliente\}/g, firstName);
}

// Precisa responder? Só quando o "não tenho condições" é o pedido mais recente do
// cliente (se depois ele clicou em "QUERO SER VIP", o fluxo VIP já cuidou) e nada
// saiu depois do clique: nem a nossa mensagem, nem um atendimento da equipe. Os
// disparos da própria campanha (source workflow) não contam como resposta.
export function noConditionsResponseDue(messages, settings) {
  const lista = [...(messages || [])]
    .filter((m) => m && typeof m.body === "string")
    .sort((a, b) => new Date(a.dateAdded || 0).getTime() - new Date(b.dateAdded || 0).getTime());
  const marcadores = [
    replyMarker(settings && settings.noconf_reply_message),
    replyMarker(settings && settings.noconf_reply_sent_marker),
  ].filter((m) => m && m.length >= 20);

  let posCondicao = -1;
  let posVip = -1;
  lista.forEach((m, i) => {
    if (m.direction !== "inbound") return;
    if (matchesNoConditions(m.body)) posCondicao = i;
    if (matchesVipInterest(m.body)) posVip = i;
  });
  if (posCondicao < 0 || posVip > posCondicao) return false;
  // Depois de falar em condições, o cliente avisou que não tem mais o equipamento:
  // a oferta de refil não é enviada.
  if (lista.slice(posCondicao).some((m) => m.direction === "inbound" && matchesNoEquipment(m.body))) return false;

  return !lista.slice(posCondicao + 1).some((m) => {
    if (m.direction !== "outbound") return false;
    if (m.messageType && m.messageType !== "TYPE_WHATSAPP") return false; // atividade do CRM não é resposta
    const texto = normalizeText(m.body);
    if (marcadores.some((marca) => texto.includes(marca))) return true; // já foi a nossa mensagem
    return m.source !== "workflow"; // alguém da equipe já respondeu o cliente
  });
}

// Envia a mensagem de recuperação para um contato do CRM.
// dryRun = true avalia tudo (cliente) sem enviar nada.
export async function replyNoConditions({ svc, cfg, settings, contact, dryRun = false, log }) {
  const logar = typeof log === "function" ? log : async () => {};
  const contactId = contact && contact.id;
  const template = String((settings && settings.noconf_reply_message) || "").trim();
  if (!template) {
    await logar("Resposta 'sem condições' sem mensagem configurada", 0, { contactId });
    return { ok: false, motivo: "mensagem não configurada" };
  }

  const { client, match, candidates } = await resolveClientByContact(svc, contact);
  if (!client) {
    const ambiguo = match === "ambíguo";
    await logar(
      ambiguo
        ? "Resposta 'sem condições' não enviada: mais de um cliente do ERP casa com este contato do CRM (telefone/e-mail) — vínculo ambíguo, nada foi vinculado"
        : "Resposta 'sem condições' sem cliente correspondente no ERP (telefone/e-mail não casaram)",
      0,
      { contactId, nome: contactName(contact), email: contact && contact.email, telefone: contact && contact.phone, candidatos: candidates },
    );
    return {
      ok: false,
      motivo: ambiguo ? "vínculo ambíguo" : "no ERP match",
      contato: contactName(contact),
      telefone: contact && contact.phone,
    };
  }

  if (dryRun) return { ok: true, simulado: true, client, motivo: "mensagem seria enviada" };

  const message = buildNoConditionsReply(template, { clientName: client.name || contactName(contact) });
  const send = await sendGhlWhatsAppMessage(contactId, message, cfg.ghl_location_id, secrets);
  if (!send.ok) {
    await logar(`Falha ao enviar a resposta 'sem condições' (${send.status})`, send.status || 502, { contactId, envio: send.data });
    return { ok: false, motivo: "falha no envio", client, envio_status: send.status };
  }

  const now = new Date().toISOString();
  await svc.Client.update(client.id, {
    ghl_contact_id: client.ghl_contact_id || contactId,
    ghl_tags: Array.isArray(contact.tags) ? contact.tags : (client.ghl_tags || []),
    ghl_last_sync_date: now,
  }).catch(() => {});
  // Guarda o texto enviado: o controle de "já respondido" continua valendo se a
  // mensagem for editada depois na tela de configurações.
  if (settings && settings.id) {
    await svc.SystemSetting.update(settings.id, { noconf_reply_sent_marker: message }).catch(() => {});
  }

  return { ok: true, client, mensagem_enviada: true };
}