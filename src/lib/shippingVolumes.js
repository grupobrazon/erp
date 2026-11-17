// Validação de coerência entre os itens do pedido e os volumes de frete salvos.
// Detecta cotações desatualizadas: se itens/quantidades foram alterados depois da
// última cotação, os volumes salvos divergem da composição atual do pedido.
//
// Respeita o modo de empacotamento: volumes COMPARTILHADOS (product_id vazio —
// ex.: volume único do modo unify_all, onde dois ou mais produtos compartilham o
// mesmo volume) são válidos e cobrem a quantidade restante dos itens. O bloqueio
// ocorre somente quando há divergência real entre a composição atual do pedido
// e os volumes salvos da última cotação.

export const VOLUMES_OUTDATED_MESSAGE =
  "Este pedido foi alterado após a última cotação de frete. Os volumes salvos estão desatualizados. Revise os volumes e faça uma nova cotação antes de gerar as etiquetas.";

// Retorna { ok: boolean, reason: string } — reason explica a divergência encontrada.
export function validateVolumesAgainstItems(items, volumes, packingMode) {
  const itemsList = items || [];
  const vols = volumes || [];

  if (itemsList.length === 0) return { ok: true, reason: "" };
  if (vols.length === 0) {
    return { ok: false, reason: "O pedido possui itens de produto, mas não possui volumes de frete salvos." };
  }

  // Composição esperada do pedido: produto -> quantidade total
  const expected = {};
  const names = {};
  itemsList.forEach(i => {
    const pid = i.product_id || `sem-id:${i.product_name}`;
    expected[pid] = (expected[pid] || 0) + (Number(i.quantity) || 1);
    names[pid] = i.product_name || "Item";
  });

  // Volumes salvos: os vinculados a um produto comparam por produto;
  // os compartilhados (product_id vazio) cobrem a quantidade restante.
  const found = {};
  let sharedQty = 0;
  let orphanName = null;
  for (const v of vols) {
    const qty = Number(v.quantity) || 1;
    if (!v.product_id) {
      sharedQty += qty;
      continue;
    }
    if (!(v.product_id in expected)) {
      orphanName = v.label_tag || v.product_name || v.product_id;
    }
    found[v.product_id] = (found[v.product_id] || 0) + qty;
  }

  if (orphanName) {
    return { ok: false, reason: `Os volumes salvos contêm o volume "${orphanName}" de um produto que não está mais no pedido.` };
  }

  let deficit = 0;
  let excessMsg = null;
  for (const [pid, qty] of Object.entries(expected)) {
    const f = found[pid] || 0;
    if (f < qty) deficit += qty - f;
    else if (f > qty) {
      excessMsg = `O item "${names[pid]}" tem ${qty} un. no pedido, mas ${f} un. nos volumes salvos.`;
    }
  }
  if (excessMsg) return { ok: false, reason: excessMsg };

  // Quantidade em volumes compartilhados deve cobrir exatamente o que falta nos volumes vinculados.
  if (sharedQty !== deficit) {
    const totalItemQty = itemsList.reduce((s, i) => s + (Number(i.quantity) || 1), 0);
    const totalVolQty = vols.reduce((s, v) => s + (Number(v.quantity) || 1), 0);
    return {
      ok: false,
      reason: `A quantidade total dos volumes salvos (${totalVolQty} un.) diverge da composição atual do pedido (${totalItemQty} un.).`,
    };
  }
  return { ok: true, reason: "" };
}