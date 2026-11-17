import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { call3C, mapCallStatus } from "../../shared/threeCPlus.ts";

/**
 * Gerencia as ações do agente (vendedora) no discador 3C Plus.
 *
 * Body: { action, seller_id, ... }
 *
 * Ações:
 * - "getAgentConfig"     → retorna { agent_token, domain, webrtc_url, socket_url } para a vendedora
 * - "getAgentCampaigns"   → GET /agent/campaigns (campanhas disponíveis para o agente)
 * - "agentLogin"          → POST /agent/login { campaign_id }
 * - "agentLogout"         → POST /agent/logout
 * - "agentHangup"         → POST /agent/call/{call_id}/hangup
 * - "getLoggedCampaign"   → GET /campaigns/agent/loggedCampaign (campanha logada + intervalos)
 * - "agentBreakEnter"     → POST /agent/work_break/{work_break_id}/enter
 * - "agentBreakExit"      → POST /agent/work_break_exit
 * - "manualCallEnter"     → POST /agent/manual_call_enter
 * - "manualCallDial"      → POST /agent/manual_call_dial { number }
 * - "manualCallExit"      → POST /agent/manual_call_exit
 * - "agentQualifyCall"    → POST /agent/call/{call_id}/qualify { qualification_id, observation? }
 *
 * O token do agente (não o do gestor) é lido da entidade Seller (threec_agent_token).
 * O domínio (para WebRTC/Socket.io) é lido do SystemSetting (threec_domain).
 */
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action, seller_id } = body;

    // Carregar config do SystemSetting (domínio + base_url)
    const settings = await base44.asServiceRole.entities.SystemSetting.list("-created_date", 1);
    const setting = settings[0] || {};
    const domain = setting.threec_domain || "";
    const baseUrl = setting.threec_base_url || "";

    // Buscar o Seller para obter o token do agente
    let agentToken = "";
    let seller = null;
    if (seller_id) {
      seller = await base44.entities.Seller.get(seller_id);
      agentToken = seller?.threec_agent_token || "";
    }

    // === getAgentConfig: retorna config para o frontend (WebRTC + Socket.io) ===
    if (action === "getAgentConfig") {
      if (!agentToken) {
        return Response.json({
          error: "Vendedora sem token de agente configurado. Defina o token em Configurações > Sistema > Agentes 3C Plus.",
        }, { status: 400 });
      }
      if (!domain) {
        return Response.json({
          error: "Domínio do 3C Plus não configurado. Defina threec_domain em Configurações > Sistema > 3C Plus.",
        }, { status: 400 });
      }
      // Garante o "Ramal Webphone" (web_extension) ativo no 3C — sem ele o softphone do ERP não registra.
      const mgrToken = setting.threec_api_token || "";
      const me = await call3C("GET", "/me", { apiToken: agentToken, baseUrl });
      const u = me.data?.data;
      if (mgrToken && u?.id && u.settings?.web_extension === false) {
        await call3C("PUT", `/users/${u.id}`, { apiToken: mgrToken, baseUrl }, {
          form: {
            name: u.name || "",
            role: u.role?.name || "agent",
            extension_number: String(u.extension?.extension_number || ""),
            timezone: u.settings?.timezone || "America/Sao_Paulo",
            web_extension: 1,
          },
        });
      }
      return Response.json({
        agent_token: agentToken,
        domain,
        webrtc_url: `https://${domain}/extension?api_token=${agentToken}`,
        socket_url: "https://new-socket.3c.plus",
        seller_name: seller?.name || "",
        seller_id: seller_id,
      });
    }

    // === diagnoseAgent: testa cada etapa da integração e devolve o resultado ===
    if (action === "diagnoseAgent") {
      const steps = [];
      const push = (name, ok, detail) => steps.push({ name, ok, detail });

      push("Domínio do 3C configurado", Boolean(domain), domain ? `Domínio: ${domain}` : "threec_domain não configurado em Configurações > Sistema > 3C Plus.");
      push("Token da vendedora cadastrado", Boolean(agentToken), agentToken ? "Token do agente encontrado no cadastro da vendedora." : "Vendedora sem token de agente. Cadastre em Configurações > Sistema > Agentes 3C Plus.");
      if (!agentToken) return Response.json({ steps });

      // 1) Token do agente: /me (valida token, ramal, webphone e licenças da empresa)
      const me = await call3C("GET", "/me", { apiToken: agentToken, baseUrl }, { params: { include: "company" } });
      const u = me.data?.data || {};
      push("Token do agente válido (/me)", me.ok, me.ok
        ? `Agente: ${u.name || "-"} · Ramal: ${u.extension?.extension_number || u.telephony_id || "-"} · Ramal Webphone: ${u.settings?.web_extension ? "ATIVADO" : "DESATIVADO"} · Webphone do usuário: ${u.webphone ? "ativado" : "desativado"} · Licenças de webphone da conta: ${u.company?.webphone_licenses ?? "?"} · Saldo: R$ ${Number(u.company?.balance ?? 0).toFixed(2)}`
        : `Falha ao validar o token (HTTP ${me.status}).`);

      // 2) Campanhas disponíveis para o agente
      const camps = await call3C("GET", "/agent/campaigns", { apiToken: agentToken, baseUrl });
      const campList = camps.data?.data || [];
      push("Campanhas do agente (/agent/campaigns)", camps.ok, camps.ok
        ? `${campList.length} campanha(s) disponível(is) para esta vendedora.`
        : `Falha ao listar campanhas (HTTP ${camps.status}).`);

      // 3) Login na campanha + confirmação de que o agente ficou online
      if (body.campaign_id) {
        const lg = await call3C("POST", "/agent/login", { apiToken: agentToken, baseUrl }, { form: { campaign: Number(body.campaign_id) } });
        const loginOk = lg.ok || lg.status === 204;
        push("Pedido de login na campanha", loginOk, loginOk ? "O 3C recebeu o pedido de login." : `Falha (HTTP ${lg.status}).`);
        if (loginOk) {
          await new Promise((r) => setTimeout(r, 6000));
          const logged = await call3C("GET", "/agent/loggedCampaign", { apiToken: agentToken, baseUrl });
          const online = Boolean(logged.ok && logged.data?.data?.id);
          push("Agente online na campanha", online, online
            ? "Agente conectado: o softphone registrou o ramal corretamente."
            : "O 3C respondeu que o agente NÃO está online. Este teste só passa com o Softphone aberto e conectado na tela da vendedora no mesmo momento. Se estiver aberto, verifique 'Ramal Webphone' ativado e salvo no 3C e o microfone liberado.");
          if (online) await call3C("POST", "/agent/logout", { apiToken: agentToken, baseUrl });
        }
      }
      return Response.json({ steps });
    }

    // === getQualifications: lista completa de qualificações da lista vinculada à campanha ===
    // Usa o token do gestor (api_token) pois /qualification_lists é rota administrativa.
    // Recebe campaign_id (opcional); se omitido, usa a campanha logada do agente.
    if (action === "getQualifications") {
      const apiToken = setting.threec_api_token || "";
      if (!apiToken) return Response.json({ error: "Token da API do 3C Plus não configurado." }, { status: 400 });
      const mgrConfig = { apiToken, baseUrl };
      let campaignId = body.campaign_id;
      if (!campaignId && agentToken) {
        const logged = await call3C("GET", "/agent/loggedCampaign", agentConfig);
        campaignId = logged.data?.data?.id;
      }
      if (!campaignId) return Response.json({ qualifications: [] });
      // qualification_list_id vem em dialer_settings
      const campDetail = await call3C("GET", `/campaigns/${campaignId}`, mgrConfig);
      const qListId = campDetail.data?.data?.dialer_settings?.qualification_list_id;
      if (!qListId) return Response.json({ qualifications: [] });
      const qResp = await call3C("GET", `/qualification_lists/${qListId}/qualifications`, mgrConfig);
      const qualifications = (qResp.data?.data || []).map((q) => ({
        id: q.id,
        name: q.name,
        color: q.color || "#9e9e9e",
      }));
      return Response.json({ qualifications });
    }

    // === getLastCallId: recupera o id da chamada mais recente da campanha ===
    // O endpoint /campaigns/{id}/calls do 3C retorna vazio (lista consumida), então
    // consultamos nosso próprio Chamada3C (populado pelo webhook call-history-was-created),
    // que guarda callHistory._id no raw_payload. Usado como fallback quando o socket
    // não trouxe o call_id ao entrar em ACW.
    if (action === "getLastCallId") {
      const { campaign_id } = body;
      if (!campaign_id) return Response.json({ error: "campaign_id é obrigatório" }, { status: 400 });
      const local = await base44.entities.Campanha3C.filter({ campaign_id_3c: String(campaign_id) });
      const campanhaId = local[0]?.id || "";
      const chamadas = await base44.entities.Chamada3C.filter(
        campanhaId ? { campanha_3c_id: campanhaId } : {},
        "-created_date",
        5
      );
      for (const c of chamadas) {
        const rp = c.raw_payload || {};
        const chId = rp["call-history-was-created"]?.callHistory?._id || rp["call-history-was-created"]?.callHistory?.id || "";
        if (chId) return Response.json({ call_id: String(chId), phone: c.phone || "" });
      }
      return Response.json({ call_id: "" });
    }

    // === getCampaignCalls: histórico de chamadas da campanha ===
    // Usa o token principal da API (não o do agente) pois o agente não tem permissão de relatório
    if (action === "getCampaignCalls") {
      const { campaign_id } = body;
      if (!campaign_id) return Response.json({ error: "campaign_id é obrigatório" }, { status: 400 });
      const apiToken = setting.threec_api_token || "";
      if (!apiToken) return Response.json({ error: "Token da API do 3C Plus não configurado no SystemSetting." }, { status: 400 });
      const reportConfig = { apiToken, baseUrl };
      const result = await call3C("GET", `/campaigns/${campaign_id}/calls`, reportConfig);
      if (!result.ok) {
        return Response.json({ calls: [] });
      }
      const calls = (result.data?.data || []).map((c) => ({
        id: c.id,
        phone: c.phone || c.number || c.mailing?.phone || "",
        client_name: c.mailing?.data?.name || c.mailing?.data?.nome || c.name || "",
        call_status: mapCallStatus(c.status || c.result || c.call_status),
        call_status_raw: c.status || c.result || "",
        call_duration: c.duration || c.call_duration || 0,
        call_date: c.created_at || c.date || c.call_date || "",
        recording_url: c.recording_url || c.record_url || "",
        agent_name: c.agent?.name || "",
      }));
      return Response.json({ calls });
    }

    // A partir daqui, todas as ações precisam do token do agente
    if (!agentToken) {
      return Response.json({
        error: "Token do agente não configurado para esta vendedora. Defina em Configurações > Sistema > Agentes 3C Plus.",
      }, { status: 400 });
    }

    const agentConfig = { apiToken: agentToken, baseUrl };

    // === getAgentCampaigns ===
    // Filtra: apenas campanhas parametrizadas localmente (Campanha3C) para esta vendedora E não pausadas
    if (action === "getAgentCampaigns") {
      const result = await call3C("GET", "/agent/campaigns", agentConfig);
      if (!result.ok) {
        return Response.json({ error: "Falha ao listar campanhas do agente", details: result.data }, { status: 502 });
      }
      const remoteCampaigns = (result.data?.data || []).map((c) => ({
        id: c.id,
        name: c.name,
        paused: c.paused,
        start_time: c.start_time,
        end_time: c.end_time,
      }));
      // Buscar campanhas locais parametrizadas para esta vendedora
      const localCampaigns = await base44.entities.Campanha3C.filter({ seller_id });
      const localCampaignIds = new Set(localCampaigns.map((c) => String(c.campaign_id_3c)));
      // Filtrar: apenas campanhas locais da vendedora E não pausadas
      const campaigns = remoteCampaigns.filter((c) => localCampaignIds.has(String(c.id)) && !c.paused);
      return Response.json({ campaigns });
    }

    // === agentLogin ===
    if (action === "agentLogin") {
      const { campaign_id } = body;
      if (!campaign_id) return Response.json({ error: "campaign_id é obrigatório" }, { status: 400 });
      const result = await call3C("POST", "/agent/login", agentConfig, {
        form: { campaign: Number(campaign_id) },
      });
      // HTTP 204 = recebido, processamento assíncrono (confirmar via socket)
      if (!result.ok && result.status !== 204) {
        return Response.json({ error: "Falha ao fazer login na campanha", details: result.data }, { status: 502 });
      }
      return Response.json({ ok: true });
    }

    // === agentLogout ===
    if (action === "agentLogout") {
      const result = await call3C("POST", "/agent/logout", agentConfig);
      if (!result.ok && result.status !== 204) {
        return Response.json({ error: "Falha ao fazer logout", details: result.data }, { status: 502 });
      }
      return Response.json({ ok: true });
    }

    // === agentHangup ===
    if (action === "agentHangup") {
      const { call_id } = body;
      if (!call_id) return Response.json({ error: "call_id é obrigatório" }, { status: 400 });
      const result = await call3C("POST", `/agent/call/${call_id}/hangup`, agentConfig);
      if (!result.ok && result.status !== 204) {
        return Response.json({ error: "Falha ao encerrar chamada", details: result.data }, { status: 502 });
      }
      return Response.json({ ok: true });
    }

    // === getLoggedCampaign ===
    // O endpoint do agente (/agent/loggedCampaign) não retorna os intervalos.
    // Buscamos o work_break_group_id via /campaigns/{id} (token do gestor) e
    // então os intervalos via /work_break_group/{id}/intervals (token do gestor).
    // Se a campanha não tiver grupo de pausas vinculado, vinculamos automaticamente
    // o primeiro grupo global (ex.: "Padrão") para que as pausas fiquem disponíveis.
    if (action === "getLoggedCampaign") {
      const result = await call3C("GET", "/agent/loggedCampaign", agentConfig);
      // 422 "O agente não está online" = estado offline VÁLIDO (login ainda não concluiu,
      // reconexão do socket, ou após logout). NÃO é erro — retorna 200 com campaign null.
      if (!result.ok) {
        const detail = String(result.data?.detail || "");
        if (result.status === 422 && /n[aã]o est[aá] (online|logado)|n[aã]o est[aá] online/i.test(detail)) {
          return Response.json({ campaign: null, offline: true, work_breaks: [] });
        }
        return Response.json({ error: "Falha ao obter campanha logada", details: result.data }, { status: 502 });
      }
      const campaign = result.data?.data || {};
      const campaignId = campaign.id;

      let workBreaks = [];
      const apiToken = setting.threec_api_token || "";
      if (campaignId && apiToken) {
        const mgrConfig = { apiToken, baseUrl };
        // 1) Detalhes da campanha para obter o work_break_group
        const campDetail = await call3C("GET", `/campaigns/${campaignId}`, mgrConfig);
        let wbg = campDetail.data?.data?.work_break_group;
        // 2) Se não houver grupo vinculado, usar o primeiro grupo global e vinculá-lo
        if (!wbg || !wbg.id) {
          const groupsResp = await call3C("GET", "/work_break_group", mgrConfig);
          const groups = groupsResp.data?.data || [];
          if (groups.length > 0) {
            wbg = { id: groups[0].id, name: groups[0].name };
            // Vincular à campanha (PUT exige os campos obrigatórios)
            const c = campDetail.data?.data || {};
            await call3C("PUT", `/campaigns/${campaignId}`, mgrConfig, {
              form: {
                name: c.name || "",
                start_time: c.start_time || "08:00",
                end_time: c.end_time || "21:00",
                limit_call_per_agent: c.limit_call_per_agent || 0,
                qualification_list: c.dialer_settings?.qualification_list_id || "",
                is_predictive: c.is_predictive ? 1 : 0,
                update_mailing_data: c.update_mailing_data ? 1 : 0,
                work_break_group_id: wbg.id,
              },
            });
          }
        }
        // 3) Intervalos do grupo
        if (wbg && wbg.id) {
          const intervalsResp = await call3C("GET", `/work_break_group/${wbg.id}/intervals`, mgrConfig);
          workBreaks = intervalsResp.data?.data || [];
        }
      }
      campaign.work_breaks = workBreaks;
      return Response.json({ campaign });
    }

    // === agentBreakEnter ===
    if (action === "agentBreakEnter") {
      const { work_break_id } = body;
      if (!work_break_id) return Response.json({ error: "work_break_id é obrigatório" }, { status: 400 });
      const result = await call3C("POST", `/agent/work_break/${work_break_id}/enter`, agentConfig);
      if (!result.ok && result.status !== 204) {
        return Response.json({ error: "Falha ao entrar em intervalo", details: result.data }, { status: 502 });
      }
      return Response.json({ ok: true });
    }

    // === agentBreakExit ===
    if (action === "agentBreakExit") {
      const result = await call3C("POST", "/agent/work_break/exit", agentConfig);
      if (!result.ok && result.status !== 204) {
        return Response.json({ error: "Falha ao sair do intervalo", details: result.data }, { status: 502 });
      }
      return Response.json({ ok: true });
    }

    // === manualCallEnter ===
    if (action === "manualCallEnter") {
      const result = await call3C("POST", "/agent/manual_call_enter", agentConfig);
      if (!result.ok && result.status !== 204) {
        return Response.json({ error: "Falha ao entrar em modo manual", details: result.data }, { status: 502 });
      }
      return Response.json({ ok: true });
    }

    // === manualCallDial ===
    if (action === "manualCallDial") {
      const { number } = body;
      if (!number) return Response.json({ error: "number é obrigatório" }, { status: 400 });
      const result = await call3C("POST", "/agent/manual_call_dial", agentConfig, {
        form: { number },
      });
      if (!result.ok && result.status !== 204) {
        return Response.json({ error: "Falha ao discar", details: result.data }, { status: 502 });
      }
      return Response.json({ ok: true });
    }

    // === manualCallExit ===
    if (action === "manualCallExit") {
      const result = await call3C("POST", "/agent/manual_call_exit", agentConfig);
      if (!result.ok && result.status !== 204) {
        return Response.json({ error: "Falha ao sair do modo manual", details: result.data }, { status: 502 });
      }
      return Response.json({ ok: true });
    }

    // === agentQualifyCall ===
    // Classifica a chamada em Pós-Atendimento (ACW). O acw_timeout da campanha retorna à fila sozinho.
    if (action === "agentQualifyCall") {
      const { call_id, qualification_id, observation } = body;
      if (!call_id || !qualification_id) {
        return Response.json({ error: "call_id e qualification_id são obrigatórios" }, { status: 400 });
      }
      const form = { qualification_id: Number(qualification_id) };
      if (observation) form.observation = observation;
      const result = await call3C("POST", `/agent/call/${call_id}/qualify`, agentConfig, { form });
      if (!result.ok && result.status !== 204) {
        // 422 "não está mais em estado válido" = ACW já estourou (acw_timeout) e a chamada
        // voltou à fila sozinha. Tratamos como sucesso para não confundir a vendedora.
        const detail = result.data?.detail || result.data?.error || "";
        if (result.status === 422 && /n[oã]o est[aá] mais em estado|acw/i.test(String(detail))) {
          return Response.json({ ok: true, already_returned: true });
        }
        return Response.json({ error: detail || "Falha ao classificar chamada", details: result.data }, { status: 502 });
      }
      return Response.json({ ok: true });
    }

    return Response.json({ error: `Ação não reconhecida: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}