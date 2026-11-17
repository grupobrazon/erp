// Motor de distribuição inteligente de clientes entre vendedoras.
//
// Objetivos:
//  - Distribuição total igualitária entre as vendedoras (cargas balanceadas).
//  - Coesão de bairro: o mesmo bairro vai para a mesma vendedora (dentro da mesma cidade).
//  - Cidades pequenas (<= LIMITE_CIDADE_PEQUENA) são centralizadas em uma única vendedora.
//  - Cidades grandes (> LIMITE_CIDADE_PEQUENA) são divididas igualmente, mantendo os bairros
//    coesos; um único bairro gigante (acima de FATOR_DIVISAO * mediaPorVendedora) é dividido
//    entre as vendedoras para alcançar o equilíbrio (ex.: cidade de 100 com bairro único Centro -> 50/50).
//  - Memória histórica: bairros já atribuídos a uma vendedora (em distribuições anteriores
//    não estornadas) continuam com essa vendedora quando ela está no conjunto de destino.

export const LIMITE_CIDADE_PEQUENA = 50; // cidades com <= 50 clientes são centralizadas
export const FATOR_DIVISAO = 1.5; // bairros maiores que 1.5x a média por vendedora são divididos

const chaveBairro = (c) => `${c.state || ""}|${c.city || ""}|${c.neighborhood || "(Sem bairro)"}`;
const chaveCidade = (c) => `${c.state || ""}|${c.city || ""}`;

function argMin(arr) {
  let min = 0;
  for (let i = 1; i < arr.length; i++) if (arr[i] < arr[min]) min = i;
  return min;
}

// Constrói a memória de bairros a partir de todos os clientes já atribuídos.
// Retorna Map<chaveBairro, sellerId> com o seller majoritário do bairro.
export function buildNeighborhoodMemory(allClients, targetSellerIds) {
  const targetSet = new Set(targetSellerIds);
  const counts = new Map(); // chave -> Map<sellerId, n>
  for (const c of allClients) {
    if (!c.seller_id) continue;
    const key = chaveBairro(c);
    if (!counts.has(key)) counts.set(key, new Map());
    const m = counts.get(key);
    m.set(c.seller_id, (m.get(c.seller_id) || 0) + 1);
  }
  const memory = new Map();
  for (const [key, m] of counts) {
    let best = null;
    let bestN = -1;
    for (const [sid, n] of m) {
      // só considera vendedoras que ainda existem; mesmo as fora do alvo contam para a memória,
      // mas a preferência só é aplicada se o seller estiver no conjunto de destino.
      if (n > bestN) {
        bestN = n;
        best = sid;
      }
    }
    if (best && (targetSet.size === 0 || targetSet.has(best))) memory.set(key, best);
  }
  return memory;
}

// Distribui os clientes selecionados entre as vendedoras alvo.
// Retorna array de { clientId, sellerIndex }.
export function distributeClients(selectedClients, targetSellers, allClients) {
  const N = targetSellers.length;
  if (N === 0) return [];
  if (N === 1) return selectedClients.map((c) => ({ clientId: c.id, sellerIndex: 0 }));

  const targetIds = targetSellers.map((s) => s.id);
  const memory = buildNeighborhoodMemory(allClients || selectedClients, targetIds);

  // Agrupa selecionados por cidade
  const byCity = new Map();
  for (const c of selectedClients) {
    const key = chaveCidade(c);
    if (!byCity.has(key)) byCity.set(key, []);
    byCity.get(key).push(c);
  }
  // Cidades grandes primeiro -> equilibra o global antes de precher com cidades pequenas
  const cidades = [...byCity.values()].sort((a, b) => b.length - a.length);

  const assignments = [];
  const globalLoads = new Array(N).fill(0);

  for (const cityClients of cidades) {
    const cityTotal = cityClients.length;

    // Agrupa por bairro (desc por tamanho)
    const byNbh = new Map();
    for (const c of cityClients) {
      const k = chaveBairro(c);
      if (!byNbh.has(k)) byNbh.set(k, []);
      byNbh.get(k).push(c);
    }
    const bairros = [...byNbh.entries()]
      .map(([key, clients]) => ({ key, clients }))
      .sort((a, b) => b.clients.length - a.clients.length);

    if (cityTotal <= LIMITE_CIDADE_PEQUENA) {
      // Cidade pequena: centralizar em uma vendedora.
      // Preferência de memória: vendedora majoritária lembrada para os bairros da cidade.
      let chosen = argMin(globalLoads);
      const memCount = new Map();
      for (const nbh of bairros) {
        const sid = memory.get(nbh.key);
        if (sid && targetIds.includes(sid)) {
          memCount.set(sid, (memCount.get(sid) || 0) + nbh.clients.length);
        }
      }
      if (memCount.size) {
        let best = null;
        let bestN = -1;
        for (const [sid, n] of memCount) if (n > bestN) { bestN = n; best = sid; }
        const idx = targetIds.indexOf(best);
        if (idx >= 0) chosen = idx;
      }
      for (const c of cityClients) assignments.push({ clientId: c.id, sellerIndex: chosen });
      globalLoads[chosen] += cityTotal;
    } else {
      // Cidade grande: dividir igualmente mantendo bairros coesos.
      const mediaPorVendedora = cityTotal / N;
      const cityLoads = new Array(N).fill(0);

      for (const nbh of bairros) {
        const size = nbh.clients.length;
        const remembered = memory.get(nbh.key);
        const rememberedIdx = remembered ? targetIds.indexOf(remembered) : -1;

        if (rememberedIdx >= 0 && cityLoads[rememberedIdx] + size <= mediaPorVendedora * FATOR_DIVISAO) {
          // Memória: manter bairro com a vendedora anterior (sem desequilibrar muito).
          for (const c of nbh.clients) assignments.push({ clientId: c.id, sellerIndex: rememberedIdx });
          cityLoads[rememberedIdx] += size;
        } else if (size > mediaPorVendedora * FATOR_DIVISAO) {
          // Bairro gigante: dividir entre as vendedoras para equilibrar a cidade.
          for (const c of nbh.clients) {
            const idx = argMin(cityLoads);
            assignments.push({ clientId: c.id, sellerIndex: idx });
            cityLoads[idx] += 1;
          }
        } else {
          // Bairro coeso: vai inteiro para a vendedora com menor carga na cidade.
          const idx = argMin(cityLoads);
          for (const c of nbh.clients) assignments.push({ clientId: c.id, sellerIndex: idx });
          cityLoads[idx] += size;
        }
      }
      for (let i = 0; i < N; i++) globalLoads[i] += cityLoads[i];
    }
  }

  return assignments;
}