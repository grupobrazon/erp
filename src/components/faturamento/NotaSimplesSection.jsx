import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle2, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function NotaSimplesSection({ os, setting, onUpdated, readOnly }) {
  const { toast } = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const serie = setting?.nfe_serie || "001";

  const generate = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("emitNotaSimples", {
        os_id: os.id,
        invoice_date: date,
      });
      toast({ title: "Nota simples gerada", description: res.data.nota_simples_number });
      onUpdated();
    } catch (err) {
      toast({ title: "Erro ao gerar nota simples", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" /> Nota Simples
        </CardTitle>
      </CardHeader>
      <CardContent>
        {os.nota_simples_number ? (
          <div className="flex flex-wrap items-center gap-6">
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Gerada
            </Badge>
            <div>
              <p className="text-xs text-muted-foreground">Número</p>
              <p className="font-mono font-semibold text-lg">{os.nota_simples_number}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Data</p>
              <p className="font-medium">{os.nota_simples_date}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Série</p>
              <p className="font-medium">{serie}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {readOnly ? (
              <p className="text-sm text-muted-foreground">A nota simples será gerada pelo setor responsável pelo faturamento.</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Gere a nota simples para faturar esta OS. A numeração é automática
                  (série <span className="font-mono font-medium">{serie}</span> + sequencial).
                </p>
                <div className="flex items-end gap-3">
                  <div>
                    <Label className="text-xs">Data do Faturamento</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <Button onClick={generate} disabled={loading} className="gap-2">
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}{" "}
                    Gerar Nota Simples
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}