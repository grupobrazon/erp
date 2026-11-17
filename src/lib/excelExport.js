import * as XLSX from "xlsx";
import { SALE_STATUS } from "@/lib/distributionConversion";
import { dashLabel } from "@/lib/commercialCounting";

const PHONE_FIELDS = [
  "phone1", "phone2", "phone3", "phone4", "phone5",
  "zoox_phone1", "zoox_phone2", "zoox_phone3", "zoox_phone4", "zoox_phone5", "zoox_phone6", "zoox_phone7",
];

const fmtDate = (d) => {
  if (!d) return "";
  try {
    return new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("pt-BR");
  } catch {
    return String(d);
  }
};

export function exportProductionDashboard({ summary, bySubgroup, byProduct, viewMode, filteredOrders }) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Resumo por status
  const resumoRows = [
    ["Status", "Qtd. OS", "Qtd. Itens"],
    ...Object.keys(summary).map((s) => [s, summary[s]?.os || 0, summary[s]?.items || 0]),
    ["Total", filteredOrders.length, Object.values(summary).reduce((a, b) => a + (b?.items || 0), 0)],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumoRows), "Resumo");

  // Sheet 2: Detalhamento (subgrupo ou produto)
  if (viewMode === "subgroup") {
    const rows = [
      ["Grupo", "Subgrupo", "Aguardando", "Em Produção", "Liberada", "Total"],
      ...bySubgroup.map((r) => [r.group, r.name, r["Aguardando Produção"], r["Produção Iniciada"], r["Produção Liberada"], r.total]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Por Subgrupo");
  } else {
    const rows = [
      ["Grupo", "Subgrupo", "Tipo de Produto", "Produto", "Aguardando", "Em Produção", "Liberada", "Total", "Qtd. OS"],
      ...byProduct.map((r) => [r.group, r.subgroup, r.product_type || "", r.name, r["Aguardando Produção"], r["Produção Iniciada"], r["Produção Liberada"], r.total, r.os_count]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Por Produto");
  }

  // Sheet 3: OS detalhadas
  const osRows = [
    ["OS", "Cliente", "Status", "Itens", "Enviado p/ Produção", "Prazo"],
    ...filteredOrders.map((os) => [
      os.code,
      os.client_name,
      os.status,
      os.items.map((i) => `${i.quantity}x ${i.product_name} (${i.subgroup_name || ""})`).join(" | "),
      fmtDate(os.production_sent_date),
      fmtDate(os.production_deadline || os.production_forecast_date),
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(osRows), "Ordens de Serviço");

  XLSX.writeFile(wb, `dashboard_producao_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportSales(sales, osBySaleId = {}) {
  const wb = XLSX.utils.book_new();
  const rows = [
    ["Pedido", "Data", "Cliente", "Vendedor", "Itens", "OS", "Status da OS", "Comprovante", "Modalidade", "Total", "Etapa"],
    ...sales.map((s) => {
      const os = osBySaleId[s.id];
      const hasReceipt = (s.payments || []).some((p) => p.receipt_url);
      return [
        s.order_number || "",
        fmtDate(s.date),
        s.client_name || "",
        s.seller_name || "",
        s.items?.length || 0,
        os?.code || "",
        os?.status || "",
        hasReceipt ? "Sim" : "Não",
        s.delivery_modality || "",
        s.grand_total || s.total || 0,
        s.stage || s.status || "",
      ];
    }),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Vendas");
  XLSX.writeFile(wb, `vendas_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportProductionOrders(orders) {
  const wb = XLSX.utils.book_new();
  const rows = [
    ["OS", "Pedido", "Cliente", "Código Cliente", "Status", "Itens", "Data Venda", "Enviado p/ Produção", "Iniciada", "Previsão", "Prazo"],
    ...orders.map((os) => [
      os.code,
      os.sale_order_number || "",
      os.client_name || "",
      os.clientCode || "",
      os.status,
      os.items.map((i) => `${i.quantity}x ${i.product_name}${i.group_name ? ` (${i.group_name})` : ""}`).join(" | "),
      fmtDate(os.saleDate),
      fmtDate(os.sentDate),
      fmtDate(os.production_started_date),
      fmtDate(os.production_forecast_date),
      fmtDate(os.production_deadline),
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Produção");
  XLSX.writeFile(wb, `producao_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportClientDistribution(clients, sellers, conversionMap = new Map()) {
  const wb = XLSX.utils.book_new();
  const sellerMap = new Map(sellers.map((s) => [s.id, s.name]));
  const clientPhones = clients.map((c) => PHONE_FIELDS.map((f) => c[f]).filter(Boolean));
  const maxPhones = Math.max(1, ...clientPhones.map((p) => p.length));
  const header = ["Nome", "Código", "CPF/CNPJ", "Cidade/UF", "Vendedora", "Status da Venda"];
  for (let i = 1; i <= maxPhones; i++) header.push(`Telefone ${i}`);
  const rows = [
    header,
    ...clients.map((c, i) => {
      const row = [
        c.name || "",
        c.new_code || c.old_code || "",
        c.document || "",
        [c.city, c.state].filter(Boolean).join(" - "),
        sellerMap.get(c.seller_id) || c.seller_name || "",
        conversionMap.get(c.id)?.status || SALE_STATUS.none,
      ];
      for (const p of clientPhones[i]) row.push(p);
      return row;
    }),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Distribuição");
  XLSX.writeFile(wb, `distribuicao_clientes_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportSalesReportDetailed(rows) {
  const wb = XLSX.utils.book_new();
  const data = [
    ["Pedido", "Data", "Cliente", "Vendedor", "Produto", "Qtd", "Preço Unit.", "Total Item", "Modalidade", "Etapa", "OS", "Status OS", "Computa o Dashboard", "Observação (Dashboard)"],
    ...rows.map((r) => [
      r.sale.order_number || "",
      fmtDate(r.sale.date),
      r.sale.client_name || "",
      r.sale.seller_name || "",
      r.product_name,
      r.quantity,
      r.unit_price,
      r.total,
      r.sale.delivery_modality || "",
      r.sale.stage || r.sale.status || "",
      r.os?.code || "",
      r.os?.status || "",
      r.dash?.counted ? `⭐ ${dashLabel(r.dash)}` : "",
      r.dash && !r.dash.counted ? r.dash.note : "",
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "Relatório Detalhado");
  XLSX.writeFile(wb, `relatorio_vendas_detalhado_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportSalesReportSummary(rows) {
  const wb = XLSX.utils.book_new();
  const data = [
    ["Produto", "Qtd Total", "Nº de Pedidos", "Valor Total"],
    ...rows.map((r) => [r.product_name, r.total_quantity, r.order_count, r.total_value]),
    ["Total Geral", rows.reduce((s, r) => s + r.total_quantity, 0), "", rows.reduce((s, r) => s + r.total_value, 0)],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "Somatório por Produto");
  XLSX.writeFile(wb, `relatorio_vendas_somatorio_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportClientPhones(clients, equipmentByClient = new Map(), sellerMap = new Map()) {
  const wb = XLSX.utils.book_new();
  const clientPhones = clients.map((c) => PHONE_FIELDS.map((f) => c[f]).filter(Boolean));
  const maxPhones = Math.max(1, ...clientPhones.map((p) => p.length));
  const header = ["Nome", "Código", "Vendedora", "CPF/CNPJ", "Estado", "Cidade", "Bairro", "Modelo do Equipamento", "Última Cápsula"];
  for (let i = 1; i <= maxPhones; i++) header.push(`Telefone ${i}`);
  const rows = [
    header,
    ...clients.map((c, i) => {
      const eqs = equipmentByClient.get(c.id) || [];
      const models = eqs.map((e) => e.model || e.product_name || "").filter(Boolean).join(" / ");
      const capsules = eqs.map((e) => e.last_maintenance_part_name || "").filter(Boolean).join(" / ");
      const row = [
        c.name || "",
        c.new_code || c.old_code || "",
        sellerMap.get(c.seller_id) || c.seller_name || "",
        c.document || "",
        c.state || "",
        c.city || "",
        c.neighborhood || "",
        models,
        capsules,
      ];
      for (const p of clientPhones[i]) row.push(p);
      return row;
    }),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Telefones");
  XLSX.writeFile(wb, `relatorio_telefones_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportNeighborhoodRegionalReport(byNeighborhood, byRegional) {
  const wb = XLSX.utils.book_new();
  // Sheet 1: por bairro (com regional)
  const rows = [
    ["Bairro", "Quantidade de Clientes", "Regional"],
    ...byNeighborhood.map((n) => [n.name, n.count, n.regional || "NÃO PARAMETRIZADA"]),
    ["Total", byNeighborhood.reduce((s, n) => s + n.count, 0), ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Bairros por Regional");
  // Sheet 2: resumo por regional
  const regRows = [
    ["Regional", "Quantidade de Clientes", "Bairros"],
    ...byRegional.map((r) => [r.name, r.count, r.neighborhoods]),
    ["Total", byRegional.reduce((s, r) => s + r.count, 0), ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(regRows), "Resumo por Regional");
  XLSX.writeFile(wb, `raio_x_bairros_regional_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportServiceOrders(orders, tab, tosDataByParent = {}) {
  const wb = XLSX.utils.book_new();
  let header, rows;

  if (tab === "os_tecnico") {
    header = ["OS Mãe", "OS Técnico", "Pedido", "Tipo", "Cliente", "Data Agenda", "Prioridade", "Técnico", "Status", "Data Conclusão", "Tipo de Serviço"];
    rows = orders.map((o) => {
      const tos = tosDataByParent[o.id] || {};
      const servicos = (tos.service_detail_types || []).map((s) => s.service_type_name).filter(Boolean).join(" | ");
      return [
        o.code || "",
        o.technician_os_code || "",
        o.sale_order_number || "",
        o.type || "Manutenção",
        o.client_name || "",
        fmtDate(o.appointment_date),
        o.priority_alert || "",
        o.technician || tos.technician_name || "",
        tos.status || "",
        fmtDate(tos.completed_at),
        servicos,
      ];
    });
  } else if (tab === "os_reversa") {
    header = ["Código Reversa", "OS Original", "Cliente", "Pedido", "Motivo", "Rastreio", "Recebida", "Status"];
    rows = orders.map((o) => [
      o.code || "",
      o.reverse_parent_os_code || "",
      o.client_name || "",
      o.sale_order_number || "",
      o.reverse_reason || "",
      (o.reverse_shipments || []).map((s) => s.tracking_code).filter(Boolean).join(", "),
      o.reverse_received ? "Sim" : "Não",
      o.status || "",
    ]);
  } else {
    header = ["Código", "Tipo", "Pedido", "Cliente", "Entrega", "Data Agenda", "Prioridade", "Técnico", "Status", "Romaneio", "Pagamento"];
    rows = orders.map((o) => {
      const pagamento = o.has_pending_payment
        ? `Pendente R$ ${(o.pending_payment_amount || 0).toFixed(2)}`
        : o.received_amount > 0
          ? `Recebido R$ ${(o.received_amount || 0).toFixed(2)}`
          : "";
      return [
        o.code || "",
        o.type || "Manutenção",
        o.sale_order_number || "",
        o.client_name || "",
        fmtDate(o.delivery_date),
        fmtDate(o.appointment_date),
        o.priority_alert || "",
        o.technician || "",
        o.status || "",
        fmtDate(o.romaneio_date),
        pagamento,
      ];
    });
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Ordens de Serviço");
  XLSX.writeFile(wb, `ordens_servico_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

const slugify = (text) => String(text || "pedidos")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, "_")
  .toLowerCase()
  .replace(/^_+|_+$/g, "");

export function exportDashboardSales(items, title) {
  const wb = XLSX.utils.book_new();
  const list = items || [];
  // A coluna de tempo em aberto só entra nos relatórios de orçamento
  const showDaysOpen = list.some((i) => i.days_open !== undefined && i.days_open !== null);
  const baseHeader = ["Pedido", "Data", "Cliente", "Vendedor", "Etapa", "OS", "Status da OS", "OS Técnico", "Status da OS Técnico"];
  const header = [
    ...baseHeader,
    ...(showDaysOpen ? ["Dias em Aberto"] : []),
    "Modalidade", "Valor", "Agendamento", "Motivo",
  ];
  const rows = list.map((i) => [
    i.order_number || "",
    fmtDate(i.date),
    i.client_name || "",
    i.seller_name || "",
    i.stage || "",
    i.os_code || "",
    i.os_status || "",
    i.tos_code || "",
    i.tos_status || "",
    ...(showDaysOpen ? [i.days_open != null ? i.days_open : ""] : []),
    i.modality || "",
    i.value || 0,
    fmtDate(i.appointment_date),
    i.reason || "",
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Pedidos");
  XLSX.writeFile(wb, `${slugify(title)}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportClientDistributionEquipment(equipment, clientCodeMap) {
  const wb = XLSX.utils.book_new();
  const rows = [
    ["Cliente", "Código", "Patrimônio", "Equipamento", "Modelo", "Grupo", "Subgrupo", "Marca", "Refil", "Última Manutenção", "Próxima Manutenção", "Status"],
    ...equipment.map((e) => [
      e.client_name || "",
      clientCodeMap.get(e.client_id) || "",
      e.patrimony_code || e.code || "",
      e.product_name || "",
      e.model || "",
      e.group_name || "",
      e.subgroup_name || "",
      e.brand || "",
      e.last_maintenance_part_name || "",
      fmtDate(e.last_maintenance_date),
      fmtDate(e.next_maintenance_date),
      e.status || "",
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Equipamentos");
  XLSX.writeFile(wb, `equipamentos_distribuicao_${new Date().toISOString().slice(0, 10)}.xlsx`);
}