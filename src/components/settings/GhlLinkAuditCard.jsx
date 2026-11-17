import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Link2Off, Loader2, Search, ShieldCheck, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const REASON_LABELS = {
  sem_contato: "Contato inexistente no Atlas",
  telefone_de_outro_cliente: "Telefone pertence a outro cliente",
  telefone_divergente: "Telefone não confere com o cadastro",
};

const REASON_STYLES = {
  sem_contato: "bg-red-50 text-red-700 border-red-200",
  telefone_de_outro_cliente: "bg-red-50 text-red-700 border-red-200",
  telefone_divergente: "bg-amber-50 text-amber-700 border-amber-200",
};

export default function GhlLinkAuditCard() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [progress, setProgress] = useState("");
  const [report, setReport] = useState(null);

  const runAudit = async () => {
    setRunning(true);
    setReport(null);
    const counts = {};
    let suspects = [];
    let checked = 0;
    let scanned = 0;
    let linkedClients = 0;
    let cursor = null;
    let done = false;
    let rounds = 0;
    try {
      while (!done && rounds < 15) {
        rounds += 1;
        setProgress(rounds === 1 ? "Lendo cadastros e contatos do Atlas…" : `Analisando contatos do Atlas… ${scanned.toLocaleString("pt-BR")} lidos`);
        const res = await base44.functions.invoke("auditGhlLinks", cursor ? { cursor } : {});
        const d = res.data || {};
        if (d.error) throw new Error(d.error);
        done = Boolean(d.done);
        cursor = d.cursor || null;
        scanned += Number(d.scanned || 0);
        checked += Number(d.checked || 0);
        linkedClients = d.linked_clients || linkedClients;
        for (const [key, value] of Object.entries(d.counts || {})) {
          counts[key] = (counts[key] || 0) + Number(value || 0);
        }
        suspects = suspects.concat(d.suspects || []);
        setReport({
          counts: { ...counts },
          suspects,
          checked,
          scanned,
          linkedClients,
          done: false,
        });
        if (!done && !cursor) break;
      }
      setReport({
        counts: { ...counts },
        suspects,
        checked,
        scanned,
        linkedClients,
        done,
      });
      if (!done) {
        toast({
          title: "Auditoria incompleta",
          description: "A leitura do Atlas não terminou. Execute a análise novamente para continuar.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({ title: "Erro na auditoria", description: err?.response?.data?.error || err?.message, variant: "destructive" });
    } finally {
      setProgress("");
      setRunning(false);
    }
  };

  const unlinkSuspects = async () => {
    const ids = (report?.suspects || []).map((item) => item.client_id).filter(Boolean);
    if (ids.length === 0) return;
    setFixing(true);
    let unlinked = 0;
    let kept = 0;
    let failed = 0;
    try {
      for (let i = 0; i < ids.length; i += 100) {
        const slice = ids.slice(i, i + 100);
        setProgress(`Desfazendo vínculos… ${Math.min(i + 100, ids.length)} de ${ids.length}`);
        const res = await base44.functions.invoke("fixGhlLinks", { client_ids: slice, confirm: true });
        const d = res.data || {};
        if (d.error) throw new Error(d.error);
        unlinked += Number(d.unlinked || 0);
        kept += Number(d.kept || 0);
        failed += Number(d.failed || 0);
      }
      toast({
        title: "Vínculos suspeitos desfeitos",
        description: `${unlinked} cliente(s) desvinculado(s)${kept ? ` · ${kept} mantido(s) por confirmação no telefone` : ""}${failed ? ` · ${failed} com erro` : ""}. Nenhum contato foi alterado no Atlas.`,
      });
      setReport(null);
    } catch (err) {
      toast({ title: "Erro ao desvincular", description: err?.response?.data?.error || err?.message, variant: "destructive" });
    } finally {
      setProgress("");
      setFixing(false);
    }
  };

  const totalSuspects = report ? report.checked - (report.counts.confirmado || 0) : 0;
  const busy = running || fixing;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Auditoria de Vínculos do CRM
        </CardTitle>
        <CardDescription>
          Confere cada cliente vinculado a um contato do Atlas. O vínculo só é mantido quando o telefone do contato confere com o
          cadastro do cliente; telefone de outro cliente, telefone divergente e contato inexistente são apontados como suspeitos.
          A análise não altera nada e o desvínculo nunca apaga nem edita contatos no Atlas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={runAudit} disabled={busy}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Analisar vínculos
          </Button>
          {report && totalSuspects > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={busy}>
                  {fixing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2Off className="h-4 w-4" />}
                  Desvincular {totalSuspects} suspeito(s)
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Desfazer {totalSuspects} vínculo(s) suspeito(s)?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O vínculo do ERP com o contato do Atlas será removido apenas nos casos apontados pela auditoria. Os contatos,
                    telefones e oportunidades continuam intactos no Atlas, e cada desvínculo fica registrado no log de integração
                    com o motivo e os telefones comparados.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={unlinkSuspects}>Desvincular</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {progress && <p className="text-xs text-muted-foreground">{progress}</p>}

        {report && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Contatos lidos</p>
                <p className="text-lg font-semibold">{report.scanned.toLocaleString("pt-BR")}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Vínculos analisados</p>
                <p className="text-lg font-semibold">{report.checked.toLocaleString("pt-BR")}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Confirmados</p>
                <p className="text-lg font-semibold text-emerald-600">{(report.counts.confirmado || 0).toLocaleString("pt-BR")}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Suspeitos</p>
                <p className="text-lg font-semibold text-red-600">{totalSuspects.toLocaleString("pt-BR")}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {Object.entries(REASON_LABELS).map(([key, label]) => (
                <Badge key={key} variant="outline" className={report.counts[key] ? REASON_STYLES[key] : "text-muted-foreground"}>
                  {label}: {report.counts[key] || 0}
                </Badge>
              ))}
            </div>

            {report.suspects.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Casos apontados
                </div>
                <div className="max-h-72 overflow-y-auto rounded-lg border divide-y">
                  {report.suspects.slice(0, 150).map((item, index) => (
                    <div key={`${item.client_id}-${index}`} className="p-3 space-y-1 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">
                          {item.client_name || "—"}
                          {item.client_code ? <span className="text-muted-foreground font-normal"> · {item.client_code}</span> : null}
                        </span>
                        <Badge variant="outline" className={REASON_STYLES[item.reason]}>
                          {REASON_LABELS[item.reason] || item.reason}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Contato no Atlas: {item.contact_name || "—"} {item.contact_id ? `(${item.contact_id})` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Telefone do cadastro: {item.client_phones?.join(", ") || "—"} · no contato: {item.contact_phones?.join(", ") || "—"}
                      </p>
                      {item.outros?.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Telefone também usado por: {item.outros.map((o) => o.name || o.code).join(", ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                {report.suspects.length > 150 && (
                  <p className="text-xs text-muted-foreground">Mostrando os primeiros 150 casos. Todos os {report.suspects.length} apontados serão desvinculados.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-emerald-600">
                {report.done ? "Nenhum vínculo suspeito encontrado." : "Nenhum caso apontado até aqui."}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}