import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, MapPin, Wrench, Truck, DollarSign, Package, Printer, ClipboardList } from "lucide-react";
import { buildSaleBody } from "@/components/sales/SalePdfExport";

const LOGO_URL = "https://media.base44.com/images/public/6a1f6fc98b44d834e281aa51/851be8c4e_logobrazon.jpg";
const fmtMoney = (v) => `R$ ${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

function openPrintWindow(title, bodyHtml) {
  const win = window.open("", "_blank");
  if (!win) {
    alert("Permita pop-ups para imprimir o romaneio.");
    return;
  }
  win.document.write(`
<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  * { box-sizing: border-box; }
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  body { font-family: 'Inter', Arial, Helvetica, sans-serif; padding: 20px; color: #1e293b; }
  .header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; border-bottom: 2px solid #0ea5e9; padding-bottom: 10px; }
  .header img { height: 40px; }
  .header h1 { font-size: 16px; margin: 0; }
  .header .subtitle { font-size: 11px; color: #64748b; }
  .route-info { display: flex; gap: 20px; font-size: 12px; margin-bottom: 16px; background: #f8fafc; padding: 10px 14px; border-radius: 6px; }
  .route-info span { display: flex; gap: 4px; }
  .route-info strong { color: #0369a1; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #0ea5e9; color: #fff; padding: 6px 8px; font-size: 11px; text-align: left; }
  td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
  tr:nth-child(even) { background: #f8fafc; }
  .os-mirror { border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-bottom: 16px; page-break-inside: avoid; }
  .os-mirror h3 { font-size: 13px; margin: 0 0 8px; color: #0369a1; display: flex; justify-content: space-between; }
  .os-mirror .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; font-size: 11px; margin-bottom: 8px; }
  .os-mirror .info-grid div { display: flex; gap: 4px; }
  .os-mirror .info-grid strong { color: #475569; min-width: 70px; }
  .os-mirror .section-title { font-size: 11px; font-weight: 700; color: #475569; margin: 8px 0 4px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px; }
  .os-mirror .notes { font-size: 11px; color: #92400e; background: #fffbeb; padding: 6px 8px; border-radius: 4px; margin: 4px 0; }
  .os-mirror .payment { font-size: 12px; color: #b45309; font-weight: 600; background: #fef3c7; padding: 6px 8px; border-radius: 4px; margin: 4px 0; }
  .signatures { display: flex; justify-content: space-between; margin-top: 30px; }
  .sign-line { width: 45%; border-top: 1px solid #333; padding-top: 4px; font-size: 10px; text-align: center; color: #64748b; }
  .no-print { position: fixed; top: 16px; right: 16px; display: flex; gap: 8px; }
  .no-print button { border: none; padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-print { background: #0ea5e9; color: #fff; }
  .btn-close { background: #f1f5f9; color: #374151; border: 1px solid #e2e8f0; }
  @media print { .no-print { display: none; } }
</style></head><body>
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
    <button class="btn-close" onclick="window.close()">Fechar</button>
  </div>
  ${bodyHtml}
</body></html>`);
  win.document.close();
  win.focus();
}

function buildRomaneioHtml(route, routeOSs, saleMap, separationItems) {
  const stops = (route.stops || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const totalPayment = stops.reduce((sum, s) => sum + (s.has_payment ? s.payment_amount || 0 : 0), 0);

  const itemRows = Object.values(separationItems).map((item, idx) => `
    <tr style="${idx % 2 === 0 ? "background:#f8fafc" : "background:#fff"}">
      <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">${item.product_name || "—"}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;font-size:13px;">${item.quantity}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b;">${item.os_codes.join(", ")}</td>
    </tr>`).join("");

  const stopRows = stops.map((s, idx) => `
    <tr style="${idx % 2 === 0 ? "background:#f8fafc" : "background:#fff"}">
      <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;">${s.order || idx + 1}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-weight:600;">${s.os_code || "—"}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;">${s.client_name || "—"}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;">${s.service_type || "—"}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;">${s.address || "—"}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${s.has_payment ? fmtMoney(s.payment_amount) : "—"}</td>
    </tr>`).join("");

  return `
    <div class="header">
      <img src="${LOGO_URL}" alt="Brazon" />
      <div>
        <h1>ROMANEIO DE SEPARAÇÃO — ${route.code}</h1>
        <div class="subtitle">Rota de ${route.technician} · ${fmtDate(route.date)}</div>
      </div>
    </div>
    <div class="route-info">
      <span><strong>Técnico:</strong> ${route.technician || "—"}</span>
      <span><strong>Data:</strong> ${fmtDate(route.date)}</span>
      <span><strong>Período:</strong> ${route.period || "—"}</span>
      <span><strong>Distância:</strong> ${route.total_distance_km || 0} km</span>
      <span><strong>Término previsto:</strong> ${route.estimated_end_time || "—"}</span>
      <span><strong>Paradas:</strong> ${stops.length}</span>
      ${totalPayment > 0 ? `<span><strong>A receber:</strong> ${fmtMoney(totalPayment)}</span>` : ""}
    </div>

    <h2 style="font-size:13px;color:#0369a1;margin:10px 0 6px;">📦 Itens para Separação</h2>
    <table>
      <thead><tr><th>Produto</th><th style="text-align:center;">Qtd. Total</th><th>OSs</th></tr></thead>
      <tbody>${itemRows || '<tr><td colspan="3" style="text-align:center;color:#94a3b8;">Sem itens vinculados</td></tr>'}</tbody>
    </table>

    <h2 style="font-size:13px;color:#0369a1;margin:14px 0 6px;">📋 Paradas da Rota</h2>
    <table>
      <thead><tr><th>#</th><th>OS</th><th>Cliente</th><th>Tipo</th><th>Endereço</th><th>Pagamento</th></tr></thead>
      <tbody>${stopRows}</tbody>
    </table>

    <div style="margin-top:20px;font-size:10px;color:#94a3b8;text-align:center;">
      Grupo Brazon · Romaneio gerado em ${new Date().toLocaleString("pt-BR")}
    </div>`;
}

function buildOSMirrorHtml(route, tosMap, checklistItems, saleMap, osMap = {}) {
  const stops = (route.stops || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));

  const mirrors = stops.map((stop) => {
    const tos = stop.tos_id ? tosMap[stop.tos_id] : null;
    const os = stop.os_id ? osMap[stop.os_id] : null;
    const sale = saleMap[tos?.sale_id] || (os?.sale_id ? saleMap[os.sale_id] : null);
    const sellerName = sale?.seller_name || "—";
    // Endereço completo da venda (inclui o complemento, que não existe no snapshot da OS)
    const saleAddress = (sale?.delivery_different ? sale?.delivery_address : sale?.billing_address) || sale?.delivery_address || sale?.billing_address || {};
    const saleAddressStr = [saleAddress.street, saleAddress.number, saleAddress.complement, saleAddress.neighborhood, saleAddress.city, saleAddress.state].filter(Boolean).join(", ");
    const displayAddress = saleAddressStr || stop.address || "—";
    const tosCode = tos?.code || stop.tos_code || "—";
    const parentOsCode = tos?.parent_os_code || stop.os_code || "—";
    const clientName = tos?.client_name || stop.client_name || "—";
    const technicianName = tos?.technician_name || route.technician || "—";
    const osType = tos?.parent_os_type || stop.service_type || "—";
    const isDelivery = osType === "Entrega" || osType === "Entrega + Instalação";

    const items = tos?.items_to_deliver || [];
    const itemRows = items.map((item) => `
      <tr>
        <td style="padding:4px 8px;font-size:11px;">${item.product_name || "—"}</td>
        <td style="padding:4px 8px;text-align:center;font-weight:700;">${item.quantity || 0}</td>
      </tr>`).join("");

    const serviceTypes = (tos?.service_detail_types || []).map(t => t.service_type_name).join(", ");

    // Checklist items filtered by OS type
    const relevantChecklist = checklistItems.filter(item => {
      if (!item.applies_to || item.applies_to === "Todos") return true;
      if (isDelivery) return item.applies_to === "Entrega" || item.applies_to === "Entrega + Instalação";
      return item.applies_to === "Manutenção/Garantia";
    });

    const checklistHtml = relevantChecklist.map(item => {
      const options = (item.options || []).map(opt =>
        `<span style="display:inline-block;margin:2px 8px 2px 0;font-size:10px;">☐ ${opt}</span>`
      ).join("");
      return `
        <div style="border:1px solid #e2e8f0;border-radius:4px;padding:6px 8px;margin-bottom:4px;">
          <div style="font-size:11px;font-weight:600;">${item.name}</div>
          ${item.description ? `<div style="font-size:10px;color:#64748b;margin-bottom:2px;">${item.description}</div>` : ""}
          <div style="margin-top:2px;">${options}</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px;">Obs: _________________________________</div>
        </div>`;
    }).join("");

    // Pre-filled technician sale items (if any) + blank rows for manual fill
    const saleItems = tos?.technician_sale_items || [];
    const saleRows = saleItems.map(si => `
      <tr>
        <td style="padding:4px 8px;font-size:11px;">${si.product_name || "—"}</td>
        <td style="padding:4px 8px;text-align:center;font-size:11px;">${si.quantity || 0}</td>
        <td style="padding:4px 8px;text-align:right;font-size:11px;">${fmtMoney(si.unit_price)}</td>
        <td style="padding:4px 8px;text-align:right;font-size:11px;font-weight:600;">${fmtMoney(si.total)}</td>
      </tr>`).join("");
    const blankSaleRows = Array.from({ length: Math.max(2, 3 - saleItems.length) }, () =>
      `<tr><td style="padding:4px 8px;">&nbsp;</td><td></td><td></td><td></td></tr>`
    ).join("");

    return `
    <div class="os-mirror">
      <div style="display:flex;justify-content:space-between;align-items:start;border-bottom:2px solid #0ea5e9;padding-bottom:8px;margin-bottom:10px;">
        <div>
          <h3 style="font-size:14px;margin:0;color:#0369a1;">ORDEM DE SERVIÇO DO TÉCNICO — ${tosCode}</h3>
          <div style="font-size:11px;color:#64748b;">OS Pai: ${parentOsCode} · ${osType}</div>
        </div>
        <div style="text-align:right;font-size:11px;">
          <div><strong>Ordem na rota:</strong> ${stop.order || "—"}</div>
          <div><strong>Data:</strong> ${fmtDate(route.date)}</div>
        </div>
      </div>

      <div class="info-grid">
        <div><strong>Cliente:</strong> ${clientName}</div>
        <div><strong>Pedido:</strong> ${tos?.sale_order_number || "—"}</div>
        <div><strong>Técnico:</strong> ${technicianName}</div>
        <div><strong>Agendamento:</strong> ${fmtDate(tos?.appointment_date)} ${tos?.appointment_time_type || ""} ${tos?.appointment_specific_time ? `às ${tos.appointment_specific_time}` : ""}</div>
        <div><strong>Vendedor:</strong> ${sellerName}</div>
      </div>
      <div style="font-size:11px;margin-bottom:8px;"><strong>Endereço:</strong> ${displayAddress}</div>

      ${isDelivery && items.length > 0 ? `
        <div class="section-title">📦 Itens a Entregar</div>
        <table style="margin-bottom:8px;">
          <thead><tr><th>Produto</th><th style="text-align:center;">Qtd.</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>` : ""}

      ${serviceTypes ? `<div class="section-title">🔧 Detalhamento do Serviço</div><div style="font-size:11px;margin-bottom:4px;">${serviceTypes}</div>` : ""}
      ${tos?.service_detail_notes ? `<div style="font-size:11px;background:#fffbeb;padding:6px 8px;border-radius:4px;margin-bottom:8px;border:1px solid #fde68a;">${tos.service_detail_notes}</div>` : ""}

      ${tos?.pending_payment_amount > 0 ? `<div class="payment">💰 Valor a receber na casa do cliente: ${fmtMoney(tos.pending_payment_amount)}</div>` : ""}

      <div class="section-title">✅ Checklist do Atendimento</div>
      ${checklistHtml || '<div style="font-size:11px;color:#94a3b8;">Sem checklist parametrizado.</div>'}

      <div class="section-title">💰 Informações Financeiras (preencher manual)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;margin-bottom:8px;">
        <div>Valor recebido: R$ _______________</div>
        <div>Forma: ☐ PIX &nbsp; ☐ Cart. Débito &nbsp; ☐ Cart. Crédito &nbsp; ☐ Dinheiro</div>
      </div>

      <div class="section-title">📝 Observações do Técnico</div>
      <div style="border:1px solid #e2e8f0;min-height:50px;border-radius:4px;margin-bottom:8px;"></div>

      <div class="section-title">🛒 Venda do Técnico (acessórios/peças)</div>
      <table style="margin-bottom:8px;">
        <thead><tr><th>Produto</th><th style="text-align:center;">Qtd.</th><th style="text-align:right;">Preço Unit.</th><th style="text-align:right;">Total</th></tr></thead>
        <tbody>${saleRows}${blankSaleRows}</tbody>
        <tfoot><tr><td colspan="3" style="text-align:right;padding:4px 8px;"><strong>Total:</strong></td><td style="text-align:right;padding:4px 8px;">${tos?.technician_sale_total ? fmtMoney(tos.technician_sale_total) : "R$ _______"}</td></tr></tfoot>
      </table>

      <div class="section-title">👤 Quem Recebeu o Atendimento</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;margin-bottom:8px;">
        <div>Nome: _________________________________</div>
        <div>Documento: _________________________________</div>
      </div>

      <div class="signatures">
        <div class="sign-line">Assinatura do Cliente</div>
        <div class="sign-line">Assinatura do Técnico</div>
      </div>
    </div>
    ${tos?.sale_id && saleMap[tos.sale_id] ? `
    <div style="page-break-before: always;"></div>
    ${buildSaleBody({ sale: saleMap[tos.sale_id], orderNumber: saleMap[tos.sale_id].order_number, client: null, mode: "pedido" })}
    ` : ""}
    <div style="page-break-after: always;"></div>`;
  }).join("");

  return `
    <div class="header">
      <img src="${LOGO_URL}" alt="Brazon" />
      <div>
        <h1>ESPELHO DAS ORDENS DE SERVIÇO — ${route.code}</h1>
        <div class="subtitle">Rota de ${route.technician} · ${fmtDate(route.date)} · ${stops.length} OS</div>
      </div>
    </div>
    ${mirrors || '<p style="text-align:center;color:#94a3b8;">Nenhuma OS vinculada a esta rota.</p>'}`;
}

export default function RouteRomaneioDialog({ open, onOpenChange, route }) {
  const { data: routeOSs = [] } = useQuery({
    queryKey: ["route-os-romaneio", route?.id],
    queryFn: () => base44.entities.ServiceOrder.filter({ route_id: route.id }, "route_order", 200),
    enabled: !!open && !!route?.id,
  });

  // Load TOS (OS do Técnico) for the route stops — the same form the technician opens in the app.
  // Cada TOS é buscado de forma resiliente: um registro ausente não derruba o espelho inteiro.
  const tosIds = (route?.stops || []).map(s => s.tos_id).filter(Boolean);
  const { data: tosList = [] } = useQuery({
    queryKey: ["route-tos-mirror", tosIds],
    queryFn: async () => {
      if (tosIds.length === 0) return [];
      return Promise.all(tosIds.map(id => base44.entities.TechnicianServiceOrder.get(id).catch(() => null)));
    },
    enabled: open && tosIds.length > 0,
  });

  // As vendas vêm tanto das OS vinculadas à rota quanto dos TOS das paradas — assim o "PEDIDO"
  // sempre é impresso no espelho quando a OS do técnico tem uma venda vinculada, mesmo que a OS
  // não esteja ligada à rota pelo route_id.
  const saleIds = [...new Set([
    ...routeOSs.map(o => o.sale_id),
    ...tosList.map(t => t?.sale_id),
  ].filter(Boolean))];
  const { data: sales = [] } = useQuery({
    queryKey: ["route-sales-romaneio", saleIds],
    queryFn: async () => {
      if (saleIds.length === 0) return [];
      return Promise.all(saleIds.map(id => base44.entities.Sale.get(id).catch(() => null)));
    },
    enabled: open && saleIds.length > 0,
  });

  const saleMap = {};
  sales.forEach(s => { if (s?.id) saleMap[s.id] = s; });

  const { data: checklistItems = [] } = useQuery({
    queryKey: ["technicianChecklistItems"],
    queryFn: () => base44.entities.TechnicianChecklistItem.filter({ is_active: true }, "order", 50),
    enabled: !!open,
  });

  const tosMap = {};
  tosList.forEach(t => { if (t?.id) tosMap[t.id] = t; });

  const osMap = {};
  routeOSs.forEach(o => { if (o?.id) osMap[o.id] = o; });

  // Aggregate separation items
  const separationItems = {};
  routeOSs.forEach(os => {
    const sale = os.sale_id ? saleMap[os.sale_id] : null;
    const items = sale?.items || [];
    items.forEach(item => {
      const key = item.product_id || item.product_name;
      if (!separationItems[key]) {
        separationItems[key] = { product_name: item.product_name, quantity: 0, os_codes: [] };
      }
      separationItems[key].quantity += item.quantity || 0;
      if (!separationItems[key].os_codes.includes(os.code)) {
        separationItems[key].os_codes.push(os.code);
      }
    });
  });

  if (!route) return null;

  const stops = (route.stops || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const totalPayment = stops.reduce((sum, s) => sum + (s.has_payment ? s.payment_amount || 0 : 0), 0);
  const totalDistance = route.total_distance_km || 0;

  const handlePrintRomaneio = () => {
    openPrintWindow(`Romaneio ${route.code}`, buildRomaneioHtml(route, routeOSs, saleMap, separationItems));
  };

  const handlePrintMirrors = () => {
    openPrintWindow(`Espelho OSs ${route.code}`, buildOSMirrorHtml(route, tosMap, checklistItems, saleMap, osMap));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Romaneio da Rota — {route.code}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 flex-wrap">
          <Button onClick={handlePrintRomaneio} className="gap-2">
            <Printer className="h-4 w-4" /> Imprimir Romaneio de Separação
          </Button>
          <Button onClick={handlePrintMirrors} variant="outline" className="gap-2">
            <ClipboardList className="h-4 w-4" /> Imprimir Espelho das OSs
          </Button>
        </div>

        <div className="space-y-4 mt-2">
          {/* Route summary */}
          <Card>
            <CardContent className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Técnico</p>
                <p className="font-medium truncate">{route.technician}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Data</p>
                <p className="font-medium">{route.date ? new Date(route.date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Distância</p>
                <p className="font-medium">{totalDistance} km</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Término previsto</p>
                <p className="font-medium">{route.estimated_end_time || "—"}</p>
              </div>
            </CardContent>
          </Card>

          {/* Separation items */}
          {Object.keys(separationItems).length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  Itens para Separação
                  <Badge variant="secondary" className="ml-auto">{Object.keys(separationItems).length} produtos</Badge>
                </h4>
                <div className="space-y-1.5">
                  {Object.values(separationItems).map((item, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/30">
                      <span className="text-sm font-medium truncate flex-1">{item.product_name}</span>
                      <Badge className="gap-1 bg-primary/10 text-primary">
                        {item.quantity} un.
                      </Badge>
                      <span className="text-xs text-muted-foreground hidden sm:inline truncate max-w-[200px]">
                        {item.os_codes.join(", ")}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stops list */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              {stops.length} Parada{stops.length !== 1 ? "s" : ""}
              {totalPayment > 0 && (
                <Badge className="gap-1 bg-amber-100 text-amber-700 ml-auto">
                  <DollarSign className="h-3 w-3" /> R$ {totalPayment.toFixed(2)}
                </Badge>
              )}
            </h4>

            {stops.map((stop) => (
              <Card key={stop.os_id}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-start gap-3">
                    <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold shrink-0">
                      {stop.order}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold">{stop.os_code}</span>
                        <span className="font-medium text-sm">{stop.client_name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {stop.service_type && (
                          <Badge variant="outline" className="gap-1 text-xs">
                            {stop.service_type === "Entrega + Instalação" ? <Wrench className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
                            {stop.service_type}
                          </Badge>
                        )}
                        {stop.has_payment && (
                          <Badge className="gap-1 bg-amber-100 text-amber-700 text-xs">
                            <DollarSign className="h-3 w-3" /> R$ {(stop.payment_amount || 0).toFixed(2)}
                          </Badge>
                        )}
                      </div>
                      {stop.address && (
                        <p className="text-xs text-muted-foreground flex items-start gap-1">
                          <MapPin className="h-3 w-3 mt-0.5 shrink-0" /> {stop.address}
                        </p>
                      )}
                      {stop.arrival_time && (
                        <p className="text-xs text-muted-foreground">
                          Chegada prevista: {stop.arrival_time}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}