import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RotateCcw, Layers, Trash2, Loader2, Download } from "lucide-react";
import { exportClientPhones } from "@/lib/excelExport";

const fmtDate = (d) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return String(d);
  }
};

export default function DistribuicaoBatches({ batches, clients, sellers = [], onReverse, onReverseAll, loading, reversing }) {
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmBatch, setConfirmBatch] = useState(null);

  const active = batches.filter((b) => !b.reversed);
  const reversed = batches.filter((b) => b.reversed);

  const sellerMap = new Map((sellers || []).map((s) => [s.id, s.name]));

  const downloadBatchPhones = (batch) => {
    const ids = new Set(batch.client_ids || []);
    const batchClients = (clients || []).filter((c) => ids.has(c.id));
    if (batchClients.length === 0) return;
    exportClientPhones(batchClients, new Map(), sellerMap);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" /> Lotes de Distribuição
        </CardTitle>
        <Button
          variant="destructive"
          size="sm"
          className="gap-1"
          disabled={active.length === 0 || loading || reversing}
          onClick={() => setConfirmAll(true)}
        >
          {reversing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Estornar tudo
        </Button>
      </CardHeader>
      <CardContent>
        {batches.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            Nenhuma distribuição registrada ainda.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Protocolo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Modo</TableHead>
                <TableHead>Vendedoras</TableHead>
                <TableHead className="text-center">Clientes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id} className={b.reversed ? "opacity-50" : ""}>
                  <TableCell className="font-mono text-sm font-medium">{b.protocol}</TableCell>
                  <TableCell className="text-sm">{fmtDate(b.date)}</TableCell>
                  <TableCell className="text-sm">
                    {b.mode === "single" ? "Uma vendedora" : b.mode === "planilha" ? "Planilha (importado)" : "Dividido igual"}
                  </TableCell>
                  <TableCell className="text-sm">{(b.seller_names || []).join(", ") || "—"}</TableCell>
                  <TableCell className="text-center text-sm">{b.client_count || 0}</TableCell>
                  <TableCell>
                    {b.reversed ? (
                      <Badge variant="secondary">Estornado</Badge>
                    ) : (
                      <Badge variant="default">Ativo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        disabled={(b.client_ids || []).length === 0}
                        onClick={() => downloadBatchPhones(b)}
                        title="Baixar relatório de telefones do lote"
                      >
                        <Download className="h-3.5 w-3.5" /> Telefones
                      </Button>
                      {!b.reversed && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          disabled={loading || reversing}
                          onClick={() => setConfirmBatch(b)}
                        >
                          {reversing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Estornar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {batches.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            {active.length} lote(s) ativo(s) · {reversed.length} estornado(s)
          </p>
        )}
      </CardContent>

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar todas as distribuições?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os clientes distribuídos serão removidos das vendedoras (limpeza geral) e todos os lotes ativos
              serão marcados como estornados. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reversing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={reversing}
              onClick={async () => {
                setConfirmAll(false);
                await onReverseAll();
              }}
            >
              {reversing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {reversing ? "Estornando..." : "Confirmar estorno geral"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmBatch} onOpenChange={(o) => !o && setConfirmBatch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar o lote {confirmBatch?.protocol}?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmBatch?.client_count || 0} cliente(s) deste lote serão removidos da vendedora. Esta ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reversing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={reversing}
              onClick={async () => {
                const b = confirmBatch;
                setConfirmBatch(null);
                await onReverse(b);
              }}
            >
              {reversing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {reversing ? "Estornando..." : "Confirmar estorno"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}