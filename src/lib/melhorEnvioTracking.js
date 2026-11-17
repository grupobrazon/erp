// Constrói o link público de rastreio do Melhor Envio (Melhor Rastreio) a partir do código de rastreio.
// Este link funciona para qualquer transportadora e pode ser enviado ao cliente para acompanhar a entrega.
export function buildTrackingUrl(trackingCode) {
  const code = String(trackingCode || "").trim();
  if (!code) return "";
  return `https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(code)}`;
}