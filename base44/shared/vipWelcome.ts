// Boas-vindas automáticas ao Grupo VIP.
// Disparadas quando o cliente finaliza a adesão de um link gerado pela AUTOMAÇÃO da
// campanha (varredura/webhook do CRM). Links gerados manualmente pelo vendedor não
// disparam nada — nesse caso o vendedor conduz o atendimento.
//  • DDD 31 e 11 (atendimento por rota de técnico): instalação gratuita;
//  • demais DDDs do Brasil (envio por transportadora): desconto no frete, já com o
//    endereço cadastrado do cliente na mensagem para a cotação.

import { secrets } from "base44:runtime";
import { resolveGhlContactId, sendGhlWhatsAppMessage } from "./ghlClient.ts";
import { onlyDigits } from "./vipCampaign.ts";

export const AUTOMATION_AUTHOR_PREFIX = "Resposta automática";
const DDDS_COM_INSTALACAO = ["31", "11"];

// Link criado pela automação da campanha (não pelo vendedor)?
export function isAutomationLink(adhesion) {
  return String((adhesion && adhesion.generated_by) || "").startsWith(AUTOMATION_AUTHOR_PREFIX);
}

// DDD do telefone. O ERP guarda DDD + número; o DDI 55 é descartado.
export function dddOf(phone) {
  let digits = onlyDigits(phone);
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  return digits.length >= 10 ? digits.slice(0, 2) : "";
}

// Endereço cadastrado do cliente em uma linha, para a cotação do frete.
export function clientAddress(client) {
  if (!client) return "";
  return [
    [client.street, client.number].filter(Boolean).join(", "),
    client.complement,
    client.neighborhood,
    [client.city, client.state].filter(Boolean).join("/"),
    client.zip_code ? `CEP ${client.zip_code}` : "",
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" - ");
}

const MENSAGEM_INSTALACAO = `🎉 💙 *PARABÉNS! AGORA VOCÊ FAZ PARTE DO GRUPO VIP BRAZON!*

Você acaba de garantir acesso a condições exclusivas e benefícios especiais!

✨ *Confira suas vantagens:*
✅ *20% de desconto VITALÍCIO* em todas as suas futuras trocas de refil!
✅ Seu refil de R$ 295,00 sai por apenas *R$ 236,00!*
✅ *Pagamento facilitado:* via Pix ou em até 4x sem juros no cartão de crédito.
✅ *Instalação GRATUITA!* Nossa equipe técnica irá até você realizar a troca do refil, sem custo adicional.

💙 Nossa equipe entrará em contato para agendar a visita do técnico.

Para darmos andamento, como prefere realizar o pagamento: *Pix ou cartão de crédito?*

🥰 É um prazer ter você no VIP Brazon!`;

const MENSAGEM_FRETE = `🎉 💙 *PARABÉNS! AGORA VOCÊ FAZ PARTE DO GRUPO VIP BRAZON!*

Você acaba de garantir acesso a condições exclusivas e benefícios especiais!

✨ *E temos uma novidade ainda melhor para você!*
✅ *20% de desconto VITALÍCIO* em todas as suas futuras compras de refil!
✅ Seu refil de R$ 295,00 sai por apenas *R$ 236,00!*
✅ *Pagamento facilitado:* via Pix ou em até 4x sem juros no cartão de crédito.
🚚 *20% de desconto especial no FRETE* para o envio do seu refil!

💙 Queremos facilitar sua compra e garantir que você mantenha seu purificador em dia, com economia!

📍 *Podemos confirmar seu endereço de entrega?*
_Endereço cadastrado:_ {endereco}

Assim, já conseguimos calcular o frete com seu desconto VIP!

*E como prefere realizar o pagamento: Pix ou cartão de crédito?*

🤩 É um prazer ter você no VIP Brazon!`;

// Modelos editáveis na Gestão de Campanhas Atlas: o texto salvo no sistema vence e,
// quando o campo está vazio, vale o modelo padrão do código.
function fillTemplate(template, fallback, values) {
  const texto = String(template || "").trim() || fallback;
  return texto
    .replace(/\{cliente\}/g, values.cliente || "cliente")
    .replace(/\{endereco\}/g, values.endereco || "");
}

