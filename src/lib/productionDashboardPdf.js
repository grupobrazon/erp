const fmtDate = (d) => {
  if (!d) return "—";
  try {
    return new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("pt-BR");
  } catch {
    return String(d);
  }
};

const STATUS_COLORS = {
  "Aguardando Produção": [245, 158, 11],
  "Produção Iniciada": [59, 130, 246],
  "Produção Liberada": [16, 185, 129],
};

function drawTable(doc, rows, startY, colWidths, options = {}) {
  const { fontSize = 8, headerFill = [37, 99, 235], headerColor = [255, 255, 255] } = options;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let x = margin;
  let y = startY;
  const rowHeight = 7;

  // Header
  doc.setFillColor(...headerFill);
  doc.setTextColor(...headerColor);
  doc.setFontSize(fontSize);
  doc.setFont("helvetica", "bold");
  for (let i = 0; i < rows[0].length; i++) {
    doc.rect(x, y, colWidths[i], rowHeight, "F");
    doc.text(String(rows[0][i] ?? ""), x + 2, y + rowHeight - 2, { maxWidth: colWidths[i] - 4 });
    x += colWidths[i];
  }
  y += rowHeight;

  // Body
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  for (let r = 1; r < rows.length; r++) {
    x = margin;
    if (r % 2 === 0) {
      doc.setFillColor(245, 247, 250);
      doc.rect(margin, y, colWidths.reduce((a, b) => a + b, 0), rowHeight, "F");
    }
    for (let i = 0; i < rows[r].length; i++) {
      doc.text(String(rows[r][i] ?? ""), x + 2, y + rowHeight - 2, { maxWidth: colWidths[i] - 4 });
      x += colWidths[i];
    }
    y += rowHeight;
    if (y > doc.internal.pageSize.getHeight() - 16) {
      doc.addPage();
      y = 16;
    }
  }
  return y;
}

export async function exportProductionDashboardPDF({ summary, chartData, viewMode, filteredOrders, filters }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 14;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text("Dashboard de Produção", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const fmtFilter = (arr) => (!arr || arr.length === 0 ? "Todos" : arr.join(", "));
  const filterDesc = [
    `Subgrupo: ${fmtFilter(filters.subgroups)}`,
    `Tipo de Produto: ${fmtFilter(filters.productTypes)}`,
    `Status: ${fmtFilter(filters.statuses)}`,
    `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
  ].join("   |   ");
  doc.text(filterDesc, 14, y);
  y += 8;

  // Summary
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Resumo por Status", 14, y);
  y += 4;
  const sumRows = [
    ["Status", "Qtd. OS", "Qtd. Itens"],
    ...Object.keys(summary).map((s) => [s, summary[s]?.os || 0, summary[s]?.items || 0]),
    ["Total", filteredOrders.length, Object.values(summary).reduce((a, b) => a + (b?.items || 0), 0)],
  ];
  y = drawTable(doc, sumRows, y, [80, 40, 40]) + 6;

  // Aggregation table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(viewMode === "subgroup" ? "Detalhamento por Subgrupo" : "Detalhamento por Produto", 14, y);
  y += 4;
  if (viewMode === "subgroup") {
    const rows = [
      ["Grupo", "Subgrupo", "Aguardando", "Em Produção", "Liberada", "Total"],
      ...chartData.map((r) => [r.group, r.name, r["Aguardando Produção"], r["Produção Iniciada"], r["Produção Liberada"], r.total]),
    ];
    y = drawTable(doc, rows, y, [55, 55, 30, 30, 30, 25]) + 6;
  } else {
    const rows = [
      ["Grupo", "Subgrupo", "Produto", "Aguardando", "Em Produção", "Liberada", "Total", "OS"],
      ...chartData.map((r) => [r.group, r.subgroup, r.name, r["Aguardando Produção"], r["Produção Iniciada"], r["Produção Liberada"], r.total, r.os_count]),
    ];
    y = drawTable(doc, rows, y, [40, 40, 60, 25, 25, 25, 20, 20]) + 6;
  }

  // OS detail
  if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 16; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Ordens de Serviço em Produção (${filteredOrders.length})`, 14, y);
  y += 4;
  const osRows = [
    ["OS", "Cliente", "Status", "Itens", "Enviado p/ Produção", "Prazo"],
    ...filteredOrders.map((os) => [
      os.code,
      os.client_name,
      os.status,
      os.items.map((i) => `${i.quantity}x ${i.product_name}`).join(" | "),
      fmtDate(os.production_sent_date),
      fmtDate(os.production_deadline || os.production_forecast_date),
    ]),
  ];
  drawTable(doc, osRows, y, [25, 55, 40, 90, 35, 35]);

  doc.save(`dashboard_producao_${new Date().toISOString().slice(0, 10)}.pdf`);
}