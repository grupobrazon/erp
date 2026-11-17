import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Package, Truck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from "@/components/ui/table";
import { Input } from "@/components/ui/input";

export default function LegacySalesImportCard() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [search, setSearch] = useState("");

  const loadReport = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("importLegacySales", { report: true });
      setReport(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const filteredImported = report?.imported_list?.filter(r =>
    !search || r.pedido.includes(search) || r.order_number?.toLowerCase().includes(search.toLowerCase()) || r.client_name?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Importação de Vendas do Sistema Antigo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Relatório da importação de 161 pedidos da planilha legada. Mostra o mapeamento entre o número do pedido antigo e o código gerado no sistema, além dos pedidos que não puderam ser importados.
        </p>

        <Button onClick={loadReport} disabled={loading} className="gap-2">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Carregando relatório...</> : <><FileSpreadsheet className="h-4 w-4" /> Carregar Relatório</>}
        </Button>

        {report && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-primary">{report.total}</p>
                <p className="text-xs text-muted-foreground">Total de Pedidos</p>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-emerald-600">{report.imported}</p>
                <p className="text-xs text-muted-foreground">Importados</p>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">{report.faturados}</p>
                <p className="text-xs text-muted-foreground">Faturados (com OS)</p>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-600">{report.failed}</p>
                <p className="text-xs text-muted-foreground">Falhas</p>
              </div>
            </div>

            {report.failed > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  Pedidos não importados ({report.failed})
                </h4>
                <div className="border rounded-lg max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Pedido</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="w-32">Cód. Antigo</TableHead>
                        <TableHead className="w-40">Erro</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.failed_list.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{r.pedido}</TableCell>
                          <TableCell className="text-sm">{r.client_name}</TableCell>
                          <TableCell className="text-xs font-mono">{r.old_client_code}</TableCell>
                          <TableCell><Badge variant="destructive" className="text-xs">{r.error}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Pedidos importados ({report.imported})
                </h4>
                <Input
                  placeholder="Buscar por pedido, código ou cliente..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="max-w-xs h-8 text-sm"
                />
              </div>
              <div className="border rounded-lg max-h-96 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Pedido Antigo</TableHead>
                      <TableHead className="w-24">Código Sistema</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="w-32">Modalidade</TableHead>
                      <TableHead className="w-24">Faturado?</TableHead>
                      <TableHead className="w-28">OS</TableHead>
                      <TableHead className="w-28">Etapa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredImported.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{r.pedido}</TableCell>
                        <TableCell className="font-mono text-xs font-medium text-primary">{r.order_number}</TableCell>
                        <TableCell className="text-sm">{r.client_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs gap-1">
                            {r.delivery_modality === "Envio" ? <Truck className="h-3 w-3" /> : <Wrench className="h-3 w-3" />}
                            {r.delivery_modality}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {r.is_faturado ? <Badge className="text-xs bg-emerald-100 text-emerald-700">Sim</Badge> : <Badge variant="secondary" className="text-xs">Não</Badge>}
                        </TableCell>
                        <TableCell>
                          {r.has_os ? <Badge className="text-xs bg-blue-100 text-blue-700">{r.os_code}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{r.stage}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}