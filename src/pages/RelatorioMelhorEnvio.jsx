import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, PackageCheck, AlertTriangle, CheckCircle2, XCircle, Truck, Filter, Tag, ClipboardList, FileCheck, Package, FileSpreadsheet, Pencil } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import MultiSelectFilter from "@/components/ui/MultiSelectFilter";
import UpdateOsFromMeDialog from "@/components/melhorenvio/UpdateOsFromMeDialog";
import * as XLSX from "xlsx";

const STATUS_STYLES = {
  "posted": { label: "Postado", variant: "default" },
  "released": { label: "Liberado", variant: "secondary" },
  "delivered": { label: "Entregue", variant: "default" },
  "pending": { label: "Pendente", variant: "secondary" },
  "canceled": { label: "Cancelado", variant: "destructive" },
  "not_delivered": { label: "Não Entregue", variant: "destructive" },
};

function normDoc(d) { return (d || "").replace(/\D/g, ""); }
function normName(n) {
  if (!n) return "";
  return String(n).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export default function RelatorioMelhorEnvio() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState("all"); // all | outside_system
  const [stageFilter, setStageFilter] = useState([]);
  const [statusFilter, setStatusFilter] = useState([]);
  const [osStatusFilter, setOsStatusFilter] = useState([]);
  const [labelFilter, setLabelFilter] = useState([]);
  const [meStatusFilter, setMeStatusFilter] = useState([]);
  const [updateOsRow, setUpdateOsRow] = useState(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["meReport"],
    queryFn: async () => {
      const res = await base44.functions.invoke("checkMelhorEnvioReport", {});
      const d = res.data || res;
      if (d.error) throw new Error(d.error);
      return d;
    },
    enabled: false,
    retry: false,
  });

  const generate = () => {
    refetch();
  };

  const stageOptions = useMemo(() => {
    if (!data?.rows) return [];
    const set = new Set(data.rows.map(r => r.sale_stage).filter(Boolean));
    return [...set].map(v => ({ value: v, label: v }));
  }, [data]);

  const statusOptions = useMemo(() => {
    if (!data?.rows) return [];
    const set = new Set(data.rows.map(r => r.sale_status).filter(Boolean));
    return [...set].map(v => ({ value: v, label: v }));
  }, [data]);

  const osStatusOptions = useMemo(() => {
    if (!data?.rows) return [];
    const set = new Set(data.rows.map(r => r.os_status).filter(Boolean));
    return [...set].map(v => ({ value: v, label: v }));
  }, [data]);

  const labelOptions = [
    { value: "sim", label: "Sim" },
    { value: "nao", label: "Não" },
  ];

  const meStatusOptions = useMemo(() => {
    if (!data?.rows) return [];
    const set = new Set();
    data.rows.forEach(r => (r.me_matches || []).forEach(m => m.status && set.add(m.status)));
    return [...set].map(v => ({ value: v, label: STATUS_STYLES[v]?.label || v }));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.rows) return [];
    let list = data.rows;
    if (filterMode === "outside_system") {
      list = list.filter(r => r.me_match_count > 0 && !r.has_system_label);
    }
    if (stageFilter.length > 0) {
      list = list.filter(r => stageFilter.includes(r.sale_stage));
    }
    if (statusFilter.length > 0) {
      list = list.filter(r => statusFilter.includes(r.sale_status));
    }
    if (osStatusFilter.length > 0) {
      list = list.filter(r => r.os_status && osStatusFilter.includes(r.os_status));
    }
    if (labelFilter.length > 0) {
      list = list.filter(r => {
        const val = r.has_system_label ? "sim" : "nao";
        return labelFilter.includes(val);
      });
    }
    if (meStatusFilter.length > 0) {
      list = list.filter(r => (r.me_matches || []).some(m => meStatusFilter.includes(m.status)));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const qDoc = normDoc(search);
      const qName = normName(search);
      list = list.filter(r => {
        if (qDoc && (r.client_doc?.includes(qDoc) || r.delivery_zip?.includes(qDoc))) return true;
        if (qName && normName(r.client_name).includes(qName)) return true;
        if (r.client_name?.toLowerCase().includes(q)) return true;
        if (r.order_number?.toLowerCase().includes(q)) return true;
        if (r.os_code?.toLowerCase().includes(q)) return true;
        return false;
      });
    }
    return list;
  }, [data, search, filterMode, stageFilter, statusFilter, osStatusFilter, labelFilter, meStatusFilter]);

  const exportExcel = () => {
    if (!filtered.length) return;
    const rows = filtered.map(r => {
      const me = r.me_matches?.[0];
      return {
        "Pedido": r.order_number || "",
        "Cliente": r.client_name || "",
        "CPF/CNPJ": r.client_doc || "",
        "CEP Entrega": r.delivery_zip || "",
        "Estágio Venda": r.sale_stage || "",
        "Status Venda": r.sale_status || "",
        "Data Venda": r.sale_date || "",
        "Venda Balcão": r.is_counter_sale ? "Sim" : "Não",
        "Código OS": r.os_code || "",
        "Status OS": r.os_status || "",
        "Qtd. OS": r.os_count || 0,
        "Etiqueta no Sistema": r.has_system_label ? "Sim" : "Não",
        "Envio no ME": r.me_match_count > 0 ? "Sim" : "Não",
        "Qtd. Envios ME": r.me_match_count || 0,
        "Status ME": me ? (STATUS_STYLES[me.status]?.label || me.status) : "",
        "Tipo Match": me?.match_type || "",
        "Transportadora": me?.carrier || "",
        "Rastreio": me?.tracking || "",
        "Valor Declarado": me?.declared_value || "",
      };
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 10 }, { wch: 30 }, { wch: 18 }, { wch: 12 },
      { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 18 }, { wch: 8 },
      { wch: 14 }, { wch: 12 }, { wch: 10 },
      { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Checagem ME");

    // Sheet 2: Resumo
    const resumo = [
      ["Métrica", "Valor"],
      ["Vendas no ERP", data.sales_total],
      ["Envios no ME (ano)", data.me_total],
      ["Vendas com envio no ME", stats.matched],
      ["Etiqueta fora do sistema", stats.outside],
      ["Vendas com OS", stats.withOS],
      ["Total filtrado", filtered.length],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), "Resumo");

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `checagem_melhor_envio_${date}.xlsx`);
    toast({ title: "Excel exportado", description: `${filtered.length} registros exportados.` });
  };

  const clearFilters = () => {
    setStageFilter([]);
    setStatusFilter([]);
    setOsStatusFilter([]);
    setLabelFilter([]);
    setMeStatusFilter([]);
    setSearch("");
    setFilterMode("all");
  };

  const hasActiveFilters = stageFilter.length > 0 || statusFilter.length > 0 || osStatusFilter.length > 0 || labelFilter.length > 0 || meStatusFilter.length > 0 || search.trim() || filterMode !== "all";

  const stats = useMemo(() => {
    if (!data?.rows) return { total: 0, matched: 0, outside: 0, withOS: 0 };
    const rows = data.rows;
    return {
      total: rows.length,
      matched: rows.filter(r => r.me_match_count > 0).length,
      outside: rows.filter(r => r.me_match_count > 0 && !r.has_system_label).length,
      withOS: rows.filter(r => r.os_count > 0).length,
    };
  }, [data]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Relatório de Checagem — Melhor Envio"
        description="Cruza todas as vendas do ERP com os envios do Melhor Envio (ano atual) para identificar etiquetas geradas fora do sistema."
      >
        <Button onClick={generate} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
          Gerar Relatório
        </Button>
        {data && filtered.length > 0 && (
          <Button variant="outline" onClick={exportExcel}>
            <FileSpreadsheet className="h-4 w-4" />
            Exportar Excel
          </Button>
        )}
      </PageHeader>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-5">
            <div className="text-2xl font-bold">{data.sales_total}</div>
            <p className="text-xs text-muted-foreground">Vendas no ERP</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <div className="text-2xl font-bold">{data.me_total}</div>
            <p className="text-xs text-muted-foreground">Envios no ME (ano)</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <div className="text-2xl font-bold text-emerald-600">{stats.matched}</div>
            <p className="text-xs text-muted-foreground">Vendas com envio no ME</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <div className="text-2xl font-bold text-amber-600">{stats.outside}</div>
            <p className="text-xs text-muted-foreground">Etiqueta fora do sistema</p>
          </CardContent></Card>
        </div>
      )}

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, CPF/CNPJ, CEP, pedido ou OS..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={filterMode === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterMode("all")}
              >
                Todas
              </Button>
              <Button
                variant={filterMode === "outside_system" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterMode("outside_system")}
              >
                <AlertTriangle className="h-4 w-4 mr-1" />
                Fora do sistema
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Filter className="h-3.5 w-3.5" /> Filtros:
            </span>
            <MultiSelectFilter
              options={stageOptions}
              selected={stageFilter}
              onChange={setStageFilter}
              placeholder="Estágio da venda"
              allLabel="Estágio: Todos"
              icon={Tag}
            />
            <MultiSelectFilter
              options={statusOptions}
              selected={statusFilter}
              onChange={setStatusFilter}
              placeholder="Status da venda"
              allLabel="Status: Todos"
              icon={ClipboardList}
            />
            <MultiSelectFilter
              options={osStatusOptions}
              selected={osStatusFilter}
              onChange={setOsStatusFilter}
              placeholder="Status da OS"
              allLabel="OS: Todos"
              icon={Package}
            />
            <MultiSelectFilter
              options={labelOptions}
              selected={labelFilter}
              onChange={setLabelFilter}
              placeholder="Etiqueta no sistema"
              allLabel="Etiqueta: Todos"
              icon={FileCheck}
            />
            <MultiSelectFilter
              options={meStatusOptions}
              selected={meStatusFilter}
              onChange={setMeStatusFilter}
              placeholder="Status do ME"
              allLabel="ME: Todos"
              icon={Truck}
            />
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs">
                Limpar filtros
              </Button>
            )}
          </div>

          {isLoading || isFetching ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Buscando vendas e cruzando com o Melhor Envio...
            </div>
          ) : !data ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <PackageCheck className="h-10 w-10 mb-3 opacity-40" />
              <p>Clique em "Gerar Relatório" para carregar os dados.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              Nenhuma venda encontrada com os filtros atuais.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>CPF/CNPJ</TableHead>
                    <TableHead>CEP</TableHead>
                    <TableHead>Status Venda</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead>Status OS</TableHead>
                    <TableHead>Etiqueta no Sistema</TableHead>
                    <TableHead>Envio no ME</TableHead>
                    <TableHead>Status ME</TableHead>
                    <TableHead>Rastreio</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const meMatch = r.me_matches[0];
                    const st = meMatch ? STATUS_STYLES[meMatch.status] || { label: meMatch.status, variant: "secondary" } : null;
                    return (
                      <TableRow key={r.sale_id}>
                        <TableCell className="font-mono text-xs">{r.order_number}</TableCell>
                        <TableCell className="font-medium">{r.client_name}</TableCell>
                        <TableCell className="font-mono text-xs">{r.client_doc || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{r.delivery_zip || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{r.sale_stage}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.os_code || <span className="text-muted-foreground">—</span>}
                          {r.os_count > 1 && <span className="text-muted-foreground ml-1">(+{r.os_count - 1})</span>}
                        </TableCell>
                        <TableCell>
                          {r.os_status ? <Badge variant="outline" className="text-xs">{r.os_status}</Badge> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {r.has_system_label ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 text-xs"><CheckCircle2 className="h-3.5 w-3.5" /> Sim</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground text-xs"><XCircle className="h-3.5 w-3.5" /> Não</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.me_match_count > 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Sim {r.me_match_count > 1 && `(${r.me_match_count})`}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground text-xs"><XCircle className="h-3.5 w-3.5" /> Não</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {st ? <Badge variant={st.variant} className="text-xs">{st.label}</Badge> : "—"}
                          {meMatch && <div className="text-[10px] text-muted-foreground mt-0.5">casou por {meMatch.match_type}</div>}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {meMatch?.tracking ? (
                            <a href={`https://www.melhorrastreio.com.br/rastreio/${meMatch.tracking}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                              {meMatch.tracking}
                            </a>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.os_id && meMatch?.tracking ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setUpdateOsRow(r)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Atualizar OS
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <UpdateOsFromMeDialog
        open={Boolean(updateOsRow)}
        onOpenChange={(v) => !v && setUpdateOsRow(null)}
        row={updateOsRow}
        onUpdated={() => refetch()}
      />
    </div>
  );
}