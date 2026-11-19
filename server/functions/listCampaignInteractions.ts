// Gerado de base44/functions/listCampaignInteractions/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { secrets } from "../runtime.ts";
import { fetchConversationMessages } from '../shared/ghlClient.ts';
import { collectConversations } from '../shared/ghlConversations.ts';
import { matchesVipInterest, matchesNoConditions, matchesNoEquipment, replyMarker, normalizeText, PUBLIC_APP_URL } from '../shared/vipCampaign.ts';

// Interações da campanha de WhatsApp no CRM (GoHighLevel) para análise:
// quem clicou em "QUERO SER VIP" e quem respondeu "SEM CONDIÇÕES AGORA", com a
// situação de cada um — resposta automática enviada, atendido por outro fluxo
// (equipe / IA do Atlas / fluxo VIP) ou ainda aguardando resposta.
// Somente leitura: não envia nada e não altera registros.
const MENSAGENS_POR_CONVERSA = 100; // o clique pode estar bem acima da última mensagem
const CONVERSAS_POR_LEITURA = 500;
const HORAS_PADRAO = 24;
const HORAS_MAXIMO = 24 * 30;
const MARCA_DO_LINK = `${PUBLIC_APP_URL}/programa/`;

// Situação da interação: a nossa resposta saiu depois do clique, outro fluxo
// atendeu (mensagem da equipe/IA) ou ninguém falou com o cliente ainda.
function situacaoDepois(mensagens, posicao, ehNossaResposta) {
  const depois = mensagens
    .slice(posicao + 1)
    .filter((m) => m.direction === 'outbound' && (!m.messageType || m.messageType === 'TYPE_WHATSAPP'));
  if (depois.some((m) => ehNossaResposta(String(m.body || '')))) return 'respondido';
  return depois.length ? 'outro_fluxo' : 'aguardando';
}

// Índice da última mensagem recebida do cliente que casa com o critério.
function ultimaRecebida(mensagens, casa) {
  let posicao = -1;
  mensagens.forEach((m, i) => {
    if (m.direction === 'inbound' && casa(String(m.body || ''))) posicao = i;
  });
  return posicao;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole.entities;

    const settingsPage = await svc.SystemSetting.list('-created_date', 1);
    const settings = (settingsPage && settingsPage[0]) || {};
    const locationId = settings.ghl_location_id || secrets.get('ghl_location_id');
    if (!locationId) return Response.json({ error: 'CRM não configurado' }, { status: 400 });

    const horas = Math.min(Math.max(Number(body.horas) || HORAS_PADRAO, 1), HORAS_MAXIMO);
    const teto = Math.min(Math.max(Number(body.maxConversas) || CONVERSAS_POR_LEITURA, 100), 1200);
    const desde = Date.now() - horas * 60 * 60 * 1000;

    const { lista: coletadas, maisAntiga } = await collectConversations({ locationId, startAt: Date.now(), floor: desde, cap: teto });
    const lista = coletadas
      .filter((c) => Number(c.lastMessageDate) >= desde)
      .sort((a, b) => Number(b.lastMessageDate) - Number(a.lastMessageDate));
    const parcial = maisAntiga > desde;

    const marcasOferta = [
      replyMarker(settings.noconf_reply_message),
      replyMarker(settings.noconf_reply_sent_marker),
    ].filter((marca) => marca && marca.length >= 20);
    const ehOferta = (texto) => marcasOferta.some((marca) => normalizeText(texto).includes(marca));
    const ehLinkVip = (texto) => texto.includes(MARCA_DO_LINK);

    const linhas = [];
    for (let i = 0; i < lista.length; i += 8) {
      const lote = lista.slice(i, i + 8);
      const avaliacoes = await Promise.allSettled(lote.map((conversa) => fetchConversationMessages(conversa.id, secrets, MENSAGENS_POR_CONVERSA)));
      avaliacoes.forEach((avaliacao, posicao) => {
        if (avaliacao.status !== 'fulfilled') return;
        const conversa = lote[posicao];
        const mensagens = avaliacao.value || [];
        const base = {
          contactId: conversa.contactId,
          conversa_id: conversa.id,
          nome: conversa.fullName || conversa.contactName || '',
          telefone: conversa.phone || '',
        };

        const posVip = ultimaRecebida(mensagens, matchesVipInterest);
        if (posVip >= 0) {
          linhas.push({
            ...base,
            interacao: 'QUERO SER VIP',
            clique_em: mensagens[posVip].dateAdded || null,
            situacao: situacaoDepois(mensagens, posVip, ehLinkVip),
          });
        }

        const posCondicao = ultimaRecebida(mensagens, matchesNoConditions);
        if (posCondicao >= 0) {
          // Cliente que avisou depois que não tem mais o equipamento não recebe a oferta.
          const semEquipamento = mensagens
            .slice(posCondicao)
            .some((m) => m.direction === 'inbound' && matchesNoEquipment(m.body));
          linhas.push({
            ...base,
            interacao: 'SEM CONDIÇÕES AGORA',
            clique_em: mensagens[posCondicao].dateAdded || null,
            situacao: semEquipamento ? 'sem_equipamento' : situacaoDepois(mensagens, posCondicao, ehOferta),
          });
        }
      });
    }

    linhas.sort((a, b) => new Date(b.clique_em || 0).getTime() - new Date(a.clique_em || 0).getTime());

    const contar = (interacao) => {
      const doTipo = linhas.filter((l) => l.interacao === interacao);
      return {
        cliques: doTipo.length,
        respondidos: doTipo.filter((l) => l.situacao === 'respondido').length,
        outro_fluxo: doTipo.filter((l) => l.situacao === 'outro_fluxo').length,
        aguardando: doTipo.filter((l) => l.situacao === 'aguardando').length,
        sem_equipamento: doTipo.filter((l) => l.situacao === 'sem_equipamento').length,
      };
    };

    return Response.json({
      ok: true,
      horas,
      conversas_lidas: lista.length,
      leitura_parcial: parcial,
      linhas,
      resumo: {
        'QUERO SER VIP': contar('QUERO SER VIP'),
        'SEM CONDIÇÕES AGORA': contar('SEM CONDIÇÕES AGORA'),
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}