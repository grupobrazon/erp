import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function LegacyImportDialog({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleImport = async () => {
    setImporting(true);
    setResult(null);
    setError("");

    try {
      const res = await base44.functions.invoke('importLegacyMaintenance', {});
      setResult(res.data);
      queryClient.invalidateQueries({ queryKey: ["maintenanceEquipment"] });
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Erro na importação");
    }
    setImporting(false);
  };

  const handleClose = () => {
    if (!importing) {
      onOpenChange(false);
      setTimeout(() => { setResult(null); setError(""); }, 200);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Base Antiga (ERP)
          </DialogTitle>
          <DialogDescription>
            Importa clientes e equipamentos da planilha do ERP antigo para o painel de manutenção.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {importing && (
            <div className="space-y-3 py-4">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                <div className="text-center">
                  <p className="font-medium">Importando base completa...</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Processando ~8.000 registros em massa. Isso pode levar 20–30 segundos.
                  </p>
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div className="bg-primary h-full w-1/3 animate-pulse" />
              </div>
            </div>
          )}

          {result && !importing && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">Importação concluída!</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded bg-muted/50 p-3">
                  <div className="font-bold text-xl text-primary">{result.equipment_created}</div>
                  <div className="text-muted-foreground">Equipamentos criados</div>
                </div>
                <div className="rounded bg-muted/50 p-3">
                  <div className="font-bold text-xl text-green-600">{result.matched}</div>
                  <div className="text-muted-foreground">Com produto casado</div>
                </div>
                <div className="rounded bg-muted/50 p-3">
                  <div className="font-bold text-xl text-amber-600">{result.skipped}</div>
                  <div className="text-muted-foreground">Pulados (duplicados)</div>
                </div>
                <div className="rounded bg-muted/50 p-3">
                  <div className="font-bold text-xl">{result.clients_created}</div>
                  <div className="text-muted-foreground">Clientes novos</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Total na planilha: {result.total_rows} registros. Os equipamentos importados aparecem no painel e podem ser editados; os de vendas não.
              </p>
            </div>
          )}

          {!importing && !result && !error && (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Importa todos os clientes da planilha do ERP antigo, cria um equipamento para cada um com as datas de última troca e próxima troca, e casa a cápsula de purificação (coluna Q) com os produtos já cadastrados no estoque.
              </p>
              <p className="text-xs">
                • Clientes já cadastrados (por CPF) não são duplicados.<br/>
                • Se o produto não for encontrado, fica em branco para preenchimento posterior.<br/>
                • A data da última compra (coluna S) usa o 1º dia do mês.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={importing}>Cancelar</Button>
              <Button onClick={handleImport} disabled={importing} className="gap-2">
                <Upload className="h-4 w-4" />
                {importing ? "Importando..." : "Iniciar Importação"}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}