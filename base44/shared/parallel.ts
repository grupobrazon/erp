/**
 * Executa fn para cada item da lista respeitando um limite de chamadas simultâneas.
 * O runtime do worker mantém ~6 conexões por vez — use 6 como limite.
 */
export async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) {
      const idx = next++;
      out[idx] = await fn(list[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}