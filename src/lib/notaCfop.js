/**
 * CFOP de venda — mesma regra aplicada na emissão da NF-e (emitNFe):
 * base = SystemSetting.cfop_internal, ajustada pela UF do emitente vs destinatário
 * (5xxx operação interna / 6xxx interestadual). Usada para exibir o CFOP
 * efetivo da emissão de Notas Simples (sem XML/SEFAZ).
 * Retorna null quando não dá para determinar com certeza (UFs ausentes).
 */
export function deriveSaleCfop({ cfopInternal, emitterState, destState }) {
  const base = String(cfopInternal || "5102");
  const emit = String(emitterState || "").toUpperCase();
  const dest = String(destState || "").toUpperCase();
  if (!emit || !dest) return null;
  const isInternal = emit === dest;
  if (isInternal) return base.startsWith("6") ? "5" + base.slice(1) : base;
  return base.startsWith("5") ? "6" + base.slice(1) : base;
}