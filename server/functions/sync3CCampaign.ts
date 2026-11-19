// Gerado de base44/functions/sync3CCampaign/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { call3C, normalizePhone } from "../shared/threeCPlus.ts";

/**
 * Gerencia campanhas do discador 3C Plus.
 *
 * Ações (via body.action):
 * - "listCampaigns": lista todas as campanhas do 3C Plus (GET /campaigns)
 * - "createCampaign": cria uma nova campanha no 3C Plus (POST /campaigns)
 *     Body: { action, name, start_time?, end_time?, caller_id?, qualification_list_id? }
 * - undefined (padrão): envia lista de clientes para uma campanha existente
 *     Body: { name, campaign_id_3c, seller_id?, distribution_batch_id?, client_ids? }
 *
 * Para cada cliente (envio):
 * - Inclui TODOS os telefones (phone1-5, zoox_phone1-7) como entradas separadas na lista
 * - Inclui dados completos: código, produto/equipamento, datas de manutenção, refil, endereço, vendedora
 * - Insere em lotes de 500 mailings por chamada à API do 3C Plus
 */
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Carregar config do 3C Plus do SystemSetting
    const settings = await base44.entities.SystemSetting.list("-created_date", 1);
    const setting = settings[0] || {};
    const config = {
      apiToken: setting.threec_api_token || "",
      baseUrl: setting.threec_base_url || "",
    };
    if (!config.apiToken) {
      return Response.json({
        error: "Token da API do 3C Plus não configurado. Defina threec_api_token em Configurações > Sistema.",
      }, { status: 400 });
    }

    const body = await req.json();

    // === AÇÃO: Listar campanhas do 3C Plus ===
    if (body.action === "listCampaigns") {
      const result = await call3C("GET", "/campaigns", config);
      if (!result.ok) {
        return Response.json({ error: "Falha ao listar campanhas", details: result.data }, { status: 502 });
      }
      const campaigns = (result.data?.data || []).map((c) => ({
        id: c.id,
        name: c.name,
        paused: c.paused,
        start_time: c.start_time,
        end_time: c.end_time,
      }));
      return Response.json({ campaigns });
    }

    // === AÇÃO: Criar nova campanha no 3C Plus ===
    if (body.action === "createCampaign") {
      const { name: campName, start_time, end_time, caller_id, qualification_list_id, seller_id } = body;
      if (!campName) {
        return Response.json({ error: "name é obrigatório para criar campanha" }, { status: 400 });
      }
      // Usa a lista de qualificação padrão (8687) se não informada
      const qlId = qualification_list_id || "8687";
      const createResult = await call3C("POST", "/campaigns", config, {
        form: {
          name: campName,
          start_time: start_time || "08:00",
          end_time: end_time || "21:00",
          caller_id: caller_id || "1000000000",
          distribution_type: "teams_and_agents",
          qualification_list: String(qlId),
        },
      });
      if (!createResult.ok) {
        return Response.json({
          error: "Falha ao criar campanha no 3C Plus",
          details: createResult.data,
        }, { status: 502 });
      }
      const newCampaign = createResult.data?.data;
      const newCampaignId = newCampaign?.id;

      // Atribuir a vendedora (agente) à campanha para que ela apareça no discador do agente
      let agentAssigned = false;
      let assignError = "";
      if (seller_id && newCampaignId) {
        const seller = await base44.entities.Seller.get(seller_id);
        const threecUserId = seller?.threec_user_id || "";
        if (threecUserId) {
          const assignResult = await call3C("POST", `/campaigns/${newCampaignId}/agents`, config, {
            body: { agents: [Number(threecUserId)] },
          });
          agentAssigned = assignResult.ok;
          if (!assignResult.ok) {
            assignError = assignResult.data?.detail || assignResult.data?.raw || `HTTP ${assignResult.status}`;
          }
        }
      }

      return Response.json({
        ok: true,
        campaign: {
          id: newCampaignId,
          name: newCampaign?.name,
          paused: newCampaign?.paused,
        },
        agent_assigned: agentAssigned,
        assign_error: assignError,
      });
    }

    // === AÇÃO PADRÃO: Enviar mailing para campanha existente ===
    const { name, campaign_id_3c, seller_id, distribution_batch_id, client_ids } = body;
    if (!name || !campaign_id_3c) {
      return Response.json({ error: "name e campaign_id_3c são obrigatórios" }, { status: 400 });
    }

    // Coletar clientes: IDs explícitos ou todos os clientes do lote de distribuição
    let clients = [];
    if (client_ids && client_ids.length) {
      for (const id of client_ids) {
        const c = await base44.entities.Client.get(id);
        if (c) clients.push(c);
      }
    } else if (distribution_batch_id) {
      const batch = await base44.entities.DistributionBatch.get(distribution_batch_id);
      if (!batch) return Response.json({ error: "Lote de distribuição não encontrado" }, { status: 404 });
      // Buscar todos os clientes do lote (limite alto para cobrir lotes grandes)
      clients = await base44.entities.Client.filter({ distribution_batch_id }, "-created_date", 5000);
      if (seller_id) {
        clients = clients.filter((c) => c.seller_id === seller_id);
      }
    } else {
      return Response.json({ error: "Informe client_ids ou distribution_batch_id" }, { status: 400 });
    }

    if (clients.length === 0) {
      return Response.json({ error: "Nenhum cliente encontrado para enviar" }, { status: 400 });
    }

    // Buscar equipamentos de todos os clientes para incluir dados de produto/manutenção
    const clientIds = clients.map((c) => c.id);
    const allEquipment = await base44.entities.Equipment.list("-created_date", 10000);
    const equipmentByClient = {};
    for (const eq of allEquipment) {
      if (!clientIds.includes(eq.client_id)) continue;
      if (!equipmentByClient[eq.client_id]) equipmentByClient[eq.client_id] = [];
      equipmentByClient[eq.client_id].push(eq);
    }

    // Buscar vendedora
    let sellerName = "";
    let sellerThreecUserId = "";
    if (seller_id) {
      const seller = await base44.entities.Seller.get(seller_id);
      sellerName = seller?.name || "";
      sellerThreecUserId = seller?.threec_user_id || "";
    }

    let batchProtocol = "";
    if (distribution_batch_id) {
      const batch = await base44.entities.DistributionBatch.get(distribution_batch_id);
      batchProtocol = batch?.protocol || "";
    }

    // Campos de telefone do cliente (phone1-5 + zoox_phone1-7)
    const phoneFields = [
      "phone1", "phone2", "phone3", "phone4", "phone5",
      "zoox_phone1", "zoox_phone2", "zoox_phone3", "zoox_phone4", "zoox_phone5", "zoox_phone6", "zoox_phone7",
    ];

    // Construir mailings: uma entrada por telefone por cliente
    const mailings = [];
    let clientsWithPhone = 0;
    for (const c of clients) {
      const clientCode = c.new_code || c.old_code || "";
      const equipment = equipmentByClient[c.id] || [];
      const primaryEq = equipment.find((e) => e.status === "Ativo") || equipment[0];

      let hasAnyPhone = false;
      for (const phoneField of phoneFields) {
        const rawPhone = c[phoneField];
        if (!rawPhone) continue;
        const phone = normalizePhone(rawPhone);
        if (!phone) continue;
        hasAnyPhone = true;

        mailings.push({
          phone,
          identifier: c.id,
          data: {
            name: c.name || "",
            document: c.document || "",
            email: c.email || "",
            client_code: clientCode,
            product: primaryEq?.product_name || "",
            patrimony: primaryEq?.patrimony_code || "",
            last_maintenance: primaryEq?.last_maintenance_date || "",
            next_maintenance: primaryEq?.next_maintenance_date || "",
            refill: primaryEq?.last_maintenance_part_name || primaryEq?.refill_type || "",
            city: c.city || "",
            neighborhood: c.neighborhood || "",
            seller: sellerName,
          },
        });
      }
      if (hasAnyPhone) clientsWithPhone++;
    }

    if (mailings.length === 0) {
      return Response.json({ error: "Nenhum cliente com telefone válido encontrado" }, { status: 400 });
    }

    // Criar registro da campanha no app
    const campanha = await base44.entities.Campanha3C.create({
      name,
      campaign_id_3c,
      seller_id: seller_id || "",
      seller_name: sellerName,
      distribution_batch_id: distribution_batch_id || "",
      batch_protocol: batchProtocol,
      client_ids: clients.map((c) => c.id),
      client_count: clientsWithPhone,
      status: "Pendente",
      metrics: {
        total_calls: 0,
        atendidas: 0,
        nao_atendidas: 0,
        ocupado: 0,
        caixa_postal: 0,
        invalido: 0,
      },
    });

    // Passo 1: Criar uma nova mailing list dentro da campanha no 3C Plus
    const listName = `${name} - ${new Date().toLocaleString("pt-BR")}`;
    const createListResult = await call3C("POST", `/campaigns/${campaign_id_3c}/lists`, config, {
      form: { name: listName },
    });

    if (!createListResult.ok) {
      await base44.entities.Campanha3C.update(campanha.id, {
        status: "Erro",
        error_message: createListResult.data?.detail || createListResult.data?.raw || `HTTP ${createListResult.status} ao criar lista`,
      });
      return Response.json({
        error: "Falha ao criar mailing list no 3C Plus",
        details: createListResult.data,
        campanha_id: campanha.id,
      }, { status: 502 });
    }

    const listId = createListResult.data?.data?.id;
    if (!listId) {
      await base44.entities.Campanha3C.update(campanha.id, {
        status: "Erro",
        error_message: "ID da lista não retornado pelo 3C Plus",
      });
      return Response.json({
        error: "3C Plus não retornou o ID da lista criada",
        details: createListResult.data,
        campanha_id: campanha.id,
      }, { status: 502 });
    }

    // Passo 2: Inserir os mailings em lotes de 500 (limite prático da API)
    const BATCH_SIZE = 500;
    let totalInserted = 0;
    for (let i = 0; i < mailings.length; i += BATCH_SIZE) {
      const batch = mailings.slice(i, i + BATCH_SIZE);
      const insertResult = await call3C("POST", `/campaigns/${campaign_id_3c}/lists/${listId}/mailing.json`, config, {
        body: batch,
      });
      if (!insertResult.ok) {
        await base44.entities.Campanha3C.update(campanha.id, {
          status: "Erro",
          error_message: insertResult.data?.detail || insertResult.data?.raw || `HTTP ${insertResult.status} ao inserir lote ${Math.floor(i / BATCH_SIZE) + 1}`,
        });
        return Response.json({
          error: "Falha ao inserir contatos na lista do 3C Plus",
          details: insertResult.data,
          campanha_id: campanha.id,
          list_id: listId,
          inserted_so_far: totalInserted,
        }, { status: 502 });
      }
      totalInserted += batch.length;
    }

    await base44.entities.Campanha3C.update(campanha.id, {
      status: "Enviada",
      sent_date: new Date().toISOString(),
      notes: `Lista 3C: ${listName} (ID: ${listId}) | ${totalInserted} mailings de ${clientsWithPhone} clientes`,
    });

    return Response.json({
      ok: true,
      campanha_id: campanha.id,
      list_id: listId,
      contacts_sent: totalInserted,
      clients_with_phone: clientsWithPhone,
      threec_user_id: sellerThreecUserId,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}