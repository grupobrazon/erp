import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";
import { executarGrafo, carregarCredenciais, buildCtx } from "../../shared/automacaoEngine.ts";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Não autorizado" }, { status: 401 });

    const body = await req.json();
    const { automacao_id, payload, salvar_log = true } = body || {};
    if (!automacao_id) return Response.json({ error: "automacao_id é obrigatório" }, { status: 400 });

    const automacao = await base44.asServiceRole.entities.Automacao.get(automacao_id);
    if (!automacao) return Response.json({ error: "Automação não encontrada" }, { status: 404 });

    const credenciais = await carregarCredenciais(base44);
    const ctx = buildCtx(base44, secrets, credenciais);

    const startedAt = new Date();
    const result = await executarGrafo(automacao.grafo, payload || {}, ctx);
    const finishedAt = new Date();

    if (salvar_log) {
      await base44.asServiceRole.entities.AutomacaoExecucao.create({
        automacao_id: automacao.id,
        automacao_nome: automacao.nome,
        status: result.status,
        gatilho_tipo: "manual",
        payload_entrada: payload || {},
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
    }

    return Response.json({ status: result.status, nos_log: result.nos_log, payload_saida: result.payload_saida, erro: result.erro });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}