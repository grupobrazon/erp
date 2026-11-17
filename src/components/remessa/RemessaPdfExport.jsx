import React from "react";
import { FileDown } from "lucide-react";

const LOGO_URL = "https://media.base44.com/images/public/6a1f6fc98b44d834e281aa51/851be8c4e_logobrazon.jpg";

const fmtMoney = (v) => `R$ ${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";

function buildHtml({ remessa, client, billingLocation }) {
  const bl = billingLocation || {};
  const blAddress = [bl.street, bl.number, bl.neighborhood, bl.city, bl.state].filter(Boolean).join(", ");
  const blCep = bl.zip_code ? ` — CEP ${bl.zip_code}` : "";
  const companyLine = bl.name || "GRUPO BRAZON";
  const title = `${remessa.remessa_type?.toUpperCase() || "REMESSA"} Nº ${remessa.code || "—"}`;

  const totalItems = (remessa.items || []).reduce((s, i) => s + (i.total || 0), 0);
  const grandTotal = totalItems + (remessa.freight || 0) - (remessa.discount || 0);

  const rows = (remessa.items || []).map((item, idx) => `
    <tr style="${idx % 2 === 0 ? "background:#f8fafc" : "background:#fff"}">
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">${item.product_name || "—"}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:11px;">${item.quantity || 0}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px;">${fmtMoney(item.unit_price)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;font-size:11px;">${fmtMoney(item.total)}</td>
    </tr>
  `).join("");

  const clientDoc = client?.document ? `<span style="color:#6b7280;">CPF/CNPJ:</span> <strong>${client.document}</strong> &nbsp;&nbsp;` : "";
  const fmtAddrLine = (a) => {
    if (!a?.street) return "";
    return `${a.street}, ${a.number || ""} — ${a.neighborhood || ""}, ${a.city || ""}/${a.state || ""} — CEP ${a.zip_code || ""}`;
  };
  const clientAddress = [client?.street, client?.number, client?.complement, client?.neighborhood, client?.city, client?.state].filter(Boolean).join(", ");
  const deliveryAddr = remessa.delivery_address?.street ? fmtAddrLine(remessa.delivery_address) : clientAddress || "—";

  const returnBlock = remessa.return_status && remessa.return_status !== "Não Aplicável" ? `
    &nbsp;&nbsp;|&nbsp;&nbsp;Retorno: <strong>${remessa.return_status}</strong>${remessa.return_date ? ` &nbsp;&nbsp;|&nbsp;&nbsp;Data Retorno: <strong>${fmtDate(remessa.return_date)}</strong>` : ""}
  ` : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', Arial, sans-serif; font-size: 12px; color: #1e293b; background: #fff; }
    @page { size: A4; margin: 10mm 12mm; }
    @media print {
      body { margin: 0; padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body style="padding:18px 22px;max-width:820px;margin:0 auto;">

  <!-- HEADER -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
    <div style="font-size:10.5px;color:#374151;line-height:1.45;">
      <strong style="font-size:12px;color:#111827;">${companyLine}</strong><br/>
      ${bl.cnpj ? `CNPJ: <strong>${bl.cnpj}</strong>` : ""}${bl.cnpj && bl.state_registration ? " &nbsp;|&nbsp; " : ""}${bl.state_registration ? `IE: <strong>${bl.state_registration}</strong>` : ""}<br/>
      ${blAddress ? `Endereço: <strong>${blAddress}${blCep}</strong><br/>` : ""}
      ${bl.phone ? `Tel: <strong>${bl.phone}</strong>` : ""}${bl.phone && bl.email ? " &nbsp;|&nbsp; " : ""}${bl.email ? `E-mail: <strong>${bl.email}</strong>` : ""}
    </div>
    <img src="${LOGO_URL}" alt="Brazon" style="height:78px;object-fit:contain;" />
  </div>

  <hr style="border:none;border-top:2px solid #6366f1;margin-bottom:10px;" />

  <!-- TITLE BLOCK -->
  <div style="margin-bottom:10px;">
    <div style="font-size:17px;font-weight:800;color:#3730a3;letter-spacing:.5px;">${title}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:2px;">
      Data: <strong>${fmtDate(remessa.date)}</strong>
      &nbsp;&nbsp;|&nbsp;&nbsp;
      Tipo: <strong>${remessa.remessa_type || "—"}</strong>
      &nbsp;&nbsp;|&nbsp;&nbsp;
      Status: <strong>${remessa.status || "—"}</strong>
      &nbsp;&nbsp;|&nbsp;&nbsp;
      CFOP: <strong>${remessa.cfop_code || "—"}</strong>
      ${returnBlock}
    </div>
    ${remessa.natureza_operacao ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">Natureza da Operação: <strong>${remessa.natureza_operacao}</strong></div>` : ""}
  </div>

  <!-- DADOS DO CLIENTE -->
  <div style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin-bottom:10px;">
    <div style="background:#6366f1;color:#fff;padding:5px 12px;font-weight:700;font-size:11px;letter-spacing:.5px;">DADOS DO CLIENTE</div>
    <div style="padding:8px 12px;display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:11px;color:#374151;">
      <div><span style="color:#6b7280;">Nome/Razão Social:</span> <strong>${client?.name || remessa.client_name || "—"}</strong></div>
      <div>${clientDoc}</div>
      ${client?.email ? `<div><span style="color:#6b7280;">E-mail:</span> <strong>${client.email}</strong></div>` : "<div></div>"}
      <div><span style="color:#6b7280;">Telefone:</span> <strong>${client?.phone1 || "—"}</strong></div>
      <div style="grid-column:span 2"><span style="color:#6b7280;">Endereço de Entrega:</span> <strong>${deliveryAddr}</strong></div>
    </div>
  </div>

  <!-- ITENS -->
  <div style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin-bottom:10px;">
    <div style="background:#6366f1;color:#fff;padding:5px 12px;font-weight:700;font-size:11px;letter-spacing:.5px;">ITENS DA REMESSA</div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:5px 8px;text-align:left;font-size:10px;color:#475569;border-bottom:2px solid #e2e8f0;">PRODUTO</th>
          <th style="padding:5px 8px;text-align:center;font-size:10px;color:#475569;border-bottom:2px solid #e2e8f0;">QTD</th>
          <th style="padding:5px 8px;text-align:right;font-size:10px;color:#475569;border-bottom:2px solid #e2e8f0;">PREÇO UNIT.</th>
          <th style="padding:5px 8px;text-align:right;font-size:10px;color:#475569;border-bottom:2px solid #e2e8f0;">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="4" style="padding:12px;text-align:center;color:#6b7280;">Nenhum item.</td></tr>`}
      </tbody>
    </table>

    <!-- TOTAIS -->
    <div style="display:flex;justify-content:flex-end;padding:8px 12px;border-top:2px solid #e2e8f0;">
      <div style="width:240px;font-size:11px;">
        <div style="display:flex;justify-content:space-between;padding:2px 0;color:#6b7280;">
          <span>Subtotal dos itens:</span><span>${fmtMoney(totalItems)}</span>
        </div>
        ${remessa.discount > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;color:#dc2626;"><span>Desconto:</span><span>-${fmtMoney(remessa.discount)}</span></div>` : ""}
        ${remessa.freight > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;color:#6b7280;"><span>Frete:</span><span>${fmtMoney(remessa.freight)}</span></div>` : ""}
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-top:2px solid #6366f1;margin-top:3px;font-weight:800;font-size:13px;color:#3730a3;">
          <span>TOTAL GERAL:</span><span>${fmtMoney(remessa.grand_total != null ? remessa.grand_total : grandTotal)}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- OBSERVAÇÕES -->
  ${remessa.notes ? `
  <div style="border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:11px;">
    <strong style="color:#374151;">Observações:</strong> <span style="color:#6b7280;">${remessa.notes}</span>
  </div>
  ` : ""}

  <!-- FOOTER -->
  <hr style="border:none;border-top:1px solid #e2e8f0;margin-top:14px;" />
  <div style="text-align:center;font-size:10px;color:#94a3b8;padding:6px 0;">
    Grupo Brazon &nbsp;|&nbsp; Documento gerado em ${new Date().toLocaleString("pt-BR")}
  </div>

  <!-- PRINT BUTTON -->
  <div class="no-print" style="position:fixed;top:16px;right:16px;display:flex;gap:8px;">
    <button onclick="window.print()" style="background:#6366f1;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">🖨️ Imprimir / Salvar PDF</button>
    <button onclick="window.close()" style="background:#f1f5f9;color:#374151;border:1px solid #e2e8f0;padding:10px 20px;border-radius:8px;font-size:13px;cursor:pointer;">Fechar</button>
  </div>

</body>
</html>`;
}

export function openRemessaPdf({ remessa, client, billingLocation }) {
  const html = buildHtml({ remessa, client, billingLocation });
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

export default function RemessaPdfExport({ remessa, client, billingLocation, label }) {
  return (
    <button
      type="button"
      onClick={() => openRemessaPdf({ remessa, client, billingLocation })}
      className="inline-flex items-center gap-2 rounded-md border border-input bg-transparent px-3 text-xs shadow-sm hover:bg-accent"
    >
      <FileDown className="h-4 w-4" />
      {label || "Exportar Remessa PDF"}
    </button>
  );
}