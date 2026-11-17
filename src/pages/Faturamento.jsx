import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { FileText, Search, CheckCircle2, ExternalLink } from "lucide-react";
import { usePermissions } from "@/lib/permissions";

const statusColors = {
  "Aprovação Comercial": "bg-amber-100 text-amber-700",
  "Aprovação Financeira": "bg-blue-100 text-blue-700",
  "Produção/Expedição": "bg-orange-100 text-orange-700",
  "Em Produção": "bg-amber-100 text-amber-700",
  "Produção Liberada": "bg-teal-100 text-teal-700",
  "Etiqueta Gerada": "bg-indigo-100 text-indigo-700",
  "Separação": "bg-violet-100 text-violet-700",
  "Saída do Estoque": "bg-cyan-100 text-cyan-700",
  "Em Transporte": "bg-sky-100 text-sky-700",
  "Em Andamento": "bg-purple-100 text-purple-700",
  "OK - Aprov. Financeira": "bg-blue-100 text-blue-700",
  "Aguardando Faturamento Final": "bg-violet-100 text-violet-700",
  "Concluída": "bg-emerald-100 text-emerald-700",
  "Entregue": "bg-emerald-100 text-emerald-700",
  "Cancelada": "bg-red-100 text-red-700",
};

const PAGE_SIZE = 50;

