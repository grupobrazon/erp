import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Paperclip, ExternalLink, Truck, Package, Wrench, MapPin, PackageCheck,
  AlertCircle, Download, Search, MapPinned, QrCode, FileText, CheckCircle2,
  Building2, DollarSign, Factory, ClipboardList, PenTool, Route, ArrowRight,
  AlertTriangle, RefreshCw, Settings, Wrench as WrenchIcon, CalendarClock, XCircle
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { validateVolumesAgainstItems, VOLUMES_OUTDATED_MESSAGE } from "@/lib/shippingVolumes";
import { openSalePdf } from "@/components/sales/SalePdfExport";
import ExpeditionStepper from "@/components/serviceorders/ExpeditionStepper";
import LogisticsStockPanel from "@/components/serviceorders/LogisticsStockPanel";
import CarrierChangePanel from "@/components/serviceorders/CarrierChangePanel";
import SaleDatesBlock from "@/components/serviceorders/SaleDatesBlock";
import OsAgendamentoSection from "@/components/serviceorders/OsAgendamentoSection";
import RecordAdvancePaymentDialog from "@/components/serviceorders/RecordAdvancePaymentDialog";
import MelhorEnvioStatusCard from "@/components/serviceorders/MelhorEnvioStatusCard";
import TechnicianOSPanel from "@/components/serviceorders/technician-os/TechnicianOSPanel";
import ExpeditionTechnicianOSSection from "@/components/serviceorders/ExpeditionTechnicianOSSection";
import ReverseOSSection from "@/components/serviceorders/ReverseOSSection";
import TrackingNoticeCard from "@/components/serviceorders/TrackingNoticeCard";
import WarrantyFlowPanel from "@/components/serviceorders/WarrantyFlowPanel";
import RequoteShippingDialog from "@/components/serviceorders/RequoteShippingDialog";
import RequestProductionCancellationDialog from "@/components/producao/RequestProductionCancellationDialog";
import { useToast } from "@/components/ui/use-toast";
import { usePermissions } from "@/lib/permissions";
import { updateOsStatus, refusalMessage } from "@/lib/osStatusUpdate";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import RescheduleOsDialog from "@/components/serviceorders/RescheduleOsDialog";
import SaleValueAdjustDialog from "@/components/serviceorders/SaleValueAdjustDialog";

const typeIcons = { "Expedição": Truck, "Entrega": Package, "Entrega + Instalação": Wrench };

const statusColors = {
  "Aprovação Comercial": "bg-amber-100 text-amber-700",
  "Aprovação Financeira": "bg-blue-100 text-blue-700",
  "Produção/Expedição": "bg-orange-100 text-orange-700",
  "Aguardando Produção": "bg-yellow-100 text-yellow-700",
  "Produção Iniciada": "bg-amber-100 text-amber-700",
  "Produção Liberada": "bg-teal-100 text-teal-700",
  "Aguardando Rota": "bg-purple-100 text-purple-700",
  "Agendamento/Rota": "bg-violet-100 text-violet-700",
  "Faturamento": "bg-indigo-100 text-indigo-700",
  "Liberado para Técnico": "bg-cyan-100 text-cyan-700",
  "OS Técnico": "bg-cyan-100 text-cyan-800",
  "Em Execução": "bg-sky-100 text-sky-700",
  "Concluída pelo Técnico": "bg-teal-100 text-teal-700",
  "Rota Enviada": "bg-violet-100 text-violet-700",
  "Em Rota": "bg-purple-100 text-purple-700",
  "Aguardando Faturamento - Pós": "bg-violet-100 text-violet-700",
  "OK - Aprov. Financeira": "bg-blue-100 text-blue-700",
  "Faturada": "bg-emerald-100 text-emerald-700",
  "Etiqueta Gerada": "bg-indigo-100 text-indigo-700",
  "Separação": "bg-violet-100 text-violet-700",
  "Saída do Estoque": "bg-cyan-100 text-cyan-700",
  "Em Transporte": "bg-sky-100 text-sky-700",
  "Em Andamento": "bg-purple-100 text-purple-700",
  "Concluída": "bg-emerald-100 text-emerald-700",
  "Entregue": "bg-emerald-100 text-emerald-700",
  "Cancelada": "bg-red-100 text-red-700",
  "Aguardando Coleta Reversa": "bg-amber-100 text-amber-700",
  "Em Retorno": "bg-sky-100 text-sky-700",
  "Recebida na Empresa": "bg-emerald-100 text-emerald-700",
};

function SectionCard({ icon: Icon, title, children, color = "border-border" }) {
  return (
    <div className={`rounded-md border ${color} p-3`}>
      <div className="flex items-center gap-1 mb-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </div>
      {children}
    </div>
  );
}

