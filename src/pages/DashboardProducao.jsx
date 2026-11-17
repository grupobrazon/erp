import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Factory, Clock, Wrench, CheckCircle2, Package, Layers, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportProductionDashboard } from "@/lib/excelExport";
import { exportProductionDashboardPDF } from "@/lib/productionDashboardPdf";
import MultiSelectFilter from "@/components/ui/MultiSelectFilter";

const STATUS_META = {
  "Aguardando Produção": { color: "#f59e0b", icon: Clock, cardBg: "border-amber-200 bg-amber-50/50", iconBg: "bg-amber-100 text-amber-600" },
  "Produção Iniciada": { color: "#3b82f6", icon: Wrench, cardBg: "border-blue-200 bg-blue-50/50", iconBg: "bg-blue-100 text-blue-600" },
  "Produção Liberada": { color: "#10b981", icon: CheckCircle2, cardBg: "border-emerald-200 bg-emerald-50/50", iconBg: "bg-emerald-100 text-emerald-600" },
};

const PRODUCTION_STATUSES = ["Aguardando Produção", "Produção Iniciada", "Produção Liberada"];

const groupSortPriority = (name) => {
  const lower = (name || "").toLowerCase();
  if (lower.includes("purificador")) return 0;
  return 1;
};

const fmtDate = (d) => d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";