export default function Faturamento() {
  const navigate = useNavigate();
  const { canBill } = usePermissions();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("pendentes");
  const [dateFromInput, setDateFromInput] = useState("");
  const [dateToInput, setDateToInput] = useState("");
  const [applied, setApplied] = useState({ dateFrom: "", dateTo: "" });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [receiptFilter, setReceiptFilter] = useState("all");

  const applyFilters = () => {
    setApplied({ dateFrom: dateFromInput, dateTo: dateToInput });
  };
  const clearFilters = () => {
    setDateFromInput("");
    setDateToInput("");
    setApplied({ dateFrom: "", dateTo: "" });
  };
  const hasActiveFilter = Boolean(applied.dateFrom || applied.dateTo);

  // Janela crescente: re-busca até trazer TODOS os registros (sem limite fixo que esconda OS/vendas antigas)
  const fetchAll = async (entity) => {
    let limit = 500;
    let result = [];
    while (limit <= 50000) {
      const batch = await base44.entities[entity].list("-created_date", limit);
      result = batch;
      if (batch.length < limit) break; // todos os registros foram carregados
      limit *= 2; // expande a janela e refaz a busca
    }
    return result;
  };

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["serviceOrders", "faturamento"],
    queryFn: () => fetchAll("ServiceOrder"),
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["sales", "faturamento"],
    queryFn: () => fetchAll("Sale"),
  });

  const { data: remessas = [] } = useQuery({
    queryKey: ["remessas"],
    queryFn: () => base44.entities.Remessa.list("-created_date", 200),
  });

  const saleMap = useMemo(() => {
    const m = {};
    sales.forEach((s) => { m[s.id] = s; });
    return m;
  }, [sales]);

  // OSs de tipo técnico (Entrega/Instalação/Manutenção) só aparecem no faturamento
  // após o pós-venda concluir e enviar para faturamento (status === "Faturada") ou se já faturadas.
  // OSs de Expedição (envio sem visita) aparecem normalmente.
  const TECHNICIAN_TYPES = ["Entrega", "Entrega + Instalação", "Manutenção"];
  const expeditionOrders = orders.filter((o) => {
    if (o.status === "Cancelada" || o.status === "Aprovação Comercial" || o.status === "Aprovação Financeira" || o.status === "OK - Aprov. Financeira") return false;
    // Venda devolvida para confirmação (stage Confirmada) ainda precisa passar pelo financeiro
    const saleStage = saleMap[o.sale_id]?.stage;
    if (!o.invoiced && saleStage === "Confirmada") return false;
    if (o.invoiced) return true; // já faturada → sempre mostra
    if (TECHNICIAN_TYPES.includes(o.type)) {
      // OS de rota aparece no faturamento após o pós-venda concluir (Aguardando Faturamento Final)
      // ou se já foi faturada (invoiced = true)
      return o.status === "Aguardando Faturamento Final" || o.invoiced;
    }
    return true; // Expedição e outros → mostra normalmente
  });

  const matchesDateFilter = (dateValue) => {
    if (!applied.dateFrom && !applied.dateTo) return true;
    if (!dateValue) return false;
    if (applied.dateFrom && dateValue < applied.dateFrom) return false;
    if (applied.dateTo && dateValue > applied.dateTo) return false;
    return true;
  };

  // Comprovante de pagamento anexado na venda (filtro visual de conferência — não altera dados)
  const hasReceipt = (o) => (saleMap[o.sale_id]?.payments || []).some((p) => p.receipt_url);

  // Valor do pedido divergente do valor cobrado pelo técnico na OS
  const valueMismatch = (o) => {
    const sale = saleMap[o.sale_id];
    const tech = Number(o.received_amount) || 0;
    return Boolean(sale && tech > 0 && Math.abs((Number(sale.grand_total) || 0) - tech) > 0.009);
  };

  const filtered = expeditionOrders.filter((o) => {
    if (tab === "pendentes" && o.invoiced) return false;
    if (tab === "faturadas" && !o.invoiced) return false;
    if (tab === "pendentes" && receiptFilter === "with" && !hasReceipt(o)) return false;
    if (tab === "pendentes" && receiptFilter === "without" && hasReceipt(o)) return false;
    if (!matchesDateFilter(saleMap[o.sale_id]?.date)) return false;
    if (!search) return true;
    return (
      o.code?.toLowerCase().includes(search.toLowerCase()) ||
      o.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      o.sale_order_number?.toLowerCase().includes(search.toLowerCase()) ||
      o.nota_simples_number?.toLowerCase().includes(search.toLowerCase())
    );
  });

  const remessaFiltered = remessas.filter((r) => {
    if (r.status === "Cancelada" || r.status === "Rascunho") return false;
    if (!matchesDateFilter(r.date)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return r.code?.toLowerCase().includes(q) || r.client_name?.toLowerCase().includes(q) || r.remessa_type?.toLowerCase().includes(q);
  });
  // Busca e filtros sempre sobre TODOS os registros; a exibição é progressiva (carregar mais)
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, tab, applied, receiptFilter]);

  const remessaPendCount = remessas.filter((r) => r.status === "Aprovada").length;

  const pendingCount = expeditionOrders.filter((o) => !o.invoiced).length;
  const invoicedCount = expeditionOrders.filter((o) => o.invoiced).length;
  const fmtMoney = (v) => `R$ ${(v || 0).toFixed(2)}`;

  return (
    <div>
      <PageHeader
        title="Faturamento"
        description="Gestão de notas fiscais e notas simples das ordens de serviço"
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Pendentes de Faturamento</p>
            <p className="text-2xl font-bold font-heading text-amber-600">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Faturadas</p>
            <p className="text-2xl font-bold font-heading text-emerald-600">{invoicedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Total Faturado</p>
            <p className="text-2xl font-bold font-heading">
              {fmtMoney(
                expeditionOrders
                  .filter((o) => o.invoiced)
                  .reduce((sum, o) => sum + (saleMap[o.sale_id]?.grand_total || 0), 0)
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          <Button size="sm" variant={tab === "pendentes" ? "default" : "outline"} onClick={() => setTab("pendentes")}>
            Pendentes ({pendingCount})
          </Button>
          <Button size="sm" variant={tab === "faturadas" ? "default" : "outline"} onClick={() => setTab("faturadas")}>
            Faturadas ({invoicedCount})
          </Button>
          <Button size="sm" variant={tab === "remessas" ? "default" : "outline"} onClick={() => setTab("remessas")}>
            Remessas ({remessaPendCount})
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por OS, cliente, pedido, nota..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 w-60"
          />
        </div>
        {tab === "pendentes" && (
          <Select value={receiptFilter} onValueChange={setReceiptFilter}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Comprovante de pagamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Comprovante: Todos</SelectItem>
              <SelectItem value="with">Com comprovante</SelectItem>
              <SelectItem value="without">Sem comprovante</SelectItem>
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Data do pedido:</span>
          <Input
            type="date"
            value={dateFromInput}
            onChange={(e) => setDateFromInput(e.target.value)}
            className="w-40"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <Input
            type="date"
            value={dateToInput}
            onChange={(e) => setDateToInput(e.target.value)}
            className="w-40"
          />
          <Button size="sm" onClick={applyFilters} className="gap-1">
            <Search className="h-4 w-4" /> Filtrar
          </Button>
          {hasActiveFilter && (
            <Button size="sm" variant="ghost" onClick={clearFilters} className="text-xs">
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {tab === "remessas" ? (
        remessaFiltered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nenhuma remessa encontrada"
            description={hasActiveFilter
              ? "Não existem resultados para os critérios de filtro selecionados. Tente ajustar ou limpar os filtros."
              : "Não há remessas aprovadas para faturar."}
          />
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Código</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>NF-e</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {remessaFiltered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs font-semibold">{r.code || "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{r.remessa_type}</Badge></TableCell>
                    <TableCell className="font-medium text-sm">{r.client_name}</TableCell>
                    <TableCell className="text-sm font-medium">{fmtMoney(r.grand_total)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={r.status === "Faturada" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.nfe_cancelled ? (
                        <Badge variant="outline" className="bg-red-50 text-red-700 text-xs">Cancelada</Badge>
                      ) : r.nfe_transmitted ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 text-xs gap-1">
                          <CheckCircle2 className="h-3 w-3" /> {r.invoice_number || "Autorizada"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 text-xs">Pendente</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={r.nfe_transmitted || r.nfe_cancelled || !canBill ? "ghost" : "default"}
                        className="gap-1"
                        onClick={() => navigate(`/faturamento/remessa/${r.id}`)}
                      >
                        <FileText className="h-3 w-3" /> {r.nfe_transmitted || r.nfe_cancelled || !canBill ? "Ver" : "Faturar"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhuma OS encontrada"
          description={hasActiveFilter
            ? "Não existem resultados para os critérios de filtro selecionados. Tente ajustar ou limpar os filtros."
            : "Não há ordens de expedição para faturar nesta categoria."}
        />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>OS</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Status OS</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Faturamento</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, visibleCount).map((o) => {
                const sale = saleMap[o.sale_id];
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs font-semibold">{o.code}</TableCell>
                    <TableCell className="font-mono text-xs">{o.sale_order_number || "—"}</TableCell>
                    <TableCell className="font-medium text-sm">{o.client_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={statusColors[o.status] || ""}>
                        {o.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      <span className={valueMismatch(o) ? "text-red-600 font-semibold" : ""}>
                        {sale ? fmtMoney(sale.grand_total) : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {o.invoiced ? (
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 text-xs gap-1 w-fit">
                            <CheckCircle2 className="h-3 w-3" /> {o.invoice_type}
                          </Badge>
                          {o.nota_simples_number && (
                            <span className="text-xs font-mono text-muted-foreground">
                              NS: {o.nota_simples_number}
                            </span>
                          )}
                          {o.invoice_type === "Nota Fiscal" && o.invoice_number && (
                            <span className="text-xs font-mono text-muted-foreground">
                              NF-e: {o.invoice_number}
                            </span>
                          )}
                          {sale?.services?.length > 0 && (
                            <span className={`text-xs font-mono ${o.nfse_cancelada ? "text-red-600" : o.nfse_transmitted ? "text-emerald-600" : "text-amber-600"}`}>
                              NFS-e: {o.nfse_cancelada ? "Cancelada" : o.nfse_transmitted ? (o.nfse_numero || "Autorizada") : "Pendente"}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 text-xs">
                          Pendente
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={o.invoiced || !canBill ? "ghost" : "default"}
                        className="gap-1"
                        onClick={() => navigate(`/faturamento/os/${o.id}`)}
                      >
                        {o.invoiced || !canBill ? (
                          <>
                            <ExternalLink className="h-3 w-3" /> Ver
                          </>
                        ) : (
                          <>
                            <FileText className="h-3 w-3" /> Faturar
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {visibleCount < filtered.length && (
            <div className="flex items-center justify-center gap-3 py-4">
              <span className="text-xs text-muted-foreground">
                Exibindo {visibleCount} de {filtered.length} registros
              </span>
              <Button size="sm" variant="outline" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                Carregar mais
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}