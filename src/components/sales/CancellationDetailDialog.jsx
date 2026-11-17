import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  CheckCircle2, XCircle, Truck, PackageCheck, DollarSign, FileX, Printer,
  Loader2, ArrowRight, Clock, Upload, Trash2, Paperclip,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { usePermissions } from "@/lib/permissions";
import { useAuth } from "@/lib/AuthContext";
import ErrorBoundary from "@/components/ui/ErrorBoundary";

const STATUS_LABELS = {
  "Não Solicitado": "Não Solicitado",
  "Aguardando Aprovação": "Aguardando Aprovação do Gerente",
  "Cancelada": "Cancelada",
  "Aguardando Retorno Logístico": "Aguardando Retorno Logístico",
  "Aguardando Recebimento": "Aguardando Recebimento da Mercadoria",
  "Aguardando Estorno Financeiro": "Aguardando Estorno Financeiro",
  "Aguardando Cancelamento NF-e": "Aguardando Cancelamento da NF-e",
  "Cancelamento Concluído": "Cancelamento Concluído",
};

const STATUS_COLORS = {
  "Aguardando Aprovação": "bg-amber-100 text-amber-700",
  "Cancelada": "bg-red-100 text-red-700",
  "Aguardando Retorno Logístico": "bg-blue-100 text-blue-700",
  "Aguardando Recebimento": "bg-cyan-100 text-cyan-700",
  "Aguardando Estorno Financeiro": "bg-orange-100 text-orange-700",
  "Aguardando Cancelamento NF-e": "bg-purple-100 text-purple-700",
  "Cancelamento Concluído": "bg-emerald-100 text-emerald-700",
};

const fmtDate = (d) => d
  ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR")
  : "—";
const fmtDateTime = (d) => d
  ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
  : "—";

