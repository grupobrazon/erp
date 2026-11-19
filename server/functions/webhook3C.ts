// Gerado de base44/functions/webhook3C/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

/**
 * Webhook para receber resultados de chamadas do discador 3C Plus.
 *
 * URL: https://brazon-comercial.base44.app/functions/webhook3C?token={threec_webhook_token}
 *
 * O 3C Plus envia um POST com o payload aninhado sob a chave do evento:
 *   - "call-history-was-created" → registro definitivo da chamada finalizada (dados completos)
 *   - "call-was-connected"        → evento em tempo real (agente conectou); o histórico chega depois
 *
 * Este webhook:
 *  1. Valida o token fixo contra o campo threec_webhook_token do SystemSetting
 *  2. Processa apenas o evento call-history-was-created (registro autoritativo) — ignora o
 *     call-was-connected para não duplicar chamadas (o histórico traz os dados completos)
 *  3. Extrai campos do caminho aninhado callHistory.{number, status, campaign.id, mailing_data, agent}
 *  4. Vincula à Campanha3C pelo campaign_id_3c
 *  5. Cria um registro Chamada3C com o resultado
 *  6. Atualiza as métricas agregadas da Campanha3C (se encontrada)
 *  7. Tenta vincular a chamada ao cliente pelo telefone (fallback: new_code do mailing)
 *
 * Mapeamento de status numérico LOCAL (não usa mapCallStatus compartilhado de threeCPlus.ts,
 * para não afetar sync3CAgent/discador). Construído a partir da análise de 2.316 eventos reais:
 *   - speaking_with_agent_time > 0          → Atendida (conversa produtiva = "Conversação")
 *   - status 9 / amd voicemail               → Caixa Postal
 *   - status 15 (hangup 52, sem resposta)   → Não Atendida
 *   - status 8: hangup 17=Ocupado, 1=Inválido, demais=Não Atendida
 *   - status 6, 4 (humano atendeu, sem agente)→ Atendida
 *   - demais                                  → Outro
 */
function mapCallStatusFromHistory(callHistory) {
  const speakingAgent = Number(callHistory?.speaking_with_agent_time || 0);
  if (speakingAgent > 0) return "Atendida";

  const s = Number(callHistory?.status);
  const hangup = Number(callHistory?.hangup_cause || 0);
  const amd = String(callHistory?.amd_v3_label || "");

  if (s === 9 || amd.includes("voicemail")) return "Caixa Postal";
  if (s === 15) return "Não Atendida";
  if (s === 8) {
    if (hangup === 17) return "Ocupado";
    if (hangup === 1) return "Inválido";
    return "Não Atendida";
  }
  if (s === 6 || s === 4) return "Atendida";
  return "Outro";
}

