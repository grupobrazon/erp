import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, ArrowLeft, Search, Paperclip, ExternalLink, AlertTriangle, Wrench, Star } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/ui/PageHeader";
import { format, addMonths } from "date-fns";
import ClientSearchInput from "@/components/sales/ClientSearchInput";
import ShippingQuote from "@/components/sales/ShippingQuote";
import AddressFields from "@/components/sales/AddressFields";
import CustomerRelationshipTab from "@/components/sales/CustomerRelationshipTab";
import SaleScheduleSection from "@/components/sales/SaleScheduleSection";
import DeliveryAddressZoneSection from "@/components/sales/DeliveryAddressZoneSection";
import IncompleteAddressAlert from "@/components/sales/IncompleteAddressAlert";
import SalesServicesTab from "@/components/sales/SalesServicesTab";
import SaleWorkflowTimeline from "@/components/sales/SaleWorkflowTimeline";
import SaleLogisticsPanel from "@/components/sales/SaleLogisticsPanel";
import { Lock } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/permissions";
import { isMaintenanceMissing } from "@/lib/maintenanceCheck";
import { createWithCode } from "@/lib/codeGeneration";
import PaymentConditionCombobox from "@/components/sales/PaymentConditionCombobox";
import SaleSupervisorPanel from "@/components/sales/SaleSupervisorPanel";
import SalePdfExport from "@/components/sales/SalePdfExport";
import LinkMaintenanceDialog from "@/components/sales/LinkMaintenanceDialog";
import CancellationRequestDialog from "@/components/sales/CancellationRequestDialog";
import { computePrice, getEffectiveCost, getEffectiveMargin } from "@/lib/pricingCalc";
import {
  getInstallmentBracket, isPaymentConditionAllowed, shouldChargeDisplacementFee,
  canExemptFreight, canApplyCashDiscount, getMaxDiscount,
} from "@/lib/salePricingRules";
import { validateVolumesAgainstItems, VOLUMES_OUTDATED_MESSAGE } from "@/lib/shippingVolumes";
import { hasValidPhone, PHONE_REQUIRED_MESSAGE } from "@/lib/clientPhoneCheck";