export default function CancellationDetailDialog({ sale, osList, open, onOpenChange }) {
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [reverseCode, setReverseCode] = useState("");
  const [reverseCarrier, setReverseCarrier] = useState("");
  const [collectionType, setCollectionType] = useState("");
  const [refundForecast, setRefundForecast] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReceiptUrls, setRefundReceiptUrls] = useState([]);
  const [refundMethod, setRefundMethod] = useState("");
  const [refundDetails, setRefundDetails] = useState("");
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, allRoles } = usePermissions();
  const { user: authUser } = useAuth();

  if (!sale) return null;

  const status = sale.cancellation_status || "Não Solicitado";
  const isSupervisor = isAdmin || allRoles.includes("supervisor");
  const isLogistica = isAdmin || allRoles.includes("logistica");
  const isFinanceiro = isAdmin || allRoles.includes("financeiro") || allRoles.includes("contas_receber");
  // Permissão individual concedida ao usuário (User.extra_permissions: "estorno_financeiro")
  // permite operar a seção de Estorno Financeiro sem conceder o restante do acesso financeiro.
  const canManageRefund = isFinanceiro || (authUser?.extra_permissions || []).includes("estorno_financeiro");

  const paidAmount = (sale.payments || [])
    .filter(p => p.payment_status === "Realizada")
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const hasNFe = (osList || []).some(os => os.nfe_transmitted && !os.nfe_cancelled);

  const runAction = async (action, extra = {}) => {
    setActionLoading(true);
    try {
      const res = await base44.functions.invoke("processSaleCancellation", {
        action,
        sale_id: sale.id,
        ...extra,
      });
      const data = res.data || res;
      if (data.error) {
        toast({ title: "Erro", description: data.error, variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      toast({ title: data.message || "Ação realizada com sucesso." });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUploadReceipt = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadingReceipt(true);
    try {
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        setRefundReceiptUrls(prev => [...prev, file_url]);
      }
      toast({ title: `${files.length} comprovante(s) anexado(s)` });
    } catch (err) {
      toast({ title: "Erro ao anexar", description: err.message, variant: "destructive" });
    } finally {
      setUploadingReceipt(false);
      e.target.value = "";
    }
  };

  const removeReceipt = (idx) => {
    setRefundReceiptUrls(prev => prev.filter((_, i) => i !== idx));
  };

  const generateReceipt = () => {
    const html = `
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>Comprovante de Cancelamento ${sale.order_number || ""}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 40px; color: #1a1a1a; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0c4a6e; padding-bottom: 16px; margin-bottom: 24px; }
        .header h1 { font-size: 20px; color: #0c4a6e; }
        .title { text-align: center; font-size: 22px; font-weight: bold; margin: 20px 0; color: #b91c1c; }
        .section { margin-bottom: 20px; }
        .section h2 { font-size: 14px; color: #0c4a6e; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 8px; }
        .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
        .row .label { color: #666; }
        .row .value { font-weight: 600; }
        .timeline { margin-top: 16px; }
        .timeline-item { padding: 8px 0; border-bottom: 1px solid #eee; font-size: 12px; }
        .timeline-item .date { color: #999; }
        .timeline-item .actor { font-weight: 600; }
        .timeline-item .notes { color: #333; margin-top: 2px; }
        .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #999; }
        @media print { body { padding: 20px; } }
      </style></head>
      <body>
        <div class="header">
          <div><h1>GRUPO BRAZON</h1><span style="font-size:12px;color:#666;">Comprovante de Cancelamento de Venda</span></div>
          <div style="text-align:right;font-size:13px;">
            <div>Pedido: <strong>${sale.order_number || "—"}</strong></div>
            <div>Data: ${fmtDateTime(sale.cancellation_completed_date || new Date().toISOString())}</div>
          </div>
        </div>
        <div class="title">CANCELAMENTO Nº ${sale.order_number || "—"}</div>
        <div class="section">
          <h2>Dados da Venda</h2>
          <div class="row"><span class="label">Cliente</span><span class="value">${sale.client_name || "—"}</span></div>
          <div class="row"><span class="label">Vendedor</span><span class="value">${sale.seller_name || "—"}</span></div>
          <div class="row"><span class="label">Valor Total</span><span class="value">R$ ${(sale.grand_total || 0).toFixed(2)}</span></div>
          <div class="row"><span class="label">Solicitado por</span><span class="value">${sale.cancellation_requested_by || "—"}</span></div>
          <div class="row"><span class="label">Data da solicitação</span><span class="value">${fmtDateTime(sale.cancellation_requested_date)}</span></div>
          <div class="row"><span class="label">Aprovado por</span><span class="value">${sale.cancellation_approved_by || "—"}</span></div>
          <div class="row"><span class="label">Data da aprovação</span><span class="value">${fmtDateTime(sale.cancellation_approved_date)}</span></div>
        </div>
        <div class="section">
          <h2>Motivo do Cancelamento</h2>
          <p style="font-size:13px;padding:8px;background:#f9fafb;border-radius:4px;">${sale.cancellation_reason || "—"}</p>
        </div>
        <div class="section">
          <h2>Estorno Financeiro</h2>
          <div class="row"><span class="label">Valor estornado</span><span class="value">R$ ${(sale.cancellation_refund_amount || 0).toFixed(2)}</span></div>
          <div class="row"><span class="label">Data do estorno</span><span class="value">${fmtDate(sale.cancellation_refund_completed_date)}</span></div>
          <div class="row"><span class="label">Previsão</span><span class="value">${fmtDate(sale.cancellation_refund_forecast_date)}</span></div>
          ${sale.cancellation_refund_method ? `<div class="row"><span class="label">Forma de reembolso</span><span class="value">${sale.cancellation_refund_method}</span></div>` : ""}
          ${sale.cancellation_refund_details ? `<div class="row"><span class="label">Dados do reembolso</span><span class="value">${sale.cancellation_refund_details}</span></div>` : ""}
          <div class="row"><span class="label">Mercadoria retornou ao estoque</span><span class="value">${sale.cancellation_needs_stock_return ? `Sim — ${fmtDate(sale.cancellation_stock_received_date)}` : "Não (não foi despachada)"}</span></div>
          ${sale.cancellation_reverse_tracking_code ? `<div class="row"><span class="label">Rastreio reverso</span><span class="value">${sale.cancellation_reverse_tracking_code} (${sale.cancellation_reverse_carrier || "—"})</span></div>` : ""}
        </div>
        ${hasNFe ? `<div class="section">
          <h2>Cancelamento de NF-e</h2>
          <div class="row"><span class="label">NF-e cancelada em</span><span class="value">${fmtDateTime(sale.cancellation_nfe_completed_date)}</span></div>
        </div>` : ""}
        <div class="section">
          <h2>Histórico do Cancelamento</h2>
          <div class="timeline">
            ${(sale.cancellation_history || []).map(h => `
              <div class="timeline-item">
                <div><span class="date">${fmtDateTime(h.date)}</span> — <span class="actor">${h.actor}</span></div>
                <div class="notes">${h.notes || ""}</div>
              </div>
            `).join("")}
          </div>
        </div>
        <div class="footer">Documento gerado automaticamente pelo ERP Brazon em ${new Date().toLocaleString("pt-BR")}</div>
      </body>
    </html>`;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 500);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <ErrorBoundary>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Cancelamento — {sale.order_number}
            <Badge className={STATUS_COLORS[status] || "bg-muted text-muted-foreground"}>
              {STATUS_LABELS[status] || status}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Cliente: <strong className="text-foreground">{sale.client_name}</strong> • Vendedor: {sale.seller_name || "—"}
          </DialogDescription>
        </DialogHeader>

        {/* Resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="bg-muted/50 rounded p-2">
            <div className="text-xs text-muted-foreground">Valor Total</div>
            <div className="font-semibold">R$ {(sale.grand_total || 0).toFixed(2)}</div>
          </div>
          <div className="bg-muted/50 rounded p-2">
            <div className="text-xs text-muted-foreground">Valor Pago</div>
            <div className="font-semibold">R$ {paidAmount.toFixed(2)}</div>
          </div>
          <div className="bg-muted/50 rounded p-2">
            <div className="text-xs text-muted-foreground">Despachada?</div>
            <div className="font-semibold">{sale.cancellation_dispatched ? "Sim" : "Não"}</div>
          </div>
          <div className="bg-muted/50 rounded p-2">
            <div className="text-xs text-muted-foreground">NF-e Emitida?</div>
            <div className="font-semibold">{hasNFe ? "Sim" : "Não"}</div>
          </div>
        </div>

        {/* Motivo */}
        <div className="rounded border bg-amber-50 border-amber-200 p-3">
          <div className="text-xs text-muted-foreground mb-1">Motivo do cancelamento ({sale.cancellation_requested_by}):</div>
          <div className="text-sm">{sale.cancellation_reason || "—"}</div>
        </div>

        {/* Etapa anterior + OS */}
        <div className="rounded border p-3 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase">Situação antes do cancelamento</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Etapa da venda</div>
              <div className="font-medium">{sale.cancellation_previous_stage || sale.stage || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Pagamento recebido</div>
              <div className="font-medium">R$ {paidAmount.toFixed(2)}</div>
            </div>
          </div>
          {(osList || []).length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Ordens de Serviço vinculadas:</div>
              {osList.map(os => (
                <div key={os.id} className="flex items-center justify-between text-xs bg-muted/40 rounded px-2 py-1">
                  <span className="font-mono">{os.code || os.technician_os_code || "—"}</span>
                  <Badge variant="outline" className="text-[10px]">{os.status}</Badge>
                </div>
              ))}
            </div>
          )}
          {(!osList || osList.length === 0) && (
            <div className="text-xs text-muted-foreground">Sem OS vinculadas a esta venda.</div>
          )}
        </div>

        {/* Estorno de equipamento/manutenção */}
        {sale.cancellation_equipment_reverted && (
          <div className="rounded border border-violet-200 bg-violet-50/50 p-3">
            <div className="text-sm font-semibold flex items-center gap-1 mb-1">
              <FileX className="h-4 w-4 text-violet-600" /> Estorno de Manutenção de Equipamento
            </div>
            <div className="text-xs text-muted-foreground">
              {sale.cancellation_equipment_revert_notes || "Data de manutenção do equipamento foi estornada."}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="rounded border p-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Histórico do Fluxo</div>
          <div className="space-y-2">
            {(sale.cancellation_history || []).map((h, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <Clock className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-muted-foreground">{fmtDateTime(h.date)}</span>
                  {" — "}
                  <span className="font-medium">{h.actor}</span>
                  <div className="text-muted-foreground">{h.notes}</div>
                </div>
              </div>
            ))}
            {(!sale.cancellation_history || sale.cancellation_history.length === 0) && (
              <div className="text-xs text-muted-foreground">Sem histórico.</div>
            )}
          </div>
        </div>

        {/* Ações por etapa */}
        <div className="space-y-3">
          {/* Aguardando Aprovação — Gerente */}
          {status === "Aguardando Aprovação" && isSupervisor && (
            <div className="rounded border border-amber-200 bg-amber-50/50 p-3 space-y-2">
              <div className="text-sm font-semibold">Aprovação do Gerente</div>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={actionLoading}
                  onClick={() => runAction("approve")}
                  className="gap-1 flex-1"
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Aprovar Cancelamento
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actionLoading}
                  onClick={() => {
                    if (rejectReason.trim()) runAction("reject", { reason: rejectReason.trim() });
                    else toast({ title: "Informe o motivo da rejeição", variant: "destructive" });
                  }}
                  className="gap-1"
                >
                  <XCircle className="h-4 w-4" /> Rejeitar
                </Button>
              </div>
              <Textarea
                rows={2}
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Motivo da rejeição (obrigatório ao rejeitar)"
              />
            </div>
          )}

          {/* Aguardando Retorno Logístico — Logística */}
          {status === "Aguardando Retorno Logístico" && isLogistica && (() => {
            const reverseOSList = (osList || []).filter(os => os.is_reverse);
            return (
              <div className="rounded border border-blue-200 bg-blue-50/50 p-3 space-y-3">
                <div className="text-sm font-semibold flex items-center gap-1">
                  <Truck className="h-4 w-4 text-blue-600" /> Retorno Logístico
                </div>
                {reverseOSList.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      OS Reversa(s) gerada(s) automaticamente para rastrear o retorno da mercadoria:
                    </div>
                    {reverseOSList.map(ros => (
                      <div key={ros.id} className="flex items-center justify-between bg-white/60 rounded px-2 py-1.5 text-xs">
                        <span className="font-mono font-medium">{ros.code}</span>
                        <Badge variant="outline" className="text-[10px]">{ros.status}</Badge>
                      </div>
                    ))}
                    <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded p-2">
                      Acesse <strong>Ordens de Serviço → aba OS Reversa</strong> para gerar etiquetas reversas, rastrear a coleta e confirmar o recebimento. Ao confirmar o recebimento com resolução <strong>Cancelamento</strong>, a mercadoria será devolvida ao estoque automaticamente e o cancelamento avançará para estorno financeiro.
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    Nenhuma OS Reversa encontrada. Use o registro manual abaixo.
                  </div>
                )}
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Registro manual de código reverso</summary>
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Código de rastreio reverso</Label>
                        <Input value={reverseCode} onChange={e => setReverseCode(e.target.value)} placeholder="Ex: BR123456789" />
                      </div>
                      <div>
                        <Label className="text-xs">Transportadora</Label>
                        <Input value={reverseCarrier} onChange={e => setReverseCarrier(e.target.value)} placeholder="Ex: Correios" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Tipo de coleta</Label>
                      <Select value={collectionType || undefined} onValueChange={setCollectionType}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Postagem pelo Cliente">Postagem pelo Cliente</SelectItem>
                          <SelectItem value="Coleta pelo Técnico">Coleta pelo Técnico</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      disabled={actionLoading || !reverseCode.trim()}
                      onClick={() => runAction("set_reverse_code", {
                        reverse_tracking_code: reverseCode.trim(),
                        reverse_carrier: reverseCarrier.trim(),
                        collection_type: collectionType,
                      })}
                      className="gap-1 w-full"
                    >
                      {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                      Registrar Código Reverso
                    </Button>
                  </div>
                </details>
              </div>
            );
          })()}

          {/* Aguardando Recebimento — Logística/Estoque */}
          {status === "Aguardando Recebimento" && isLogistica && (
            <div className="rounded border border-cyan-200 bg-cyan-50/50 p-3 space-y-2">
              <div className="text-sm font-semibold flex items-center gap-1">
                <PackageCheck className="h-4 w-4 text-cyan-600" /> Recebimento da Mercadoria
              </div>
              {sale.cancellation_reverse_tracking_code && (
                <div className="text-xs text-muted-foreground">
                  Rastreio reverso: <strong>{sale.cancellation_reverse_tracking_code}</strong> ({sale.cancellation_reverse_carrier})
                </div>
              )}
              <Button
                size="sm"
                disabled={actionLoading}
                onClick={() => runAction("confirm_stock_receipt")}
                className="gap-1 w-full"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                Confirmar Recebimento e Devolver ao Estoque
              </Button>
            </div>
          )}

          {/* Pagamentos recebidos — sempre visível */}
          {status === "Aguardando Estorno Financeiro" && (
            <div className="rounded border border-orange-200 bg-orange-50/50 p-3 space-y-2">
              <div className="text-sm font-semibold flex items-center gap-1">
                <DollarSign className="h-4 w-4 text-orange-600" /> Pagamentos Recebidos
              </div>
              {(sale.payments || []).filter(p => p.payment_status === "Realizada").length > 0 ? (
                <div className="space-y-1.5">
                  {(sale.payments || []).filter(p => p.payment_status === "Realizada").map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-white/60 rounded px-2 py-1.5">
                      <div>
                        <div className="font-medium">{p.condition_name || "—"}</div>
                        <div className="text-muted-foreground">R$ {(p.amount || 0).toFixed(2)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">Realizada</Badge>
                        {p.receipt_url && (
                          <a href={p.receipt_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Ver comprovante</a>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="text-xs font-medium pt-1">Total recebido: R$ {paidAmount.toFixed(2)}</div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Nenhum pagamento realizado.</div>
              )}
            </div>
          )}

          {/* Estorno Financeiro — Financeiro ou permissão individual do usuário */}
          {status === "Aguardando Estorno Financeiro" && canManageRefund && (
            <div className="rounded border border-orange-200 bg-orange-50/50 p-3 space-y-3">
              <div className="text-sm font-semibold flex items-center gap-1">
                <DollarSign className="h-4 w-4 text-orange-600" /> Estorno Financeiro
              </div>
              <div className="text-xs text-muted-foreground">
                Valor a estornar: <strong>R$ {paidAmount.toFixed(2)}</strong>
                {sale.cancellation_refund_forecast_date && (
                  <> • Previsão: {fmtDate(sale.cancellation_refund_forecast_date)}</>
                )}
              </div>
              {!sale.cancellation_refund_forecast_date && (
                <div className="grid grid-cols-2 gap-2 items-end">
                  <div>
                    <Label className="text-xs">Previsão de estorno</Label>
                    <Input type="date" value={refundForecast} onChange={e => setRefundForecast(e.target.value)} />
                  </div>
                  <Button variant="outline" size="sm" disabled={actionLoading || !refundForecast}
                    onClick={() => runAction("set_refund_forecast", { refund_forecast_date: refundForecast })}>
                    Definir Previsão
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 items-end">
                <div>
                  <Label className="text-xs">Valor do estorno (R$)</Label>
                  <Input type="number" step="0.01" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} placeholder={paidAmount.toFixed(2)} />
                </div>
                <Button size="sm" disabled={actionLoading}
                  onClick={() => runAction("complete_refund", {
                    refund_amount: refundAmount ? Number(refundAmount) : undefined,
                    refund_receipt_urls: refundReceiptUrls.length ? refundReceiptUrls : undefined,
                    refund_method: refundMethod || undefined,
                    refund_details: refundDetails || undefined,
                  })}
                  className="gap-1">
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Concluir Estorno
                </Button>
              </div>
              <div>
                <Label className="text-xs">Forma de reembolso *</Label>
                <Select value={refundMethod || undefined} onValueChange={setRefundMethod}>
                  <SelectTrigger><SelectValue placeholder="Selecione a forma de reembolso" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PIX">PIX</SelectItem>
                    <SelectItem value="Transferência Bancária">Transferência Bancária</SelectItem>
                    <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Dados do reembolso (chave PIX, conta, etc.) *</Label>
                <Textarea
                  rows={2}
                  value={refundDetails}
                  onChange={e => setRefundDetails(e.target.value)}
                  placeholder={refundMethod === "PIX" ? "Ex: chave PIX (CPF, email, telefone ou aleatória)" : "Ex: Banco, agência, conta, favorecido..."}
                />
              </div>
              <div>
                <Label className="text-xs">Comprovante(s) do estorno</Label>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input bg-background text-xs cursor-pointer hover:bg-accent ${uploadingReceipt ? "opacity-50 pointer-events-none" : ""}`}>
                    <Upload className="h-3.5 w-3.5" />
                    {uploadingReceipt ? "Enviando..." : "Anexar arquivos"}
                    <input type="file" accept="image/*,application/pdf" multiple onChange={handleUploadReceipt} className="hidden" disabled={uploadingReceipt} />
                  </label>
                  {uploadingReceipt && <Loader2 className="h-4 w-4 animate-spin" />}
                </div>
                {refundReceiptUrls.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {refundReceiptUrls.map((url, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 bg-white/70 rounded-md border px-2 py-1.5 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">
                            {`Comprovante ${idx + 1}`}
                          </a>
                        </div>
                        <button type="button" onClick={() => removeReceipt(idx)} className="text-destructive hover:text-destructive/80 flex-shrink-0" title="Remover">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Aguardando Cancelamento NF-e — visível para todos, ação para financeiro */}
          {status === "Aguardando Cancelamento NF-e" && (
            <div className="rounded border border-purple-200 bg-purple-50/50 p-3 space-y-2">
              <div className="text-sm font-semibold flex items-center gap-1">
                <FileX className="h-4 w-4 text-purple-600" /> Cancelamento da NF-e
              </div>
              <div className="text-xs text-muted-foreground">
                O estorno foi realizado{sale.cancellation_refund_completed_by ? ` por ${sale.cancellation_refund_completed_by}` : ""}. Agora cancele a NF-e no módulo de Notas Fiscais{isFinanceiro ? " e confirme abaixo" : ""}.
              </div>
              {isFinanceiro && (
                <Button size="sm" disabled={actionLoading} onClick={() => runAction("complete_nfe")} className="gap-1 w-full">
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Confirmar Cancelamento da NF-e e Concluir
                </Button>
              )}
            </div>
          )}

          {/* Cancelamento Concluído */}
          {status === "Cancelamento Concluído" && (
            <div className="rounded border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Cancelamento concluído em {fmtDateTime(sale.cancellation_completed_date)}
              </div>
              {sale.cancellation_refund_completed_by && (
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>
                    Estorno de R$ {(sale.cancellation_refund_amount || 0).toFixed(2)} realizado por {sale.cancellation_refund_completed_by} em {fmtDate(sale.cancellation_refund_completed_date)}
                    {(() => {
                      const urls = (sale.cancellation_refund_receipt_urls && sale.cancellation_refund_receipt_urls.length)
                        ? sale.cancellation_refund_receipt_urls
                        : (sale.cancellation_refund_receipt_url ? [sale.cancellation_refund_receipt_url] : []);
                      if (!urls.length) return null;
                      return (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          {urls.map((u, i) => (
                            <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              Ver comprovante {urls.length > 1 ? i + 1 : ""}
                            </a>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  {sale.cancellation_refund_method && (
                    <div>Forma de reembolso: <strong>{sale.cancellation_refund_method}</strong></div>
                  )}
                  {sale.cancellation_refund_details && (
                    <div>Dados: {sale.cancellation_refund_details}</div>
                  )}
                </div>
              )}
              <Button variant="outline" size="sm" onClick={generateReceipt} className="gap-1">
                <Printer className="h-4 w-4" /> Gerar Comprovante de Cancelamento
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
        </ErrorBoundary>
      </DialogContent>
    </Dialog>
  );
}