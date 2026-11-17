import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { isAutomationLink, sendVipWelcome } from "../../shared/vipWelcome.ts";

// Função pública (link externo de adesão) + ações internas do programa de promoções.
// O token da adesão é a credencial: um código longo gerado pelo sistema é a validação do link.

function onlyDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : String(iso);
}

function fmtDateTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return String(iso);
  }
}

function validateClientData(data) {
  const errors = [];
  const name = String(data.name ?? "").trim();
  if (name.split(/\s+/).filter(Boolean).length < 2) errors.push("Informe seu nome completo.");
  const doc = onlyDigits(data.document);
  if (doc.length !== 11 && doc.length !== 14) errors.push("Informe um CPF ou CNPJ válido (somente números).");
  // E-mail é opcional: muitos clientes (principalmente idosos) não têm e-mail.
  // Quando informado, é validado normalmente.
  const email = String(data.email ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.push("Informe um e-mail válido ou deixe o campo em branco.");
  const phone = onlyDigits(data.phone);
  if (phone.length < 10 || phone.length > 13) errors.push("Informe um WhatsApp válido com DDD.");
  return errors;
}

function publicPromotion(promotion) {
  return {
    id: promotion.id,
    name: promotion.name,
    category: promotion.category,
    campaign_label: promotion.campaign_label,
    description: promotion.description,
    benefits: promotion.benefits,
    discount_percent: promotion.discount_percent ?? 0,
    discount_scope: promotion.discount_scope,
    is_lifetime: !!promotion.is_lifetime,
    promotion_start_date: promotion.promotion_start_date,
    promotion_end_date: promotion.promotion_end_date,
    adhesion_start_date: promotion.adhesion_start_date,
    adhesion_end_date: promotion.adhesion_end_date,
    terms_text: promotion.terms_text,
  };
}

// Adesões antigas guardaram a assinatura como arquivo privado; a exibição usa link assinado.
async function signSignature(base44, fileUri) {
  if (!fileUri) return "";
  if (String(fileUri).startsWith("http")) return fileUri;
  try {
    const res = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
      file_uri: fileUri,
      expires_in: 3600,
    });
    return res?.signed_url || "";
  } catch {
    return "";
  }
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole.entities;
    const body = await req.json();
    const action = body.action;

    const loadAdhesion = async (token) => {
      if (!token || !String(token).trim()) return null;
      const list = await svc.PromotionAdhesion.filter({ token: String(token).trim() });
      return (list && list[0]) || null;
    };

    const loadPromotion = async (promotionId) => {
      if (!promotionId) return null;
      const list = await svc.Promotion.filter({ id: promotionId });
      return (list && list[0]) || null;
    };

    // ---------------------------------------------------------------- consulta
    if (action === "get_by_token") {
      const adhesion = await loadAdhesion(body.token);
      if (!adhesion) {
        return Response.json({ error: "Link de adesão não encontrado. Confira o endereço recebido ou solicite um novo link." }, { status: 404 });
      }
      if (adhesion.status === "Cancelada") {
        return Response.json({ error: "Este link de adesão foi cancelado. Fale com a nossa equipe para receber um novo link." }, { status: 400 });
      }
      const promotion = await loadPromotion(adhesion.promotion_id);
      if (!promotion) {
        return Response.json({ error: "Programa não encontrado." }, { status: 404 });
      }
      const signatureUrl = await signSignature(base44, adhesion.signature_url);
      return Response.json({
        adhesion: {
          id: adhesion.id,
          status: adhesion.status,
          token: adhesion.token,
          generated_by: adhesion.generated_by,
          generated_date: adhesion.generated_date,
          accepted_at: adhesion.accepted_at,
          accepted_name: adhesion.accepted_name,
          accepted_document: adhesion.accepted_document,
          accepted_email: adhesion.accepted_email,
          accepted_phone: adhesion.accepted_phone,
          accepted_discount_percent: adhesion.accepted_discount_percent,
          accepted_campaign: adhesion.accepted_campaign,
          signature_url: signatureUrl,
          terms_snapshot: adhesion.terms_snapshot,
        },
        client: {
          name: adhesion.client_name,
          document: adhesion.client_document,
          email: adhesion.client_email,
          phone: adhesion.client_phone,
        },
        promotion: publicPromotion(promotion),
      });
    }

    // ------------------------------------------------ salva os dados do cliente
    // Adesão simplificada: sem código por e-mail. O cliente confirma os dados,
    // aceita os termos e assina digitalmente.
    if (action === "save_data") {
      const adhesion = await loadAdhesion(body.token);
      if (!adhesion) return Response.json({ error: "Link de adesão não encontrado." }, { status: 404 });
      if (adhesion.status === "Aceita") {
        return Response.json({ error: "Este termo já foi aceito. Use o mesmo link para consultar o documento." }, { status: 400 });
      }
      if (adhesion.status === "Cancelada") {
        return Response.json({ error: "Este link de adesão foi cancelado. Fale com a nossa equipe." }, { status: 400 });
      }

      const promotion = await loadPromotion(adhesion.promotion_id);
      if (!promotion) return Response.json({ error: "Programa não encontrado." }, { status: 404 });
      if (promotion.status !== "Ativa") {
        return Response.json({ error: "Este programa não está mais recebendo adesões." }, { status: 400 });
      }
      const today = todayIso();
      if (promotion.adhesion_start_date && today < promotion.adhesion_start_date) {
        return Response.json({ error: `As adesões deste programa começam em ${fmtDate(promotion.adhesion_start_date)}.` }, { status: 400 });
      }
      if (promotion.adhesion_end_date && today > promotion.adhesion_end_date) {
        return Response.json({ error: `O prazo de adesão deste programa foi encerrado em ${fmtDate(promotion.adhesion_end_date)}.` }, { status: 400 });
      }
      if (promotion.target_type === "Quantidade limitada" && promotion.max_adhesions > 0) {
        const accepted = await svc.PromotionAdhesion.filter({ promotion_id: promotion.id, status: "Aceita" });
        if ((accepted?.length || 0) >= promotion.max_adhesions) {
          return Response.json({ error: "As vagas desta promoção já foram preenchidas." }, { status: 400 });
        }
      }

      const errors = validateClientData(body);
      if (errors.length) return Response.json({ error: errors.join(" ") }, { status: 400 });

      await svc.PromotionAdhesion.update(adhesion.id, {
        client_name: String(body.name).trim(),
        client_document: onlyDigits(body.document),
        client_email: String(body.email || "").trim().toLowerCase(),
        client_phone: onlyDigits(body.phone),
      });

      return Response.json({ success: true });
    }

    // --------------------------------------------------------------- aceite
    if (action === "accept") {
      const adhesion = await loadAdhesion(body.token);
      if (!adhesion) return Response.json({ error: "Link de adesão não encontrado." }, { status: 404 });
      if (adhesion.status === "Cancelada") {
        return Response.json({ error: "Este link de adesão foi cancelado." }, { status: 400 });
      }
      if (adhesion.status === "Aceita") {
        return Response.json({ success: true, already_accepted: true });
      }
      // Sem código por e-mail e sem assinatura desenhada: o próprio clique em
      // "Assinar digitalmente" é o aceite, registrado com data, hora e dados do cliente.
      const contact = {
        name: String(body.name || adhesion.client_name || "").trim(),
        document: onlyDigits(body.document || adhesion.client_document),
        email: String(body.email || adhesion.client_email || "").trim().toLowerCase(),
        phone: onlyDigits(body.phone || adhesion.client_phone),
      };
      const contactErrors = validateClientData(contact);
      if (contactErrors.length) return Response.json({ error: contactErrors.join(" ") }, { status: 400 });

      const promotion = await loadPromotion(adhesion.promotion_id);
      const acceptedAt = new Date().toISOString();

      await svc.PromotionAdhesion.update(adhesion.id, {
        status: "Aceita",
        accepted_at: acceptedAt,
        accepted_name: contact.name,
        accepted_document: contact.document,
        accepted_email: contact.email,
        accepted_phone: contact.phone,
        signature_url: "",
        accepted_discount_percent: promotion?.discount_percent ?? 0,
        accepted_campaign: promotion?.campaign_label || "",
        terms_snapshot: promotion?.terms_text || "",
        verification_code: "",
      });

      // Grava a condição no cadastro do cliente. Se o cadastro vinculado não existir
      // mais (excluído ou mesclado na revisão de duplicados), o aceite continua valendo:
      // o cliente não pode ver erro na hora de assinar.
      const clients = adhesion.client_id
        ? await svc.Client.filter({ id: adhesion.client_id }).catch(() => [])
        : [];
      const client = clients && clients[0];
      if (promotion) {
        if (client) {
          const previous = Array.isArray(client.active_promotions) ? client.active_promotions : [];
          const isVip = promotion.category === "Programa VIP";
          const entry = {
            promotion_id: promotion.id,
            promotion_name: promotion.name,
            adhesion_id: adhesion.id,
            discount_percent: promotion.discount_percent ?? 0,
            is_lifetime: !!promotion.is_lifetime,
            accepted_at: acceptedAt,
            status: "Ativa",
          };
          const update = {
            active_promotions: [...previous.filter((p) => p.promotion_id !== promotion.id), entry],
          };
          if (isVip && !client.vip_client) {
            update.vip_client = true;
            update.vip_since = todayIso();
          }
          await svc.Client.update(client.id, update);
        }
      }

      // Link gerado pela automação da campanha (não pelo vendedor): o cliente que
      // acabou de assinar recebe as boas-vindas ao Grupo VIP com as instruções do seu
      // caso — DDD 31/11 (rota de técnico) com instalação gratuita; demais DDDs com o
      // endereço cadastrado para a cotação do frete. A função nunca lança.
      if (isAutomationLink(adhesion)) {
        await sendVipWelcome({ svc, adhesion, client });
      }

      return Response.json({
        success: true,
        accepted_at: acceptedAt,
        accepted_name: adhesion.client_name,
      });
    }

    // ------------------------------------------------- envia o termo por e-mail
    if (action === "send_term_email") {
      const adhesion = await loadAdhesion(body.token);
      if (!adhesion) return Response.json({ error: "Link de adesão não encontrado." }, { status: 404 });
      if (adhesion.status !== "Aceita") {
        return Response.json({ error: "O termo só pode ser enviado depois do aceite." }, { status: 400 });
      }
      const promotion = await loadPromotion(adhesion.promotion_id);
      const email = adhesion.accepted_email || adhesion.client_email || "";
      if (!email) {
        return Response.json({ error: "Este cliente não possui e-mail cadastrado." }, { status: 400 });
      }
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          template_name: "AdesaoPromocaoAceita",
          variables: {
            client_name: String(adhesion.accepted_name || adhesion.client_name || "").split(" ")[0],
            promotion_name: promotion?.name || adhesion.promotion_name || "",
            discount_percent: String(adhesion.accepted_discount_percent ?? promotion?.discount_percent ?? 0),
            accepted_date: fmtDateTime(adhesion.accepted_at),
            term_link: body.link || "",
          },
        });
      } catch (mailError) {
        return Response.json({ error: `Não conseguimos enviar o e-mail para ${email}.` }, { status: 400 });
      }
      await svc.PromotionAdhesion.update(adhesion.id, {
        sent_at: new Date().toISOString(),
        sent_to: email,
      });
      return Response.json({ success: true, email });
    }

    // ------------------------------------- dados do cliente para o vendedor
    if (action === "get_client_context") {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: "Sessão expirada." }, { status: 401 });
      if (!body.client_id) return Response.json({ error: "client_id obrigatório." }, { status: 400 });
      const clients = await base44.entities.Client.filter({ id: body.client_id });
      const client = clients && clients[0];
      if (!client) return Response.json({ error: "Cliente não encontrado." }, { status: 404 });
      return Response.json({ client });
    }

    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}