export default function SaleForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isAdmin } = usePermissions();
  const userSellerId = user?.seller_id || "";
  const [form, setForm] = useState({
    client_id: "", seller_id: "", billing_location_id: "", stock_location_id: "",
    date: format(new Date(), "yyyy-MM-dd"), items: [], notes: "",
    additions: 0, discount: 0, received_amount: 0,
    delivery_different: false, billing_different: false, billing_address: {}, delivery_address: {},
    delivery_route_zone_id: "", delivery_route_zone_name: "", delivery_route_calendar_id: "", delivery_route_calendar_name: "",
    billing_forecast: "", payments: [], stage: "Orçamento", confirmation_type: "",
    delivery_modality: "Entrega Própria", freight: 0,
    freight_exempt: false, freight_exempt_value: 0, displacement_fee: 0,
    quote_completed: false, selected_service: "", selected_carrier: "",
    shipping_quote_history: [],
    packing_mode: "per_item", item_packing: {}, shipping_volumes: [],
    linked_equipment_id: "", linked_equipment_code: "",
    services: [],
    supervisor_logs: [],
    expedition_forecast_date: "",
    service_detail_types: [],
    service_detail_notes: "",
  });

  const { toast } = useToast();
  // Cotação desatualizada: itens/quantidades divergem dos volumes salvos da última cotação de frete
  const volumesCoherence = form.delivery_modality === "Envio"
    ? validateVolumesAgainstItems(form.items, form.shipping_volumes, form.packing_mode)
    : { ok: true, reason: "" };
  const volumesOutdated = form.delivery_modality === "Envio" && form.quote_completed && !volumesCoherence.ok;
  const [productQty, setProductQty] = useState("1");
  const [productSearch, setProductSearch] = useState("");
  const [showProductResults, setShowProductResults] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [productError, setProductError] = useState("");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [originalStage, setOriginalStage] = useState("Orçamento");
  const [searchParams] = useSearchParams();
  const equipmentIdParam = searchParams.get("equipment_id");
  const clientIdParam = searchParams.get("client_id");

  useEffect(() => {
    if (isEditing) {
      base44.entities.Sale.get(id).then(sale => {
        setForm({
          client_id: sale.client_id || "", seller_id: sale.seller_id || "",
          billing_location_id: sale.billing_location_id || "", stock_location_id: sale.stock_location_id || "",
          date: sale.date || format(new Date(), "yyyy-MM-dd"),
          first_status_change_date: sale.first_status_change_date || "",
          items: sale.items || [], notes: sale.notes || "",
          additions: sale.additions || 0, discount: sale.discount || 0, received_amount: sale.received_amount || 0,
          delivery_different: sale.delivery_different || false, billing_different: sale.billing_different || false,
          billing_address: sale.billing_address || {}, delivery_address: sale.delivery_address || {},
          delivery_route_zone_id: sale.delivery_route_zone_id || "",
          delivery_route_zone_name: sale.delivery_route_zone_name || "",
          delivery_route_calendar_id: sale.delivery_route_calendar_id || "",
          delivery_route_calendar_name: sale.delivery_route_calendar_name || "",
          billing_forecast: sale.billing_forecast || "", payments: sale.payments || [],
          cr_preferred_date: sale.cr_preferred_date || "", cr_period: sale.cr_period || "",
          cr_weekdays: sale.cr_weekdays || [], cr_time_range: sale.cr_time_range || "", cr_notes: sale.cr_notes || "",
          cr_scheduling_type: sale.cr_scheduling_type || "",
          cr_week_start: sale.cr_week_start || "",
          cr_shipping_deadline: sale.cr_shipping_deadline || "",
          cr_delivery_deadline: sale.cr_delivery_deadline || "",
          stage: sale.stage || "Orçamento", confirmation_type: sale.confirmation_type || "", delivery_modality: sale.delivery_modality || "Entrega Própria",
          freight: sale.freight || 0,
          freight_exempt: sale.freight_exempt || false,
          freight_exempt_value: sale.freight_exempt_value || 0,
          displacement_fee: sale.displacement_fee || 0,
          quote_completed: sale.quote_completed || (sale.shipping_quote_history?.length > 0) || (sale.delivery_modality === "Envio" && (sale.freight > 0 || sale.freight_exempt)),
          selected_service: sale.selected_service || "",
          selected_carrier: sale.selected_carrier || "",
          shipping_quote_history: sale.shipping_quote_history || [],
          packing_mode: sale.packing_mode || "per_item",
          item_packing: sale.item_packing || {},
          shipping_volumes: sale.shipping_volumes || [],
          services: sale.services || [],
          total_services: sale.total_services || 0,
          supervisor_logs: sale.supervisor_logs || [],
          expedition_forecast_date: sale.expedition_forecast_date || "",
          service_detail_types: sale.service_detail_types || [],
          service_detail_notes: sale.service_detail_notes || "",
        });
        setOriginalStage(sale.stage || "Orçamento");
        setOrderNumber(sale.order_number || "");
        if (sale.client_id) {
          base44.entities.Client.get(sale.client_id).then(setSelectedClient).catch(() => {});
        }
      });
    } else {
      setOrderNumber("");
      setOriginalStage("Orçamento");
      if (userSellerId) {
        setForm(prev => ({ ...prev, seller_id: userSellerId }));
      }
      if (equipmentIdParam) {
        base44.entities.Equipment.get(equipmentIdParam).then(equip => {
          if (equip) {
            setForm(prev => ({
              ...prev,
              client_id: equip.client_id,
              linked_equipment_id: equip.id,
              linked_equipment_code: equip.patrimony_code || equip.code || "",
            }));
            base44.entities.Client.get(equip.client_id).then(setSelectedClient).catch(() => {});
          }
        }).catch(() => {});
      } else if (clientIdParam) {
        // Vinda do discador 3C Plus (sem equipamento vinculado)
        setForm(prev => ({ ...prev, client_id: clientIdParam }));
        base44.entities.Client.get(clientIdParam).then(setSelectedClient).catch(() => {});
      }
    }
  }, [id, isEditing, equipmentIdParam, clientIdParam]);

  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => base44.entities.Product.list("-created_date", 500) });
  const { data: sellers = [] } = useQuery({ queryKey: ["sellers"], queryFn: () => base44.entities.Seller.list("-created_date", 200) });
  const { data: billingLocations = [] } = useQuery({ queryKey: ["billingLocations"], queryFn: () => base44.entities.BillingLocation.list("-created_date", 200) });
  const { data: stockLocations = [] } = useQuery({ queryKey: ["stockLocations"], queryFn: () => base44.entities.StockLocation.list("-created_date", 200) });
  const { data: paymentConditions = [] } = useQuery({ queryKey: ["paymentConditions"], queryFn: () => base44.entities.PaymentCondition.list("-created_date", 200) });
  const { data: productGroups = [] } = useQuery({ queryKey: ["productGroups"], queryFn: () => base44.entities.ProductGroup.list("-created_date", 200) });
  const { data: productSubgroups = [] } = useQuery({ queryKey: ["productSubgroups"], queryFn: () => base44.entities.ProductSubgroup.list("-created_date", 500) });
  const { data: pricingConfigs = [] } = useQuery({ queryKey: ["pricingConfig"], queryFn: () => base44.entities.PricingConfig.list("-created_date", 10) });
  const pricingConfig = pricingConfigs.find(c => c.name === "default") || pricingConfigs[0] || {};

  const { data: linkedOSResult = [] } = useQuery({
    queryKey: ["sale-linked-os", id],
    queryFn: () => base44.entities.ServiceOrder.filter({ sale_id: id }, "-created_date", 1),
    enabled: !!id,
  });
  const linkedOS = linkedOSResult[0] || null;

  const { data: clientEquipment = [] } = useQuery({
    queryKey: ["client-equipment-link", form.client_id],
    queryFn: () => base44.entities.Equipment.filter({ client_id: form.client_id, status: "Ativo" }, "-created_date", 200),
    enabled: !!form.client_id,
  });

  const isLocked = isEditing && ["Pagamento Aprovado", "Em OS", "Faturada", "Concluída"].includes(form.stage);
  const stageLocked = isEditing && form.stage !== "Orçamento";
  // Vendas importadas do sistema antigo (marcadas com "Pedido antigo:" em notes) podem ser editadas
  // mesmo travadas, para permitir anexar comprovantes de pagamento antigos. Vendas novas continuam travadas.
  const isLegacyImported = !!(form.notes && form.notes.includes("Pedido antigo:"));

  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const productSearchTokens = productSearch ? norm(productSearch).split(/\s+/).filter(Boolean) : [];
  const filteredProducts = productSearchTokens.length
    ? products
        .filter(p => {
          const hay = `${norm(p.name)} ${norm(p.code)}`;
          return productSearchTokens.every(tok => hay.includes(tok));
        })
    : [];

  const PECAS_COMPONENTES = "peças e componentes";
  const isPecasComponentes = (item) => {
    const product = products.find(p => p.id === item.product_id);
    if (!product) return false;
    const gName = (product.group_name || productGroups.find(g => g.id === product.group_id)?.name || "").toLowerCase();
    const sgName = (product.subgroup_name || productSubgroups.find(sg => sg.id === product.subgroup_id)?.name || "").toLowerCase();
    return gName === PECAS_COMPONENTES || sgName === PECAS_COMPONENTES;
  };

  const addItem = (productId) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    if (isMaintenanceMissing(product)) {
      setProductError(`"${product.name}" não pode ser vendido: cadastre o papel e o prazo de manutenção do equipamento primeiro.`);
      return;
    }
    setProductError("");
    const qty = parseFloat(productQty.replace(",", ".")) || 1;
    // Calcula o preço de venda: à vista como referência; se > 500 usa 12x, senão usa 6x.
    // Produtos sem custo/preço ficam com 0 — o vendedor pode lançar o valor manualmente.
    const cost = getEffectiveCost(product, productSubgroups, productGroups);
    const margin = getEffectiveMargin(product, productSubgroups, productGroups, pricingConfig);
    const priceVista = computePrice(cost, pricingConfig, 1, "mg", margin, product.sale_price);
    let unitPrice = 0;
    if (priceVista > 0) {
      if (priceVista > 500) {
        unitPrice = computePrice(cost, pricingConfig, 12, "mg", margin, product.sale_price);
      } else {
        unitPrice = computePrice(cost, pricingConfig, 6, "mg", margin, product.sale_price);
      }
    } else {
      unitPrice = Number(product.sale_price) || 0;
    }
    setForm(prev => ({
      ...prev,
      items: [...prev.items, {
        product_id: product.id, product_name: product.name,
        quantity: qty, unit_price: unitPrice,
        total: qty * unitPrice, generate_equipment: false,
      }],
    }));
    setProductSearch(""); setProductQty("1"); setShowProductResults(false);

    // Cápsula/elemento filtrante sem vínculo + cliente com equipamento vencido/próximo → oferecer vínculo
    const isPart = product.is_maintenance_part || product.maintenance_role === "Peça de Manutenção";
    if (isPart && !form.linked_equipment_id && clientEquipment.some(e => {
      if (e.record_type === "peca" || !e.next_maintenance_date) return false;
      const next = new Date(e.next_maintenance_date + "T00:00:00");
      const t = new Date(); t.setHours(0, 0, 0, 0);
      return Math.ceil((next - t) / (1000 * 60 * 60 * 24)) <= 30;
    })) {
      setLinkDialogOpen(true);
    }
  };

  const updateItem = (index, field, value) => {
    setForm(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      if (field === "quantity" || field === "unit_price") {
        items[index].total = (items[index].quantity || 0) * (items[index].unit_price || 0);
      }
      return { ...prev, items };
    });
  };

  const removeItem = (index) => setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));

  const totalItems = form.items.reduce((sum, item) => sum + (item.total || 0), 0);
  const totalServices = (form.services || []).reduce((sum, s) => sum + (s.total || 0), 0);
  // Taxa de deslocamento automática para vendas < R$ 150 nas modalidades Entrega/Entrega+Instalação
  const autoDisplacementFee = shouldChargeDisplacementFee(totalItems + totalServices, form.delivery_modality) ? 30 : 0;
  const displacementFee = form.displacement_fee || autoDisplacementFee;
  const grandTotal = totalItems + totalServices + (form.additions || 0) + (form.freight || 0) + displacementFee - (form.discount || 0);
  const totalPayments = form.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const change = (form.received_amount || 0) - grandTotal;

  // Faixa de parcelamento e desconto com base no valor total da venda
  // Exceção pontual: somente o pedido P677 tem a lista de condições liberada sem o limite
  // de parcelas da faixa de valor (permite selecionar manualmente condições acima do máximo, ex.: 10x).
  const paymentConditionException = isEditing && orderNumber === "P677";
  const saleSubtotal = totalItems + totalServices;
  const bracket = getInstallmentBracket(saleSubtotal);
  const cashDiscountCheck = canApplyCashDiscount(saleSubtotal, form.delivery_modality);
  // Condição de pagamento principal (maior parcela) para cálculo da margem de frete
  const primaryPayment = form.payments.find(p => p.condition_id);
  const primaryCondition = paymentConditions.find(c => c.id === primaryPayment?.condition_id);
  const paymentInstallments = primaryCondition?.payment_type === "Parcelado" ? (primaryCondition.installments || 1) : 1;
  const freightCheck = canExemptFreight({
    total: saleSubtotal, deliveryModality: form.delivery_modality, freight: form.freight,
    items: form.items, products, productGroups: productGroups, productSubgroups: productSubgroups,
    config: pricingConfig, paymentInstallments,
  });
  // Piso do desconto conforme regras:
  // - À vista (e permitido): preço à vista (1x)
  // - À vista mas venda < 300 + Entrega/Entrega+Instalação: tabela 6x (custo de deslocamento)
  // - Parcelado ou sem pagamento: tabela de referência da faixa (6x ou 12x)
  const isVistaPayment = primaryCondition?.payment_type === "À Vista";
  let discountFloorInstallments;
  if (isVistaPayment && cashDiscountCheck.allowed) {
    discountFloorInstallments = 1; // preço à vista
  } else if (isVistaPayment && !cashDiscountCheck.allowed) {
    discountFloorInstallments = 6; // < 300 + Entrega → tabela 6x
  } else {
    discountFloorInstallments = bracket.floorTable === "12x" ? 12 : 6; // tabela de referência
  }
  // Cliente VIP Brazon: libera o desconto do programa sobre elementos filtrantes (refis)
  const vipProgram = (selectedClient?.active_promotions || []).find(p => p.status !== "Cancelada");
  const vipDiscountPercent = selectedClient?.vip_client ? (vipProgram?.discount_percent || 20) : 0;
  const maxDiscount = getMaxDiscount({
    items: form.items, products, productGroups: productGroups, productSubgroups: productSubgroups,
    config: pricingConfig, floorInstallments: discountFloorInstallments,
    vipDiscountPercent,
  });

  const NON_MONETARY_CONDITIONS = ["Bonificação", "Brinde", "Permuta"];
  const hasValidPayment = () => form.payments.some(p => p.condition_id && ((p.amount || 0) > 0 || grandTotal <= 0 || NON_MONETARY_CONDITIONS.includes(p.condition_name)));
  const missingReceipt = () => form.payments.find(p => p.payment_status === "Realizada" && !p.receipt_url);
  const requirePayment = (stage) => stage === "Confirmada" || stage === "Pagamento Aprovado" || stage === "Em OS" || stage === "Faturada" || stage === "Concluída";
  const FORWARD_STAGES = ["Confirmada", "Pagamento Aprovado", "Em OS", "Faturada", "Concluída"];
  const clientMissingDocument = () => !selectedClient?.document || String(selectedClient.document).replace(/\D/g, "").length < 11;
  const clientMissingPhone = () => !hasValidPhone(selectedClient);

  // Endereço incompleto: falta Número e/ou Complemento (vale tanto para o endereço do
  // cadastro do cliente quanto para o endereço digitado no pedido).
  const addressIncomplete = (a) => !a?.number?.trim() || !a?.complement?.trim();
  const billingIncomplete = addressIncomplete(form.billing_address);
  const deliveryIncomplete = form.delivery_different && addressIncomplete(form.delivery_address);
  const requiresServiceDetail = form.delivery_modality === "Entrega Própria" || form.delivery_modality === "Entrega + Instalação";
  const serviceDetailMissing = requiresServiceDetail && ((form.service_detail_types || []).length === 0 || !(form.service_detail_notes || "").trim());
  const leavingOrcamento = (newStage) => originalStage === "Orçamento" && FORWARD_STAGES.includes(newStage);
  const validateProgress = (targetStage = form.stage) => {
    if (!hasValidPayment()) return "Lance ao menos uma condição de pagamento antes de sair da fase de Orçamento.";
    if (missingReceipt()) return "Anexe o comprovante de todos os pagamentos realizados antes de enviar para aprovação financeira.";
    // Modalidade Envio exige pagamento antecipado: todos os pagamentos devem estar "Realizada" com comprovante
    if (form.delivery_modality === "Envio" && targetStage === "Confirmada") {
      const pendentes = form.payments.filter(p => p.payment_type !== "Bonificação" && p.payment_status !== "Realizada");
      if (pendentes.length > 0) return "Modalidade Envio exige pagamento antecipado. Marque todos os pagamentos como 'Realizada' antes de confirmar.";
      const semComprovante = form.payments.filter(p => p.payment_status === "Realizada" && !p.receipt_url);
      if (semComprovante.length > 0) return "Anexe o comprovante de todos os pagamentos antes de confirmar a venda (modalidade Envio).";
    }
    return null;
  };

  const addPayment = () => setForm(prev => ({
    ...prev,
    payments: [...prev.payments, {
      payment_type: "", condition_id: "", condition_name: "", amount: 0,
      payment_status: prev.delivery_modality === "Envio" ? "Realizada" : "Pendente",
      payment_moment: prev.delivery_modality === "Envio" ? "Antecipada" : "",
    }],
  }));
  const handlePaymentTypeChange = (index, type) => {
    setForm(prev => {
      const payments = [...prev.payments];
      const isBonif = type === "Bonificação";
      payments[index] = {
        ...payments[index],
        payment_type: type,
        condition_id: "",
        condition_name: "",
        // Bonificação é tratada como pagamento à vista (Realizada/Antecipada)
        payment_status: isBonif ? "Realizada" : payments[index].payment_status,
        payment_moment: isBonif ? "Antecipada" : payments[index].payment_moment,
      };
      return { ...prev, payments };
    });
  };
  const updatePayment = (index, field, value) => {
    setForm(prev => {
      const payments = [...prev.payments];
      payments[index] = { ...payments[index], [field]: value };
      if (field === "payment_status" && value === "Pendente" && payments[index].payment_moment === "Antecipada") {
        payments[index].payment_moment = "";
      }
      // Modalidade Envio: pagamento antecipado — ao marcar como Realizada, define momento como Antecipada
      if (field === "payment_status" && value === "Realizada" && prev.delivery_modality === "Envio") {
        payments[index].payment_moment = "Antecipada";
      }
      if (field === "condition_id") {
        const cond = paymentConditions.find(c => c.id === value);
        payments[index].condition_name = cond?.name || "";
      }
      return { ...prev, payments };
    });
  };
  const removePayment = (index) => setForm(prev => ({ ...prev, payments: prev.payments.filter((_, i) => i !== index) }));

  const handleReceiptUpload = async (index, file) => {
    if (!file) return;
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    updatePayment(index, "receipt_url", file_url);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const client = selectedClient;
      const saleData = {
        ...form,
        // 1ª mudança de status da venda (saída de Orçamento): gravada uma única vez.
        // É a data que o Dashboard Comercial usa para agrupar o mês de cada venda.
        first_status_change_date: form.stage !== "Orçamento"
          ? (form.first_status_change_date || new Date().toISOString())
          : (form.first_status_change_date || ""),
        shipping_quote_history: (form.shipping_quote_history || []).map(h => ({
          company_name: String(h.company_name ?? ""),
          service_name: String(h.service_name ?? ""),
          service_id: String(h.service_id ?? ""),
          price: Number(h.price) || 0,
          delivery_time: String(h.delivery_time ?? ""),
          date: h.date ? String(h.date) : new Date().toISOString(),
          selected: !!h.selected,
        })),
        client_name: client?.name || "",
        total: totalItems, total_services: totalServices, grand_total: grandTotal,
        displacement_fee: displacementFee,
        change_amount: change > 0 ? change : 0,
        seller_name: sellers.find(s => s.id === form.seller_id)?.name || "",
        billing_location_name: billingLocations.find(l => l.id === form.billing_location_id)?.name || "",
        stock_location_name: stockLocations.find(l => l.id === form.stock_location_id)?.name || "",
        confirmation_type: form.stage === "Confirmada"
          ? (form.delivery_modality === "Envio"
              ? "Total"
              : (form.payments.some(p => p.payment_status === "Pendente") || form.payments.some(p => p.payment_type === "Bonificação") ? "Parcial" : "Total"))
          : (form.confirmation_type || ""),
      };

      const sale = isEditing
        ? await base44.entities.Sale.update(id, saleData)
        : (await createWithCode("sale", saleData)).record;

      if (!isEditing) {
        for (const item of form.items) {
          if (item.generate_equipment) {
            const product = products.find(p => p.id === item.product_id);
            for (let i = 0; i < (item.quantity || 1); i++) {
              const nextMaint = product?.maintenance_interval_months
                ? format(addMonths(new Date(form.date), product.maintenance_interval_months), "yyyy-MM-dd") : null;
              await createWithCode("equipment", {
                client_id: form.client_id, client_name: client?.name || "",
                product_id: item.product_id, product_name: product?.name || "",
                brand: product?.brand || "", sale_date: form.date, installation_date: form.date,
                status: "Ativo", maintenance_interval_months: product?.maintenance_interval_months || 6,
                next_maintenance_date: nextMaint,
              });
            }
          }
        }
        if (form.billing_different && form.billing_address?.zip_code && form.client_id) {
          await base44.entities.Address.create({
            client_id: form.client_id,
            label: "Faturamento",
            ...form.billing_address,
          });
        }
        if (form.delivery_different && form.delivery_address?.zip_code && form.client_id) {
          await base44.entities.Address.create({
            client_id: form.client_id,
            label: "Entrega",
            ...form.delivery_address,
            route_zone_id: form.delivery_route_zone_id || "",
            route_zone_name: form.delivery_route_zone_name || "",
            route_calendar_id: form.delivery_route_calendar_id || "",
            route_calendar_name: form.delivery_route_calendar_name || "",
          });
        }
      }

      // Venda Parcial confirmada: gera a OS automaticamente (pagamentos pendentes na entrega/instalação —
      // o técnico recebe o pagamento na entrega). Venda Total aguarda aprovação financeira.
      const isParcialConfirmed = saleData.stage === "Confirmada" && saleData.confirmation_type === "Parcial";
      if (isParcialConfirmed) {
        const existingOS = await base44.entities.ServiceOrder.filter({ sale_id: sale.id });
        if (existingOS.length === 0) {
          try {
            await base44.functions.invoke("generateServiceOrder", { sale_id: sale.id });
          } catch (_e) { /* ignora — a OS pode ser gerada manualmente depois */ }
        }
      }
      return sale;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      queryClient.invalidateQueries({ queryKey: ["maintenanceEquipment"] });
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
      navigate("/vendas");
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Erro ao salvar venda", description: error?.message || "Falha desconhecida" });
    },
  });

  const relMutation = useMutation({
    mutationFn: async () => {
      return await base44.entities.Sale.update(id, {
        cr_preferred_date: form.cr_preferred_date || null,
        cr_scheduling_type: form.cr_scheduling_type || null,
        cr_week_start: form.cr_week_start || null,
        cr_period: form.cr_period || null,
        cr_weekdays: form.cr_weekdays || [],
        cr_time_range: form.cr_time_range || null,
        cr_shipping_deadline: form.cr_shipping_deadline || null,
        cr_delivery_deadline: form.cr_delivery_deadline || null,
        cr_notes: form.cr_notes || null,
        service_detail_types: form.service_detail_types || [],
        service_detail_notes: form.service_detail_notes || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast({ title: "Detalhamento do serviço atualizado", description: "As informações de detalhamento foram salvas." });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Erro ao salvar relacionamento", description: error?.message || "Falha desconhecida" });
    },
  });

  const handleLinkMaintenance = (equip) => {
    setForm(prev => ({ ...prev, linked_equipment_id: equip.id, linked_equipment_code: equip.patrimony_code || equip.code || "" }));
    toast({ title: "Venda vinculada à manutenção", description: `Troca de refil vinculada ao patrimônio ${equip.patrimony_code || equip.code}. A próxima troca será atualizada ao confirmar a venda.` });
  };

  const client = selectedClient;
  const billingLocation = billingLocations.find(l => l.id === form.billing_location_id);
  const quoteOriginZip = billingLocation?.zip_code || "";
  const quoteDestinationZip = form.delivery_different
    ? (form.delivery_address.zip_code || "")
    : (form.billing_address.zip_code || "");

  const buildClientAddress = (c) => ({
    zip_code: c?.zip_code || "",
    street: c?.street || "",
    number: c?.number || "",
    complement: c?.complement || "",
    neighborhood: c?.neighborhood || "",
    city: c?.city || "",
    state: c?.state || "",
  });

  // Sincroniza endereço do cliente apenas quando o cliente muda por ação do usuário
  // e NÃO quando o endereço já foi carregado do pedido salvo (evita CEP sumir/mudar).
  useEffect(() => {
    if (client) {
      const clientAddr = buildClientAddress(client);
      setForm(prev => ({
        ...prev,
        billing_address: (prev.billing_different || prev.billing_address?.zip_code) ? prev.billing_address : clientAddr,
        delivery_address: (prev.delivery_different || prev.delivery_address?.zip_code) ? prev.delivery_address : clientAddr,
      }));
    }
  }, [client]);

  const toggleBillingDiff = (v) => setForm(p => ({
    ...p,
    billing_different: v,
    billing_address: v ? p.billing_address : buildClientAddress(client),
  }));

  const toggleDeliveryDiff = (v) => setForm(p => ({
    ...p,
    delivery_different: v,
    delivery_address: v ? p.delivery_address : (p.billing_different ? p.billing_address : buildClientAddress(client)),
  }));

  return (
    <div>
      <PageHeader title={isEditing ? "Editar Venda" : "Nova Venda"} description="Pedido Simples">
        <div className="flex gap-2">
          {isEditing && (
            <>
              <SalePdfExport
                sale={{ ...form, seller_name: sellers.find(s => s.id === form.seller_id)?.name || form.seller_name || "" }}
                orderNumber={orderNumber}
                client={selectedClient}
                mode="orcamento"
                billingLocation={billingLocation}
              />
              <SalePdfExport
                sale={{ ...form, seller_name: sellers.find(s => s.id === form.seller_id)?.name || form.seller_name || "" }}
                orderNumber={orderNumber}
                client={selectedClient}
                mode="pedido"
                billingLocation={billingLocation}
              />
            </>
          )}
          {isEditing && form.stage !== "Cancelada" && (!form.cancellation_status || form.cancellation_status === "Não Solicitado") && (
            <Button variant="outline" className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => setCancelTarget({ id, order_number: orderNumber, client_name: form.client_name || selectedClient?.name || "" })}>
              <AlertTriangle className="h-4 w-4" /> Cancelar Pedido
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>
      </PageHeader>

      {client?.vip_client && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-center gap-2 text-sm mb-3">
          <Star className="h-4 w-4 text-amber-500 fill-amber-500 shrink-0" />
          <span className="text-amber-900">
            <strong>Cliente VIP Brazon</strong>
            {vipDiscountPercent > 0 && <> — desconto de <strong>{vipDiscountPercent}%</strong> liberado em elementos filtrantes (refis).</>}
          </span>
        </div>
      )}

      {form.linked_equipment_code && (
        <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 flex items-center gap-2 text-sm">
          <Wrench className="h-4 w-4 text-accent" />
          <span>Troca de refil vinculada ao patrimônio <strong className="text-foreground">{form.linked_equipment_code}</strong> — ao confirmar a venda, a próxima troca será atualizada automaticamente.</span>
        </div>
      )}

      <LinkMaintenanceDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        equipment={clientEquipment}
        clientName={selectedClient?.name}
        onLink={handleLinkMaintenance}
      />

      <CancellationRequestDialog
        sale={cancelTarget}
        open={!!cancelTarget}
        onOpenChange={v => {
          if (!v) setCancelTarget(null);
          if (!v) {
            // recarrega a venda para refletir o novo status de cancelamento
            base44.entities.Sale.get(id).then(sale => {
              setForm(prev => ({ ...prev, stage: sale.stage || prev.stage, cancellation_status: sale.cancellation_status || "Não Solicitado" }));
            }).catch(() => {});
          }
        }}
      />

      {isLocked && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center gap-2 text-sm">
          <Lock className="h-4 w-4 text-primary" />
          <span className="text-foreground">Pedido bloqueado para edição — após a aprovação financeira, o status avança automaticamente pelo fluxo. Acompanhe o andamento na aba <strong>Andamento</strong>.</span>
        </div>
      )}

      <SaleSupervisorPanel
        sale={form}
        saleId={id}
        orderNumber={orderNumber}
        linkedOS={linkedOS}
        onReverted={(fresh) => setForm(prev => ({
          ...prev,
          stage: fresh.stage || "Orçamento",
          status: fresh.status || "Pendente",
          confirmation_type: fresh.confirmation_type || "",
          supervisor_logs: fresh.supervisor_logs || [],
        }))}
      />

      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Pedido</Label>
                <Input value={orderNumber || "Gerado automaticamente"} disabled className="bg-muted font-bold" />
              </div>
              <div>
                <Label>Local de Faturamento</Label>
                <Select value={form.billing_location_id} onValueChange={v => setForm(p => ({ ...p, billing_location_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{billingLocations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Local de Estoque</Label>
                <Select value={form.stock_location_id} onValueChange={v => setForm(p => ({ ...p, stock_location_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{stockLocations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Vendedor {userSellerId && <span className="text-xs text-muted-foreground">(vinculado a você)</span>}</Label>
                <Select
                  value={form.seller_id}
                  onValueChange={v => setForm(p => ({ ...p, seller_id: v }))}
                  disabled={!!userSellerId && user?.role !== "logistica"}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {sellers
                      .filter(s => user?.role !== "logistica" || !userSellerId || s.id === userSellerId || s.name === "Site Brazon")
                      .map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {userSellerId && user?.role === "logistica" && (
                  <p className="text-xs text-muted-foreground mt-1">Para vendas provenientes do Site, selecione o vendedor <strong>Site Brazon</strong>. Demais vendedores não estão disponíveis.</p>
                )}
                {userSellerId && user?.role !== "logistica" && (
                  <p className="text-xs text-muted-foreground mt-1">Vendas são lançadas automaticamente em seu nome.</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
              <div className="md:col-span-2">
                <Label>Cliente *</Label>
                <ClientSearchInput value={form.client_id} onChange={v => setForm(p => ({ ...p, client_id: v }))} onClientSelect={setSelectedClient} />
                {client && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {client.document || "Sem documento"} • {client.city}/{client.state}
                  </p>
                )}
                {client && clientMissingPhone() && (
                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {PHONE_REQUIRED_MESSAGE}
                  </p>
                )}
              </div>
              <div>
                <Label>Modalidade de Venda</Label>
                <Select value={form.delivery_modality} onValueChange={v => setForm(p => ({ ...p, delivery_modality: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Envio">Envio de Mercadoria</SelectItem>
                    <SelectItem value="Entrega Própria">Entrega Própria</SelectItem>
                    <SelectItem value="Entrega + Instalação">Entrega + Instalação</SelectItem>
                  </SelectContent>
                </Select>
                {form.delivery_modality === "Envio" && (
                  <p className="text-xs text-amber-600 mt-1">Pagamento antecipado obrigatório.</p>
                )}
              </div>
              <div>
                <Label>Etapa da Venda</Label>
                <Select value={form.stage} onValueChange={v => {
                  // Regra: do Orçamento só pode ir para Confirmada — as demais etapas
                  // avançam automaticamente pelo fluxo (aprovação financeira, OS, faturamento).
                  if (originalStage === "Orçamento" && v !== "Orçamento" && v !== "Confirmada") {
                    toast({ variant: "destructive", title: "Transição não permitida", description: "Do orçamento, a venda só pode ser enviada para Confirmada. As demais etapas avançam automaticamente pelo fluxo." });
                    return;
                  }
                  if (leavingOrcamento(v) && clientMissingPhone()) {
                    toast({ variant: "destructive", title: "Cliente sem telefone", description: PHONE_REQUIRED_MESSAGE });
                    return;
                  }
                  if (leavingOrcamento(v) && clientMissingDocument()) {
                    toast({ variant: "destructive", title: "Cliente sem CPF/CNPJ", description: "Cadastre o CPF/CNPJ do cliente antes de sair da fase de Orçamento." });
                    return;
                  }
                  if (requirePayment(v)) {
                    const err = validateProgress(v);
                    if (err) { toast({ variant: "destructive", title: "Não é possível avançar", description: err }); return; }
                  }
                  setForm(p => ({ ...p, stage: v }));
                }} disabled={stageLocked}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Orçamento">Orçamento</SelectItem>
                    <SelectItem value="Confirmada">Confirmada</SelectItem>
                    {/* Do Orçamento só pode ir para Confirmada — demais etapas avançam pelo fluxo.
                        Os itens abaixo permanecem visíveis apenas quando a venda já está avançada
                        (dropdown desabilitado por stageLocked), para refletir a etapa atual. */}
                    {originalStage !== "Orçamento" && (
                      <>
                        <SelectItem value="Pagamento Aprovado">Pagamento Aprovado</SelectItem>
                        <SelectItem value="Em OS">Em OS</SelectItem>
                        <SelectItem value="Faturada">Faturada</SelectItem>
                        <SelectItem value="Concluída">Concluída</SelectItem>
                        <SelectItem value="Cancelada">Cancelada</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
                {form.stage === "Confirmada" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.delivery_modality === "Envio"
                      ? "Confirmação Total — Envio de Mercadoria exige pagamento antecipado. Aguarda aprovação financeira (com comprovante anexado) em Confirmações de Venda para liberar a OS."
                      : form.payments.some(p => p.payment_status === "Pendente")
                        ? "Confirmação Parcial — pagamentos pendentes na entrega/instalação. A OS é gerada automaticamente ao salvar (o técnico recebe o pagamento na entrega)."
                        : "Confirmação Total — aguarda aprovação financeira (com comprovante anexado) em Confirmações de Venda para liberar a OS."}
                  </p>
                )}
                {stageLocked && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Etapa controlada automaticamente pelo fluxo.
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <Label>Data</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="md:col-span-2" />
            </div>
          </CardContent>
        </Card>

        <Tabs key={isLocked ? "locked" : "open"} defaultValue={isLocked ? "andamento" : "produtos"}>
          <TabsList>
            <TabsTrigger value="produtos">Produtos</TabsTrigger>
            <TabsTrigger value="servicos">Serviços</TabsTrigger>
            <TabsTrigger value="detalhes">Detalhes do Pedido</TabsTrigger>
            <TabsTrigger value="pagamento">Pagamento</TabsTrigger>
            <TabsTrigger value="relacionamento">Detalhamento do Serviço</TabsTrigger>
            <TabsTrigger value="andamento">Andamento</TabsTrigger>
          </TabsList>

          <fieldset disabled={isLocked && !isLegacyImported} className="border-0 p-0 m-0">
          <TabsContent value="produtos" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 mb-4 relative">
                  <div className="md:col-span-2">
                    <Label className="text-xs">Quantidade</Label>
                    <Input value={productQty} onChange={e => setProductQty(e.target.value)} />
                  </div>
                  <div className="md:col-span-10 relative">
                    <Label className="text-xs">Produto / Código</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Digite o nome ou código do produto..."
                        value={productSearch}
                        onChange={e => { setProductSearch(e.target.value); setShowProductResults(true); }}
                        onFocus={() => setShowProductResults(true)}
                        className="pl-10"
                      />
                    </div>
                    {showProductResults && productSearch && filteredProducts.length === 0 && (
                      <div className="absolute z-50 mt-1 w-full bg-popover border rounded-lg shadow-lg px-3 py-3 text-sm text-muted-foreground">
                        Nenhum produto encontrado para "<span className="text-foreground font-medium">{productSearch}</span>".
                      </div>
                    )}
                    {showProductResults && filteredProducts.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {filteredProducts.map(p => {
                          const blocked = isMaintenanceMissing(p);
                          return (
                          <button key={p.id} type="button" disabled={blocked} onClick={() => addItem(p.id)} className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-0 disabled:opacity-60 disabled:cursor-not-allowed">
                            <span className="font-medium">{p.name}</span>
                            <span className="text-muted-foreground ml-2 text-xs">{p.code} • R$ {(p.sale_price || 0).toFixed(2)}</span>
                            {blocked && <span className="text-amber-600 text-xs ml-2 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Sem parametrização de manutenção</span>}
                          </button>
                          );
                        })}
                      </div>
                    )}
                    {productError && (
                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {productError}</p>
                    )}
                  </div>
                </div>

                {form.items.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead className="w-24">Qtd</TableHead>
                        <TableHead className="w-32">Preço Unit.</TableHead>
                        <TableHead className="w-32 text-right">Total</TableHead>
                        <TableHead className="w-20">Patrim.</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {form.items.map((item, i) => (
                        <React.Fragment key={i}>
                          <TableRow>
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="font-medium">{item.product_name}</TableCell>
                            <TableCell><Input type="number" className="h-8" value={item.quantity} onChange={e => updateItem(i, "quantity", parseFloat(e.target.value) || 0)} /></TableCell>
                            <TableCell><Input type="number" step="0.01" className="h-8" value={item.unit_price} onChange={e => updateItem(i, "unit_price", parseFloat(e.target.value) || 0)} /></TableCell>
                            <TableCell className="text-right font-medium">R$ {(item.total || 0).toFixed(2)}</TableCell>
                            <TableCell><Checkbox checked={item.generate_equipment} onCheckedChange={v => updateItem(i, "generate_equipment", v)} /></TableCell>
                            <TableCell><Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem(i)}><Trash2 className="h-3 w-3 text-destructive" /></Button></TableCell>
                          </TableRow>
                          {isPecasComponentes(item) && (
                            <TableRow className="bg-muted/30">
                              <TableCell colSpan={7} className="py-2">
                                <div className="flex items-center gap-2 pl-4">
                                  <Label className="text-xs whitespace-nowrap text-muted-foreground">Modelo do Purificador</Label>
                                  <Input
                                    className="h-8 max-w-xs"
                                    placeholder="Ex: iPure, Icezon..."
                                    value={item.purifier_model || ""}
                                    onChange={e => updateItem(i, "purifier_model", e.target.value)}
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhum produto adicionado. Busque acima para adicionar.</p>
                )}

                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-6 border-t pt-4">
                  <div><Label className="text-xs">Produtos</Label><Input value={`R$ ${totalItems.toFixed(2)}`} disabled className="bg-muted" /></div>
                  <div><Label className="text-xs">Serviços</Label><Input value={`R$ ${totalServices.toFixed(2)}`} disabled className="bg-muted" /></div>
                  <div><Label className="text-xs">Acréscimos</Label><Input type="number" step="0.01" value={form.additions} onChange={e => setForm(p => ({ ...p, additions: parseFloat(e.target.value) || 0 }))} /></div>
                  <div><Label className="text-xs">Desconto {isAdmin ? <span className="text-primary">(livre — admin)</span> : maxDiscount > 0 && <span className="text-amber-600">(máx R$ {maxDiscount.toFixed(2)})</span>}</Label><Input type="number" step="0.01" value={form.discount} onChange={e => setForm(p => ({ ...p, discount: parseFloat(e.target.value) || 0 }))} /></div>
                  <div>
                    <Label className="text-xs">Frete {form.freight_exempt && <span className="text-accent">(Isentado → Desconto)</span>}</Label>
                    <Input type="number" step="0.01" value={form.freight} disabled={form.freight_exempt} onChange={e => setForm(p => ({ ...p, freight: parseFloat(e.target.value) || 0, freight_exempt: false, freight_exempt_value: 0 }))} />
                    <Button type="button" size="sm" variant={form.freight_exempt ? "secondary" : "ghost"} className="h-7 text-xs mt-1 w-full" onClick={() => setForm(p => {
                      if (p.freight_exempt) {
                        return { ...p, freight_exempt: false, freight: p.freight_exempt_value || 0, freight_exempt_value: 0 };
                      }
                      // Validar regras de isenção de frete (admin libera qualquer isenção)
                      if (!isAdmin && !freightCheck.allowed) {
                        toast({ variant: "destructive", title: "Não é possível isentar o frete", description: freightCheck.reason });
                        return p;
                      }
                      // Isentar frete: zera o frete (sem custo p/ cliente) e guarda o valor original p/ relatório.
                      const val = p.freight || 0;
                      return { ...p, freight_exempt: true, freight_exempt_value: val, freight: 0 };
                    })}>
                      {form.freight_exempt ? "Remover Isenção" : "Isentar Frete"}
                    </Button>
                    {!isAdmin && !freightCheck.allowed && !form.freight_exempt && form.freight > 0 && (
                      <p className="text-[10px] text-destructive mt-1">{freightCheck.reason}</p>
                    )}
                    {freightCheck.allowed && form.freight > 0 && !form.freight_exempt && (
                      <p className="text-[10px] text-emerald-600 mt-1">Margem disponível: R$ {(freightCheck.margin || 0).toFixed(2)}</p>
                    )}
                  </div>
                  <div><Label className="text-xs">Recebido</Label><Input type="number" step="0.01" value={form.received_amount} onChange={e => setForm(p => ({ ...p, received_amount: parseFloat(e.target.value) || 0 }))} /></div>
                  <div><Label className="text-xs">Troco</Label><Input value={`R$ ${Math.max(0, change).toFixed(2)}`} disabled className="bg-muted" /></div>
                  <div><Label className="text-xs">Total Geral</Label><Input value={`R$ ${grandTotal.toFixed(2)}`} disabled className="bg-primary/10 font-bold border-primary" /></div>
                </div>
                {form.freight_exempt && form.freight_exempt_value > 0 && (
                  <div className="mt-3 p-2 rounded-lg bg-accent/10 border border-accent/30 text-xs flex items-center justify-between">
                    <span className="text-foreground">Frete Isentado (concedido como desconto):</span>
                    <span className="font-bold text-foreground">R$ {form.freight_exempt_value.toFixed(2)}</span>
                  </div>
                )}
                {displacementFee > 0 && (
                  <div className="mt-3 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs flex items-center justify-between">
                    <span className="text-amber-800">Taxa de Deslocamento (venda abaixo de R$ 150,00):</span>
                    <span className="font-bold text-amber-800">R$ {displacementFee.toFixed(2)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="servicos" className="mt-4">
            <SalesServicesTab form={form} setForm={setForm} />
          </TabsContent>

          <TabsContent value="detalhes" className="mt-4">
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium">Endereço de Faturamento</h3>
                    <div className="flex items-center gap-2">
                      <Checkbox checked={form.billing_different} onCheckedChange={toggleBillingDiff} id="billing_diff" />
                      <Label htmlFor="billing_diff" className="text-xs cursor-pointer">Usar endereço diferente do cadastro</Label>
                    </div>
                  </div>
                  <AddressFields
                    address={form.billing_address}
                    onChange={addr => setForm(p => ({ ...p, billing_address: addr }))}
                    disabled={!form.billing_different}
                    required={form.billing_different || billingIncomplete}
                  />
                  {billingIncomplete && (
                    <IncompleteAddressAlert
                      label="faturamento"
                      onFix={!form.billing_different ? () => toggleBillingDiff(true) : undefined}
                    />
                  )}
                  {form.billing_different && (
                    <p className="text-xs text-muted-foreground mt-2">Será salvo como endereço adicional no cadastro do cliente.</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium">Endereço de Entrega/Instalação</h3>
                    <div className="flex items-center gap-2">
                      <Checkbox checked={form.delivery_different} onCheckedChange={toggleDeliveryDiff} id="delivery_diff" />
                      <Label htmlFor="delivery_diff" className="text-xs cursor-pointer">Usar endereço diferente do faturamento</Label>
                    </div>
                  </div>
                  {form.delivery_different ? (
                    <>
                      <AddressFields
                        address={form.delivery_address}
                        onChange={addr => setForm(p => ({ ...p, delivery_address: addr, delivery_route_zone_id: "", delivery_route_zone_name: "", delivery_route_calendar_id: "", delivery_route_calendar_name: "" }))}
                        required
                      />
                      {deliveryIncomplete && <IncompleteAddressAlert label="entrega/instalação" />}
                      <DeliveryAddressZoneSection
                        address={form.delivery_address}
                        zoneId={form.delivery_route_zone_id}
                        zoneName={form.delivery_route_zone_name}
                        calendarId={form.delivery_route_calendar_id}
                        calendarName={form.delivery_route_calendar_name}
                        onZoneChange={(zoneData) => setForm(p => ({ ...p, ...zoneData }))}
                      />
                      <p className="text-xs text-muted-foreground mt-2">Será salvo como endereço adicional no cadastro do cliente com a zona parametrizada.</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground py-2">Mesmo endereço de faturamento.</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs">Valor do Frete {form.delivery_modality === "Envio" && <span className="text-destructive">*</span>}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.freight}
                      onChange={e => setForm(p => ({ ...p, freight: parseFloat(e.target.value) || 0 }))}
                      placeholder="R$ 0,00"
                    />
                    {form.delivery_modality !== "Envio" && (
                      <p className="text-xs text-muted-foreground mt-1">Pode ser deixado em zero.</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Previsão de Faturamento</Label>
                    <Input type="date" value={form.billing_forecast} onChange={e => setForm(p => ({ ...p, billing_forecast: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Previsão de Expedição *</Label>
                    <Input type="date" value={form.expedition_forecast_date} onChange={e => setForm(p => ({ ...p, expedition_forecast_date: e.target.value }))} />
                    <p className="text-xs text-muted-foreground mt-1">Data prometida ao cliente para a expedição do pedido.</p>
                  </div>
                </div>

                {form.delivery_modality === "Envio" && (
                  <>
                    <ShippingQuote
                      originZip={quoteOriginZip}
                      destinationZip={quoteDestinationZip}
                      items={form.items}
                      products={products}
                      quoteHistory={form.shipping_quote_history}
                      initialPackingMode={form.packing_mode}
                      initialItemPacking={form.item_packing}
                      initialShippingVolumes={form.shipping_volumes}
                      onQuoteCompleted={() => setForm(p => ({ ...p, quote_completed: true }))}
                      onApplyFreight={(value, quote, meta) => {
                        // Antes de salvar a nova cotação: os volumes cotados devem ser coerentes com os itens atuais do pedido
                        const check = validateVolumesAgainstItems(form.items, meta?.shipping_volumes || [], meta?.packing_mode || "per_item");
                        if (!check.ok) {
                          toast({
                            variant: "destructive",
                            title: "Cotação não salva",
                            description: `Os volumes cotados divergem dos itens atuais do pedido. ${check.reason}`,
                          });
                          return;
                        }
                        return setForm(p => ({
                        ...p,
                        freight: value,
                        freight_exempt: false,
                        freight_exempt_value: 0,
                        selected_service: quote?.service_name || "",
                        selected_carrier: quote?.company_name || "",
                        packing_mode: meta?.packing_mode || p.packing_mode || "per_item",
                        item_packing: meta?.item_packing || p.item_packing || {},
                        shipping_volumes: meta?.shipping_volumes || p.shipping_volumes || [],
                        shipping_quote_history: [
                          ...(p.shipping_quote_history || []),
                          {
                            company_name: String(quote?.company_name ?? ""),
                            service_name: String(quote?.service_name ?? ""),
                            service_id: String(quote?.service_id ?? ""),
                            price: Number(quote?.custom_price) || 0,
                            delivery_time: String(quote?.custom_delivery_time ?? quote?.delivery_time ?? ""),
                            date: new Date().toISOString(),
                            selected: true,
                            volumes_count: (meta?.shipping_volumes || []).length,
                          },
                        ].slice(-10),
                      }));
                      }}
                    />
                    {form.quote_completed && form.selected_service && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Frete selecionado: <span className="font-medium text-foreground">{form.selected_carrier} — {form.selected_service}</span>
                      </p>
                    )}
                    {volumesOutdated && (
                      <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
                        <p className="text-xs font-medium text-amber-700 flex items-start gap-1">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {VOLUMES_OUTDATED_MESSAGE}
                        </p>
                        {volumesCoherence.reason && (
                          <p className="text-xs text-amber-600 mt-1">Motivo: {volumesCoherence.reason}</p>
                        )}
                      </div>
                    )}
                    {!form.quote_completed && (
                      <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> É obrigatório cotar o frete antes de salvar a venda. Após cotar, você pode isentar o frete se desejar.
                      </p>
                    )}
                  </>
                )}

                <div>
                  <Label className="text-xs">Observações</Label>
                  <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pagamento" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-medium">Condições de Pagamento</h3>
                  <Button type="button" size="sm" variant="outline" onClick={addPayment} className="gap-1">
                    <Plus className="h-3 w-3" /> Adicionar Pagamento
                  </Button>
                </div>
                <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-lg border bg-primary/5 p-3 text-sm">
                    <p className="text-xs text-muted-foreground">Faixa de Parcelamento (R$ {saleSubtotal.toFixed(2)})</p>
                    <p className="font-bold text-foreground mt-1">{bracket.label}</p>
                  </div>
                  <div className="rounded-lg border bg-amber-50/40 p-3 text-sm">
                    <p className="text-xs text-muted-foreground">Desconto Máximo Permitido</p>
                    <p className={`font-bold mt-1 ${isAdmin ? "text-primary" : "text-amber-700"}`}>{isAdmin ? "Livre (admin)" : `R$ ${maxDiscount.toFixed(2)}`}</p>
                    {vipDiscountPercent > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Inclui {vipDiscountPercent}% de benefício VIP em elementos filtrantes.</p>
                    )}
                  </div>
                  <div className={`rounded-lg border p-3 text-sm ${cashDiscountCheck.allowed ? "bg-emerald-50/40" : "bg-destructive/5"}`}>
                    <p className="text-xs text-muted-foreground">Desconto à Vista</p>
                    <p className={`font-bold mt-1 ${cashDiscountCheck.allowed ? "text-emerald-700" : "text-destructive"}`}>
                      {cashDiscountCheck.allowed ? "Permitido" : "Não permitido"}
                    </p>
                    {!cashDiscountCheck.allowed && <p className="text-[10px] text-muted-foreground mt-0.5">{cashDiscountCheck.reason}</p>}
                  </div>
                </div>
                {form.payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum pagamento adicionado.</p>
                ) : (
                  <div className="space-y-2">
                    {form.payments.map((pay, i) => (
                      <div key={i} className="bg-muted/30 p-3 rounded-lg">
                        {(() => {
                          const effectiveType = pay.payment_type || (pay.condition_id ? paymentConditions.find(c => c.id === pay.condition_id)?.payment_type : "") || "";
                          return (
                            <>
                              <div className="grid grid-cols-12 gap-2 items-end">
                                <div className="col-span-4">
                                  <Label className="text-xs">Tipo de Pagamento *</Label>
                                  <Select value={effectiveType} onValueChange={v => handlePaymentTypeChange(i, v)}>
                                    <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="À Vista">À Vista</SelectItem>
                                      <SelectItem value="Parcelado">Parcelado</SelectItem>
                                      <SelectItem value="Bonificação">Bonificação</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="col-span-6">
                                  <Label className="text-xs">Valor</Label>
                                  <Input type="number" step="0.01" className="h-9" value={pay.amount} onChange={e => updatePayment(i, "amount", parseFloat(e.target.value) || 0)} />
                                </div>
                                <div className="col-span-2 flex justify-end">
                                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => removePayment(i)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                                </div>
                              </div>
                              <div className="mt-2">
                                <Label className="text-xs">Condição de Pagamento {!effectiveType && <span className="text-muted-foreground">(selecione o tipo primeiro)</span>}</Label>
                                <PaymentConditionCombobox
                                  conditions={effectiveType
                                    ? paymentConditions.filter(c => c.payment_type === effectiveType && (paymentConditionException || isPaymentConditionAllowed(c, saleSubtotal)))
                                    : []}
                                  value={pay.condition_id}
                                  onChange={v => updatePayment(i, "condition_id", v)}
                                  disabled={!effectiveType}
                                  placeholder={effectiveType ? "Buscar condição..." : "Selecione o tipo de pagamento primeiro"}
                                />
                              </div>
                            </>
                          );
                        })()}
                        {(() => {
                          const cond = paymentConditions.find(c => c.id === pay.condition_id);
                          if (!cond || cond.payment_type !== "Parcelado") return null;
                          const feeAmount = (pay.amount || 0) * ((cond.financial_fee || 0) / 100);
                          return (
                            <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-muted-foreground">
                              <span>Tipo: <span className="text-foreground font-medium">{cond.payment_type}</span></span>
                              <span>Parcelas: <span className="text-foreground font-medium">{cond.installments}x</span></span>
                              <span>Taxa Financ. ({(cond.financial_fee || 0).toFixed(2)}%): <span className="text-destructive font-medium">R$ {feeAmount.toFixed(2)}</span></span>
                            </div>
                          );
                        })()}
                        <div className="grid grid-cols-12 gap-2 mt-2 items-end">
                          <div className="col-span-4">
                            <Label className="text-xs">Status do Pagamento</Label>
                            <Select
                              value={pay.payment_status || "Pendente"}
                              onValueChange={v => updatePayment(i, "payment_status", v)}
                              disabled={pay.payment_type === "Bonificação"}
                            >
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Realizada">Realizada</SelectItem>
                                <SelectItem value="Pendente">Pendente</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {pay.payment_status === "Pendente" && form.delivery_modality !== "Envio" && (
                            <div className="col-span-5">
                              <Label className="text-xs">Momento do Pagamento</Label>
                              <Select
                                value={pay.payment_moment || ""}
                                onValueChange={v => updatePayment(i, "payment_moment", v)}
                              >
                                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Na Entrega">Na Entrega</SelectItem>
                                  <SelectItem value="Na Instalação">Na Instalação</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          {form.delivery_modality === "Envio" && (
                            <div className="col-span-8 text-xs text-amber-600 flex items-center pb-2">
                              ⚠ Pagamento deve ser realizado de imediato (Envio).
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            className="hidden"
                            id={`receipt-${i}`}
                            onChange={e => handleReceiptUpload(i, e.target.files?.[0])}
                          />
                          {pay.receipt_url ? (
                            <>
                              <Button type="button" variant="outline" size="sm" className="gap-1 h-7 text-xs" asChild>
                                <a href={pay.receipt_url} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-3 w-3" /> Ver Comprovante
                                </a>
                              </Button>
                              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => document.getElementById(`receipt-${i}`).click()}>
                                <Paperclip className="h-3 w-3" /> Trocar
                              </Button>
                            </>
                          ) : (
                            <Button type="button" variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={() => document.getElementById(`receipt-${i}`).click()}>
                              <Paperclip className="h-3 w-3" /> Anexar Comprovante
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3 mt-6 border-t pt-4">
                  <div><Label className="text-xs">Total Pago</Label><Input value={`R$ ${totalPayments.toFixed(2)}`} disabled className="bg-muted" /></div>
                  <div><Label className="text-xs">Total Geral</Label><Input value={`R$ ${grandTotal.toFixed(2)}`} disabled className="bg-muted" /></div>
                  <div><Label className="text-xs">Restante</Label><Input value={`R$ ${Math.max(0, grandTotal - totalPayments).toFixed(2)}`} disabled className="bg-muted" /></div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          </fieldset>

          <TabsContent value="relacionamento" className="mt-4 space-y-4">
            <CustomerRelationshipTab form={form} setForm={setForm} />
            {isEditing && (
              <div className="flex justify-end pt-2">
                <Button type="button" disabled={relMutation.isPending || serviceDetailMissing} onClick={() => {
                  if (serviceDetailMissing) {
                    toast({ variant: "destructive", title: "Detalhamento do serviço obrigatório", description: "Selecione pelo menos um tipo de serviço e preencha a observação antes de salvar." });
                    return;
                  }
                  relMutation.mutate();
                }}>
                  {relMutation.isPending ? "Salvando..." : "Salvar Detalhamento"}
                </Button>
              </div>
            )}
            <SaleScheduleSection
              client={selectedClient}
              saleId={id}
              orderNumber={orderNumber}
              serviceDetailTypes={form.service_detail_types}
              serviceDetailNotes={form.service_detail_notes}
              items={form.items}
              services={form.services}
              deliveryModality={form.delivery_modality}
              deliveryDifferent={form.delivery_different}
              deliveryAddress={form.delivery_address}
              deliveryZoneId={form.delivery_route_zone_id}
              deliveryZoneName={form.delivery_route_zone_name}
              deliveryCalendarId={form.delivery_route_calendar_id}
              deliveryCalendarName={form.delivery_route_calendar_name}
            />
          </TabsContent>

          <TabsContent value="andamento" className="mt-4 space-y-4">
            {isLocked && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center gap-2 text-sm">
                <Lock className="h-4 w-4 text-primary" />
                <span className="text-foreground">Pedido bloqueado para edição — o status avança automaticamente pelo fluxo de aprovação, produção, faturamento e expedição.</span>
              </div>
            )}
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-medium mb-4">Linha do Tempo do Pedido</h3>
                <SaleWorkflowTimeline sale={form} serviceOrder={linkedOS} />
              </CardContent>
            </Card>
            <SaleLogisticsPanel sale={form} serviceOrder={linkedOS} />
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Voltar</Button>
          {(!isLocked || isLegacyImported) && (
            <Button type="button" disabled={mutation.isPending || !form.client_id || (form.items.length === 0 && (form.services?.length || 0) === 0) || (requirePayment(form.stage) && !!validateProgress()) || (leavingOrcamento(form.stage) && (clientMissingDocument() || clientMissingPhone())) || (!isEditing && form.delivery_modality === "Envio" && !form.quote_completed) || serviceDetailMissing} onClick={() => {
              if (clientMissingPhone()) {
                toast({ variant: "destructive", title: "Cliente sem telefone", description: PHONE_REQUIRED_MESSAGE });
                return;
              }
              if (leavingOrcamento(form.stage) && clientMissingDocument()) {
                toast({ variant: "destructive", title: "Cliente sem CPF/CNPJ", description: "Cadastre o CPF/CNPJ do cliente antes de sair da fase de Orçamento." });
                return;
              }
              if (requirePayment(form.stage)) {
                const err = validateProgress();
                if (err) { toast({ variant: "destructive", title: "Não é possível salvar", description: err }); return; }
              }
              if (serviceDetailMissing) {
                toast({ variant: "destructive", title: "Detalhamento do serviço obrigatório", description: "Selecione pelo menos um tipo de serviço e preencha a observação na aba 'Detalhamento do Serviço' antes de salvar." });
                return;
              }
              if (!isAdmin && form.items.length > 0 && (form.discount || 0) > maxDiscount) {
                toast({ variant: "destructive", title: "Desconto acima do limite", description: maxDiscount === 0
                  ? "Não há margem para desconto — o produto já está no preço da tabela de referência da condição de pagamento selecionada."
                  : `O desconto máximo permitido é R$ ${maxDiscount.toFixed(2)}.` });
                return;
              }
              if (billingIncomplete) {
                toast({ variant: "destructive", title: "Endereço de faturamento incompleto", description: "O endereço está sem Número e/ou Complemento. Atualize o endereço na aba 'Detalhes do Pedido' para salvar a venda." });
                return;
              }
              if (deliveryIncomplete) {
                toast({ variant: "destructive", title: "Endereço de entrega incompleto", description: "O endereço está sem Número e/ou Complemento. Atualize o endereço na aba 'Detalhes do Pedido' para salvar a venda." });
                return;
              }
              mutation.mutate();
            }}>
              {mutation.isPending ? "Processando..." : isEditing ? "Atualizar Venda" : "Salvar Venda"}
            </Button>
          )}
          {form.delivery_modality === "Envio" && !form.quote_completed && !isLocked && (
            <p className="text-xs text-destructive self-center mr-auto">{isEditing ? "Cotação de frete pendente — cotar antes de finalizar." : "Cotação de frete obrigatória para envio."}</p>
          )}
        </div>
      </div>
    </div>
  );
}