export default async function (req) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) return Response.json({ error: "Token obrigatório" }, { status: 400 });

    const base44 = createClientFromRequest(req);

    // Carregar config do SystemSetting (via service role — webhook é público)
    const settings = await base44.asServiceRole.entities.SystemSetting.list("-created_date", 1);
    const setting = settings[0] || {};
    const webhookToken = setting.threec_webhook_token || "";
    if (!webhookToken) {
      return Response.json({ error: "Token do webhook não configurado no SystemSetting (threec_webhook_token)" }, { status: 500 });
    }
    if (token !== webhookToken) {
      return Response.json({ error: "Token inválido" }, { status: 403 });
    }

    let payload = {};
    try { payload = await req.json(); } catch { payload = {}; }

    // Detectar evento pela chave raiz (o 3C Plus aninha o payload sob o nome do evento)
    const eventKeys = Object.keys(payload || {});
    const isHistory = eventKeys.includes("call-history-was-created");

    // call-was-connected é um evento em tempo real (agente conectou à chamada).
    // O evento call-history-was-created chega logo após com os dados completos da chamada
    // finalizada. Ignoramos o connected aqui para não duplicar registros/inflar métricas.
    if (!isHistory) {
      return Response.json({ ok: true, event: eventKeys[0] || "unknown", processed: false });
    }

    // === Extração do caminho aninhado call-history-was-created.callHistory.* ===
    const evt = payload["call-history-was-created"] || {};
    const ch = evt.callHistory || {};
    const campaignInfo = ch.campaign || {};
    const mailingData = ch.mailing_data || {};
    const mailingCustom = mailingData.data || {};
    const agentInfo = ch.agent || {};
    const qualificationObj = ch.qualification;

    const phone = String(ch.number || mailingData.phone || "");
    const rawStatus = ch.status != null ? String(ch.status) : "";
    const callStatus = mapCallStatusFromHistory(ch);
    const duration = Number(ch.billed_time || ch.speaking_time || ch.calling_time || 0);
    const callDate = ch.call_date || ch.created_at || new Date().toISOString();
    const agentName = agentInfo.name || "";
    const agentExtension = ""; // call-history não traz o ramal (apenas agent.id = user_id 3C)
    const recordingUrl = ""; // call-history não traz recording_url (disponível em endpoint separado)
    const qualified = Boolean(qualificationObj);
    const qualificationLabel = (qualificationObj && (qualificationObj.name || qualificationObj.label)) || ch.qualification_note || "";

    // Extrair campaign_id do caminho aninhado (callHistory.campaign.id)
    const campaignId3c = String(campaignInfo.id || "");

    // Buscar a Campanha3C pelo campaign_id_3c
    let campanha = null;
    if (campaignId3c) {
      const found = await base44.asServiceRole.entities.Campanha3C.filter({ campaign_id_3c: campaignId3c });
      if (found.length > 0) campanha = found[0];
    }

    // Vincular ao cliente pelo telefone (apenas dígitos, últimos 10)
    const phoneDigits = String(phone || "").replace(/\D/g, "");
    let clientId = "";
    let clientName = "";
    if (phoneDigits) {
      const clients = await base44.asServiceRole.entities.Client.filter({}, "-updated_date", 500);
      const match = clients.find((c) => {
        const phones = [c.phone1, c.phone2, c.phone3, c.phone4, c.phone5].map((p) => String(p || "").replace(/\D/g, ""));
        const tail = phoneDigits.slice(-10);
        return phones.some((p) => p && p.endsWith(tail));
      });
      if (match) {
        clientId = match.id;
        clientName = match.name || "";
      }
    }

    // Fallback: se não achou cliente pelo telefone, tentar pelo new_code enviado no mailing
    if (!clientId && mailingCustom.client_code) {
      const byCode = await base44.asServiceRole.entities.Client.filter({ new_code: mailingCustom.client_code });
      if (byCode.length > 0) {
        clientId = byCode[0].id;
        clientName = byCode[0].name || clientName;
      }
    }

    // Se ainda não tiver nome do cliente, usar o nome que veio no mailing (cache)
    if (!clientName && mailingCustom.name) {
      clientName = mailingCustom.name;
    }

    // Criar registro da chamada
    await base44.asServiceRole.entities.Chamada3C.create({
      campanha_3c_id: campanha ? campanha.id : "",
      campanha_name: campanha ? campanha.name : (campaignInfo.name || ""),
      client_id: clientId,
      client_name: clientName,
      phone,
      call_status: callStatus,
      call_status_raw: rawStatus,
      call_duration: duration,
      call_date: callDate,
      agent_name: agentName,
      agent_extension: agentExtension,
      recording_url: recordingUrl,
      qualified,
      qualification_label: qualificationLabel,
      raw_payload: payload,
    });

    // Atualizar métricas da campanha (se encontrada)
    if (campanha) {
      const metrics = campanha.metrics || {
        total_calls: 0, atendidas: 0, nao_atendidas: 0, ocupado: 0, caixa_postal: 0, invalido: 0,
      };
      metrics.total_calls = (metrics.total_calls || 0) + 1;
      if (callStatus === "Atendida") metrics.atendidas = (metrics.atendidas || 0) + 1;
      else if (callStatus === "Não Atendida") metrics.nao_atendidas = (metrics.nao_atendidas || 0) + 1;
      else if (callStatus === "Ocupado") metrics.ocupado = (metrics.ocupado || 0) + 1;
      else if (callStatus === "Caixa Postal") metrics.caixa_postal = (metrics.caixa_postal || 0) + 1;
      else if (callStatus === "Inválido") metrics.invalido = (metrics.invalido || 0) + 1;

      const status = metrics.total_calls >= (campanha.client_count || 0) ? "Concluída" : "Em Discagem";
      await base44.asServiceRole.entities.Campanha3C.update(campanha.id, {
        metrics,
        last_result_date: new Date().toISOString(),
        status,
      });
    }

    return Response.json({ ok: true, call_status: callStatus, campaign_matched: Boolean(campanha), event: "call-history-was-created" });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}