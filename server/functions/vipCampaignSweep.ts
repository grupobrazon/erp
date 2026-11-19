// Gerado de base44/functions/vipCampaignSweep/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { secrets } from "../runtime.ts";
import { fetchGhlContact, fetchConversationMessages } from '../shared/ghlClient.ts';
import { collectConversations, PAGINA_CONVERSAS } from '../shared/ghlConversations.ts';
import { matchesVipInterest, matchesNoConditions, noConditionsResponseDue, replyNoConditions, replyVipClick, PUBLIC_APP_URL } from '../shared/vipCampaign.ts';

// Varredura das campanhas do CRM: lê o histórico das conversas e dispara as
// respostas automáticas de quem ainda não recebeu nada —
//  • "QUERO SER VIP": gera o link de adesão e responde com imagem, áudio e link;
//  • "SEM CONDIÇÕES AGORA": devolve a condição especial de troca de refil.
// Roda de tempo em tempo (workflow agendado) e pode ser executada manualmente
// com dryRun = true (só simula).
//
// A leitura é em duas partes, em cada rodada:
//  1) a janela mais recente de conversas (cliques que acabaram de chegar);
//  2) o histórico para trás, continuando de onde a rodada anterior parou (cursor
//     salvo em SystemSetting). Antes só as ~100 conversas mais recentes eram
//     lidas: em pico de campanha isso cobre poucos minutos e quem clica e logo
//     recebe a resposta da IA do Atlas saía da leitura sem nunca receber o link.
//
// Quem já recebeu o nosso link (mensagem ou adesão registrada) ou já tem link de
// adesão gerado no cadastro — inclusive quando o vendedor gerou manualmente — é
// ignorado, para não responder duas vezes.
const DIAS_JANELA = 30;
const MARCA_DO_LINK = `${PUBLIC_APP_URL}/programa/`;
// Histórico lido por conversa (o clique pode estar bem acima da última mensagem).
const MENSAGENS_POR_CONVERSA = 100;
// Conversas lidas por rodada: a varredura precisa ficar leve para não concorrer
// com o webhook (cliques em tempo real) nem com o resto do sistema.
const CONVERSAS_POR_RODADA = 200;
// Respostas enviadas por rodada (a varredura roda a cada 5 minutos, então isso
// cobre a chegada dos cliques novos e ainda escoa o histórico).
const LIMITE_POR_RODADA = 25;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

function precisaResposta(mensagens) {
  let ultimoClique = -1;
  mensagens.forEach((m, i) => {
    if (matchesVipInterest(m.body)) ultimoClique = i;
  });
  if (ultimoClique < 0) return false;
  const jaRespondido = mensagens
    .slice(ultimoClique + 1)
    .some((m) => m.direction === 'outbound' && String(m.body || '').includes(MARCA_DO_LINK));
  return !jaRespondido;
}

