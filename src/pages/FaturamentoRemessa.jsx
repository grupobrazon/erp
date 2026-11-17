import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Send, Loader2, RefreshCw, Download, CheckCircle2,
  XCircle, Pencil, ChevronDown, ChevronUp, FileText,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { usePermissions } from "@/lib/permissions";
import { parseNfeError } from "@/lib/nfeErrorHandler";
import CceHistory from "@/components/faturamento/CceHistory";

const fmtMoney = (v) => `R$ ${(v || 0).toFixed(2)}`;

export default function FaturamentoRemessa() {
  const { remessaId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canBill } = usePermissions();
  const readOnly = !canBill;

  const [transmitting, setTransmitting] = useState(false);
  const [consulting, setConsulting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionText, setCorrectionText] = useState("");
  const [sendingCce, setSendingCce] = useState(false);
  const [emittingNotaSimples, setEmittingNotaSimples] = useState(false);

  const { data: remessa, isLoading } = useQuery({
    queryKey: ["remessa", remessaId],
    queryFn: () => base44.entities.Remessa.get(remessaId),
    enabled: !!remessaId,
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSetting.list("-created_date", 1),
  });
  const setting = settings[0];

  const reload = () => queryClient.invalidateQueries({ queryKey: ["remessa", remessaId] });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }
  if (!remessa) {
    return <EmptyState title="Remessa não encontrada" description="A remessa não foi localizada." />;
  }

  const isAutorizada = remessa.nfe_status === "autorizado" || (!!remessa.nfe_chave);
  const isProcessando = remessa.nfe_status === "processando";
  const isCancelled = remessa.nfe_cancelled;
  // A transmissão depende da aprovação financeira (registrada em financial_approved_by), não do
  // rótulo de status: uma remessa pode ter sido marcada como "Faturada" por uma tentativa
  // assíncrona que a SEFAZ depois rejeitou, e ainda assim precisa ser retransmitida.
  const financiallyApproved =
    !!remessa.financial_approved_by || ["Aprovada Financeiro", "Faturada"].includes(remessa.status);

  const transmit = async () => {
    setTransmitting(true);
    try {
      const res = await base44.functions.invoke("emitNFe", { remessa_id: remessa.id });
      const d = res.data;
      if (d.status === "autorizado") {
        toast({ title: "NF-e autorizada pela SEFAZ", description: `Nº ${d.invoice_number} • Série ${d.nfe_serie}` });
      } else if (d.status === "processando") {
        toast({ title: "NF-e em processamento", description: "Consulte o status em instantes." });
      } else {
        toast({ title: "Erro na transmissão", description: JSON.stringify(d.error) || "Verifique os dados", variant: "destructive" });
      }
      reload();
    } catch (err) {
      const e = parseNfeError(err);
      toast({ title: e.title, description: e.description, variant: "destructive" });
    } finally {
      setTransmitting(false);
    }
  };

  const consult = async () => {
    setConsulting(true);
    try {
      const res = await base44.functions.invoke("consultNFe", { remessa_id: remessa.id });
      const d = res.data;
      if (d.status === "autorizado") {
        toast({ title: "NF-e autorizada", description: `Nº ${d.invoice_number}` });
      } else {
        toast({ title: "Ainda em processamento", description: "Tente novamente em alguns segundos." });
      }
      reload();
    } catch (err) {
      toast({ title: "Erro na consulta", description: err?.message, variant: "destructive" });
    } finally {
      setConsulting(false);
    }
  };

  const downloadDanfe = async () => {
    setDownloading(true);
    try {
      const res = await base44.functions.invoke("downloadDanfe", { remessa_id: remessa.id });
      const { pdf_base64, filename } = res.data;
      const byteChars = atob(pdf_base64);
      const byteNumbers = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteNumbers], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: "Erro ao baixar DANFE", description: err?.response?.data?.error || err?.message, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const doCancel = async () => {
    if (cancelReason.length < 15) { toast({ title: "Justificativa deve ter no mínimo 15 caracteres", variant: "destructive" }); return; }
    setCancelling(true);
    try {
      const res = await base44.functions.invoke("cancelNFe", { ref: remessa.nfe_ref, justificativa: cancelReason, source: "remessa", entity_id: remessa.id });
      const d = res.data;
      if (d.status === "cancelado") {
        toast({ title: "NF-e cancelada na SEFAZ" });
      } else {
        toast({ title: "Cancelamento em processamento", description: "Consulte novamente em instantes." });
      }
      setShowCancel(false); setCancelReason("");
      reload();
    } catch (err) {
      toast({ title: "Erro ao cancelar NF-e", description: err?.response?.data?.error || err?.message, variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  const sendCce = async () => {
    if (correctionText.length < 15) { toast({ title: "Correção deve ter no mínimo 15 caracteres", variant: "destructive" }); return; }
    setSendingCce(true);
    try {
      const res = await base44.functions.invoke("emitCorrectionLetter", { ref: remessa.nfe_ref, correcao: correctionText, source: "remessa", entity_id: remessa.id });
      const d = res.data;
      if (d.status === "processado") {
        toast({ title: "Carta de correção processada", description: d.cce?.protocol || "" });
      } else {
        toast({ title: "CC-e em processamento" });
      }
      setShowCorrection(false); setCorrectionText("");
      reload();
    } catch (err) {
      toast({ title: "Erro na carta de correção", description: err?.response?.data?.error || err?.message, variant: "destructive" });
    } finally {
      setSendingCce(false);
    }
  };

  const emitNotaSimples = async () => {
    setEmittingNotaSimples(true);
    try {
      const res = await base44.functions.invoke("emitNotaSimplesRemessa", { remessa_id: remessa.id });
      toast({ title: "Nota Simples emitida", description: `Nº ${res.data.nota_simples_number}` });
      reload();
    } catch (err) {
      toast({ title: "Erro ao emitir Nota Simples", description: err?.response?.data?.error || err?.message, variant: "destructive" });
    } finally {
      setEmittingNotaSimples(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={`Faturamento — ${remessa.code || "Remessa"}`}
        description={`${remessa.remessa_type} • ${remessa.natureza_operacao || ""}`}
      >
        <Button variant="outline" onClick={() => navigate("/remessas")} className="gap-2"><ArrowLeft className="h-4 w-4" /> Voltar</Button>
      </PageHeader>

      <Card className="mb-6">
        <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><p className="text-xs text-muted-foreground">Cliente</p><p className="font-medium">{remessa.client_name || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Data</p><p className="font-medium">{remessa.date || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Valor</p><p className="font-medium">{fmtMoney(remessa.grand_total)}</p></div>
          <div><p className="text-xs text-muted-foreground mb-1">Status</p><Badge variant="outline" className={remessa.status === "Faturada" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}>{remessa.status}</Badge></div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-sm">Itens da Remessa</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr><th className="text-left p-2">Produto</th><th className="text-right p-2">Qtd</th><th className="text-right p-2">V. Unit.</th><th className="text-right p-2">Total</th></tr></thead>
            <tbody>
              {(remessa.items || []).map((it, i) => (
                <tr key={i} className="border-t"><td className="p-2">{it.product_name}</td><td className="p-2 text-right">{it.quantity}</td><td className="p-2 text-right">{fmtMoney(it.unit_price)}</td><td className="p-2 text-right font-medium">{fmtMoney(it.total)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="text-right mt-2"><Badge variant="secondary">Total: {fmtMoney(remessa.grand_total)}</Badge></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary" /> Nota Fiscal (NF-e) — Focus NFe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isCancelled ? (
            <div className="space-y-3">
              <Badge variant="outline" className="bg-red-50 text-red-700 gap-1"><XCircle className="h-3 w-3" /> NF-e Cancelada</Badge>
              <p className="text-xs text-muted-foreground">Justificativa: {remessa.nfe_cancel_reason}</p>
              {remessa.invoice_number && <p className="text-sm">NF-e Nº {remessa.invoice_number} • Série {remessa.nfe_serie}</p>}
            </div>
          ) : isAutorizada ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 gap-1"><CheckCircle2 className="h-3 w-3" /> Autorizada pela SEFAZ</Badge>
                {remessa.nfe_serie && <Badge variant="secondary">Série {remessa.nfe_serie}</Badge>}
                <Badge variant="secondary">{remessa.cfop_code}</Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div><p className="text-xs text-muted-foreground">Número</p><p className="font-mono font-semibold">{remessa.invoice_number || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Data</p><p className="font-medium">{remessa.invoice_date || "—"}</p></div>
                {remessa.nfe_chave && <div className="col-span-2 md:col-span-1"><p className="text-xs text-muted-foreground">Chave de Acesso</p><p className="font-mono text-xs break-all">{remessa.nfe_chave}</p></div>}
              </div>
              {remessa.nfe_mensagem_sefaz && <p className="text-xs text-muted-foreground italic">{remessa.nfe_mensagem_sefaz}</p>}

              <div className="flex flex-wrap gap-2">
                <Button onClick={downloadDanfe} disabled={downloading} variant="outline" className="gap-2">
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Baixar DANFE
                </Button>
                {!readOnly && (
                  <Button onClick={() => setShowCorrection((v) => !v)} variant="outline" className="gap-2">
                    <Pencil className="h-4 w-4" /> Carta de Correção
                  </Button>
                )}
                {!readOnly && (
                  <Button onClick={() => setShowCancel((v) => !v)} variant="destructive" className="gap-2">
                    <XCircle className="h-4 w-4" /> Cancelar NF-e
                  </Button>
                )}
              </div>

              {showCorrection && !readOnly && (
                <div className="space-y-3 border-t pt-3">
                  <Label className="text-xs">Texto da Correção (15–1000 caracteres)</Label>
                  <Textarea value={correctionText} onChange={(e) => setCorrectionText(e.target.value)} rows={4} placeholder="Descreva a correção a ser aplicada na NF-e..." maxLength={1000} />
                  <p className="text-xs text-muted-foreground">{correctionText.length}/1000</p>
                  <Button onClick={sendCce} disabled={sendingCce} size="sm" className="gap-2">
                    {sendingCce ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Enviar Carta de Correção
                  </Button>
                </div>
              )}

              {showCancel && !readOnly && (
                <div className="space-y-3 border-t pt-3">
                  <Label className="text-xs">Justificativa do Cancelamento (mín. 15 caracteres)</Label>
                  <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} placeholder="Descreva o motivo do cancelamento..." />
                  <Button onClick={doCancel} disabled={cancelling} variant="destructive" size="sm" className="gap-2">
                    {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />} Confirmar Cancelamento
                  </Button>
                </div>
              )}

            </div>
          ) : isProcessando ? (
            <div className="space-y-3">
              <Badge variant="outline" className="bg-amber-50 text-amber-700 gap-1"><RefreshCw className="h-3 w-3" /> Em processamento na SEFAZ</Badge>
              <Button onClick={consult} disabled={consulting} variant="outline" className="gap-2">
                {consulting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Consultar Status
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Transmita a NF-e de {remessa.remessa_type.toLowerCase()} direto para a SEFAZ via Focus NFe.
                CFOP: <span className="font-mono font-medium">{remessa.cfop_code}</span> • Natureza: {remessa.natureza_operacao}
              </p>
              {readOnly ? (
                <p className="text-xs text-muted-foreground italic">A transmissão da NF-e é realizada pelo setor responsável pelo faturamento.</p>
              ) : (
                <Button onClick={transmit} disabled={transmitting || !financiallyApproved || !!remessa.nota_simples_number} className="gap-2">
                  {transmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Transmitir NF-e
                </Button>
              )}
              {remessa.nota_simples_number && (
                <p className="text-xs text-muted-foreground italic">Esta remessa foi faturada com Nota Simples — não é possível transmitir NF-e.</p>
              )}
              {!financiallyApproved && !remessa.nota_simples_number && (
                <p className="text-xs text-amber-600">A remessa precisa estar aprovada pelo financeiro para transmitir a NF-e.</p>
              )}
            </div>
          )}

          <CceHistory source="remessa" entityId={remessa.id} history={remessa.nfe_cce_history} />
        </CardContent>
      </Card>

      {!isAutorizada && !remessa.nota_simples_number && financiallyApproved && !readOnly && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Nota Simples (Não Fiscal)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Emita uma Nota Simples para esta remessa sem transmissão fiscal (sem NF-e na SEFAZ).
              Útil para operações que não exigem documento fiscal eletrônico.
            </p>
            <Button onClick={emitNotaSimples} disabled={emittingNotaSimples} variant="outline" className="gap-2">
              {emittingNotaSimples ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Emitir Nota Simples
            </Button>
          </CardContent>
        </Card>
      )}

      {remessa.nota_simples_number && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Nota Simples Emitida</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-xs text-muted-foreground">Número</p><p className="font-mono font-semibold">{remessa.nota_simples_number}</p></div>
              <div><p className="text-xs text-muted-foreground">Data</p><p className="font-medium">{remessa.nota_simples_date || "—"}</p></div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}