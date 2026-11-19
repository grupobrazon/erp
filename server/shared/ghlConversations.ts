// Cópia de base44/shared/ghlConversations.ts gerada por tools/port_function.py.
// Leitura do histórico de conversas do CRM (GoHighLevel).
// Compartilhada pela varredura das campanhas (vipCampaignSweep) e pelo relatório
// de interações (listCampaignInteractions): anda da conversa mais recente para
// trás, de página em página, até o piso da janela ou até o limite de conversas.
import { secrets } from "../runtime.ts";
import { fetchConversationPage } from "./ghlClient.ts";

export const PAGINA_CONVERSAS = 100; // máximo aceito pelo CRM por página

// `startAt` = data (ms) de onde a leitura começa; `floor` = data (ms) mais antiga
// que interessa; `cap` = conversas lidas no máximo; `incluirRecentes` = soma a
// janela mais nova (usado quando a leitura continua de um cursor histórico).
// Devolve as conversas lidas e a data da mais antiga (`maisAntiga`), que é o
// cursor da próxima leitura.
export async function collectConversations({ locationId, startAt, floor, cap, incluirRecentes = false }) {
  const lidas = new Map();
  const adicionar = (pagina) => (pagina || []).forEach((c) => {
    if (c && c.id && c.contactId && !lidas.has(c.id)) lidas.set(c.id, c);
  });

  if (incluirRecentes) {
    adicionar(await fetchConversationPage(locationId, secrets, { limit: PAGINA_CONVERSAS, startAfterDate: Date.now() }));
  }

  let maisAntiga = startAt;
  while (lidas.size < cap && maisAntiga > floor) {
    const pagina = await fetchConversationPage(locationId, secrets, { limit: PAGINA_CONVERSAS, startAfterDate: maisAntiga });
    if (!pagina.length) { maisAntiga = floor; break; }
    adicionar(pagina);
    const datas = pagina.map((c) => Number(c.lastMessageDate)).filter(Boolean);
    const menor = datas.length ? Math.min(...datas) : null;
    if (!menor || menor >= maisAntiga) { maisAntiga = floor; break; } // sem avanço: encerra a busca
    maisAntiga = menor;
  }

  const lista = [...lidas.values()].slice(0, cap);
  const datas = lista.map((c) => Number(c.lastMessageDate)).filter(Boolean);
  return { lista, maisAntiga: datas.length ? Math.min(...datas) : maisAntiga };
}