export default async function (req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const svc = base44.asServiceRole.entities;

    const settingsPage = await svc.SystemSetting.list('-created_date', 1);
    const settings = (settingsPage && settingsPage[0]) || {};
    const vipAtivo = !!settings.vip_reply_enabled;
    const semCondicoesAtivo = !!settings.noconf_reply_enabled;
    if (!vipAtivo && !semCondicoesAtivo) {
      return Response.json({ ok: true, ignorado: 'nenhuma resposta automática ligada' });
    }

    const locationId = settings.ghl_location_id || secrets.get('ghl_location_id');
    const cfg = { ghl_location_id: locationId };
    const logar = async (mensagem, status, payload) => {
      await svc.IntegracaoLog.create({
        origem: 'webhook', mensagem, status_http: status, payload_resumido: payload || {},
      }).catch(() => {});
    };

    const piso = Date.now() - DIAS_JANELA * 24 * 60 * 60 * 1000;
    const cursorSalvo = settings.vip_sweep_cursor ? new Date(settings.vip_sweep_cursor).getTime() : 0;
    const cursorInicial = cursorSalvo > piso ? cursorSalvo : Date.now();
    const teto = Math.min(Math.max(Number(body.maxConversas) || CONVERSAS_POR_RODADA, 2 * PAGINA_CONVERSAS), 800);

    // Conversas desta rodada: a janela mais recente + o histórico anterior, continuando do cursor.
    const { lista: recentes, maisAntiga } = await collectConversations({
      locationId, startAt: cursorInicial, floor: piso, cap: teto, incluirRecentes: true,
    });

    const candidatos = [];
    const candidatosSemCondicoes = [];
    let cliques = 0;
    let cliquesSemCondicoes = 0;
    for (let i = 0; i < recentes.length; i += 8) {
      const lote = recentes.slice(i, i + 8);
      const avaliacoes = await Promise.allSettled(lote.map(async (conversa) => {
        const mensagens = await fetchConversationMessages(conversa.id, secrets, MENSAGENS_POR_CONVERSA);
        return { mensagens };
      }));
      avaliacoes.forEach((a, pos) => {
        if (a.status !== 'fulfilled') return;
        const mensagens = a.value.mensagens;
        if (vipAtivo && mensagens.some((m) => matchesVipInterest(m.body))) {
          cliques += 1;
          if (precisaResposta(mensagens)) candidatos.push(lote[pos].contactId);
        }
        if (semCondicoesAtivo && mensagens.some((m) => m.direction === 'inbound' && matchesNoConditions(m.body))) {
          cliquesSemCondicoes += 1;
          if (noConditionsResponseDue(mensagens, settings)) candidatosSemCondicoes.push(lote[pos].contactId);
        }
      });
    }

    // Responde uma fila de contatos, de 3 em 3 para não estourar o limite do CRM.
    const responder = async (fila, executar, origem) => {
      const contatos = [...new Set(fila)].slice(0, LIMITE_POR_RODADA);
      const resultados = [];
      for (let i = 0; i < contatos.length; i += 3) {
        const lote = contatos.slice(i, i + 3);
        const parciais = await Promise.allSettled(lote.map(async (contactId) => {
          const contato = await fetchGhlContact(contactId, locationId, secrets);
          if (!contato) {
            await logar(`${origem}: contato do clique não encontrado no CRM`, 404, { contactId });
            return { contactId, ok: false, motivo: 'contato não encontrado no CRM' };
          }
          const r = await executar(contato);
          return {
            contactId,
            nome: contato.contactName || contato.firstName || '',
            telefone: contato.phone || '',
            ok: r.ok,
            motivo: r.ok ? (r.simulado ? `simulado: ${r.motivo}` : 'resposta enviada') : r.motivo,
            cliente: (r.client && r.client.name) || null,
          };
        }));
        parciais.forEach((p) => {
          resultados.push(p.status === 'fulfilled' ? p.value : { ok: false, motivo: String((p.reason && p.reason.message) || p.reason) });
        });
        if (i + 3 < contatos.length) await pausa(700);
      }
      return { contatos, resultados };
    };

    const vip = vipAtivo
      ? await responder(
        candidatos,
        (contato) => replyVipClick({ svc, cfg, settings, contact: contato, createdBy: 'Resposta automática (varredura)', dryRun, log: logar }),
        'Varredura VIP',
      )
      : { contatos: [], resultados: [] };
    const semCondicoes = semCondicoesAtivo
      ? await responder(
        candidatosSemCondicoes,
        (contato) => replyNoConditions({ svc, cfg, settings, contact: contato, dryRun, log: logar }),
        'Varredura sem condições',
      )
      : { contatos: [], resultados: [] };

    // Cursor da próxima rodada: anda para trás quando nada ficou pendente; fica
    // onde estava (a rodada seguinte relê a mesma faixa e responde os próximos)
    // quando o limite de respostas da rodada foi atingido, para nenhum clique ser
    // ultrapassado sem resposta. Ao alcançar 30 dias atrás, volta ao presente —
    // o histórico já foi coberto.
    const sobrouParaProximaRodada =
      (vipAtivo && candidatos.length > vip.contatos.length) ||
      (semCondicoesAtivo && candidatosSemCondicoes.length > semCondicoes.contatos.length);
    const proximoCursor = sobrouParaProximaRodada
      ? new Date(cursorInicial).toISOString()
      : (maisAntiga > piso ? new Date(maisAntiga).toISOString() : '');
    if (!dryRun) {
      await svc.SystemSetting.update(settings.id, { vip_sweep_cursor: proximoCursor }).catch(() => {});
    }

    const respondidos = [...vip.resultados, ...semCondicoes.resultados]
      .filter((r) => r.ok && !String(r.motivo).startsWith('simulado')).length;

    return Response.json({
      ok: true,
      simulacao: dryRun,
      conversas_lidas: recentes.length,
      cursor_proxima_rodada: proximoCursor || 'reiniciado no presente',
      cliques_encontrados: cliques,
      cliques_sem_resposta: candidatos.length,
      cliques_sem_condicoes: cliquesSemCondicoes,
      sem_condicoes_sem_resposta: candidatosSemCondicoes.length,
      pendentes_para_as_proximas_rodadas:
        Math.max(0, candidatos.length - vip.contatos.length) +
        Math.max(0, candidatosSemCondicoes.length - semCondicoes.contatos.length),
      respondidos,
      vip: vip.resultados,
      sem_condicoes: semCondicoes.resultados,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}