import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { FileSpreadsheet, Loader2, ClipboardList } from "lucide-react";
import * as XLSX from "xlsx";

// Relatório do ajuste de vendas parciais recolhidas do Faturamento para análise financeira
export default function ParciaisAjusteReportCard() {
  const { toast } = useToast();

  const osQ = useQuery({
    queryKey: ["parciais-ajuste-os"],
    queryFn: () => base44.entities.ServiceOrder.list("-created_date", 1000),
  });
  const salesQ = useQuery({
    queryKey: ["parciais-ajuste-sales"],
    queryFn: () => base44.entities.Sale.list("-created_date", 1000),
  });
  const clientsQ = useQuery({
    queryKey: ["parciais-ajuste-clients"],
    queryFn: async () => {
      const map = new Map();
      for (const r of await base44.entities.Client.list("-created_date", 5000)) map.set(r.id, r);
      for (const r of await base44.entities.Client.list("created_date", 5000)) map.set(r.id, r);
      return [...map.values()];
    },
  });

  const held = useMemo(() => (osQ.data || []).filter((o) => o.financial_hold_date), [osQ.data]);

  const rows = useMemo(() => {
    const saleMap = new Map((salesQ.data || []).map((s) => [s.id, s]));
    const clientMap = new Map((clientsQ.data || []).map((c) => [c.id, c]));
    return held.map((os) => {
      const sale = os.sale_id ? saleMap.get(os.sale_id) : null;
      const client = (sale?.client_id || os.client_id)
        ? clientMap.get(sale?.client_id || os.client_id)
        : null;
      const pgs = sale?.payments || [];
      const realizadas = pgs.filter((p) => p.payment_status === "Realizada");
      const pendentes = pgs.filter((p) => p.payment_status === "Pendente");
      return {
        "Número do Pedido": sale?.order_number || os.sale_order_number || "",
        "Número da OS": os.code || "",
        "Cliente": os.client_name || "",
        "CPF/CNPJ": client?.document || "",
        "Data do Pedido": sale?.date ? new Date(sale.date).toLocaleDateString("pt-BR") : "",
        "Valor Total da Venda (R$)": sale?.grand_total ?? 0,
        "Tipo da Venda": sale?.confirmation_type || "Parcial",
        "Etapa Atual da Venda": sale?.stage || "",
        "Forma de Pagamento": pgs.map((p) => p.condition_name).filter(Boolean).join(" + ") || "",
        "Valor Já Pago (R$)": realizadas.reduce((s, p) => s + (p.amount || 0), 0),
        "Valor Pendente (R$)": pendentes.reduce((s, p) => s + (p.amount || 0), 0),
        "Status dos Pagamentos": `${realizadas.length} Realizada / ${pendentes.length} Pendente`,
        "Comprovante Anexado": realizadas.length > 0
          ? `Sim (${realizadas.filter((p) => p.receipt_url).length}/${realizadas.length})`
          : "Não",
        "Status Anterior da OS": os.financial_hold_previous_status || "",
        "Status Anterior no Faturamento": "Pendente de Faturamento",
        "Novo Status após Correção": os.status || "",
        "Data da Correção": os.financial_hold_date ? new Date(os.financial_hold_date).toLocaleString("pt-BR") : "",
      };
    });
  }, [held, salesQ.data, clientsQ.data]);

  const handleExport = () => {
    if (!rows.length) {
      toast({ title: "Nenhum registro para exportar", variant: "destructive" });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ajuste Vendas Parciais");
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Ajuste_Vendas_Parciais_${today}.xlsx`);
    toast({ title: `Excel exportado (${rows.length} pedidos)` });
  };

  if (!held.length && !osQ.isLoading) return null;

  return (
    <Card className="mb-6 border-amber-200 bg-amber-50/50">
      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <ClipboardList className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">
              Ajuste de Vendas Parciais — {held.length} pedido(s) recolhido(s) do Faturamento
            </p>
            <p className="text-xs text-muted-foreground">
              Vendas parciais retornadas para a etapa Orçamento para revisão do financeiro. A OS fica retida em
              "Aprovação Financeira" e só retorna ao fluxo operacional após a aprovação em Confirmações de Venda.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={handleExport} disabled={!rows.length} className="gap-2 whitespace-nowrap">
          {osQ.isLoading || salesQ.isLoading || clientsQ.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" />
          )}
          Baixar Excel
        </Button>
      </CardContent>
    </Card>
  );
}