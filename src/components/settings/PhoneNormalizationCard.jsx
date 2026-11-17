import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

export default function PhoneNormalizationCard() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleRun = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke("normalizePhones", {});
      setResult(res.data);
      toast({ title: "Normalização concluída", description: `${res.data.phonesNormalized} telefones padronizados, ${res.data.whatsappFlagsSet} flags de WhatsApp atualizadas.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Erro na normalização", description: err?.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-primary" />
          Parametrização de Telefones
        </CardTitle>
        <CardDescription>
          Padroniza o formato de todos os telefones cadastrados (clientes e contatos) para o padrão (DD) XXXXX-XXXX e classifica automaticamente quais são WhatsApp (celular) vs fixo usando regras de telefonia brasileira.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 mt-0.5 text-accent shrink-0" />
          <span>
            O sistema percorre todos os números, classifica cada um como <strong>celular</strong> (com WhatsApp) ou <strong>fixo</strong> (sem WhatsApp) usando regras de telefonia brasileira — 11 dígitos = celular, 10 dígitos com 3º dígito 2-5 = fixo — e marca automaticamente o flag de WhatsApp em cada telefone do cliente.
          </span>
        </div>
        {result && (
          <div className="rounded-md border bg-muted/40 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-green-600">
              <CheckCircle2 className="h-4 w-4" /> Normalização concluída
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Clientes processados</span><Badge variant="secondary">{result.clientsProcessed}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Contatos processados</span><Badge variant="secondary">{result.contactsProcessed}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Clientes atualizados</span><Badge variant="secondary">{result.clientsUpdated}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Contatos atualizados</span><Badge variant="secondary">{result.contactsUpdated}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Formatos padronizados</span><Badge variant="secondary">{result.phonesNormalized}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Flags WhatsApp ajustadas</span><Badge variant="secondary">{result.whatsappFlagsSet}</Badge></div>
              <div className="flex justify-between col-span-2"><span className="text-muted-foreground">Números classificados</span><Badge>{result.numbersClassified}</Badge></div>
            </div>
          </div>
        )}
        <Button onClick={handleRun} disabled={loading} className="w-full gap-2">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Processando com IA...</> : <><Sparkles className="h-4 w-4" /> Normalizar e Classificar Telefones</>}
        </Button>
      </CardContent>
    </Card>
  );
}