export default function ServiceOrderDetailDialog({ open, onOpenChange, order }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canEditProduction, allRoles, isAdmin, canManageOS } = usePermissions();
  const isSellerReadOnly = !isAdmin && allRoles.length > 0 && allRoles.every(r => r === "vendedor");
  const dialogSource = `Detalhe da OS — ${isAdmin ? "admin" : (allRoles[0] || "usuário")}`;

  const [technician, setTechnician] = useState("");
  const [trackingCode, setTrackingCode] = useState("");
  const [labelUrl, setLabelUrl] = useState("");
  const [receivedAmount, setReceivedAmount] = useState(0);
  const [receivedMethod, setReceivedMethod] = useState("");
  const [receivedPhotoUrl, setReceivedPhotoUrl] = useState("");
  const [paymentReceiptUrl, setPaymentReceiptUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [labelError, setLabelError] = useState("");
  const [trackingEvents, setTrackingEvents] = useState([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [showTracking, setShowTracking] = useState(false);
  const [checkingLabel, setCheckingLabel] = useState(false);
  const [productionDeadline, setProductionDeadline] = useState("");
  const [showCancellationRequest, setShowCancellationRequest] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [financialApprovedBy, setFinancialApprovedBy] = useState("");
  const [invoiceType, setInvoiceType] = useState("Nota Fiscal");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [separationSignedBy, setSeparationSignedBy] = useState("");
  const [stockConfirmed, setStockConfirmed] = useState(false);
  const [selectedRegionId, setSelectedRegionId] = useState("");
  const [logisticsNotes, setLogisticsNotes] = useState("");
  const [showAdvancePayment, setShowAdvancePayment] = useState(false);
  const [technicianOsUrl, setTechnicianOsUrl] = useState("");
  const [refreshingMe, setRefreshingMe] = useState(false);
  const [requoting, setRequoting] = useState(false);
  const [manualDelivering, setManualDelivering] = useState(false);
  const [showRequoteDialog, setShowRequoteDialog] = useState(false);
  const [showSaleValueAdjust, setShowSaleValueAdjust] = useState(false);
  const [showTechnicianMode, setShowTechnicianMode] = useState(false);

  // Acesso à edição como técnico: Gerente (supervisor), Adm (admin), Logística e Pós-Vendas
  const canEditAsTechnician = isAdmin || allRoles.includes("supervisor") || allRoles.includes("logistica") || allRoles.includes("pos_vendas");

  const { data: sale } = useQuery({
    queryKey: ["sale", order?.sale_id],
    queryFn: () => base44.entities.Sale.get(order.sale_id),
    enabled: !!order?.sale_id,
  });

  // Busca periódica da OS enquanto o dialog está aberto — reflete as atualizações
  // automáticas do workflow de rastreio (a cada 10 min) sem precisar clicar em "Atualizar agora".
  const { data: liveOrder } = useQuery({
    queryKey: ["serviceOrder", order?.id],
    queryFn: () => base44.entities.ServiceOrder.get(order.id),
    enabled: !!open && !!order?.id,
    refetchInterval: 30000,
  });
  const meOrder = liveOrder || order;

  // Dados do cliente (código + telefones) para exibir no Registro Comercial.
  const { data: client } = useQuery({
    queryKey: ["client", order?.client_id],
    queryFn: () => base44.entities.Client.get(order.client_id),
    enabled: !!open && !!order?.client_id,
  });

  // Cotação desatualizada: o pedido foi alterado após a última cotação de frete e os
  // volumes salvos divergem da composição atual — mesmo aviso exibido na venda.
  const volumesCoherence = sale && sale.delivery_modality === "Envio" && sale.quote_completed
    ? validateVolumesAgainstItems(sale.items, sale.shipping_volumes, sale.packing_mode)
    : { ok: true, reason: "" };
  const volumesOutdated = sale && sale.delivery_modality === "Envio" && sale.quote_completed && !volumesCoherence.ok;

  const { data: technicians = [] } = useQuery({
    queryKey: ["technicians"],
    queryFn: () => base44.entities.Technician.list("-created_date", 200),
  });

  const { data: billingLocations = [] } = useQuery({
    queryKey: ["billingLocations"],
    queryFn: () => base44.entities.BillingLocation.list("-created_date", 200),
  });

  const { data: routeRegions = [] } = useQuery({
    queryKey: ["routeRegions"],
    queryFn: () => base44.entities.RouteRegion.list("-created_date", 200),
  });

  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  useEffect(() => {
    if (order) {
      setTechnician(order.technician || "");
      setTrackingCode(order.tracking_code || "");
      setLabelUrl(order.expedition_label_url || "");
      setReceivedAmount(order.received_amount || order.pending_payment_amount || 0);
      setReceivedMethod(order.received_method || "");
      setReceivedPhotoUrl(order.received_photo_url || "");
      setPaymentReceiptUrl(order.payment_receipt_url || "");
      setNotes(order.notes || "");
      setTrackingEvents([]);
      setShowTracking(false);
      setProductionDeadline(order.production_deadline || order.production_forecast_date || "");
      setFinancialApprovedBy(order.financial_approved_by || "");
      setInvoiceType(order.invoice_type || "Nota Fiscal");
      setInvoiceNumber(order.invoice_number || "");
      setInvoiceDate(order.invoice_date || new Date().toISOString().slice(0, 10));
      setSeparationSignedBy(order.separation_signed_by || "");
      // Inicializa com o estado persistido da OS — se o estoque já foi confirmado
      // (stock_confirmed_date preenchido), o botão de etiqueta aparece imediatamente.
      setStockConfirmed(!!order.stock_confirmed_date);
      setSelectedRegionId(order.route_region_id || "");
      setLogisticsNotes(order.logistics_notes || "");
      setTechnicianOsUrl(order.technician_os_url || "");
      setLabelError("");
    }
  }, [order?.id]);

  if (!order) return null;

  const update = async (data, msg) => {
    try {
      if (data && data.status) {
        // Revalidação no backend: só atualiza se a OS ainda estiver na etapa exibida.
        // Usa meOrder (dados ao vivo) em vez de order (prop que pode estar desatualizada)
        // para evitar recusa falsa quando outro setor movimentou a OS após o dialog abrir.
        const result = await updateOsStatus({ osId: order.id, updates: data, expectedStatus: meOrder?.status, source: dialogSource });
        if (!result.success) {
          queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
          toast({ title: "Ação não realizada", description: refusalMessage(result, order.code), variant: "destructive" });
          onOpenChange(false);
          return;
        }
      } else {
        await base44.entities.ServiceOrder.update(order.id, data);
      }
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      if (msg) toast({ title: msg });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro ao atualizar OS", description: "Não foi possível concluir a ação agora. Tente novamente.", variant: "destructive" });
    }
  };

  const completeWithPayment = async () => {
    if (order.has_pending_payment && !paymentReceiptUrl) {
      toast({ title: "Anexe o comprovante de pagamento", variant: "destructive" });
      return;
    }
    try {
      const result = await updateOsStatus({ osId: order.id, updates: {
        status: "Concluída",
        received_amount: receivedAmount,
        received_method: receivedMethod,
        received_photo_url: receivedPhotoUrl,
        payment_receipt_url: paymentReceiptUrl,
        notes,
      }, expectedStatus: meOrder?.status, source: dialogSource });
      if (!result.success) {
        queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
        toast({ title: "Ação não realizada", description: refusalMessage(result, order.code), variant: "destructive" });
        return;
      }
      if (order.sale_id) {
        await base44.entities.Sale.update(order.sale_id, { stage: "Pagamento Aprovado" });
      }
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast({ title: "OS concluída — pagamento confirmado" });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleUpload = async (file, setUrl) => {
    if (!file) return;
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      setUrl(file_url);
    } catch (err) {
      toast({ title: "Erro no upload", description: err.message, variant: "destructive" });
    }
  };

  const handleGenerateLabel = async () => {
    setGenerating(true);
    setLabelError("");
    try {
      const res = await base44.functions.invoke('generateMelhorEnvioLabel', { os_id: order.id });
      const data = res.data || res;
      if (data.error) {
        const errMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        throw new Error(errMsg);
      }
      setLabelUrl(data.label_url || "");
      setTrackingCode(data.tracking_code || (data.labels && data.labels[0]?.tracking_code) || "");
      const count = data.volumes_count || (data.labels || []).length || 1;
      toast({ title: `${count} etiqueta${count > 1 ? "s" : ""} gerada${count > 1 ? "s" : ""}!`, description: `Rastreio: ${data.tracking_code || (data.labels && data.labels[0]?.tracking_code) || "—"}` });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      onOpenChange(false);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "Falha no Melhor Envio";
      const msgStr = typeof msg === 'string' ? msg : JSON.stringify(msg);
      setLabelError(msgStr);
      toast({ title: "Erro ao gerar etiqueta", description: msgStr, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleTrack = async () => {
    if (!trackingCode && !order.tracking_code) return;
    setTrackingLoading(true);
    setShowTracking(true);
    try {
      const res = await base44.functions.invoke('trackMelhorEnvioShipment', { tracking_code: order.tracking_code || trackingCode });
      const data = res.data || res;
      setTrackingEvents(data.events || []);
    } catch (err) {
      toast({ title: "Erro ao rastrear", description: err?.message, variant: "destructive" });
    } finally {
      setTrackingLoading(false);
    }
  };

  // Verifica no Melhor Envio se as etiquetas vinculadas foram canceladas.
  // Se canceladas, arquiva no histórico e libera o pedido para reemissão.
  const handleCheckLabelStatus = async () => {
    setCheckingLabel(true);
    try {
      const res = await base44.functions.invoke('checkMelhorEnvioLabelStatus', { os_id: order.id });
      const data = res.data || res;
      if (data.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      if (data.cleared) {
        toast({ title: "Etiqueta cancelada detectada", description: "A etiqueta foi desvinculada e o pedido está liberado para gerar uma nova etiqueta." });
        onOpenChange(false);
      } else if (data.anyCanceled) {
        toast({ title: "Etiquetas parcialmente canceladas", description: "Algumas etiquetas foram canceladas e arquivadas. Verifique as remanescentes." });
        onOpenChange(false);
      } else if ((data.remaining || []).length === 0) {
        toast({ title: "Nenhuma etiqueta ativa", description: "Não há etiqueta ativa vinculada a esta OS. O pedido está liberado para gerar uma nova etiqueta." });
      } else {
        toast({ title: "Etiquetas ativas", description: "Nenhuma etiqueta cancelada no Melhor Envio. Cancele a etiqueta lá antes de reemitir." });
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "Falha ao verificar status";
      toast({ title: "Erro ao verificar status", description: typeof msg === 'string' ? msg : JSON.stringify(msg), variant: "destructive" });
    } finally {
      setCheckingLabel(false);
    }
  };

  // Confirmação manual de entrega — usada quando o Melhor Envio não atualiza (etiqueta expirada,
  // postagem direta na transportadora, etc.). Marca a OS como "Entregue" e o status do ME como
  // "delivered" com auditoria no histórico.
  const handleManualDeliver = async () => {
    if (!order?.id) return;
    const ok = window.confirm("Confirmar a entrega desta OS manualmente? Isso vai marcar a OS como 'Entregue' e o status do Melhor Envio como 'Entregue'. Use quando o Melhor Envio não atualizar (etiqueta expirada ou postada direto na transportadora).");
    if (!ok) return;
    setManualDelivering(true);
    try {
      const result = await updateOsStatus({
        osId: order.id,
        updates: {
          status: "Entregue",
          melhor_envio_status: "delivered",
          melhor_envio_status_date: new Date().toISOString(),
        },
        expectedStatus: meOrder?.status,
        source: "Confirmação manual de entrega (Melhor Envio sem atualização)",
      });
      if (!result.success) {
        toast({ title: "Não foi possível confirmar a entrega", description: refusalMessage(result, meOrder?.code || order.code), variant: "destructive" });
      } else {
        queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
        toast({ title: "Entrega confirmada manualmente", description: `${meOrder?.code || order.code} marcada como Entregue.` });
      }
    } catch (err) {
      toast({ title: "Erro", description: err.message || "Falha ao confirmar entrega", variant: "destructive" });
    } finally {
      setManualDelivering(false);
    }
  };

  // Atualiza manualmente o status e rastreio desta OS no Melhor Envio (consulta sob demanda).
  const handleRefreshMeStatus = async () => {
    setRefreshingMe(true);
    try {
      const res = await base44.functions.invoke('syncMelhorEnvioOsStatus', { os_id: order.id });
      const data = res.data || res;
      if (data.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      toast({ title: "Status do Melhor Envio atualizado", description: `Status: ${data.melhor_envio_status || "—"}${data.tracking_code ? ` — Rastreio: ${data.tracking_code}` : ""}` });
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "Falha ao atualizar status";
      toast({ title: "Erro ao atualizar status", description: typeof msg === 'string' ? msg : JSON.stringify(msg), variant: "destructive" });
    } finally {
      setRefreshingMe(false);
    }
  };

  const handleInvoice = async () => {
    if (!invoiceNumber) {
      toast({ title: "Informe o número da nota", variant: "destructive" });
      return;
    }
    try {
      await base44.entities.ServiceOrder.update(order.id, {
        invoiced: true,
        invoice_type: invoiceType,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
      });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      toast({ title: "Faturamento registrado", description: `${invoiceType} ${invoiceNumber}` });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleFinancialApproval = async () => {
    try {
      const result = await updateOsStatus({ osId: order.id, updates: {
        status: "Produção/Expedição",
        financial_approved_by: financialApprovedBy || currentUser?.full_name || "Financeiro",
        financial_approval_date: new Date().toISOString(),
      }, expectedStatus: meOrder?.status, source: "Financeiro — aprovação" });
      if (!result.success) {
        queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
        toast({ title: "Ação não realizada", description: refusalMessage(result, order.code), variant: "destructive" });
        onOpenChange(false);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      toast({ title: "Pagamento aprovado — OS liberada para logística" });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro ao atualizar OS", description: "Não foi possível concluir a ação agora. Tente novamente.", variant: "destructive" });
    }
  };

  // Aprovar pagamento antecipado registrado durante a produção — libera o envio para a rota sem sair da produção
  const handleAdvancePaymentApproval = async () => {
    try {
      await base44.entities.ServiceOrder.update(order.id, {
        financial_approved_by: financialApprovedBy || currentUser?.full_name || "Financeiro",
        financial_approval_date: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      toast({ title: "Pagamento antecipado aprovado — envio para rota liberado" });
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleProductionLiberation = async () => {
    try {
      // Prazo só é enviado quando preenchido — nunca como string vazia
      const updates = {
        status: "Produção Liberada",
        production_liberated_date: new Date().toISOString().slice(0, 10),
      };
      if (productionDeadline) updates.production_deadline = productionDeadline;
      const result = await updateOsStatus({ osId: order.id, updates, expectedStatus: meOrder?.status, source: "Produção — liberação" });
      if (!result.success) {
        queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
        toast({ title: "Ação não realizada", description: refusalMessage(result, order.code), variant: "destructive" });
        onOpenChange(false);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      toast({ title: "Produção liberada — OS voltou para logística" });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro ao liberar produção", description: "Não foi possível concluir a ação agora. Tente novamente.", variant: "destructive" });
    }
  };

  const TypeIcon = typeIcons[order.type] || Package;
  const addr = order.delivery_address || {};
  const isExpedition = order.type === "Expedição";
  const currentTracking = meOrder?.tracking_code || order.tracking_code || trackingCode;
  const currentLabel = meOrder?.expedition_label_url || order.expedition_label_url || labelUrl;
  const salePayments = sale?.payments || [];
  const confirmedPayments = salePayments.filter(p => p.payment_status === "Realizada" || p.receipt_url);
  const isDelivery = order.type === "Entrega" || order.type === "Entrega + Instalação";
  const isFullyPaidBefore = salePayments.length > 0 && salePayments.every(p => p.payment_status === "Realizada");
  const isAllAtDelivery = salePayments.length > 0 && salePayments.every(p => p.payment_status === "Pendente");
  const isParcial = sale?.confirmation_type === "Parcial";
  const needsFaturamentoBeforeRoute = isFullyPaidBefore;
  // Pagamento antecipado registrado durante a produção
  const hasRecordedAdvancePayment = (sale?.payments || []).some(p => p.payment_status === "Realizada" && p.payment_moment === "Antecipada");
  // Restante pendente para o técnico cobrar na entrega/instalação (pagamento parcial)
  const hasPendingRemainderForTechnician = (sale?.payments || []).some(p => p.payment_status === "Pendente");
  // Aprovação financeira só é exigida quando o pagamento antecipado foi INTEGRAL (sem restante).
  // Pagamento parcial com restante para o técnico libera a rota diretamente.
  const needsFinancialApprovalBeforeRoute = hasRecordedAdvancePayment && !hasPendingRemainderForTechnician && !order.financial_approval_date;
  const isPartialAdvanceWithRemainder = hasRecordedAdvancePayment && hasPendingRemainderForTechnician;
  const showLogisticsNotes = ["Produção/Expedição", "Produção Liberada", "Aguardando Rota", "Agendamento/Rota", "Liberado para Técnico", "Em Execução"].includes(meOrder?.status);
  const fmtMoney = (v) => `R$ ${(v || 0).toFixed(2)}`;
  const fmtDate = (d) => d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";
  const fmtDateTime = (d) => d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  // Regenera os volumes de frete a partir dos itens atuais e re-cota no Melhor Envio.
  // Disponível quando os volumes salvos divergem do pedido (volumesOutdated) — permite
  // reparar o pedido sem precisar voltar à tela de vendas para re-cotar do zero.
  const handleRequoteShipping = async () => {
    if (!sale?.id) return;
    setRequoting(true);
    try {
      const res = await base44.functions.invoke("requoteShipping", { sale_id: sale.id });
      const data = res.data || res;
      if (data.error) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      queryClient.invalidateQueries({ queryKey: ["sale"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      toast({
        title: "Volumes recalculados e fretes re-cotados",
        description: data.selected
          ? `${data.volumes_count} volumes • ${data.selected.company_name} — ${data.selected.service_name} (R$ ${data.selected.price.toFixed(2)})`
          : `${data.volumes_count} volumes • ${data.quotes_count} transportadoras disponíveis. Selecione uma no painel de troca.`,
      });
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "Falha ao re-cotar";
      toast({ title: "Erro ao re-cotar frete", description: typeof msg === "string" ? msg : JSON.stringify(msg), variant: "destructive" });
    } finally {
      setRequoting(false);
    }
  };

  const saveLogisticsNotes = async () => {
    try {
      await base44.entities.ServiceOrder.update(order.id, { logistics_notes: logisticsNotes });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      toast({ title: "Observação da logística salva" });
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const inProductionStatus = ["Aguardando Produção", "Produção Iniciada", "Produção/Expedição"].includes(meOrder?.status);
  const canRouteFromProduction = inProductionStatus && meOrder?.production_cancellation_requested;

  const sendToRoute = () => {
    if (inProductionStatus && !meOrder?.production_cancellation_requested) {
      toast({ title: "OS em produção", description: "Solicite o cancelamento da produção antes de enviar para a rota.", variant: "destructive" });
      return;
    }
    if (!selectedRegionId) {
      toast({ title: "Selecione a região de rota", variant: "destructive" });
      return;
    }
    const region = routeRegions.find(r => r.id === selectedRegionId);
    update({
      status: "Rota Enviada",
      route_region_id: selectedRegionId,
      route_region_name: region?.name || "",
      logistics_notes: logisticsNotes,
      route_sent_date: new Date().toISOString().slice(0, 10),
    }, "OS enviada para a rota do técnico — aguardando definição da rota");
  };

  const handleNeedProduction = () => update({
    status: "Aguardando Produção",
    production_needed: true,
    production_sent_date: new Date().toISOString().slice(0, 10),
    production_history: [...((meOrder || order).production_history || []), { date: new Date().toISOString(), event: "enviado_producao", actor: currentUser?.full_name || "Logística", notes: "" }]
  }, "OS enviada para produção");

  const handleStockConfirmed = (confirmed) => {
    setStockConfirmed(confirmed);
    if (confirmed && !order.stock_confirmed_date) {
      base44.entities.ServiceOrder.update(order.id, { stock_confirmed_date: new Date().toISOString().slice(0, 10) })
        .then(() => queryClient.invalidateQueries({ queryKey: ["serviceOrders"] }))
        .catch(() => {});
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <TypeIcon className="h-5 w-5 text-primary" />
              <DialogTitle className="font-mono">{order.code}</DialogTitle>
            </div>
            <Badge className={statusColors[meOrder?.status] || "bg-muted text-muted-foreground"}>{meOrder?.status}</Badge>
            {order.type && <Badge variant="outline">{order.type}</Badge>}
            {meOrder?.rescheduled && (
              <Badge variant="outline" className="gap-1 border-amber-400 text-amber-700 bg-amber-50">
                <CalendarClock className="h-3 w-3" /> Reagendada
              </Badge>
            )}
            <div className="ml-auto flex gap-2 items-center">
              {meOrder?.route_id && (
                <Button
                  type="button" variant="outline" size="sm" className="gap-1 h-7 text-xs"
                  onClick={() => setShowReschedule(true)}
                >
                  <CalendarClock className="h-3 w-3" /> Reagendar
                </Button>
              )}
              {sale && (
                <>
                  <Button
                    type="button" variant="outline" size="sm" className="gap-1 h-7 text-xs"
                    onClick={() => openSalePdf({ sale, orderNumber: sale.order_number, client: null, mode: "pedido", os: order, billingLocation: billingLocations.find(l => l.id === sale?.billing_location_id) })}
                  >
                    <FileText className="h-3 w-3" /> PDF Pedido
                  </Button>
                  <Button
                    type="button" variant="outline" size="sm" className="gap-1 h-7 text-xs"
                    onClick={() => openSalePdf({ sale, orderNumber: sale.order_number, client: null, mode: "orcamento", os: null, billingLocation: billingLocations.find(l => l.id === sale?.billing_location_id) })}
                  >
                    <FileText className="h-3 w-3" /> PDF Orçamento
                  </Button>
                </>
              )}
              {canEditAsTechnician && (isDelivery || meOrder?.type === "Manutenção") && !showTechnicianMode && (
                <Button
                  type="button" variant="outline" size="sm" className="gap-1 h-7 text-xs"
                  onClick={() => setShowTechnicianMode(true)}
                >
                  <WrenchIcon className="h-3 w-3" /> OS do Técnico
                </Button>
              )}
              {showTechnicianMode && (
                <Badge className="gap-1 bg-cyan-100 text-cyan-800">
                  <WrenchIcon className="h-3 w-3" /> Modo Técnico
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <RescheduleOsDialog
          open={showReschedule}
          onOpenChange={setShowReschedule}
          order={meOrder}
          onDone={() => {
            queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
            queryClient.invalidateQueries({ queryKey: ["technicianRoutes"] });
          }}
        />

        {isSellerReadOnly && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> Modo visualização (vendedor) — apenas o registro de pagamento antecipado está disponível.
          </div>
        )}

        <ErrorBoundary key={`os-content-${order.id}`}>
        <div className={`min-w-0 ${isSellerReadOnly ? "pointer-events-none" : ""}`}>

        {/* Stepper */}
        {order.type && <ExpeditionStepper status={meOrder?.status} type={order.type} />}

        {/* === COMMERCIAL SUMMARY === */}
        <SectionCard icon={Building2} title="Registro Comercial" color="border-amber-200 bg-amber-50/30">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">Pedido:</span> <span className="font-medium">{order.sale_order_number || "—"}</span></div>
            <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{order.client_name || "—"}{client?.new_code ? <span className="font-mono text-muted-foreground ml-1">({client.new_code})</span> : client?.old_code ? <span className="font-mono text-muted-foreground ml-1">({client.old_code})</span> : null}</span></div>
            <div><span className="text-muted-foreground">Data:</span> {fmtDate(order.date)}</div>
            <div><span className="text-muted-foreground">Valor:</span> <span className="font-medium">{sale ? fmtMoney(sale.grand_total) : "—"}</span></div>
          </div>
          {client && (() => {
            const phones = [
              { num: client.phone1, name: client.phone1_name, wa: client.phone1_whatsapp },
              { num: client.phone2, name: client.phone2_name, wa: client.phone2_whatsapp },
              { num: client.phone3, name: client.phone3_name, wa: client.phone3_whatsapp },
              { num: client.phone4, name: client.phone4_name, wa: client.phone4_whatsapp },
              { num: client.phone5, name: client.phone5_name, wa: client.phone5_whatsapp },
              { num: client.zoox_phone1, name: "Zoox 1", wa: false },
              { num: client.zoox_phone2, name: "Zoox 2", wa: false },
              { num: client.zoox_phone3, name: "Zoox 3", wa: false },
              { num: client.zoox_phone4, name: "Zoox 4", wa: false },
              { num: client.zoox_phone5, name: "Zoox 5", wa: false },
              { num: client.zoox_phone6, name: "Zoox 6", wa: false },
              { num: client.zoox_phone7, name: "Zoox 7", wa: false },
            ].filter(p => p.num && p.num.trim());
            if (phones.length === 0) return null;
            return (
              <div className="mt-2 border-t pt-2">
                <div className="text-xs text-muted-foreground mb-1">Telefones do Cliente</div>
                <div className="flex flex-wrap gap-2">
                  {phones.map((p, i) => (
                    <div key={i} className="flex items-center gap-1 text-xs">
                      <Badge variant="outline" className={p.wa ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}>
                        {p.num}
                      </Badge>
                      {p.name && <span className="text-muted-foreground">{p.name}</span>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          {salePayments.length > 0 && (
            <div className="mt-2 border-t pt-2">
              <div className="text-xs text-muted-foreground mb-1">Comprovantes de Pagamento</div>
              <div className="flex flex-wrap gap-2">
                {salePayments.map((p, i) => (
                  <div key={i} className="flex items-center gap-1 text-xs">
                    <Badge variant="outline" className={p.payment_status === "Realizada" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}>
                      {p.condition_name || `Pagamento ${i + 1}`}
                    </Badge>
                    <span className="text-muted-foreground">{fmtMoney(p.amount)}</span>
                    {p.receipt_url && (
                      <Button variant="ghost" size="sm" className="h-6 gap-1 px-1" asChild>
                        <a href={p.receipt_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /> Ver</a>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        {/* === AGENDA DE ATENDIMENTO (vinculada à venda) === */}
        <OsAgendamentoSection order={meOrder} sale={sale} readOnly={isSellerReadOnly} currentUser={currentUser} />

        {/* === FINANCIAL APPROVAL HISTORY === */}
        <SectionCard icon={DollarSign} title="Aprovação Financeira" color={order.financial_approval_date ? "border-emerald-200 bg-emerald-50/30" : "border-blue-200 bg-blue-50/30"}>
          {order.financial_approval_date ? (
            <div className="text-sm space-y-0.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Aprovado por <strong>{order.financial_approved_by || "—"}</strong></span>
              </div>
              <div className="text-xs text-muted-foreground ml-6">
                Data/hora: <strong>{fmtDateTime(order.financial_approval_date)}</strong>
              </div>
            </div>
          ) : isParcial && meOrder?.status !== "OK - Aprov. Financeira" ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <span>Aprovação financeira ocorre após a conclusão do técnico — OS liberada para produção/expedição agora.</span>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <span>Aguardando aprovação financeira — nada liberado enquanto não confirmar.</span>
            </div>
          )}
          {order.has_pending_payment && !order.financial_approval_date && (
            <div className="mt-3 border-t pt-3">
              <Button size="sm" variant="secondary" className="gap-1 pointer-events-auto" onClick={() => setShowAdvancePayment(true)}>
                <DollarSign className="h-3 w-3" /> Registrar Pagamento Antecipado
              </Button>
              <p className="text-xs text-blue-700 mt-1">
                Cliente pagou antes da aprovação financeira? Registre aqui, anexe o comprovante e o financeiro libera o envio.
              </p>
            </div>
          )}
        </SectionCard>

        {/* === PRODUCTION HISTORY === */}
        {(order.production_needed || meOrder?.status === "Produção Iniciada" || meOrder?.status === "Produção Liberada" || order.production_liberated_date) && (
          <SectionCard icon={Factory} title="Histórico de Produção" color="border-orange-200 bg-orange-50/30">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Enviado para produção:</span> {order.production_needed ? "Sim" : "—"}</div>
              <div><span className="text-muted-foreground">Prazo (fábrica):</span> {fmtDate(order.production_deadline || order.production_forecast_date)}</div>
              <div><span className="text-muted-foreground">Produção liberada:</span> {fmtDate(order.production_liberated_date)}</div>
              {order.production_notes && <div className="col-span-2"><span className="text-muted-foreground">Observações:</span> {order.production_notes}</div>}
            </div>
          </SectionCard>
        )}

        {/* === HISTÓRICO DE DATAS DA LOGÍSTICA === */}
        {(order.stock_confirmed_date || order.route_sent_date || order.production_sent_date || order.production_liberated_date || order.separation_date || order.exit_date) && (
          <SectionCard icon={ClipboardList} title="Histórico de Datas" color="border-slate-200 bg-slate-50/40">
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {order.stock_confirmed_date && <div><span className="text-muted-foreground">Estoque confirmado:</span> {fmtDate(order.stock_confirmed_date)}</div>}
              {order.production_sent_date && <div><span className="text-muted-foreground">Enviado p/ produção:</span> {fmtDate(order.production_sent_date)}</div>}
              {order.production_liberated_date && <div><span className="text-muted-foreground">Produção liberada:</span> {fmtDate(order.production_liberated_date)}</div>}
              {order.route_sent_date && <div><span className="text-muted-foreground">Enviado p/ rota:</span> {fmtDate(order.route_sent_date)}</div>}
              {order.separation_date && <div><span className="text-muted-foreground">Separação:</span> {fmtDate(order.separation_date)}</div>}
              {order.exit_date && <div><span className="text-muted-foreground">Saída do estoque:</span> {fmtDate(order.exit_date)}</div>}
            </div>
          </SectionCard>
        )}

        {/* Delivery address */}
        {addr.street && (
          <SectionCard icon={MapPin} title="Endereço de Entrega" color="border-sky-200 bg-sky-50/30">
            <div className="text-sm space-y-0.5">
              <p>{addr.street}, {addr.number} — {addr.neighborhood}</p>
              <p>{addr.city}/{addr.state} — CEP {addr.zip_code}</p>
            </div>
          </SectionCard>
        )}

        {/* QR Code access for expedition */}
        {isExpedition && meOrder?.status !== "Aprovação Comercial" && meOrder?.status !== "Aprovação Financeira" && meOrder?.status !== "Cancelada" && (
          <div className="flex items-center gap-2 rounded-md border border-dashed p-2">
            <QrCode className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground flex-1">Acesso rápido pelo celular (sem login):</span>
            <Button variant="outline" size="sm" className="h-7 gap-1" asChild>
              <a href={`${window.location.origin}/expedicao/${order.id}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3 w-3" /> Abrir
              </a>
            </Button>
          </div>
        )}

        {/* === OBSERVAÇÕES PARA O TÉCNICO === */}
        {(sale?.cr_notes || order.technician_notes) && (
          <SectionCard icon={PenTool} title="Observação do Vendedor" color="border-amber-300 bg-amber-50/40">
            <p className="text-sm text-amber-900 whitespace-pre-wrap">{sale?.cr_notes || order.technician_notes}</p>
          </SectionCard>
        )}
        {showLogisticsNotes && (
          <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm">
            <div className="font-medium text-blue-800 mb-1 flex items-center gap-1">
              <ClipboardList className="h-3 w-3" /> Observação da Logística
            </div>
            <Textarea rows={2} value={logisticsNotes} onChange={e => setLogisticsNotes(e.target.value)} placeholder="Observações para o técnico — preenchido pela logística" className="bg-white mb-2" />
            <Button size="sm" variant="outline" onClick={saveLogisticsNotes}>
              <PenTool className="h-3 w-3" /> Salvar Observação
            </Button>
          </div>
        )}

        {/* Pending payment info */}
        {order.has_pending_payment && (
          <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm">
            <div className="font-medium text-blue-800 mb-1">Recebimento Pendente</div>
            <p className="text-blue-900">Valor a receber: <strong>{fmtMoney(order.pending_payment_amount)}</strong> — {order.pending_payment_moment}</p>
            {!order.financial_approval_date ? (
              <div className="mt-2">
                <Button size="sm" variant="secondary" className="gap-1 pointer-events-auto" onClick={() => setShowAdvancePayment(true)}>
                  <DollarSign className="h-3 w-3" /> Registrar Pagamento Antecipado
                </Button>
                <p className="text-xs text-blue-700 mt-1">
                  Cliente pagou antes da aprovação financeira? Registre aqui, anexe o comprovante e o financeiro libera o envio — sem recebimento na entrega/instalação.
                </p>
              </div>
            ) : (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 mt-2 flex items-start gap-1">
                <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                OS já aprovada financeiramente — o ajuste do pagamento deve ser feito pelo financeiro.
              </p>
            )}
          </div>
        )}

        {meOrder?.status === "Aprovação Financeira" && isExpedition && (
          <div className="space-y-3 rounded-md border border-blue-300 bg-blue-50 p-4">
            <h4 className="font-medium text-sm flex items-center gap-1"><DollarSign className="h-4 w-4" /> Aprovação Financeira</h4>
            <p className="text-xs text-muted-foreground">
              Confirme a aprovação do pagamento para liberar a expedição/produção. Nada é liberado enquanto não aprovar.
            </p>
            <div>
              <Label className="text-xs">Aprovado por</Label>
              <Input value={financialApprovedBy} onChange={(e) => setFinancialApprovedBy(e.target.value)} placeholder="Nome de quem aprovou" />
            </div>
            <Button className="w-full gap-2" onClick={handleFinancialApproval}>
              <CheckCircle2 className="h-4 w-4" /> Aprovar Pagamento e Liberar
            </Button>
          </div>
        )}

        {meOrder?.status === "Aprovação Comercial" && (
          <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4">
            <h4 className="font-medium text-sm flex items-center gap-1"><AlertCircle className="h-4 w-4" /> Aprovação Comercial</h4>
            <p className="text-xs text-muted-foreground">Esta OS aguarda liberação. Clique para liberar e iniciar o fluxo de produção/expedição.</p>
            <Button className="w-full gap-2" onClick={() => update({ status: "Produção/Expedição" }, "OS liberada para produção/expedição")}>
              <ArrowRight className="h-4 w-4" /> Liberar para Produção/Expedição
            </Button>
          </div>
        )}

        {meOrder?.status === "Produção/Expedição" && order.type && (
          <SectionCard icon={PackageCheck} title="Logística — Verificar Estoque" color="border-orange-200 bg-orange-50/30">
            {order.production_completed && (
              <div className="text-xs text-emerald-700 bg-emerald-50 rounded p-2 flex items-center gap-1 mb-2">
                <PackageCheck className="h-3 w-3" /> Produção concluída — mercadoria pronta. {isExpedition ? "Gere a etiqueta para prosseguir." : "Envie para a rota."}
              </div>
            )}
            <LogisticsStockPanel
              sale={sale}
              onStockConfirmed={handleStockConfirmed}
              onNeedProduction={handleNeedProduction}
              productionCompleted={order.production_completed}
            />
            {isExpedition && sale && (() => {
              const sq = (sale.shipping_quote_history || []).filter(q => q.selected).pop();
              return sq ? (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 mt-2">
                  Cotação: <strong>{sq.company_name}</strong> — {sq.service_name} | {fmtMoney(sq.price)} | Prazo {sq.delivery_time} dias
                </div>
              ) : (
                <div className="text-xs text-red-600 bg-red-50 rounded p-2 mt-2">⚠ Nenhuma cotação de frete selecionada. Gere e selecione uma cotação antes de criar a etiqueta.</div>
              );
            })()}
            {volumesOutdated && (
              <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 space-y-2">
                <p className="text-xs font-medium text-amber-800 flex items-start gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {VOLUMES_OUTDATED_MESSAGE}
                </p>
                {volumesCoherence.reason && (
                  <p className="text-xs text-amber-700">Motivo: {volumesCoherence.reason}</p>
                )}
                <Button variant="secondary" size="sm" className="gap-1 w-full" onClick={handleRequoteShipping} disabled={requoting}>
                  {requoting ? (
                    <><div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Recalculando volumes e cotação...</>
                  ) : (
                    <><RefreshCw className="h-3.5 w-3.5" /> Recalcular Volumes e Cotar Frete Novamente</>
                  )}
                </Button>
              </div>
            )}
            {stockConfirmed && (
              <div className="space-y-3 mt-3 border-t pt-3">
                <SaleDatesBlock sale={sale} />
                {isExpedition && sale && (sale.shipping_quote_history || []).length > 0 && (
                  <CarrierChangePanel sale={sale} order={order} currentUser={currentUser} volumesOutdated={volumesOutdated} />
                )}
                {isExpedition && (
                  <>
                    <Button onClick={handleGenerateLabel} disabled={generating} className="w-full gap-2">
                      {generating ? (
                        <><div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Gerando etiqueta...</>
                      ) : (
                        <><Download className="h-4 w-4" /> Gerar Etiqueta Melhor Envio</>
                      )}
                    </Button>
                    {labelError && (
                      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 flex items-start gap-1">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        <span className="break-words whitespace-normal">{labelError}</span>
                      </div>
                    )}
                  </>
                )}
                {isDelivery && (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-1">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <span>A OS só pode ser enviada para a rota do técnico após a <strong>liberação da produção</strong>. Confirme o estoque acima e aguarde a liberação da produção para prosseguir.</span>
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        )}

        {meOrder?.status === "Aguardando Produção" && order.type && (
          <div className="space-y-3 rounded-md border border-yellow-300 bg-yellow-50 p-4">
            <h4 className="font-medium text-sm flex items-center gap-1"><Factory className="h-4 w-4" /> Aguardando Produção</h4>
            <p className="text-xs text-muted-foreground">
              OS enviada para produção em {fmtDate(order.production_sent_date)}. O início da produção é controlado exclusivamente pelo módulo de Produção — acompanhe o andamento no menu Produção.
            </p>
            {meOrder?.production_cancellation_requested ? (
              <div className="rounded-md border border-purple-300 bg-purple-50 p-2 text-xs text-purple-800">
                <strong>Cancelamento solicitado.</strong> A produção foi notificada. O pedido está liberado para rota — a entrega sairá de outro item em estoque.
                {isDelivery && (
                  <div className="mt-2 space-y-2">
                    {routeRegions.length === 0 && (
                      <p className="text-xs text-red-600 bg-red-50 rounded p-2">⚠ Nenhuma região de rota cadastrada.</p>
                    )}
                    <div>
                      <Label className="text-xs">Região de Rota *</Label>
                      <Select value={selectedRegionId} onValueChange={setSelectedRegionId}>
                        <SelectTrigger><SelectValue placeholder="Selecione a região do técnico" /></SelectTrigger>
                        <SelectContent>
                          {routeRegions.map(r => (<SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={sendToRoute} disabled={!selectedRegionId} className="w-full gap-2">
                      <Route className="h-4 w-4" /> Enviar para Rota do Técnico
                    </Button>
                  </div>
                )}
              </div>
            ) : isExpedition && (
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowCancellationRequest(true)}>
                <AlertCircle className="h-3.5 w-3.5" /> Solicitar Cancelamento da Produção
              </Button>
            )}
            {isAdmin && isExpedition && (
              <div className="space-y-2 border-t border-yellow-300 pt-3">
                <div className="text-xs text-amber-800 bg-amber-100/50 rounded p-2 flex items-start gap-1">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Modo administrador: geração de etiqueta liberada mesmo com o produto aguardando produção. Use quando o produto já estiver disponível apesar do status.</span>
                </div>
                {sale && (sale.shipping_quote_history || []).length > 0 && (
                  <CarrierChangePanel sale={sale} order={order} currentUser={currentUser} volumesOutdated={volumesOutdated} />
                )}
                {volumesOutdated && (
                  <div className="space-y-2">
                    <div className="text-xs text-amber-800 bg-amber-100 border border-amber-300 rounded p-2 flex items-start gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{VOLUMES_OUTDATED_MESSAGE}{volumesCoherence.reason ? ` Motivo: ${volumesCoherence.reason}` : ""}</span>
                    </div>
                    <Button variant="secondary" size="sm" className="gap-1 w-full" onClick={handleRequoteShipping} disabled={requoting}>
                      {requoting ? (
                        <><div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Recalculando volumes e cotação...</>
                      ) : (
                        <><RefreshCw className="h-3.5 w-3.5" /> Recalcular Volumes e Cotar Frete Novamente</>
                      )}
                    </Button>
                  </div>
                )}
                <Button onClick={handleGenerateLabel} disabled={generating} className="w-full gap-2">
                  {generating ? (
                    <><div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Gerando etiqueta...</>
                  ) : (
                    <><Download className="h-4 w-4" /> Gerar Etiqueta Melhor Envio</>
                  )}
                </Button>
                {labelError && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 flex items-start gap-1">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <span className="break-words whitespace-normal">{labelError}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {meOrder?.status === "Produção Iniciada" && order.type && (
          <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4">
            <h4 className="font-medium text-sm flex items-center gap-1"><Wrench className="h-4 w-4" /> Circuito de Produção (Fábrica)</h4>
            {meOrder?.production_cancellation_requested && isDelivery && (
              <div className="rounded-md border border-purple-300 bg-purple-50 p-2 text-xs text-purple-800 space-y-2">
                <strong>Cancelamento solicitado.</strong> O pedido está liberado para rota — a entrega sairá de outro item em estoque.
                <div>
                  <Label className="text-xs">Região de Rota *</Label>
                  <Select value={selectedRegionId} onValueChange={setSelectedRegionId}>
                    <SelectTrigger><SelectValue placeholder="Selecione a região do técnico" /></SelectTrigger>
                    <SelectContent>
                      {routeRegions.map(r => (<SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={sendToRoute} disabled={!selectedRegionId} className="w-full gap-2">
                  <Route className="h-4 w-4" /> Enviar para Rota do Técnico
                </Button>
              </div>
            )}
            {!meOrder?.production_cancellation_requested && isExpedition && (
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowCancellationRequest(true)}>
                <AlertCircle className="h-3.5 w-3.5" /> Solicitar Cancelamento da Produção
              </Button>
            )}
            {canEditProduction ? (
              <>
                <p className="text-xs text-muted-foreground">A fábrica (Maxfilter) deve informar o prazo e liberar quando os itens estiverem produzidos.</p>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">Prazo de Produção</Label>
                    <Input type="date" value={productionDeadline} onChange={(e) => setProductionDeadline(e.target.value)} />
                  </div>
                  <Button onClick={handleProductionLiberation}>
                    <PackageCheck className="h-4 w-4" /> Liberar Produção
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Produção em andamento desde {fmtDate(order.production_started_date)}. O setor de produção irá liberar quando concluído.</p>
            )}
            {isAdmin && isExpedition && (
              <div className="space-y-2 border-t border-amber-300 pt-3">
                <div className="text-xs text-amber-800 bg-amber-100/50 rounded p-2 flex items-start gap-1">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Modo administrador: geração de etiqueta liberada mesmo com a produção em andamento. Use quando o produto já estiver disponível apesar do status.</span>
                </div>
                {sale && (sale.shipping_quote_history || []).length > 0 && (
                  <CarrierChangePanel sale={sale} order={order} currentUser={currentUser} volumesOutdated={volumesOutdated} />
                )}
                {volumesOutdated && (
                  <div className="space-y-2">
                    <div className="text-xs text-amber-800 bg-amber-100 border border-amber-300 rounded p-2 flex items-start gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{VOLUMES_OUTDATED_MESSAGE}{volumesCoherence.reason ? ` Motivo: ${volumesCoherence.reason}` : ""}</span>
                    </div>
                    <Button variant="secondary" size="sm" className="gap-1 w-full" onClick={handleRequoteShipping} disabled={requoting}>
                      {requoting ? (
                        <><div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Recalculando volumes e cotação...</>
                      ) : (
                        <><RefreshCw className="h-3.5 w-3.5" /> Recalcular Volumes e Cotar Frete Novamente</>
                      )}
                    </Button>
                  </div>
                )}
                <Button onClick={handleGenerateLabel} disabled={generating} className="w-full gap-2">
                  {generating ? (
                    <><div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Gerando etiqueta...</>
                  ) : (
                    <><Download className="h-4 w-4" /> Gerar Etiqueta Melhor Envio</>
                  )}
                </Button>
                {labelError && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 flex items-start gap-1">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <span className="break-words whitespace-normal">{labelError}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {meOrder?.status === "Produção Liberada" && order.type && (
          <div className="space-y-3 rounded-md border border-teal-300 bg-teal-50 p-4">
            <h4 className="font-medium text-sm flex items-center gap-1"><PackageCheck className="h-4 w-4" /> Produção Liberada — Logística Assume</h4>
            <div className="text-xs text-teal-700 bg-teal-100/50 rounded p-2">
              Fábrica liberou em {fmtDate(order.production_liberated_date)}. {isExpedition ? "Gere a etiqueta para prosseguir com separação e saída." : "Envie para a rota do técnico."}
            </div>
            {isExpedition && !order.invoiced && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                ⚠ Faturamento necessário antes de gerar a etiqueta. Registre o faturamento na seção abaixo.
              </div>
            )}
            {isExpedition && order.invoiced && sale && (sale.shipping_quote_history || []).length > 0 && (
              <CarrierChangePanel sale={sale} order={order} currentUser={currentUser} />
            )}
            {isExpedition && order.invoiced && volumesOutdated && (
              <div className="space-y-2">
                <div className="text-xs text-amber-800 bg-amber-100 border border-amber-300 rounded p-2 flex items-start gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{VOLUMES_OUTDATED_MESSAGE}{volumesCoherence.reason ? ` Motivo: ${volumesCoherence.reason}` : ""}</span>
                </div>
                <Button variant="secondary" size="sm" className="gap-1 w-full" onClick={handleRequoteShipping} disabled={requoting}>
                  {requoting ? (
                    <><div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin"></div> Recalculando volumes e cotação...</>
                  ) : (
                    <><RefreshCw className="h-3.5 w-3.5" /> Recalcular Volumes e Cotar Frete Novamente</>
                  )}
                </Button>
              </div>
            )}
            {isExpedition && order.invoiced && sale?.delivery_modality === "Envio" && !volumesOutdated && (
              <Button variant="outline" size="sm" className="gap-1 w-full" onClick={() => setShowRequoteDialog(true)}>
                <RefreshCw className="h-3.5 w-3.5" /> Alterar Empacotamento e Recotar Frete
              </Button>
            )}
            {isExpedition && order.invoiced && (
              <>
                <Button onClick={handleGenerateLabel} disabled={generating}>
                  {generating ? (
                    <><div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Gerando etiqueta...</>
                  ) : (
                    <><Download className="h-4 w-4" /> Gerar Etiqueta Melhor Envio</>
                  )}
                </Button>
                {labelError && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 flex items-start gap-1">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <span className="break-words whitespace-normal">{labelError}</span>
                  </div>
                )}
              </>
            )}
            {isDelivery && (
              <>
                <SaleDatesBlock sale={sale} />
                {needsFaturamentoBeforeRoute && !order.invoiced && (
                  <div className="text-xs text-red-600 bg-red-50 rounded p-2">⚠ Faturamento necessário antes de enviar para a rota.</div>
                )}
                {needsFinancialApprovalBeforeRoute && (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 space-y-2">
                    <div className="flex items-start gap-1">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <span>Pagamento integral antecipado registrado. O financeiro precisa aprovar antes de enviar para a rota do técnico.</span>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Label className="text-xs">Aprovado por</Label>
                        <Input className="h-8" value={financialApprovedBy} onChange={(e) => setFinancialApprovedBy(e.target.value)} placeholder="Nome de quem aprovou" />
                      </div>
                      <Button size="sm" onClick={handleAdvancePaymentApproval} className="gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Aprovar Pagamento
                      </Button>
                    </div>
                  </div>
                )}
                {isPartialAdvanceWithRemainder && !order.financial_approval_date && (
                  <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-2 flex items-start gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <span>Pagamento parcial registrado — o restante ({fmtMoney(order.pending_payment_amount)}) será cobrado pelo técnico {order.pending_payment_moment === "Na Instalação" ? "na instalação" : "na entrega"}. Rota liberada diretamente.</span>
                  </div>
                )}
                {routeRegions.length === 0 && (
                  <p className="text-xs text-red-600 bg-red-50 rounded p-2">⚠ Nenhuma região de rota cadastrada. Cadastre em Cadastros do Sistema → Regiões de Rota.</p>
                )}
                <div>
                  <Label className="text-xs">Região de Rota *</Label>
                  <Select value={selectedRegionId} onValueChange={setSelectedRegionId}>
                    <SelectTrigger><SelectValue placeholder="Selecione a região do técnico" /></SelectTrigger>
                    <SelectContent>
                      {routeRegions.map(r => (<SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={sendToRoute}
                  disabled={(needsFaturamentoBeforeRoute && !order.invoiced) || needsFinancialApprovalBeforeRoute || !selectedRegionId}
                  className="w-full gap-2"
                >
                  <Route className="h-4 w-4" /> Enviar para Rota do Técnico
                </Button>
              </>
            )}
          </div>
        )}

        {/* === AGENDAMENTO/ROTA — OS AGUARDANDO DEFINIÇÃO DE ROTA === */}
        {meOrder?.status === "Agendamento/Rota" && (
          <SectionCard icon={Route} title="Agendamento/Rota — Aguardando Definição de Rota" color="border-violet-200 bg-violet-50/30">
            <div className="grid grid-cols-2 gap-2 text-sm mb-2">
              <div><span className="text-muted-foreground">Estoque confirmado:</span> <strong>{fmtDate(order.stock_confirmed_date)}</strong></div>
              <div><span className="text-muted-foreground">Enviado para rota:</span> <strong>{fmtDate(order.route_sent_date)}</strong></div>
              <div><span className="text-muted-foreground">Região selecionada:</span> <strong>{order.route_region_name || "—"}</strong></div>
            </div>
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 flex items-center gap-1">
              <Route className="h-3 w-3" /> OS aguardando definição de rota do técnico. Acompanhe no menu Rotas do Técnico para incluir em uma rota e despachar.
            </div>
          </SectionCard>
        )}

        {meOrder?.status === "Etiqueta Gerada" && isExpedition && (
          <div className="space-y-3 rounded-md border p-4">
            <h4 className="font-medium text-sm">Etiquetas Geradas — Iniciar Separação</h4>
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <span className="text-muted-foreground">Transportadora:</span> <strong>{meOrder?.carrier || order.carrier || "—"}</strong>
              <span className="text-muted-foreground ml-2">Volumes:</span> <strong>{(meOrder?.melhor_envio_labels || order.melhor_envio_labels || []).length || 1}</strong>
            </div>
            {(meOrder?.melhor_envio_labels || order.melhor_envio_labels || []).length > 1 && (
              <div className="border rounded-md divide-y">
                {(meOrder?.melhor_envio_labels || order.melhor_envio_labels || []).map((lbl, i) => (
                  <div key={i} className="px-2 py-1.5 text-xs flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono font-medium">{lbl.label_tag}</span>
                      <span className="text-muted-foreground block">Rastreio: {lbl.tracking_code || "—"}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{lbl.product_name}</Badge>
                  </div>
                ))}
              </div>
            )}
            {(meOrder?.melhor_envio_labels || order.melhor_envio_labels || []).length <= 1 && currentTracking && (
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="text-muted-foreground">Rastreio:</span> <code className="text-xs bg-muted px-2 py-0.5 rounded">{currentTracking}</code>
              </div>
            )}
            {currentLabel && (
              <Button variant="outline" size="sm" className="gap-1" asChild>
                <a href={currentLabel} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /> Visualizar / Imprimir Etiquetas</a>
              </Button>
            )}
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 space-y-2">
              <p className="text-xs text-amber-800">Etiqueta cancelada no Melhor Envio? Verifique o status para desvincular automaticamente e liberar a reemissão de uma nova etiqueta.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-1" onClick={handleCheckLabelStatus} disabled={checkingLabel}>
                  <Search className="h-3.5 w-3.5" /> {checkingLabel ? "Verificando..." : "Verificar Status no Melhor Envio"}
                </Button>
                <Button variant="outline" size="sm" className="gap-1" onClick={handleGenerateLabel} disabled={generating}>
                  <Download className="h-3.5 w-3.5" /> {generating ? "Gerando..." : "Regenerar Etiqueta"}
                </Button>
              </div>
              {volumesOutdated && (
                <div className="space-y-2">
                  <div className="text-xs text-amber-800 bg-amber-100 border border-amber-300 rounded p-2 flex items-start gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{VOLUMES_OUTDATED_MESSAGE}{volumesCoherence.reason ? ` Motivo: ${volumesCoherence.reason}` : ""}</span>
                  </div>
                  <Button variant="secondary" size="sm" className="gap-1 w-full" onClick={handleRequoteShipping} disabled={requoting}>
                    {requoting ? (
                      <><div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Recalculando volumes e cotação...</>
                    ) : (
                      <><RefreshCw className="h-3.5 w-3.5" /> Recalcular Volumes e Cotar Frete Novamente</>
                    )}
                  </Button>
                </div>
              )}
              {sale?.delivery_modality === "Envio" && !volumesOutdated && (
                <Button variant="outline" size="sm" className="gap-1 w-full" onClick={() => setShowRequoteDialog(true)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Alterar Empacotamento e Recotar Frete
                </Button>
              )}
              {labelError && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 flex items-start gap-1">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span className="break-words whitespace-normal">{labelError}</span>
                </div>
              )}
            </div>
            <Button className="w-full gap-2" onClick={() => update({ status: "Separação", separation_date: new Date().toISOString().slice(0, 10) }, "Separação iniciada")}>
              <PackageCheck className="h-4 w-4" /> Iniciar Separação
            </Button>
          </div>
        )}

        {/* === EXTRAVIO — Regenerar Etiqueta (OS em status avançado com etiquetas extraviadas) === */}
        {isExpedition &&
          (order.melhor_envio_labels || []).length === 0 &&
          (order.melhor_envio_canceled_labels || []).some(l => l.canceled_status === 'extraviado' || String(l.reason || '').includes('Extravio')) &&
          ["Etiqueta Gerada", "Separação", "Saída do Estoque", "Em Transporte", "Entregue"].includes(meOrder?.status) && (
          <div className="space-y-3 rounded-md border border-red-300 bg-red-50 p-4">
            <h4 className="font-medium text-sm flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-red-600" /> Extravio Identificado — Reenviar Mercadoria</h4>
            <p className="text-xs text-muted-foreground">
              A etiqueta anterior foi marcada como extraviada{order.melhor_envio_canceled_labels?.length > 0 ? ` (${order.melhor_envio_canceled_labels.filter(l => l.canceled_status === 'extraviado').length} volume(s))` : ''}. Gere uma nova etiqueta para reenviar a mercadoria ao cliente — a mesma NF-e da venda será vinculada automaticamente.
            </p>
            {sale && (sale.shipping_quote_history || []).length > 0 && (
              <CarrierChangePanel sale={sale} order={order} currentUser={currentUser} volumesOutdated={volumesOutdated} />
            )}
            {volumesOutdated && (
              <div className="space-y-2">
                <div className="text-xs text-amber-800 bg-amber-100 border border-amber-300 rounded p-2 flex items-start gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{VOLUMES_OUTDATED_MESSAGE}{volumesCoherence.reason ? ` Motivo: ${volumesCoherence.reason}` : ""}</span>
                </div>
                <Button variant="secondary" size="sm" className="gap-1 w-full" onClick={handleRequoteShipping} disabled={requoting}>
                  {requoting ? (
                    <><div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Recalculando volumes e cotação...</>
                  ) : (
                    <><RefreshCw className="h-3.5 w-3.5" /> Recalcular Volumes e Cotar Frete Novamente</>
                  )}
                </Button>
              </div>
            )}
            <Button onClick={handleGenerateLabel} disabled={generating} className="w-full gap-2">
              {generating ? (
                <><div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Gerando etiqueta...</>
              ) : (
                <><Download className="h-4 w-4" /> Gerar Nova Etiqueta Melhor Envio</>
              )}
            </Button>
            {labelError && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 flex items-start gap-1">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span className="break-words whitespace-normal">{labelError}</span>
              </div>
            )}
          </div>
        )}

        {/* Status do Melhor Envio — rastreio e status do pedido sincronizados */}
        {((Array.isArray(meOrder?.melhor_envio_labels || order.melhor_envio_labels) && (meOrder?.melhor_envio_labels || order.melhor_envio_labels || []).length > 0) || meOrder?.tracking_code || order.tracking_code) && (
          <MelhorEnvioStatusCard
            order={meOrder}
            onRefresh={handleRefreshMeStatus}
            refreshing={refreshingMe}
            onManualDeliver={handleManualDeliver}
            manualDelivering={manualDelivering}
            onExtravioCompleted={() => {
              queryClient.invalidateQueries({ queryKey: ["serviceOrder", order?.id] });
              queryClient.invalidateQueries({ queryKey: ["sale", order?.sale_id] });
            }}
          />
        )}

        {/* === ROMANEIO DE SEPARAÇÃO === */}
        {(meOrder?.status === "Separação" || meOrder?.status === "Saída do Estoque" || meOrder?.status === "Em Transporte") && isExpedition && (
          <SectionCard icon={ClipboardList} title="Romaneio de Separação" color="border-violet-200 bg-violet-50/30">
            <div className="grid grid-cols-2 gap-2 text-sm mb-2">
              <div><span className="text-muted-foreground">Data Separação:</span> {fmtDate(order.separation_date)}</div>
              <div><span className="text-muted-foreground">Data Saída:</span> {fmtDate(order.exit_date)}</div>
              <div><span className="text-muted-foreground">Assinado por:</span> {order.separation_signed_by || "—"}</div>
            </div>
            {sale?.items?.length > 0 && (
              <div className="border-t pt-2 mb-2">
                <div className="text-xs text-muted-foreground mb-1">Itens para Separar</div>
                {sale.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-xs py-0.5">
                    <span>{item.product_name}</span>
                    <span className="font-bold text-primary">{item.quantity}x</span>
                  </div>
                ))}
              </div>
            )}
            {currentLabel && (
              <Button variant="outline" size="sm" className="gap-1 w-full mb-2" asChild>
                <a href={currentLabel} target="_blank" rel="noreferrer"><Download className="h-3 w-3" /> Imprimir Etiqueta</a>
              </Button>
            )}
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 space-y-2 mb-2">
              <p className="text-xs text-amber-800">Etiqueta cancelada no Melhor Envio? Verifique para desvincular e reemitir.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-1" onClick={handleCheckLabelStatus} disabled={checkingLabel}>
                  <Search className="h-3.5 w-3.5" /> {checkingLabel ? "Verificando..." : "Verificar Status"}
                </Button>
                <Button variant="outline" size="sm" className="gap-1" onClick={handleGenerateLabel} disabled={generating}>
                  <Download className="h-3.5 w-3.5" /> {generating ? "Gerando..." : "Regenerar Etiqueta"}
                </Button>
              </div>
              {volumesOutdated && (
                <div className="text-xs text-amber-800 bg-amber-100 border border-amber-300 rounded p-2 flex items-start gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{VOLUMES_OUTDATED_MESSAGE}{volumesCoherence.reason ? ` Motivo: ${volumesCoherence.reason}` : ""}</span>
                </div>
              )}
              <Button variant="secondary" size="sm" className="gap-1 w-full" onClick={handleRequoteShipping} disabled={requoting}>
                {requoting ? (
                  <><div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin"></div> Recalculando volumes e cotação...</>
                ) : (
                  <><RefreshCw className="h-3.5 w-3.5" /> Recalcular Volumes e Cotar Frete Novamente</>
                )}
              </Button>
              {labelError && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 flex items-start gap-1">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span className="break-words whitespace-normal">{labelError}</span>
                </div>
              )}
            </div>
            {sale && (sale.shipping_quote_history || []).length > 0 && (
              <CarrierChangePanel sale={sale} order={order} currentUser={currentUser} volumesOutdated={volumesOutdated} />
            )}
            {order.separation_signature_url && (
              <div className="mb-2">
                <img src={order.separation_signature_url} alt="Assinatura" className="max-h-20 border rounded" />
              </div>
            )}
            {meOrder?.status === "Separação" && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>A confirmação de saída do estoque é feita exclusivamente via <strong>Romaneio de Expedição</strong> ou <strong>QR Code</strong> (romaneio digital). Este botão foi removido para garantir o controle do fluxo.</span>
              </div>
            )}
            {meOrder?.status === "Saída do Estoque" && (
              <Button className="w-full gap-2" onClick={() => update({ status: "Em Transporte", exit_date: new Date().toISOString().slice(0, 10) }, "Saída confirmada — mercadoria em transporte")}>
                <Truck className="h-4 w-4" /> Confirmar Saída → Em Transporte
              </Button>
            )}
          </SectionCard>
        )}

        {/* === EM TRANSPORTE — TRACKING === */}
        {meOrder?.status === "Em Transporte" && isExpedition && (
          <div className="space-y-3 rounded-md border border-sky-300 bg-sky-50 p-4">
            <h4 className="font-medium text-sm flex items-center gap-1"><Truck className="h-4 w-4" /> Em Transporte — Acompanhar Entrega</h4>
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <span className="text-muted-foreground">Rastreio:</span> <code className="text-xs bg-muted px-2 py-0.5 rounded">{currentTracking}</code>
              <Button variant="outline" size="sm" className="gap-1 ml-2" onClick={handleTrack} disabled={trackingLoading}>
                <Search className="h-3 w-3" /> {trackingLoading ? "Rastreando..." : "Rastrear"}
              </Button>
            </div>
            {showTracking && (
              <div className="rounded-md border bg-muted/30 p-3 max-h-40 overflow-y-auto">
                {trackingEvents.length === 0 && !trackingLoading ? (
                  <p className="text-xs text-muted-foreground">Nenhum evento de rastreio encontrado ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {trackingEvents.map((ev, i) => (
                      <div key={i} className="flex gap-2 text-xs">
                        <MapPinned className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="font-medium">{ev.date || ev.created_at || "—"}</span>
                          <p className="text-muted-foreground">{ev.description || ev.message || ev.status || "—"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Button onClick={() => update({ status: "Entregue" }, "Entrega confirmada — OS concluída")}>
              <PackageCheck className="h-4 w-4" /> Confirmar Entrega
            </Button>
          </div>
        )}

        {meOrder?.status === "Entregue" && (
          <div className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm">
            <div className="font-medium text-emerald-800 flex items-center gap-2"><PackageCheck className="h-4 w-4" /> Mercadoria Entregue</div>
            {currentTracking && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Rastreio:</span> <code className="text-xs bg-emerald-100 px-2 py-0.5 rounded">{currentTracking}</code>
                <Button variant="ghost" size="sm" className="h-6 gap-1" onClick={handleTrack}><Search className="h-3 w-3" /> Ver histórico</Button>
              </div>
            )}
            {showTracking && trackingEvents.length > 0 && (
              <div className="rounded-md bg-emerald-100/50 p-3 max-h-40 overflow-y-auto mt-2">
                <div className="space-y-2">
                  {trackingEvents.map((ev, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <MapPinned className="h-3 w-3 text-emerald-600 mt-0.5 flex-shrink-0" />
                      <div><span className="font-medium">{ev.date || ev.created_at || "—"}</span><p className="text-emerald-800">{ev.description || ev.message || ev.status || "—"}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* === FATURAMENTO === */}
        {(isExpedition || (isDelivery && needsFaturamentoBeforeRoute)) && meOrder?.status !== "Aprovação Comercial" && meOrder?.status !== "Aprovação Financeira" && meOrder?.status !== "Cancelada" && (
          <SectionCard icon={FileText} title="Faturamento" color={order.invoiced ? "border-emerald-200 bg-emerald-50/30" : "border-border"}>
            {order.invoiced ? (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700">{order.invoice_type}</Badge>
                <span className="font-mono text-sm">{order.invoice_number}</span>
                <span className="text-muted-foreground text-xs">{fmtDate(order.invoice_date)}</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <Select value={invoiceType} onValueChange={setInvoiceType}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Nota Fiscal">Nota Fiscal</SelectItem>
                        <SelectItem value="Nota Simples">Nota Simples</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Número</Label>
                    <Input className="h-8" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Ex: NF-e 000123" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Data</Label>
                  <Input type="date" className="h-8" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                </div>
                <Button size="sm" className="gap-1" onClick={handleInvoice}><FileText className="h-3 w-3" /> Registrar Faturamento</Button>
              </div>
            )}
          </SectionCard>
        )}

        {/* ===== ENTREGA / INSTALAÇÃO FLOW ===== */}
        {meOrder?.status === "Aprovação Financeira" && isDelivery && (
          <div className="space-y-3 rounded-md border border-blue-300 bg-blue-50 p-4">
            <h4 className="font-medium text-sm flex items-center gap-1"><DollarSign className="h-4 w-4" /> Aprovação Financeira</h4>
            <p className="text-xs text-muted-foreground">
              {isFullyPaidBefore
                ? "Pagamento 100% confirmado. Aprove para liberar a produção/expedição. O faturamento deverá ocorrer antes de enviar para a rota."
                : "Entrada/pagamento parcial confirmado. Aprove para liberar a produção/expedição. O restante será recebido na entrega."}
            </p>
            <div>
              <Label className="text-xs">Aprovado por</Label>
              <Input value={financialApprovedBy} onChange={(e) => setFinancialApprovedBy(e.target.value)} placeholder="Nome de quem aprovou" />
            </div>
            <Button className="w-full gap-2" onClick={handleFinancialApproval}>
              <CheckCircle2 className="h-4 w-4" /> Aprovar Pagamento e Liberar
            </Button>
          </div>
        )}

        {meOrder?.status === "Em Andamento" && !isExpedition && order.type && (
          <div className="space-y-3 rounded-md border p-4">
            <h4 className="font-medium text-sm">Conclusão do Serviço</h4>
            {order.has_pending_payment && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Valor Recebido</Label>
                    <Input type="number" step="0.01" value={receivedAmount} onChange={e => setReceivedAmount(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div>
                    <Label className="text-xs">Forma de Recebimento</Label>
                    <Select value={receivedMethod} onValueChange={setReceivedMethod}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="Cartão de Crédito">Cartão de Crédito</SelectItem>
                        <SelectItem value="Cartão de Débito">Cartão de Débito</SelectItem>
                        <SelectItem value="PIX">PIX</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input type="file" accept="image/*,.pdf" className="hidden" id="receipt-upload" onChange={e => handleUpload(e.target.files?.[0], setPaymentReceiptUrl)} />
                  <input type="file" accept="image/*" className="hidden" id="photo-upload" onChange={e => handleUpload(e.target.files?.[0], setReceivedPhotoUrl)} />
                  {paymentReceiptUrl ? (
                    <Button variant="outline" size="sm" className="gap-1" asChild>
                      <a href={paymentReceiptUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /> Ver Comprovante</a>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => document.getElementById("receipt-upload").click()}>
                      <Paperclip className="h-3 w-3" /> Anexar Comprovante
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => document.getElementById("photo-upload").click()}>
                    <Paperclip className="h-3 w-3" /> Foto do Dinheiro
                  </Button>
                  {receivedPhotoUrl && (
                    <Button variant="ghost" size="sm" asChild>
                      <a href={receivedPhotoUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /> Ver Foto</a>
                    </Button>
                  )}
                </div>
              </>
            )}
            <div>
              <Label className="text-xs">Observações da Conclusão</Label>
              <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <Button onClick={completeWithPayment}>
              <PackageCheck className="h-4 w-4" /> {order.has_pending_payment ? "Confirmar Recebimento e Concluir" : "Confirmar Conclusão"}
            </Button>
          </div>
        )}

        {meOrder?.status === "Concluída" && !isExpedition && (
          <div className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm">
            <div className="font-medium text-emerald-800">OS Concluída</div>
            {order.received_amount > 0 && <p className="text-emerald-900">Recebido: {fmtMoney(order.received_amount)} — {order.received_method || "—"}</p>}
            {order.payment_receipt_url && (
              <Button variant="outline" size="sm" className="gap-1" asChild>
                <a href={order.payment_receipt_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /> Ver Comprovante</a>
              </Button>
            )}
            {order.has_pending_payment && (
              <div className="border-t pt-2 mt-2 text-xs text-blue-800 bg-blue-50 rounded p-2">
                <strong>Recebimento pendente:</strong> O valor recebido pelo técnico ({fmtMoney(order.received_amount)}) deve ser conciliado no Contas a Receber e o faturamento do pedido deve ser realizado.
              </div>
            )}
          </div>
        )}

        {/* === REPROVADO PELO FINANCEIRO — pós-venda precisa corrigir e reenviar === */}
        {meOrder?.finance_rejected && (
          <div className="space-y-1 rounded-md border border-red-300 bg-red-50 p-4 text-sm">
            <div className="font-medium text-red-800 flex items-center gap-1"><XCircle className="h-4 w-4" /> Reprovado pelo Financeiro</div>
            <p className="text-xs text-red-800">
              {meOrder.finance_rejected_reason || "—"}
              {meOrder.finance_rejected_by ? ` — por ${meOrder.finance_rejected_by}` : ""}
              {meOrder.finance_rejected_date ? `, em ${new Date(meOrder.finance_rejected_date).toLocaleDateString("pt-BR")}` : ""}
            </p>
            <p className="text-xs text-red-700">Corrija o apontado e reenvie ao financeiro pela aba Pós-Rota em Ordens de Serviço.</p>
            {canManageOS && Number(meOrder?.received_amount) !== Number(sale?.grand_total) && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1 border-red-300 text-red-800 hover:bg-red-100"
                onClick={() => setShowSaleValueAdjust(true)}
              >
                <DollarSign className="h-3 w-3" /> Ajustar Valor da Venda
              </Button>
            )}
          </div>
        )}

        {/* === CONCLUÍDA PELO TÉCNICO — aguardando envio para aprovação financeira === */}
        {meOrder?.status === "Concluída pelo Técnico" && (
          <div className="space-y-3 rounded-md border border-teal-300 bg-teal-50 p-4">
            <h4 className="font-medium text-sm flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-teal-600" /> Concluída pelo Técnico</h4>
            <p className="text-xs text-muted-foreground">
              O técnico finalizou o serviço{order.tech_completion_date ? ` em ${fmtDate(order.tech_completion_date)}` : ""}. Envie para aprovação financeira para prosseguir com o faturamento.
            </p>
            <Button className="w-full gap-2" onClick={() => update({ status: "OK - Aprov. Financeira" }, "OS enviada para aprovação financeira")}>
              <ArrowRight className="h-4 w-4" /> Enviar para Aprovação Financeira
            </Button>
          </div>
        )}

        {/* === ROTA ENVIADA — aguardando definição da rota do técnico === */}
        {meOrder?.status === "Rota Enviada" && (
          <SectionCard icon={Route} title="Rota Enviada — Aguardando Definição de Rota" color="border-violet-200 bg-violet-50/30">
            <div className="grid grid-cols-2 gap-2 text-sm mb-2">
              <div><span className="text-muted-foreground">Estoque confirmado:</span> <strong>{fmtDate(order.stock_confirmed_date)}</strong></div>
              <div><span className="text-muted-foreground">Enviado para rota:</span> <strong>{fmtDate(order.route_sent_date)}</strong></div>
              <div><span className="text-muted-foreground">Região selecionada:</span> <strong>{order.route_region_name || "—"}</strong></div>
            </div>
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 flex items-center gap-1">
              <Route className="h-3 w-3" /> OS aguardando definição de rota do técnico. Acompanhe no menu Rotas do Técnico para incluir em uma rota e despachar.
            </div>
            {/* Sempre mostra a OS do Técnico para que o admin/supervisor/logística possa visualizar e editar */}
            {(isDelivery || meOrder?.type === "Manutenção") && <TechnicianOSPanel order={meOrder} sale={sale} />}
          </SectionCard>
        )}

        {/* === PÓS-TÉCNICO: APROVAÇÃO FINANCEIRA (fluxo Parcial) === */}
        {meOrder?.status === "OK - Aprov. Financeira" && (
          <div className="space-y-3 rounded-md border border-blue-300 bg-blue-50 p-4">
            <h4 className="font-medium text-sm flex items-center gap-1"><DollarSign className="h-4 w-4" /> Aprovação Financeira — Pós-Técnico</h4>
            <p className="text-xs text-muted-foreground">
              O técnico concluiu o serviço. Confirme a aprovação financeira para liberar o faturamento final.
              {order.has_pending_payment && order.received_amount > 0 && ` Recebimento do técnico: ${fmtMoney(order.received_amount)} — ${order.received_method || "—"}.`}
            </p>
            <div>
              <Label className="text-xs">Aprovado por</Label>
              <Input value={financialApprovedBy} onChange={(e) => setFinancialApprovedBy(e.target.value)} placeholder="Nome de quem aprovou" />
            </div>
            <Button className="w-full gap-2" onClick={async () => {
              try {
                const result = await updateOsStatus({ osId: order.id, updates: {
                  status: "Faturada",
                  financial_approved_by: financialApprovedBy || currentUser?.full_name || "Financeiro",
                  financial_approval_date: new Date().toISOString(),
                }, expectedStatus: meOrder?.status, source: "Financeiro — aprovação pós-técnico" });
                if (!result.success) {
                  queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
                  toast({ title: "Ação não realizada", description: refusalMessage(result, order.code), variant: "destructive" });
                  onOpenChange(false);
                  return;
                }
                queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
                queryClient.invalidateQueries({ queryKey: ["sales"] });
                toast({ title: "Aprovação financeira concluída — OS liberada para faturamento" });
                onOpenChange(false);
              } catch (err) {
                toast({ title: "Erro ao atualizar OS", description: "Não foi possível concluir a ação agora. Tente novamente.", variant: "destructive" });
              }
            }}>
              <CheckCircle2 className="h-4 w-4" /> Aprovar e Liberar Faturamento
            </Button>
          </div>
        )}


        {/* === FATURADA — pronta para conclusão final === */}
        {meOrder?.status === "Faturada" && (
          <div className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50 p-4">
            <h4 className="font-medium text-sm flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Faturada — Conclusão do Atendimento</h4>
            <p className="text-xs text-muted-foreground">
              OS faturada{order.invoice_date ? ` em ${fmtDate(order.invoice_date)}` : ""}{order.invoice_number ? ` (${order.invoice_type}: ${order.invoice_number})` : ""}.
              Conclua para encerrar definitivamente o atendimento — a venda vinculada também será marcada como concluída.
            </p>
            <Button className="w-full gap-2" onClick={() => update({ status: "Concluída" }, "OS concluída — atendimento encerrado e venda atualizada")}>
              <CheckCircle2 className="h-4 w-4" /> Concluir Atendimento
            </Button>
          </div>
        )}

        {/* === OS DO TÉCNICO (sistema completo de OS do técnico) ===
            Sempre visível para OS de Entrega/Instalação e Manutenção. O painel interno
            controla permissões de edição (canManageOS) e exibe o botão "Revisão" (violeta)
            para pós-venda/admin/logística quando a TOS está concluída/parcial/interrompida. */}
        {(isDelivery || meOrder?.type === "Manutenção") && <TechnicianOSPanel order={meOrder} sale={sale} />}

        {/* === AVISO AUTOMÁTICO DE RASTREIO (WhatsApp) === */}
        {isExpedition && meOrder && <TrackingNoticeCard order={meOrder} />}

        {/* === OS DO TÉCNICO MANUAL (expedição — pós-entrega) === */}
        {isExpedition && meOrder?.status !== "Cancelada" && <ExpeditionTechnicianOSSection order={meOrder} />}

        {/* === FLUXO DE GARANTIA — recebimento e retorno do produto === */}
        {meOrder?.type === "Manutenção" && (meOrder?.maintenance_subtype === "Garantia" || meOrder?.analysis_converted_to === "Garantia") && (
          <WarrantyFlowPanel order={meOrder} />
        )}

        {/* === OS REVERSA (devolução) — disponível para OS entregue/concluída === */}
        {!order.is_reverse && ["Concluída", "Entregue"].includes(meOrder?.status) && <ReverseOSSection order={meOrder} />}

        </div>
        </ErrorBoundary>

        <RecordAdvancePaymentDialog
          open={showAdvancePayment}
          onOpenChange={setShowAdvancePayment}
          order={order}
          sale={sale}
        />
        <RequoteShippingDialog
          open={showRequoteDialog}
          onOpenChange={setShowRequoteDialog}
          sale={sale}
        />
        <RequestProductionCancellationDialog
          open={showCancellationRequest}
          onOpenChange={setShowCancellationRequest}
          order={meOrder || order}
        />
        <SaleValueAdjustDialog
          open={showSaleValueAdjust}
          onOpenChange={setShowSaleValueAdjust}
          order={meOrder || order}
          sale={sale}
          currentUser={currentUser}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["sales"] });
            queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
            if (order?.sale_id) queryClient.invalidateQueries({ queryKey: ["sale", order.sale_id] });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}