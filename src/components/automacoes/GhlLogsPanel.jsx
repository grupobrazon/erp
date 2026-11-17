import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/use-toast";
import { AlertTriangle, RefreshCw, Loader2, CheckCheck } from "lucide-react";

const ORIGENS = [
  { value: "todos", label: "Todas as origens" },
  { value: "pull", label: "Pull (sincronização)" },
  { value: "webhook", label: "Webhook" },
  { value: "vinculo", label: "Vínculo ambíguo" },
];

const ORIGEM_BADGE = {
  pull: { label: "Pull", className: "bg-blue-50 text-blue-700" },
  webhook: { label: "Webhook", className: "bg-amber-50 text-amber-700" },
  vinculo: { label: "Vínculo ambíguo", className: "bg-destructive/10 text-destructive" },
};

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export default function GhlLogsPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [origem, setOrigem] = useState("todos");
  const [syncing, setSyncing] = useState(false);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["ghl-logs", origem],
    queryFn: () =>
      origem === "todos"
        ? base44.entities.IntegracaoLog.list("-created_date", 100)
        : base44.entities.IntegracaoLog.filter({ origem }, "-created_date", 100),
  });

  const revisarMutation = useMutation({
    mutationFn: ({ id, revisado }) => base44.entities.IntegracaoLog.update(id, { revisado }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ghl-logs"] }),
  });

  const naoRevisados = useMemo(() => logs.filter((l) => !l.revisado).length, [logs]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const res = await base44.functions.invoke("pullGhlUpdates", {});
      const d = res.data || res;
      if (d?.error) {
        toast({ title: "Sincronização falhou", description: d.error, variant: "destructive" });
      } else {
        toast({
          title: "Sincronização concluída",
          description: `${d.matched || 0} clientes vinculados de ${d.contacts_fetched || 0} contatos.`,
        });
      }
      qc.invalidateQueries({ queryKey: ["ghl-logs"] });
    } catch (err) {
      toast({ title: "Erro na sincronização", description: err?.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Logs de Integração — GoHighLevel (CRM)
            </CardTitle>
            <CardDescription className="mt-1">
              Registra apenas falhas da integração (pull e webhook) para diagnóstico rápido.
              {naoRevisados > 0 && (
                <span className="text-destructive font-medium"> · {naoRevisados} não revisado(s)</span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={origem} onValueChange={setOrigem}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORIGENS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={syncNow} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sincronizar agora
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={CheckCheck}
            title="Nenhum erro registrado"
            description="A integração com o GHL não registrou falhas. Configure o Location ID nas Configurações e sincronize para começar."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left bg-muted/40">
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Data</th>
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Origem</th>
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Status</th>
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Mensagem</th>
                  <th className="px-3 py-2 font-semibold text-muted-foreground text-center">Revisado</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className={`border-b last:border-0 ${!l.revisado ? "bg-destructive/5" : ""}`}>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(l.created_date)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={(ORIGEM_BADGE[l.origem] || ORIGEM_BADGE.pull).className}
                      >
                        {(ORIGEM_BADGE[l.origem] || ORIGEM_BADGE.pull).label}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{l.status_http || "—"}</td>
                    <td className="px-3 py-2 max-w-[420px]">{l.mensagem}</td>
                    <td className="px-3 py-2 text-center">
                      <Checkbox
                        checked={!!l.revisado}
                        onCheckedChange={(v) => revisarMutation.mutate({ id: l.id, revisado: !!v })}
                        aria-label="Marcar como revisado"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}