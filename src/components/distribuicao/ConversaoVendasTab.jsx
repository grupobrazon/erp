import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, FileText, Wrench } from "lucide-react";
import { buildConversionMap, SALE_STATUS } from "@/lib/distributionConversion";

export default function ConversaoVendasTab({ clients, batches, sellers, batchFilter, sellerFilter }) {
  const [expandedBatch, setExpandedBatch] = useState(null);

  const salesQ = useQuery({
    queryKey: ["conversaoVendasSales"],
    queryFn: async () => {
      const map = new Map();
      for (const r of await base44.entities.Sale.list("-created_date", 5000)) map.set(r.id, r);
      for (const r of await base44.entities.Sale.list("created_date", 5000)) map.set(r.id, r);
      return [...map.values()];
    },
  });

  const sales = salesQ.data || [];

  const sellerMap = useMemo(() => new Map(sellers.map((s) => [s.id, s.name])), [sellers]);
  const batchMap = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);

  // Clientes distribuídos (com seller_id e batch) — escopo já filtrado pela página.
  const distributed = useMemo(() => clients.filter((c) => c.seller_id && c.distribution_batch_id), [clients]);

  // Venda válida = lançada para o cliente a partir da data da distribuição (canceladas são ignoradas).
  const conversionByClient = useMemo(
    () => buildConversionMap(distributed, sales, batchMap),
    [distributed, sales, batchMap]
  );

  // Agrupamento por lote -> vendedora -> indicadores.
  const rowsByBatch = useMemo(() => {
    const byBatch = new Map();
    for (const c of distributed) {
      const bid = c.distribution_batch_id;
      if (!byBatch.has(bid)) byBatch.set(bid, new Map());
      const bySeller = byBatch.get(bid);
      const sid = c.seller_id;
      if (!bySeller.has(sid)) {
        bySeller.set(sid, { total: 0, orcamento: 0, convertido: 0, semVenda: 0 });
      }
      const acc = bySeller.get(sid);
      acc.total += 1;
      const entry = conversionByClient.get(c.id);
      if (!entry) acc.semVenda += 1;
      else if (entry.status === SALE_STATUS.converted) acc.convertido += 1;
      else acc.orcamento += 1;
    }
    return byBatch;
  }, [distributed, conversionByClient]);

  // Resumo por lote (soma das vendedoras).
  const batchSummary = useMemo(() => {
    const out = [];
    for (const [bid, bySeller] of rowsByBatch) {
      const batch = batchMap.get(bid);
      let total = 0, orcamento = 0, convertido = 0, semVenda = 0;
      const sellerRows = [];
      for (const [sid, acc] of bySeller) {
        total += acc.total;
        orcamento += acc.orcamento;
        convertido += acc.convertido;
        semVenda += acc.semVenda;
        sellerRows.push({
          sellerId: sid,
          sellerName: sellerMap.get(sid) || "—",
          ...acc,
          conversao: acc.total ? (acc.convertido / acc.total) * 100 : 0,
        });
      }
      out.push({
        batchId: bid,
        protocol: batch?.protocol || "—",
        date: batch?.date,
        sellerNames: batch?.seller_names || [],
        total,
        orcamento,
        convertido,
        semVenda,
        conversao: total ? (convertido / total) * 100 : 0,
        sellers: sellerRows.sort((a, b) => b.conversao - a.conversao),
      });
    }
    return out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [rowsByBatch, batchMap, sellerMap]);

  // Total geral (respeitando filtros de vendedora/lote da página).
  const grandTotal = useMemo(() => {
    let total = 0, orcamento = 0, convertido = 0, semVenda = 0;
    for (const c of distributed) {
      total += 1;
      const entry = conversionByClient.get(c.id);
      if (!entry) semVenda += 1;
      else if (entry.status === SALE_STATUS.converted) convertido += 1;
      else orcamento += 1;
    }
    return { total, orcamento, convertido, semVenda, conversao: total ? (convertido / total) * 100 : 0 };
  }, [distributed, conversionByClient]);

  if (salesQ.isLoading) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const fmtPct = (v) => `${v.toFixed(1)}%`;
  const fmtDate = (d) => (d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—");

  return (
    <div className="space-y-4">
      {/* Indicadores gerais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Clientes distribuídos</div>
            <div className="text-2xl font-bold mt-1">{grandTotal.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Em Orçamento</div>
            <div className="text-2xl font-bold mt-1 text-amber-600">{grandTotal.orcamento}</div>
            <div className="text-[11px] text-muted-foreground">{fmtPct(grandTotal.total ? (grandTotal.orcamento / grandTotal.total) * 100 : 0)} do total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Wrench className="h-3.5 w-3.5" /> Em OS (convertidos)</div>
            <div className="text-2xl font-bold mt-1 text-emerald-600">{grandTotal.convertido}</div>
            <div className="text-[11px] text-muted-foreground">{fmtPct(grandTotal.total ? (grandTotal.convertido / grandTotal.total) * 100 : 0)} do total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> % Conversão geral</div>
            <div className="text-2xl font-bold mt-1 text-primary">{fmtPct(grandTotal.conversao)}</div>
            <div className="text-[11px] text-muted-foreground">{grandTotal.semVenda} sem venda lançada</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela por lote */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Lote</TableHead>
                <TableHead className="text-center">Data</TableHead>
                <TableHead>Vendedora(s)</TableHead>
                <TableHead className="text-center">Distribuídos</TableHead>
                <TableHead className="text-center">Em Orçamento</TableHead>
                <TableHead className="text-center">Em OS</TableHead>
                <TableHead className="text-center">Sem venda</TableHead>
                <TableHead className="text-center">% Conversão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batchSummary.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground text-sm py-8">
                    Nenhum cliente distribuído no filtro selecionado.
                  </TableCell>
                </TableRow>
              )}
              {batchSummary.map((b) => {
                const isOpen = expandedBatch === b.batchId;
                return (
                  <React.Fragment key={b.batchId}>
                    <TableRow
                      className={batchFilter === "all" ? "cursor-pointer hover:bg-muted/50" : ""}
                      onClick={() => batchFilter === "all" && setExpandedBatch(isOpen ? null : b.batchId)}
                    >
                      <TableCell className="text-center">
                        {batchFilter === "all" && (
                          isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono font-semibold text-sm">{b.protocol}</TableCell>
                      <TableCell className="text-center text-xs">{fmtDate(b.date)}</TableCell>
                      <TableCell className="text-xs">{(b.sellerNames || []).join(", ") || "—"}</TableCell>
                      <TableCell className="text-center font-medium">{b.total}</TableCell>
                      <TableCell className="text-center text-amber-600">{b.orcamento}</TableCell>
                      <TableCell className="text-center text-emerald-600 font-medium">{b.convertido}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{b.semVenda}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={
                          b.conversao >= 50 ? "bg-emerald-100 text-emerald-700"
                          : b.conversao >= 25 ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                        }>
                          {fmtPct(b.conversao)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                    {isOpen && b.sellers.map((s) => (
                      <TableRow key={`${b.batchId}-${s.sellerId}`} className="bg-muted/30">
                        <TableCell />
                        <TableCell className="pl-8 text-xs text-muted-foreground">↳ vendedora</TableCell>
                        <TableCell />
                        <TableCell className="text-sm font-medium">{s.sellerName}</TableCell>
                        <TableCell className="text-center text-sm">{s.total}</TableCell>
                        <TableCell className="text-center text-sm text-amber-600">{s.orcamento}</TableCell>
                        <TableCell className="text-center text-sm text-emerald-600 font-medium">{s.convertido}</TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">{s.semVenda}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{fmtPct(s.conversao)}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        <strong>Em Orçamento</strong>: clientes com venda lançada ainda na fase de orçamento (não convertida).{" "}
        <strong>Em OS</strong>: clientes com venda convertida (Confirmada, Pagamento Aprovado, Em OS, Faturada ou Concluída).{" "}
        <strong>% Conversão</strong> = Em OS ÷ Distribuídos. Conta apenas venda lançada a partir da data da distribuição do cliente — vendas canceladas e vendas anteriores à distribuição são ignoradas. A coluna <strong>Status da Venda</strong> do Excel traz essa informação por cliente.
      </p>
    </div>
  );
}