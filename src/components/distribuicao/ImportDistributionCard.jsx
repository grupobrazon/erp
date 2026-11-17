import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { FileSpreadsheet, Loader2, Play, AlertTriangle } from "lucide-react";

export default function ImportDistributionCard({ onImported }) {
  const { toast } = useToast();
  const [file, setFile] = useState(null);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleRun = async () => {
    if (!file) {
      toast({ title: "Selecione a planilha", description: "Anexe o arquivo Excel com as colunas Código novo e Vendedora.", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const up = await base44.integrations.Core.UploadPublicFile({ file });
      const res = await base44.functions.invoke("importDistributionFromSheet", {
        file_url: up.file_url,
        dry_run: dryRun,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setResult(res.data);
      if (dryRun) {
        toast({
          title: "Simulação concluída",
          description: `${res.data.summary.to_update} clientes seriam distribuídos conforme a planilha.`,
        });
      } else {
        toast({
          title: "Distribuição aplicada",
          description: `${res.data.summary.updated} clientes distribuídos — Lote ${res.data.protocol}.`,
        });
        onImported?.();
      }
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const s = result?.summary;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Importar Distribuição da Planilha
        </CardTitle>
        <CardDescription>
          Suba o Excel com o <strong>Código novo</strong> do cliente (ex: B000123) e a <strong>vendedora</strong> responsável.
          O sistema aplica a vendedora da planilha em cada cliente e gera um lote de distribuição.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="dist-file">Planilha (.xlsx, .xls ou .csv)</Label>
          <input
            id="dist-file"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
          />
          {file && <p className="text-xs text-muted-foreground">{file.name}</p>}
        </div>

        <div className="flex items-center gap-3 rounded-lg border p-3">
          <Switch id="dist-dry-run" checked={dryRun} onCheckedChange={setDryRun} />
          <Label htmlFor="dist-dry-run" className="flex-1 cursor-pointer">
            <span className="font-medium">Modo Simulação</span>
            <p className="text-xs text-muted-foreground">
              {dryRun ? "Só pré-visualiza o resultado, sem alterar os clientes." : "Aplica a vendedora da planilha em cada cliente."}
            </p>
          </Label>
          <Badge variant={dryRun ? "secondary" : "destructive"}>{dryRun ? "Simulação" : "Aplicar"}</Badge>
        </div>

        <Button onClick={handleRun} disabled={loading || !file} className="w-full">
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</>
          ) : (
            <><Play className="h-4 w-4" /> {dryRun ? "Simular distribuição" : "Aplicar distribuição"}</>
          )}
        </Button>

        {s && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Linhas na planilha" value={s.total_rows} />
              <Stat label="Códigos únicos" value={s.unique_codes} />
              <Stat label={result.dry_run ? "Clientes a atualizar" : "Clientes atualizados"} value={s.updated ?? s.to_update} highlight />
              <Stat label="Não encontrados" value={s.not_found} />
            </div>

            {s.by_seller?.length > 0 && (
              <div className="rounded-lg border">
                <p className="text-xs font-semibold text-muted-foreground px-3 py-2 border-b">Clientes por vendedora</p>
                <div className="max-h-48 overflow-auto divide-y">
                  {s.by_seller.map((r) => (
                    <div key={r.seller} className="flex items-center justify-between px-3 py-1.5 text-sm">
                      <span className="truncate">{r.seller}</span>
                      <span className="font-medium">{r.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {s.sellers_not_found > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                <p className="flex items-center gap-2 font-medium text-amber-800">
                  <AlertTriangle className="h-4 w-4" /> Vendedoras não cadastradas
                </p>
                <p className="text-xs text-amber-800 mt-1">{result.sellers_not_found.join(", ")}</p>
              </div>
            )}

            {result.not_found_codes?.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                <p className="flex items-center gap-2 font-medium text-amber-800">
                  <AlertTriangle className="h-4 w-4" /> Códigos sem cliente no sistema
                </p>
                <p className="text-xs text-amber-800 mt-1 break-words">{result.not_found_codes.join(", ")}</p>
              </div>
            )}

            {!result.dry_run && (
              <p className="text-xs text-muted-foreground">
                Lote gerado: <span className="font-mono font-medium">{result.protocol}</span> — já disponível para envio nas Campanhas 3C Plus.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "bg-primary/10 border-primary/30" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold mt-1">{value ?? 0}</p>
    </div>
  );
}