function StatCard({ status, osCount, itemCount }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Card className={meta.cardBg}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg p-2 ${meta.iconBg}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none">{osCount}</p>
            <p className="text-xs text-muted-foreground mt-1">{status}</p>
            <p className="text-xs font-medium mt-0.5" style={{ color: meta.color }}>{itemCount} itens</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardProducao() {
  const [viewMode, setViewMode] = useState("subgroup");
  const [selectedSubgroups, setSelectedSubgroups] = useState([]);
  const [selectedProductTypes, setSelectedProductTypes] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [exportingPdf, setExportingPdf] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["productionDashboard"],
    queryFn: async () => {
      const res = await base44.functions.invoke("getProductionDashboard", {});
      return res.data || res;
    },
  });

  const orders = data?.orders || [];

  // Filter options derived from ALL orders (so options don't disappear when filtering)
  const subgroups = useMemo(() => {
    return [...new Set(orders.flatMap(os => os.items.map(i => i.subgroup_name).filter(Boolean)))].sort();
  }, [orders]);

  const productTypes = useMemo(() => {
    return [...new Set(orders.flatMap(os => os.items.map(i => i.product_type).filter(Boolean)))].sort();
  }, [orders]);

  // Filtered orders first — everything downstream derives from this
  const filteredOrders = useMemo(() => {
    let result = orders;
    if (selectedSubgroups.length > 0) {
      result = result.filter(os => os.items.some(i => selectedSubgroups.includes(i.subgroup_name)));
    }
    if (selectedProductTypes.length > 0) {
      result = result.filter(os => os.items.some(i => selectedProductTypes.includes(i.product_type)));
    }
    if (selectedStatuses.length > 0) {
      result = result.filter(os => selectedStatuses.includes(os.status));
    }
    return result.sort((a, b) => {
      const statusOrder = PRODUCTION_STATUSES.indexOf(a.status) - PRODUCTION_STATUSES.indexOf(b.status);
      if (statusOrder !== 0) return statusOrder;
      return (a.code || "").localeCompare(b.code || "");
    });
  }, [orders, selectedSubgroups, selectedProductTypes, selectedStatuses]);

  // When filtering by subgroup/type, narrow each OS's items to only those matching the filter
  const scopedOrders = useMemo(() => {
    if (selectedSubgroups.length === 0 && selectedProductTypes.length === 0) return filteredOrders;
    return filteredOrders.map(os => ({
      ...os,
      items: os.items.filter(i =>
        (selectedSubgroups.length === 0 || selectedSubgroups.includes(i.subgroup_name)) &&
        (selectedProductTypes.length === 0 || selectedProductTypes.includes(i.product_type))
      ),
    }));
  }, [filteredOrders, selectedSubgroups, selectedProductTypes]);

  const summary = useMemo(() => {
    const s = {};
    for (const status of PRODUCTION_STATUSES) s[status] = { os: 0, items: 0 };
    for (const os of scopedOrders) {
      if (s[os.status]) {
        s[os.status].os++;
        s[os.status].items += os.items.reduce((sum, i) => sum + (i.quantity || 0), 0);
      }
    }
    return s;
  }, [scopedOrders]);

  const bySubgroup = useMemo(() => {
    const map = {};
    for (const os of scopedOrders) {
      for (const item of os.items) {
        const groupName = item.group_name || "Sem Grupo";
        const subgroupName = item.subgroup_name || "Sem Subgrupo";
        const key = groupName + "||" + subgroupName;
        if (!map[key]) {
          map[key] = { name: subgroupName, group: groupName, "Aguardando Produção": 0, "Produção Iniciada": 0, "Produção Liberada": 0, total: 0 };
        }
        if (map[key][os.status] !== undefined) map[key][os.status] += item.quantity;
        map[key].total += item.quantity;
      }
    }
    const entries = Object.values(map);
    const nameCounts = {};
    for (const e of entries) nameCounts[e.name] = (nameCounts[e.name] || 0) + 1;
    const withLabel = entries.map(e => ({
      ...e,
      label: nameCounts[e.name] > 1 ? `${e.name} (${e.group})` : e.name,
    }));
    return withLabel.sort((a, b) => {
      const ga = groupSortPriority(a.group);
      const gb = groupSortPriority(b.group);
      if (ga !== gb) return ga - gb;
      if (a.group !== b.group) return a.group.localeCompare(b.group);
      return a.name.localeCompare(b.name);
    });
  }, [scopedOrders]);

  const byProduct = useMemo(() => {
    const map = {};
    for (const os of scopedOrders) {
      for (const item of os.items) {
        const key = item.product_name || "Sem Produto";
        if (!map[key]) {
          map[key] = {
            name: key,
            subgroup: item.subgroup_name || "Sem Subgrupo",
            group: item.group_name || "Sem Grupo",
            product_type: item.product_type || "",
            "Aguardando Produção": 0,
            "Produção Iniciada": 0,
            "Produção Liberada": 0,
            total: 0,
            osIds: new Set(),
          };
        }
        if (map[key][os.status] !== undefined) map[key][os.status] += item.quantity;
        map[key].total += item.quantity;
        map[key].osIds.add(os.id);
      }
    }
    return Object.values(map)
      .map(p => ({ ...p, os_count: p.osIds.size, label: p.name }))
      .sort((a, b) => {
        const ga = groupSortPriority(a.group);
        const gb = groupSortPriority(b.group);
        if (ga !== gb) return ga - gb;
        if (a.group !== b.group) return a.group.localeCompare(b.group);
        if (a.subgroup !== b.subgroup) return a.subgroup.localeCompare(b.subgroup);
        return a.name.localeCompare(b.name);
      });
  }, [scopedOrders]);

  const chartData = viewMode === "subgroup" ? bySubgroup : byProduct;

  const filters = { subgroups: selectedSubgroups, productTypes: selectedProductTypes, statuses: selectedStatuses };
  const hasActiveFilter = selectedSubgroups.length > 0 || selectedProductTypes.length > 0 || selectedStatuses.length > 0;

  const handleExportExcel = () => {
    exportProductionDashboard({ summary, bySubgroup, byProduct, viewMode, filteredOrders: scopedOrders });
  };
  const handleExportPDF = async () => {
    setExportingPdf(true);
    try {
      await exportProductionDashboardPDF({ summary, chartData, viewMode, filteredOrders: scopedOrders, filters });
    } finally {
      setExportingPdf(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const chartHeight = Math.max(300, chartData.length * 45 + 80);
  const totalItems = PRODUCTION_STATUSES.reduce((sum, s) => sum + (summary[s]?.items || 0), 0);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Factory className="h-6 w-6 text-primary" /> Dashboard de Produção
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Visão geral dos itens em produção por subgrupo e produto
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={orders.length === 0}>
            <Download className="h-4 w-4" /> Exportar Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={orders.length === 0 || exportingPdf}>
            <FileText className="h-4 w-4" /> {exportingPdf ? "Gerando..." : "Exportar PDF"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {PRODUCTION_STATUSES.map(status => (
          <StatCard
            key={status}
            status={status}
            osCount={summary[status]?.os || 0}
            itemCount={summary[status]?.items || 0}
          />
        ))}
        <Card className="border-slate-200 bg-slate-50/50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2 bg-slate-100 text-slate-600">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none">{scopedOrders.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Total de OS</p>
                <p className="text-xs font-medium mt-0.5 text-slate-600">{totalItems} itens</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Agrupar por:</span>
          <Select value={viewMode} onValueChange={setViewMode}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="subgroup">Subgrupo</SelectItem>
              <SelectItem value="product">Produto</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Subgrupo</span>
          <MultiSelectFilter
            options={subgroups.map(sg => ({ value: sg, label: sg }))}
            selected={selectedSubgroups}
            onChange={setSelectedSubgroups}
            allLabel="Todos"
            className="w-[220px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Tipo de Produto</span>
          <MultiSelectFilter
            options={productTypes.map(pt => ({ value: pt, label: pt }))}
            selected={selectedProductTypes}
            onChange={setSelectedProductTypes}
            allLabel="Todos"
            className="w-[220px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Status</span>
          <MultiSelectFilter
            options={PRODUCTION_STATUSES.map(s => ({ value: s, label: s }))}
            selected={selectedStatuses}
            onChange={setSelectedStatuses}
            allLabel="Todos"
            className="w-[220px]"
          />
        </div>
        {hasActiveFilter && (
          <Button variant="ghost" size="sm" onClick={() => { setSelectedSubgroups([]); setSelectedProductTypes([]); setSelectedStatuses([]); }}>
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            {viewMode === "subgroup" ? "Quantidade por Subgrupo" : "Quantidade por Produto"}
            {selectedSubgroups.map(sg => <Badge key={sg} variant="outline" className="ml-2">{sg}</Badge>)}
            {selectedProductTypes.map(pt => <Badge key={pt} variant="outline" className="ml-2">{pt}</Badge>)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              Nenhum item em produção para os filtros selecionados.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 40, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="label" width={220} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value, name) => [`${value} un.`, name]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Aguardando Produção" stackId="a" fill={STATUS_META["Aguardando Produção"].color} name="Aguardando" />
                <Bar dataKey="Produção Iniciada" stackId="a" fill={STATUS_META["Produção Iniciada"].color} name="Em Produção" />
                <Bar dataKey="Produção Liberada" stackId="a" fill={STATUS_META["Produção Liberada"].color} name="Liberada" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Aggregation Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {viewMode === "subgroup" ? "Detalhamento por Subgrupo" : "Detalhamento por Produto"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              Sem dados para exibir.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{viewMode === "subgroup" ? "Subgrupo" : "Produto"}</TableHead>
                  {viewMode === "product" && <TableHead>Subgrupo</TableHead>}
                  {viewMode === "product" && <TableHead>Tipo</TableHead>}
                  <TableHead className="text-center">Aguardando</TableHead>
                  <TableHead className="text-center">Em Produção</TableHead>
                  <TableHead className="text-center">Liberada</TableHead>
                  <TableHead className="text-center font-bold">Total</TableHead>
                  {viewMode === "product" && <TableHead className="text-center">OS</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {chartData.flatMap((row, i) => {
                  const rows = [];
                  const prevRow = chartData[i - 1];
                  if (!prevRow || prevRow.group !== row.group) {
                    rows.push(
                      <TableRow key={`grp-${i}`} className="bg-muted/40">
                        <TableCell
                          colSpan={viewMode === "product" ? 8 : 5}
                          className="font-semibold text-xs uppercase tracking-wider text-muted-foreground py-2"
                        >
                          {row.group}
                        </TableCell>
                      </TableRow>
                    );
                  }
                  rows.push(
                    <TableRow key={i}>
                      <TableCell className="font-medium text-sm pl-4">{row.name}</TableCell>
                      {viewMode === "product" && <TableCell className="text-sm text-muted-foreground">{row.subgroup}</TableCell>}
                      {viewMode === "product" && <TableCell className="text-sm text-muted-foreground">{row.product_type || "—"}</TableCell>}
                      <TableCell className="text-center text-sm">
                        {row["Aguardando Produção"] > 0 ? <span className="text-amber-600 font-medium">{row["Aguardando Produção"]}</span> : "—"}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {row["Produção Iniciada"] > 0 ? <span className="text-blue-600 font-medium">{row["Produção Iniciada"]}</span> : "—"}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {row["Produção Liberada"] > 0 ? <span className="text-emerald-600 font-medium">{row["Produção Liberada"]}</span> : "—"}
                      </TableCell>
                      <TableCell className="text-center text-sm font-bold">{row.total}</TableCell>
                      {viewMode === "product" && <TableCell className="text-center text-sm">{row.os_count}</TableCell>}
                    </TableRow>
                  );
                  return rows;
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* OS Detail Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Ordens de Serviço em Produção ({scopedOrders.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {scopedOrders.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              Nenhuma OS encontrada com os filtros selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OS</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Itens</TableHead>
                    <TableHead>Enviado p/ Produção</TableHead>
                    <TableHead>Prazo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scopedOrders.map(os => (
                    <TableRow key={os.id}>
                      <TableCell className="font-mono text-xs">{os.code}</TableCell>
                      <TableCell className="text-sm">{os.client_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="whitespace-nowrap" style={{ borderColor: STATUS_META[os.status]?.color, color: STATUS_META[os.status]?.color }}>
                          {os.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {os.items.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="space-y-0.5">
                            {os.items.map((item, i) => (
                              <div key={i} className="text-xs">
                                <span className="font-medium">{item.quantity}x</span> {item.product_name}
                                <span className="text-muted-foreground ml-1">({item.subgroup_name})</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{fmtDate(os.production_sent_date)}</TableCell>
                      <TableCell className="text-sm">{fmtDate(os.production_deadline || os.production_forecast_date)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}