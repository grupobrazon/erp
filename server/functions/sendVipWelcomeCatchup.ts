// Gerado de base44/functions/sendVipWelcomeCatchup/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { isAutomationLink, sendVipWelcome } from "../shared/vipWelcome.ts";

// Disparo de recuperação das boas-vindas VIP: envia a mensagem aos clientes que já
// assinaram um link gerado pela AUTOMAÇÃO da campanha antes do envio automático
// entrar no ar (links criados manualmente pelo vendedor não entram).
// Quem já recebeu (welcome_sent_at preenchido) fica de fora, então a função pode ser
// executada quantas vezes for preciso sem repetir mensagem: cada chamada envia um
// lote (limit, padrão 25) e informa quantos ainda faltam.

const DELAY_MS = 800;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default (async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Acesso restrito a administradores' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const limite = Math.min(Math.max(Number(body.limit) || 25, 1), 40);

  const svc = base44.asServiceRole.entities;
  const page = await svc.PromotionAdhesion.filter(
    { status: 'Aceita', welcome_sent_at: { $exists: false } },
    { sort: 'accepted_at', limit: 200 },
  );
  const pendentes = (page.items || []).filter(isAutomationLink);
  const lote = pendentes.slice(0, limite);

  // Cadastro dos clientes do lote: o endereço do cadastro vai na mensagem do frete.
  const clientIds = [...new Set(lote.map((a) => a.client_id).filter(Boolean))];
  const clientes = clientIds.length
    ? (await svc.Client.filter({ id: { $in: clientIds } }, { limit: 100 })).items || []
    : [];
  const porId = new Map(clientes.map((c) => [c.id, c]));

  const resultados = [];
  for (const adhesion of lote) {
    const resultado = await sendVipWelcome({ svc, adhesion, client: porId.get(adhesion.client_id) || null });
    resultados.push({
      cliente: adhesion.client_name,
      telefone: adhesion.accepted_phone || adhesion.client_phone || '',
      cenario: resultado.cenario,
      enviada: !!resultado.ok,
      motivo: resultado.motivo || (resultado.ok ? '' : `erro ${resultado.status}`),
    });
    await esperar(DELAY_MS);
  }

  const enviadas = resultados.filter((r) => r.enviada).length;
  return Response.json({
    enviadas,
    falhas: resultados.length - enviadas,
    restantes: Math.max(pendentes.length - lote.length, 0),
    cenarios: {
      instalacao: resultados.filter((r) => r.cenario === 'instalacao_gratuita').length,
      frete: resultados.filter((r) => r.cenario === 'desconto_frete').length,
    },
    detalhes: resultados,
  });
});