import React from "react";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";

const LOGO_URL = "https://media.base44.com/images/public/6a1f6fc98b44d834e281aa51/851be8c4e_logobrazon.jpg";

const fmtMoney = (v) => `R$ ${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";

export function buildSaleBody({ sale, orderNumber, client, mode, os, billingLocation }) {
  const isOrcamento = mode === "orcamento";
  const bl = billingLocation || {};
  const blAddress = [bl.street, bl.number, bl.neighborhood, bl.city, bl.state].filter(Boolean).join(", ");
  const blCep = bl.zip_code ? ` — CEP ${bl.zip_code}` : "";
  const companyLine = bl.name || "GRUPO BRAZON";
  const title = isOrcamento ? `ORÇAMENTO Nº ${orderNumber || "—"}` : `PEDIDO Nº ${orderNumber || "—"}`;

  const totalItems = (sale.items || []).reduce((s, i) => s + (i.total || 0), 0);
  const grandTotal = totalItems + (sale.additions || 0) + (sale.freight || 0) - (sale.discount || 0);

  const rows = (sale.items || []).map((item, idx) => `
    <tr style="${idx % 2 === 0 ? "background:#f8fafc" : "background:#fff"}">
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">
        ${item.product_name || "—"}
        ${item.purifier_model ? `<div style="font-size:10px;color:#0369a1;margin-top:1px;">Modelo do Purificador: <strong>${item.purifier_model}</strong></div>` : ""}
      </td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:11px;">${item.quantity || 0}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px;">${fmtMoney(item.unit_price)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;font-size:11px;">${fmtMoney(item.total)}</td>
    </tr>
  `).join("");

  const paymentRows = (sale.payments || []).map(p => `
    <tr>
      <td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">${p.condition_name || "—"}</td>
      <td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">
        <span style="padding:1px 6px;border-radius:9999px;font-size:10px;background:${p.payment_status === "Realizada" ? "#d1fae5" : "#fef3c7"};color:${p.payment_status === "Realizada" ? "#065f46" : "#92400e"};">
          ${p.payment_status || "Pendente"}${p.payment_moment ? ` — ${p.payment_moment}` : ""}
        </span>
      </td>
      <td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;font-size:11px;">${fmtMoney(p.amount)}</td>
    </tr>
  `).join("");

  const osSection = os ? `
    <div style="margin-top:10px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
      <div style="background:#0ea5e9;color:#fff;padding:5px 12px;font-weight:700;font-size:11px;letter-spacing:.5px;">
        ORDEM DE SERVIÇO — ${os.code || "—"}
      </div>
      <div style="padding:8px 12px;display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:11px;color:#374151;">
        <div><span style="color:#6b7280;">Tipo:</span> <strong>${os.type || "—"}</strong></div>
        <div><span style="color:#6b7280;">Status:</span> <strong>${os.status || "—"}</strong></div>
        <div><span style="color:#6b7280;">Data:</span> <strong>${fmtDate(os.date)}</strong></div>
        <div><span style="color:#6b7280;">Técnico:</span> <strong>${os.technician || "—"}</strong></div>
        ${os.delivery_address?.street ? `
        <div style="grid-column:span 2"><span style="color:#6b7280;">Endereço de Entrega:</span> <strong>${os.delivery_address.street}, ${os.delivery_address.number || ""}${os.delivery_address.complement ? " - " + os.delivery_address.complement : ""} — ${os.delivery_address.neighborhood || ""}, ${os.delivery_address.city || ""}/${os.delivery_address.state || ""}</strong></div>
        ` : ""}
        ${os.logistics_notes ? `<div style="grid-column:span 2"><span style="color:#6b7280;">Obs. Logística:</span> <em>${os.logistics_notes}</em></div>` : ""}
        ${os.notes ? `<div style="grid-column:span 2"><span style="color:#6b7280;">Observações:</span> <em>${os.notes}</em></div>` : ""}
      </div>
    </div>
  ` : "";

  const clientDoc = client?.document ? `<span style="color:#6b7280;">CPF/CNPJ:</span> <strong>${client.document}</strong> &nbsp;&nbsp;` : "";
  const fmtAddrLine = (a) => {
    if (!a?.street) return "";
    return `${a.street}, ${a.number || ""}${a.complement ? " - " + a.complement : ""} — ${a.neighborhood || ""}, ${a.city || ""}/${a.state || ""} — CEP ${a.zip_code || ""}`;
  };
  const clientAddress = [client?.street, client?.number, client?.complement, client?.neighborhood, client?.city, client?.state].filter(Boolean).join(", ");
  const billingAddr = sale.billing_address;
  const billingLine = billingAddr?.street ? fmtAddrLine(billingAddr) : clientAddress || "—";

  return `
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

  <hr style="border:none;border-top:2px solid #0ea5e9;margin-bottom:10px;" />

  <!-- TITLE BLOCK -->
  <div style="margin-bottom:10px;">
    <div style="font-size:17px;font-weight:800;color:#0c4a6e;letter-spacing:.5px;">${title}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:2px;">
      Data: <strong>${fmtDate(sale.date)}</strong>
      &nbsp;&nbsp;|&nbsp;&nbsp;
      Modalidade: <strong>${sale.delivery_modality || "—"}</strong>
      &nbsp;&nbsp;|&nbsp;&nbsp;
      Etapa: <strong>${sale.stage || "—"}</strong>
      &nbsp;&nbsp;|&nbsp;&nbsp;
      Vendedor: <strong>${sale.seller_name || "—"}</strong>
      ${sale.billing_forecast ? `&nbsp;&nbsp;|&nbsp;&nbsp;Prev. Faturamento: <strong>${fmtDate(sale.billing_forecast)}</strong>` : ""}
    </div>
  </div>

  <!-- DADOS DO CLIENTE -->
  <div style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin-bottom:10px;">
    <div style="background:#0ea5e9;color:#fff;padding:5px 12px;font-weight:700;font-size:11px;letter-spacing:.5px;">DADOS DO CLIENTE</div>
    <div style="padding:8px 12px;display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:11px;color:#374151;">
      <div><span style="color:#6b7280;">Nome/Razão Social:</span> <strong>${client?.name || sale.client_name || "—"}</strong></div>
      <div>${clientDoc}</div>
      ${client?.email ? `<div><span style="color:#6b7280;">E-mail:</span> <strong>${client.email}</strong></div>` : "<div></div>"}
      <div><span style="color:#6b7280;">Telefone:</span> <strong>${client?.phone1 || "—"}</strong></div>
      <div style="grid-column:span 2"><span style="color:#6b7280;">Endereço de Faturamento:</span> <strong>${billingLine}</strong></div>
      ${sale.delivery_different && sale.delivery_address?.street ? `
      <div style="grid-column:span 2"><span style="color:#6b7280;">Endereço de Entrega:</span> <strong>${fmtAddrLine(sale.delivery_address)}</strong></div>
      ` : ""}
    </div>
  </div>

  <!-- ITENS -->
  <div style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin-bottom:10px;">
    <div style="background:#0ea5e9;color:#fff;padding:5px 12px;font-weight:700;font-size:11px;letter-spacing:.5px;">ITENS DO PEDIDO</div>
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
        ${sale.additions > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;color:#6b7280;"><span>Acréscimos:</span><span>${fmtMoney(sale.additions)}</span></div>` : ""}
        ${sale.discount > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;color:#dc2626;"><span>Desconto:</span><span>-${fmtMoney(sale.discount)}</span></div>` : ""}
        ${sale.freight > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;color:#6b7280;"><span>Frete (${sale.selected_carrier || ""} ${sale.selected_service || ""}):</span><span>${fmtMoney(sale.freight)}</span></div>` : ""}
        ${sale.freight_exempt && sale.freight_exempt_value > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;color:#059669;"><span>Frete isentado:</span><span>R$ 0,00</span></div>` : ""}
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-top:2px solid #0ea5e9;margin-top:3px;font-weight:800;font-size:13px;color:#0c4a6e;">
          <span>TOTAL GERAL:</span><span>${fmtMoney(grandTotal)}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- PAGAMENTOS -->
  ${sale.payments?.length > 0 ? `
  <div style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin-bottom:10px;">
    <div style="background:#0ea5e9;color:#fff;padding:5px 12px;font-weight:700;font-size:11px;letter-spacing:.5px;">CONDIÇÕES DE PAGAMENTO</div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:5px 8px;text-align:left;font-size:10px;color:#475569;border-bottom:2px solid #e2e8f0;">CONDIÇÃO</th>
          <th style="padding:5px 8px;text-align:center;font-size:10px;color:#475569;border-bottom:2px solid #e2e8f0;">STATUS</th>
          <th style="padding:5px 8px;text-align:right;font-size:10px;color:#475569;border-bottom:2px solid #e2e8f0;">VALOR</th>
        </tr>
      </thead>
      <tbody>${paymentRows}</tbody>
    </table>
  </div>
  ` : ""}

  <!-- OBSERVAÇÕES -->
  ${sale.notes ? `
  <div style="border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:11px;">
    <strong style="color:#374151;">Observações:</strong> <span style="color:#6b7280;">${sale.notes}</span>
  </div>
  ` : ""}

  <!-- OS SECTION (quando imprimir da OS) -->
  ${osSection}

  <!-- FOOTER -->
  <hr style="border:none;border-top:1px solid #e2e8f0;margin-top:14px;" />
  <div style="text-align:center;font-size:10px;color:#94a3b8;padding:6px 0;">
    Grupo Brazon &nbsp;|&nbsp; Documento gerado em ${new Date().toLocaleString("pt-BR")}
  </div>

`;
}

export function openSalePdf({ sale, orderNumber, client, mode = "pedido", os = null, billingLocation = null }) {
  const body = buildSaleBody({ sale, orderNumber, client, mode, os, billingLocation });
  const docTitle = mode === "orcamento" ? `Orçamento Nº ${orderNumber || "—"}` : `Pedido Nº ${orderNumber || "—"}`;
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${docTitle}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', Arial, sans-serif; font-size: 12px; color: #1e293b; background: #fff; }
    @page { size: A4; margin: 10mm 12mm; }
    @media print { body { margin: 0; padding: 0; } .no-print { display: none !important; } }
  </style>
</head>
<body style="padding:18px 22px;max-width:820px;margin:0 auto;">
${body}
  <div class="no-print" style="position:fixed;top:16px;right:16px;display:flex;gap:8px;">
    <button onclick="window.print()" style="background:#0ea5e9;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">🖨️ Imprimir / Salvar PDF</button>
    <button onclick="window.close()" style="background:#f1f5f9;color:#374151;border:1px solid #e2e8f0;padding:10px 20px;border-radius:8px;font-size:13px;cursor:pointer;">Fechar</button>
  </div>
</body>
</html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

export default function SalePdfExport({ sale, orderNumber, client, mode = "pedido", os = null, label, billingLocation = null }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-2"
      onClick={() => openSalePdf({ sale, orderNumber, client, mode, os, billingLocation })}
    >
      <FileDown className="h-4 w-4" />
      {label || (mode === "orcamento" ? "Exportar Orçamento PDF" : "Exportar Pedido PDF")}
    </Button>
  );
}