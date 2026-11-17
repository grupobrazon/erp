import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";
import { executarGrafo, carregarCredenciais, buildCtx } from "../../shared/automacaoEngine.ts";

export default async function (req) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) return Response.json({ error: "Token obrigatório" }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const automacoes = await base44.asServiceRole.entities.Automacao.filter({
      webhook_token: token,
      ativo: true,
      tipo_gatilho: "webhook",
    });
    if (automacoes.length === 0) return Response.json({ error: "Automação não encontrada" }, { status: 404 });
    const automacao = automacoes[0];

    let payload = {};
    try {
      payload = await req.json();
    } catch (_e) {
      payload = {};
    }

    const credenciais = await carregarCredenciais(base44);
    const ctx = buildCtx(base44, secrets, credenciais);

    const startedAt = new Date();
    const result = await executarGrafo(automacao.grafo, payload, ctx);
    const finishedAt = new Date();

    await base44.asServiceRole.entities.AutomacaoExecucao.create({
      automacao_id: automacao.id,
      automacao_nome: automacao.nome,
      status: result.status,
      gatilho_tipo: "webhook",
      payload_entrada: payload,
      payload_saida: result.payload_saida,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duracao_ms: finishedAt - startedAt,
      nos_log: result.nos_log,
      erro_geral: result.erro,
    });
    await base44.asServiceRole.entities.Automacao.update(automacao.id, {
      ultimo_disparo: startedAt.toISOString(),
      total_execucoes: (automacao.total_execucoes || 0) + 1,
      total_sucessos: (automacao.total_sucessos || 0) + (result.status === "sucesso" ? 1 : 0),
    });

    return Response.json({ status: result.status, payload_saida: result.payload_saida, erro: result.erro });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}