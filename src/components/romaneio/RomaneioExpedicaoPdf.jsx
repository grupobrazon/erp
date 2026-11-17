import React from "react";
import { FileDown } from "lucide-react";

const LOGO_URL = "https://media.base44.com/images/public/6a1f6fc98b44d834e281aa51/851be8c4e_logobrazon.jpg";

const fmtDate = (d) => (d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—");

// Agrupa os volumes das OS selecionadas por transportadora
function groupByCarrier(selectedOrders) {
  const groups = {};
  for (const os of selectedOrders) {
    const labels = Array.isArray(os.melhor_envio_labels) ? os.melhor_envio_labels : [];
    for (const lbl of labels) {
      const carrier = lbl.carrier || os.carrier || "Não informada";
      if (!groups[carrier]) groups[carrier] = [];
      groups[carrier].push({
        os_code: os.code,
        client_name: os.client_name,
        city: os.delivery_address?.city || "",
        state: os.delivery_address?.state || "",
        neighborhood: os.delivery_address?.neighborhood || "",
        volume_index: lbl.volume_index,
        label_tag: lbl.label_tag || `Vol. ${lbl.volume_index || "?"}`,
        product_name: lbl.product_name || "—",
        quantity: lbl.quantity || 0,
        tracking_code: lbl.tracking_code || os.tracking_code || "",
        shipment_id: lbl.shipment_id || "",
      });
    }
  }
  return groups;
}

function buildCarrierSection(carrier, volumes, romaneioDate) {
  const rows = volumes
    .map(
      (v, idx) => `
    <tr style="${idx % 2 === 0 ? "background:#f8fafc" : "background:#fff"}">
      <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:10px;font-family:monospace;font-weight:600;">${v.os_code || "—"}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:10px;">${v.client_name || "—"}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:10px;">${v.label_tag}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:10px;">${v.product_name}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:10px;">${v.quantity}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:10px;">${v.neighborhood ? v.neighborhood + " — " : ""}${v.city || ""}${v.state ? "/" + v.state : ""}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:10px;font-family:monospace;">${v.tracking_code || "—"}</td>
    </tr>
  `
    )
    .join("");

  const totalVolumes = volumes.length;

  return `
    <div style="page-break-after:always;margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div style="font-size:10.5px;color:#374151;line-height:1.45;">
          <strong style="font-size:12px;color:#111827;">GRUPO BRAZON</strong><br/>
          Romaneio de Expedição
        </div>
        <img src="${LOGO_URL}" alt="Brazon" style="height:68px;object-fit:contain;" />
      </div>
      <hr style="border:none;border-top:2px solid #0ea5e9;margin-bottom:10px;" />
      <div style="margin-bottom:10px;">
        <div style="font-size:16px;font-weight:800;color:#0369a1;letter-spacing:.5px;">ROMANEIO DE EXPEDIÇÃO — ${carrier.toUpperCase()}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">
          Data de Postagem: <strong>${fmtDate(romaneioDate)}</strong>
          &nbsp;&nbsp;|&nbsp;&nbsp; Total de Volumes: <strong>${totalVolumes}</strong>
        </div>
      </div>
      <div style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="padding:6px 8px;text-align:left;font-size:9px;color:#475569;border-bottom:2px solid #e2e8f0;">OS</th>
              <th style="padding:6px 8px;text-align:left;font-size:9px;color:#475569;border-bottom:2px solid #e2e8f0;">CLIENTE</th>
              <th style="padding:6px 8px;text-align:left;font-size:9px;color:#475569;border-bottom:2px solid #e2e8f0;">VOLUME</th>
              <th style="padding:6px 8px;text-align:left;font-size:9px;color:#475569;border-bottom:2px solid #e2e8f0;">PRODUTO</th>
              <th style="padding:6px 8px;text-align:center;font-size:9px;color:#475569;border-bottom:2px solid #e2e8f0;">QTD</th>
              <th style="padding:6px 8px;text-align:left;font-size:9px;color:#475569;border-bottom:2px solid #e2e8f0;">DESTINO</th>
              <th style="padding:6px 8px;text-align:left;font-size:9px;color:#475569;border-bottom:2px solid #e2e8f0;">RASTREIO</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="margin-top:30px;display:flex;gap:60px;">
        <div style="flex:1;">
          <div style="border-top:1px solid #475569;padding-top:4px;font-size:10px;color:#6b7280;text-align:center;">Separado por</div>
        </div>
        <div style="flex:1;">
          <div style="border-top:1px solid #475569;padding-top:4px;font-size:10px;color:#6b7280;text-align:center;">Conferido por</div>
        </div>
        <div style="flex:1;">
          <div style="border-top:1px solid #475569;padding-top:4px;font-size:10px;color:#6b7280;text-align:center;">Postado por</div>
        </div>
      </div>
    </div>
  `;
}

function buildHtml({ selectedOrders, romaneioDate }) {
  const groups = groupByCarrier(selectedOrders);
  const carriers = Object.keys(groups).sort();
  const sections = carriers.map((c) => buildCarrierSection(c, groups[c], romaneioDate)).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Romaneio de Expedição — ${fmtDate(romaneioDate)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', Arial, sans-serif; font-size: 12px; color: #1e293b; background: #fff; }
    @page { size: A4; margin: 10mm 12mm; }
    @media print { body { margin: 0; padding: 0; } .no-print { display: none !important; } }
  </style>
</head>
<body style="padding:18px 22px;max-width:820px;margin:0 auto;">
  ${sections}
  <hr style="border:none;border-top:1px solid #e2e8f0;margin-top:10px;" />
  <div style="text-align:center;font-size:10px;color:#94a3b8;padding:6px 0;">
    Grupo Brazon &nbsp;|&nbsp; Romaneio gerado em ${new Date().toLocaleString("pt-BR")}
  </div>
  <div class="no-print" style="position:fixed;top:16px;right:16px;display:flex;gap:8px;">
    <button onclick="window.print()" style="background:#0ea5e9;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">🖨️ Imprimir / Salvar PDF</button>
    <button onclick="window.close()" style="background:#f1f5f9;color:#374151;border:1px solid #e2e8f0;padding:10px 20px;border-radius:8px;font-size:13px;cursor:pointer;">Fechar</button>
  </div>
</body>
</html>`;
}

export function openRomaneioExpedicaoPdf({ selectedOrders, romaneioDate }) {
  const html = buildHtml({ selectedOrders, romaneioDate });
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

export default function RomaneioExpedicaoPdf({ selectedOrders, romaneioDate, label }) {
  return (
    <button
      type="button"
      onClick={() => openRomaneioExpedicaoPdf({ selectedOrders, romaneioDate })}
      className="inline-flex items-center gap-2 rounded-md border border-input bg-transparent px-3 text-xs shadow-sm hover:bg-accent"
    >
      <FileDown className="h-4 w-4" />
      {label || "Gerar Romaneio PDF"}
    </button>
  );
}