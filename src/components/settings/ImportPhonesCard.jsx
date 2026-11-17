import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Phone, Play, Loader2 } from "lucide-react";

export default function ImportPhonesCard() {
  const { toast } = useToast();
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleImport = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke("importClientPhones", { dry_run: dryRun });
      setResult(res.data);
      toast({
        title: dryRun ? "Simulação concluída" : "Importação concluída",
        description: dryRun
          ? `${res.data.summary.to_update} clientes receberiam novos telefones.`
          : `${res.data.summary.updated} clientes atualizados, ${res.data.summary.errors} erros.`,
      });
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-primary" />
          Importar Telefones da Planilha
        </CardTitle>
        <CardDescription>
          Lê a planilha do Google Sheets, cruza pelo "Código Antigo" e <strong>adiciona</strong> novos
          telefones em slots vazios (phone1–phone5). <strong>Não sobrescreve</strong> telefones já cadastrados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <Switch id="dry-run" checked={dryRun} onCheckedChange={setDryRun} />
          <Label htmlFor="dry-run" className="flex-1 cursor-pointer">
            <span className="font-medium">Modo Simulação</span>
            <p className="text-xs text-muted-foreground">
              {dryRun
                ? "Apenas pré-visualiza — não altera os clientes."
                : "Aplica as alterações de fato nos clientes."}
            </p>
          </Label>
          <Badge variant={dryRun ? "secondary" : "destructive"}>
            {dryRun ? "Simulação" : "Aplicar"}
          </Badge>
        </div>

        <Button onClick={handleImport} disabled={loading} className="w-full">
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</>
          ) : (
            <><Play className="h-4 w-4" /> {dryRun ? "Simular Importação" : "Importar Telefones"}</>
          )}
        </Button>

        {loading && <Progress value={undefined} className="h-2" />}

        {result?.summary && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Stat label="Linhas na planilha" value={result.summary.total_rows} />
            <Stat label="Códigos únicos" value={result.summary.unique_codes} />
            <Stat label="Clientes a atualizar" value={result.summary.to_update} />
            <Stat label="Atualizados" value={result.summary.updated} highlight />
            <Stat label="Sem alteração" value={result.summary.no_change} />
            <Stat label="Não encontrados" value={result.summary.not_found} />
            <Stat label="Erros" value={result.summary.errors} />
            <Stat label="Clientes escaneados" value={result.summary.total_clients_scanned} />
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
      <p className="text-lg font-bold mt-1">{value}</p>
    </div>
  );
}