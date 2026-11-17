// Gera o Termo de Adesão em PDF (via nova aba → imprimir/salvar em PDF),
// com os dados do cliente, o aceite digital, a assinatura e o texto do termo.

const LOGO_URL = "https://media.base44.com/images/public/6a1f6fc98b44d834e281aa51/90e503685_logobrazon.jpg";

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));

const fmtDate = (value) => {
  if (!value) return "-";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : String(value);
};

const fmtDateTime = (value) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return String(value);
  }
};

export function buildPromotionTermHtml({ promotion, adhesion, signatureUrl }) {
  const isVip = promotion?.category === "Programa VIP";
  const discount = adhesion?.accepted_discount_percent ?? promotion?.discount_percent ?? 0;
  const validity = promotion?.is_lifetime
    ? "Benefício vitalício, enquanto o cliente cumprir as condições de manutenção do programa"
    : `Vigência até ${fmtDate(promotion?.promotion_end_date)}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Termo de Adesão — ${escapeHtml(promotion?.name)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #171d26; background: #f1f5f9; line-height: 1.55; }
  .page { max-width: 820px; margin: 0 auto; background: #fff; padding: 44px 52px; }
  .header { display: flex; align-items: center; gap: 18px; border-bottom: 3px solid #0b81b7; padding-bottom: 18px; margin-bottom: 24px; }
  .header img { width: 150px; height: 52px; object-fit: contain; }
  .header h1 { font-size: 17px; font-weight: 800; }
  .header p { font-size: 12px; color: #64748b; }
  h2.title { font-size: 19px; font-weight: 800; margin-bottom: 4px; }
  .campaign { font-size: 13px; color: #0b81b7; font-weight: 700; margin-bottom: 18px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 20px; margin-bottom: 18px; }
  .grid div span { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; }
  .grid div strong { font-size: 13.5px; }
  .accept { border: 1px solid #a7d8ea; background: #eef7fb; border-radius: 10px; padding: 16px 20px; margin-bottom: 22px; }
  .accept h3 { font-size: 13px; font-weight: 800; color: #0b5d85; margin-bottom: 8px; }
  .term { white-space: pre-wrap; font-size: 12.5px; color: #1f2937; border-top: 1px solid #e5e7eb; padding-top: 18px; }
  .sign { margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 18px; }
  .sign img { max-width: 340px; border-bottom: 1px solid #94a3b8; }
  .sign p { font-size: 12px; color: #475569; margin-top: 6px; }
  .footer { margin-top: 28px; border-top: 1px solid #e5e7eb; padding-top: 12px; font-size: 11px; color: #64748b; }
  @media print { body { background: #fff; } .page { padding: 24px 28px; } .no-print { display: none !important; } }
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <img src="${LOGO_URL}" alt="Grupo Brazon" />
      <div>
        <h1>GRUPO BRAZON</h1>
        <p>Purificadores de água · Brazon e MaxFilter</p>
      </div>
    </div>

    <h2 class="title">TERMO DE ADESÃO E CONDIÇÕES — ${escapeHtml(String(promotion?.name || "").toUpperCase())}</h2>
    ${promotion?.campaign_label ? `<div class="campaign">${escapeHtml(promotion.campaign_label)}</div>` : ""}

    <div class="grid">
      <div><span>Cliente</span><strong>${escapeHtml(adhesion?.accepted_name || adhesion?.client_name)}</strong></div>
      <div><span>CPF/CNPJ</span><strong>${escapeHtml(adhesion?.accepted_document || adhesion?.client_document)}</strong></div>
      <div><span>E-mail</span><strong>${escapeHtml(adhesion?.accepted_email || adhesion?.client_email)}</strong></div>
      <div><span>WhatsApp</span><strong>${escapeHtml(adhesion?.accepted_phone || adhesion?.client_phone)}</strong></div>
      <div><span>Código de adesão</span><strong>${escapeHtml(adhesion?.token)}</strong></div>
      <div><span>Desconto concedido</span><strong>${escapeHtml(discount)}%</strong></div>
    </div>

    <div class="accept">
      <h3>REGISTRO DO ACEITE ELETRÔNICO</h3>
      <div>Data e hora do aceite: <strong>${fmtDateTime(adhesion?.accepted_at)}</strong></div>
      <div>Condição vigente: <strong>${validity}</strong></div>
      <div>Escopo do desconto: <strong>${escapeHtml(promotion?.discount_scope || "-")}</strong></div>
      ${isVip ? `<div>Classificação no sistema: <strong>Cliente VIP Brazon</strong></div>` : ""}
    </div>

    <div class="term">${escapeHtml(adhesion?.terms_snapshot || promotion?.terms_text || "")}</div>

    <div class="sign">
      ${signatureUrl ? `<img src="${signatureUrl}" alt="Assinatura digital do cliente" />` : ""}
      <p>${escapeHtml(adhesion?.accepted_name || adhesion?.client_name)} — assinatura digital registrada no sistema do Grupo Brazon em ${fmtDateTime(adhesion?.accepted_at)}</p>
    </div>

    <div class="footer">
      Grupo Brazon · Documento gerado em ${fmtDateTime(new Date().toISOString())} · Código de adesão ${escapeHtml(adhesion?.token)}
    </div>
  </div>
</body>
</html>`;
}

export function openPromotionTermPdf({ promotion, adhesion, signatureUrl }) {
  const html = buildPromotionTermHtml({ promotion, adhesion, signatureUrl });
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}