// Mensagem do cenário do cliente (DDD 31/11 = instalação gratuita; demais = frete).
export function buildVipWelcomeMessage({ client, adhesion, settings }) {
  const ddd = dddOf((adhesion && (adhesion.accepted_phone || adhesion.client_phone)) || "");
  const nome = String((client && client.name) || (adhesion && adhesion.accepted_name) || (adhesion && adhesion.client_name) || "")
    .trim()
    .split(/\s+/)[0] || "cliente";
  const endereco = clientAddress(client)
    || "não localizamos seu endereço no cadastro. Envie seu endereço completo por aqui, por favor.";
  const cfg = settings || {};
  if (DDDS_COM_INSTALACAO.includes(ddd)) {
    return {
      cenario: "instalacao_gratuita",
      ddd,
      endereco: "",
      texto: fillTemplate(cfg.vip_welcome_msg_instalacao, MENSAGEM_INSTALACAO, { cliente: nome, endereco }),
    };
  }
  return {
    cenario: "desconto_frete",
    ddd,
    endereco,
    texto: fillTemplate(cfg.vip_welcome_msg_frete, MENSAGEM_FRETE, { cliente: nome, endereco }),
  };
}

async function logFalha(svc, mensagem, payload) {
  await svc.IntegracaoLog.create({
    origem: "webhook",
    mensagem,
    status_http: (payload && payload.status) || 0,
    payload_resumido: payload || {},
  }).catch(() => {});
}

// Envia as boas-vindas no WhatsApp do contato do CRM. Nunca lança: a mensagem é um
// complemento do aceite e não pode impedir o cliente de assinar o termo.
export async function sendVipWelcome({ svc, adhesion, client }) {
  try {
    const phone = adhesion.accepted_phone || adhesion.client_phone || "";

    const settingsPage = await svc.SystemSetting.list("-created_date", 1);
    const settings = (settingsPage && settingsPage[0]) || {};
    // Texto em uso vem da Gestão de Campanhas Atlas (vazio = modelo padrão).
    const mensagem = buildVipWelcomeMessage({ client, adhesion, settings });
    // Interruptor da Gestão de Campanhas Atlas (campo vazio = boas-vindas ligadas).
    if (settings.vip_welcome_enabled === false) {
      return { ok: false, motivo: "boas-vindas automáticas desligadas", cenario: mensagem.cenario };
    }
    const locationId = settings.ghl_location_id || secrets.get("ghl_location_id");
    if (!locationId) {
      await logFalha(svc, "Boas-vindas VIP automática: conta do CRM não configurada", { telefone: phone });
      return { ok: false, motivo: "conta do CRM não configurada", cenario: mensagem.cenario };
    }

    const contactId = await resolveGhlContactId({ client, phone, locationId, secrets });
    if (!contactId) {
      await logFalha(svc, "Boas-vindas VIP automática: cliente sem contato vinculado no CRM", {
        cliente: (client && client.name) || adhesion.accepted_name || "",
        telefone: phone,
        ddd: mensagem.ddd,
        cenario: mensagem.cenario,
        endereco: mensagem.endereco || "",
      });
      return { ok: false, motivo: "cliente sem contato vinculado no CRM", cenario: mensagem.cenario };
    }

    const envio = await sendGhlWhatsAppMessage(contactId, mensagem.texto, locationId, secrets);
    if (envio.ok) {
      // Marca quem já recebeu: o disparo de recuperação não repete a mensagem.
      await svc.PromotionAdhesion.update(adhesion.id, { welcome_sent_at: new Date().toISOString() }).catch(() => {});
    }
    if (!envio.ok) {
      await logFalha(svc, `Boas-vindas VIP automática: falha no envio (${envio.status})`, {
        cliente: (client && client.name) || adhesion.accepted_name || "",
        telefone: phone,
        ddd: mensagem.ddd,
        cenario: mensagem.cenario,
        endereco: mensagem.endereco || "",
        envio: envio.data,
      });
    }
    return { ok: envio.ok, cenario: mensagem.cenario, ddd: mensagem.ddd, status: envio.status };
  } catch (error) {
    await logFalha(svc, `Boas-vindas VIP automática: ${error.message}`, {});
    return { ok: false, motivo: error.message };
  }
}