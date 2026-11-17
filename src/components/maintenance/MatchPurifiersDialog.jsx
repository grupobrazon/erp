import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Wand2, Loader2, ArrowRight } from "lucide-react";

export default function MatchPurifiersDialog({ open, onOpenChange }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleRun = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await base44.functions.invoke("matchEquipmentPurifiers", {});
      setResult(res.data);
      queryClient.invalidateQueries({ queryKey: ["maintenanceEquipment"] });
      toast({ title: "De-Para concluído", description: `${res.data.updated} equipamento(s) atualizado(s) com o nome correto do produto.` });
    } catch (err) {
      setError(err.message);
      toast({ title: "Erro no De-Para", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (v) => {
    if (!v && !loading) {
      setResult(null);
      setError(null);
      onOpenChange(v);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" /> De-Para Purificadores
          </DialogTitle>
          <DialogDescription>
            Identifica equipamentos cuja coluna "Última Cápsula" contém nomes de purificadores (começando com PUR)
            em vez de cápsulas, faz a correspondência com os produtos cadastrados no banco de dados via IA,
            e atualiza o nome do equipamento com o produto correto.
          </DialogDescription>
        </DialogHeader>

        {!result && !loading && !error && (
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Clique em "Executar De-Para" para iniciar. A IA vai ler todos os nomes PUR, comparar com os produtos
              cadastrados e atualizar o campo de equipamento com o nome correto do produto que foi comprado.
            </p>
          </div>
        )}

        {loading && (
          <div className="py-8 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Processando... A IA está fazendo a correspondência. Isso pode levar alguns minutos.</p>
          </div>
        )}

        {error && !loading && (
          <div className="py-4">
            <p className="text-sm text-destructive">Erro: {error}</p>
          </div>
        )}

        {result && !loading && (
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">{result.total_pur}</p>
                <p className="text-xs text-muted-foreground">Equip. com PUR</p>
              </div>
              <div className="bg-primary/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-primary">{result.updated}</p>
                <p className="text-xs text-muted-foreground">Atualizados</p>
              </div>
              <div className="bg-destructive/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-destructive">{result.unmatched?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Sem match</p>
              </div>
            </div>

            {result.match_details && result.match_details.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Correspondências encontradas ({result.match_details.length} nomes únicos):</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {result.match_details.sort((a, b) => b.count - a.count).map((m, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5">
                      <span className="font-mono flex-1 truncate">{m.pur_name}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="font-medium flex-1 truncate">{m.product_name}</span>
                      <Badge variant={m.confidence === "alta" ? "default" : m.confidence === "media" ? "secondary" : "outline"} className="shrink-0">
                        {m.confidence} · {m.count}x
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.unmatched && result.unmatched.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2 text-destructive">Sem correspondência ({result.unmatched.length} nomes):</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {result.unmatched.map((u, i) => (
                    <div key={i} className="text-xs bg-destructive/10 rounded px-2 py-1 font-mono">{u}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <Button onClick={handleRun} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Executar De-Para
            </Button>
          ) : (
            <Button onClick={() => handleClose(false)}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}