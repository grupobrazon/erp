import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, CheckCircle, Wallet, ExternalLink, ArrowDownCircle, Receipt } from "lucide-react";
import ReconcilePaymentDialog from "@/components/receivables/ReconcilePaymentDialog";
import FiscalReportsTab from "@/components/financeiro/FiscalReportsTab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { computeAccountingSplit, accountName } from "@/lib/receivableSplit";

export default function Receivables() {
  const [area, setArea] = useState("contas");
  const [subtab, setSubtab] = useState("cobranca");
  const [search, setSearch] = useState("");
  const [reconcileTarget, setReconcileTarget] = useState(null);
  const queryClient = useQueryClient();

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: () => base44.entities.Sale.list("-created_date", 500),
  });

  const { data: chartAccounts = [] } = useQuery({
    queryKey: ["chartOfAccounts"],
    queryFn: () => base44.entities.ChartOfAccount.list("-code", 500),
  });

  const allPaymentRows = [];
  for (const s of sales) {
    for (let i = 0; i < (s.payments || []).length; i++) {
      allPaymentRows.push({ sale: s, payment: s.payments[i], index: i });
    }
  }
  const pendingPayments = allPaymentRows.filter(r => r.payment.payment_status === "Pendente");
  const receivedPayments = allPaymentRows.filter(r => r.payment.payment_status === "Realizada");

  const totalToReceive = pendingPayments.reduce((sum, r) => sum + (r.payment.amount || 0), 0);
  const totalReceived = receivedPayments.reduce((sum, r) => sum + (r.payment.amount || 0), 0);

  const list = subtab === "cobranca" ? pendingPayments : receivedPayments;
  const filtered = list.filter(r =>
    !search || r.sale.client_name?.toLowerCase().includes(search.toLowerCase()) || r.sale.order_number?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader title="Contas a Receber" description="Receitas em 5103 (Produto Vendido) e frete em 8102 — lançamento separado por venda" />

      <div className="mb-6">
        <Tabs value={area} onValueChange={setArea}>
          <TabsList>
            <TabsTrigger value="contas">Contas a Receber</TabsTrigger>
            <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {area === "fiscal" ? (
        <FiscalReportsTab />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="h-4 w-4 text-blue-600" />
                <span className="text-xs text-muted-foreground uppercase">A Receber (Cobrança)</span>
              </div>
              <p className="text-2xl font-bold">R$ {totalToReceive.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{pendingPayments.length} pagamento(s) pendente(s)</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                <span className="text-xs text-muted-foreground uppercase">Recebido (Conciliado)</span>
              </div>
              <p className="text-2xl font-bold">R$ {totalReceived.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{receivedPayments.length} pagamento(s) conciliado(s)</p>
            </Card>
          </div>

          <div className="mb-4 flex items-center gap-4 flex-wrap">
            <Tabs value={subtab} onValueChange={setSubtab}>
              <TabsList>
                <TabsTrigger value="cobranca">Cobrança ({pendingPayments.length})</TabsTrigger>
                <TabsTrigger value="recebido">Recebido ({receivedPayments.length})</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por cliente ou pedido..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Nada por aqui"
              description={subtab === "cobranca" ? "Nenhum pagamento em cobrança." : "Nenhum pagamento conciliado ainda."}
            />
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Condição</TableHead>
                    <TableHead>Momento</TableHead>
                    <TableHead>Comprovante</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => (
                    <TableRow key={r.sale.id + "-" + r.index}>
                      <TableCell className="font-mono text-xs font-semibold">{r.sale.order_number}</TableCell>
                      <TableCell className="font-medium">{r.sale.client_name}</TableCell>
                      <TableCell className="text-right">
                        <p className="font-medium">R$ {(r.payment.amount || 0).toFixed(2)}</p>
                        <div className="mt-1 space-y-0.5">
                          {computeAccountingSplit(r.sale, r.payment).map((line) => (
                            <p key={line.code} title={accountName(line.code, chartAccounts)} className={`text-[10px] ${line.kind === "frete" ? "text-blue-600" : "text-emerald-600"}`}>
                              {line.code} · {line.kind === "frete" ? "Frete" : "Receita"} — R$ {line.amount.toFixed(2)}
                            </p>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{r.payment.condition_name}</TableCell>
                      <TableCell>
                        {r.payment.payment_moment ? (
                          <Badge variant="outline" className="text-[10px]">{r.payment.payment_moment}</Badge>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell>
                        {r.payment.receipt_url ? (
                          <a href={r.payment.receipt_url} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1 text-xs">
                            <ExternalLink className="h-3 w-3" /> Ver
                          </a>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.payment.payment_status === "Pendente" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReconcileTarget({ sale: r.sale, paymentIndex: r.index })}
                            className="gap-1"
                          >
                            <ArrowDownCircle className="h-3 w-3" /> Conciliar
                          </Button>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 border-transparent">Conciliado</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      <ReconcilePaymentDialog
        sale={reconcileTarget?.sale}
        paymentIndex={reconcileTarget?.paymentIndex}
        open={!!reconcileTarget}
        onOpenChange={(v) => !v && setReconcileTarget(null)}
        onReconciled={() => queryClient.invalidateQueries({ queryKey: ["sales"] })}
      />
    </div>
  );
}