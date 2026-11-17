import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  FileCheck2, Send, Loader2, Save, CheckCircle2, RefreshCw, ChevronDown, ChevronUp, Download,
  XCircle, Pencil, AlertCircle,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseNfeError } from "@/lib/nfeErrorHandler";
import CceHistory from "@/components/faturamento/CceHistory";

export default function NFeSection({ os, sale, setting, onUpdated, readOnly }) {
  const { toast } = useToast();
  const safeStr = (v) => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.map((e) => e?.mensagem || e?.campo || JSON.stringify(e)).join("; ");
    if (typeof v === "object") return v.mensagem || v.error || JSON.stringify(v);
    return String(v);
  };
  const today = new Date().toISOString().slice(0, 10);
  const isNFe = os.invoice_type === "Nota Fiscal";
  const [transmitting, setTransmitting] = useState(false);
  const [consulting, setConsulting] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [number, setNumber] = useState(isNFe ? os.invoice_number || "" : "");
  const [date, setDate] = useState(isNFe ? os.invoice_date || today : today);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [selectedCfop, setSelectedCfop] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionText, setCorrectionText] = useState("");
  const [sendingCce, setSendingCce] = useState(false);

  const { data: cfops = [] } = useQuery({
    queryKey: ["cfops"],
    queryFn: () => base44.entities.Cfop.list("-created_date", 100),
  });
  const isBonificacaoSale = (sale?.payments || []).some((p) => p.payment_type === "Bonificação");
  const cfopCategoriaDesejada = isBonificacaoSale ? "Remessa" : "Venda";
  const defaultCfop = cfops.find((c) => c.categoria === cfopCategoriaDesejada)?.code || cfops[0]?.code || "";
  const cfopValue = selectedCfop || defaultCfop;
  const availableCfops = isBonificacaoSale ? cfops.filter((c) => c.categoria !== "Venda") : cfops;

  const isManual = isNFe && os.invoice_number && !os.nfe_chave && !os.nfe_ref;
  const isCancelled = os.nfe_cancelled;
  const isAutorizada = !isCancelled && (os.nfe_status === "autorizado" || (!!os.nfe_chave));
  const isProcessando = os.nfe_status === "processando";
  const canManageNFe = !isManual && !!os.nfe_ref;

  // Validar frete antes da transmissão (evita rejeição da SEFAZ)
  const isEnvio = sale?.delivery_modality === "Envio";
  const freightExempt = sale?.freight_exempt;
  const freightValue = Number(sale?.freight) || 0;
  const freightValid = !sale || !isEnvio || freightExempt || (sale.quote_completed && freightValue > 0);
  const freightBlockReason = !freightValid
    ? (!sale?.quote_completed
      ? "Cotação de frete não realizada no pedido. Complete a cotação antes de transmitir a NF-e."
      : "Frete não informado no pedido. Informe o valor do frete antes de transmitir a NF-e.")
    : null;

  const transmit = async () => {
    setTransmitting(true);
    try {
      const res = await base44.functions.invoke("emitNFe", { os_id: os.id, cfop: cfopValue });
      const d = res.data;
      if (d.status === "autorizado") {
        toast({ title: "NF-e autorizada pela SEFAZ", description: `Nº ${d.invoice_number} • Série ${d.nfe_serie}` });
      } else if (d.status === "processando") {
        toast({ title: "NF-e em processamento", description: "Consulte o status em instantes." });
      } else {
        toast({ title: "Erro na transmissão", description: safeStr(d.error) || "Verifique os dados", variant: "destructive" });
      }
      onUpdated();
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
      const res = await base44.functions.invoke("consultNFe", { os_id: os.id });
      const d = res.data;
      if (d.status === "autorizado") {
        toast({ title: "NF-e autorizada", description: `Nº ${d.invoice_number}` });
      } else {
        toast({ title: "Ainda em processamento", description: "Tente novamente em alguns segundos." });
      }
      onUpdated();
    } catch (err) {
      toast({ title: "Erro na consulta", description: safeStr(err?.message), variant: "destructive" });
    } finally {
      setConsulting(false);
    }
  };

  // Processamento automático: enquanto a NF-e estiver em processamento na SEFAZ,
  // consulta o status sozinho até autorizar/rejeitar (sem precisar clicar no botão).
  useEffect(() => {
    if (!isProcessando) return;
    let cancelled = false;
    let timer = null;
    let tries = 0;
    const tick = async () => {
      if (cancelled) return;
      tries += 1;
      try {
        const res = await base44.functions.invoke("consultNFe", { os_id: os.id });
        const d = res.data || {};
        if (cancelled) return;
        if (d.status === "autorizado") {
          toast({ title: "NF-e autorizada pela SEFAZ", description: `Nº ${d.invoice_number}` });
          onUpdated();
          return;
        }
        if (d.status && d.status !== "processando") {
          toast({ title: "NF-e com problema na SEFAZ", description: safeStr(d.nfe_mensagem_sefaz) || d.status, variant: "destructive" });
          onUpdated();
          return;
        }
      } catch { /* tenta novamente */ }
      if (!cancelled && tries < 10) timer = setTimeout(tick, 6000);
    };
    timer = setTimeout(tick, 4000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isProcessando, os.id]);

  const downloadDanfe = async () => {
    setDownloading(true);
    try {
      const res = await base44.functions.invoke("downloadDanfe", { os_id: os.id });
      const { pdf_base64, filename } = res.data;
      const byteChars = atob(pdf_base64);
      const byteNumbers = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteNumbers], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: "Erro ao baixar DANFE", description: safeStr(err?.response?.data?.error || err?.message), variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const doCancel = async () => {
    if (cancelReason.length < 15) { toast({ title: "Justificativa deve ter no mínimo 15 caracteres", variant: "destructive" }); return; }
    setCancelling(true);
    try {
      const res = await base44.functions.invoke("cancelNFe", { ref: os.nfe_ref, justificativa: cancelReason, source: "os", entity_id: os.id });
      const d = res.data;
      if (d.status === "cancelado") {
        toast({ title: "NF-e cancelada na SEFAZ" });
      } else {
        toast({ title: "Cancelamento em processamento", description: "Consulte novamente em instantes." });
      }
      setShowCancel(false); setCancelReason("");
      onUpdated();
    } catch (err) {
      toast({ title: "Erro ao cancelar NF-e", description: safeStr(err?.response?.data?.error || err?.message), variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  const sendCce = async () => {
    if (correctionText.length < 15) { toast({ title: "Correção deve ter no mínimo 15 caracteres", variant: "destructive" }); return; }
    setSendingCce(true);
    try {
      const res = await base44.functions.invoke("emitCorrectionLetter", { ref: os.nfe_ref, correcao: correctionText, source: "os", entity_id: os.id });
      const d = res.data;
      if (d.status === "processado") {
        toast({ title: "Carta de correção processada", description: d.cce?.protocol || "" });
      } else {
        toast({ title: "CC-e em processamento" });
      }
      setShowCorrection(false); setCorrectionText("");
      onUpdated();
    } catch (err) {
      toast({ title: "Erro na carta de correção", description: safeStr(err?.response?.data?.error || err?.message), variant: "destructive" });
    } finally {
      setSendingCce(false);
    }
  };

  const saveManual = async () => {
    if (!number) { toast({ title: "Informe o número da NF-e", variant: "destructive" }); return; }
    setSaving(true);
    try {
      // Se a OS estava aguardando faturamento final, conclui a OS (a cascata finaliza a venda)
      const wasAwaitingFinal = os.status === "Aguardando Faturamento Final";
      const updates = {
        invoice_type: "Nota Fiscal",
        invoice_number: number,
        invoice_date: date,
        nfe_transmitted: true,
        nfe_status: "autorizado",
        invoiced: true,
      };
      if (wasAwaitingFinal) {
        updates.status = "Concluída";
      }
      // Usa updateOsStatus para que a cascata da venda seja processada
      await base44.functions.invoke("updateOsStatus", {
        os_id: os.id,
        updates,
        expected_status: null,
        source: "Faturamento — NF-e manual",
      });
      toast({
        title: "NF-e registrada manualmente",
        description: wasAwaitingFinal ? "OS e pedido concluídos automaticamente." : undefined,
      });
      onUpdated();
    } catch (err) {
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCheck2 className="h-5 w-5 text-primary" /> Nota Fiscal (NF-e) — Focus NFe
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isCancelled ? (
          <div className="space-y-3">
            <Badge variant="outline" className="bg-red-50 text-red-700 gap-1">
              <XCircle className="h-3 w-3" /> NF-e Cancelada
            </Badge>
            <p className="text-xs text-muted-foreground">Justificativa: {os.nfe_cancel_reason}</p>
            {os.invoice_number && <p className="text-sm">NF-e Nº {os.invoice_number} • Série {os.nfe_serie}</p>}
          </div>
        ) : isAutorizada ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 gap-1">
                <CheckCircle2 className="h-3 w-3" /> {isManual ? "Registrada manualmente" : "Autorizada pela SEFAZ"}
              </Badge>
              {os.nfe_serie && <Badge variant="secondary">Série {os.nfe_serie}</Badge>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Número</p>
                <p className="font-mono font-semibold">{os.invoice_number || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Data</p>
                <p className="font-medium">{os.invoice_date || "—"}</p>
              </div>
              {os.nfe_chave && (
                <div className="col-span-2 md:col-span-1">
                  <p className="text-xs text-muted-foreground">Chave de Acesso</p>
                  <p className="font-mono text-xs break-all">{os.nfe_chave}</p>
                </div>
              )}
            </div>
            {os.nfe_mensagem_sefaz && (
              <p className="text-xs text-muted-foreground italic">{safeStr(os.nfe_mensagem_sefaz)}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {os.nfe_danfe_url && !isManual && (
                <Button onClick={downloadDanfe} disabled={downloading} variant="outline" className="gap-2">
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Baixar DANFE (PDF)
                </Button>
              )}
              {canManageNFe && !readOnly && (
                <Button onClick={() => setShowCorrection((v) => !v)} variant="outline" className="gap-2">
                  <Pencil className="h-4 w-4" /> Carta de Correção
                </Button>
              )}
              {canManageNFe && !readOnly && (
                <Button onClick={() => setShowCancel((v) => !v)} variant="destructive" className="gap-2">
                  <XCircle className="h-4 w-4" /> Cancelar NF-e
                </Button>
              )}
            </div>

            {showCorrection && canManageNFe && (
              <div className="space-y-3 border-t pt-3">
                <Label className="text-xs">Texto da Correção (15–1000 caracteres)</Label>
                <Textarea value={correctionText} onChange={(e) => setCorrectionText(e.target.value)} rows={4} placeholder="Descreva a correção a ser aplicada na NF-e..." maxLength={1000} />
                <p className="text-xs text-muted-foreground">{correctionText.length}/1000</p>
                <Button onClick={sendCce} disabled={sendingCce} size="sm" className="gap-2">
                  {sendingCce ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Enviar Carta de Correção
                </Button>
              </div>
            )}

            {showCancel && canManageNFe && (
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
            <Badge variant="outline" className="bg-amber-50 text-amber-700 gap-1">
              <RefreshCw className="h-3 w-3" /> Em processamento na SEFAZ
            </Badge>
            <p className="text-sm text-muted-foreground">
              A NF-e foi enviada e está sendo processada. O sistema consulta o status automaticamente a cada poucos segundos.
            </p>
            <Button onClick={consult} disabled={consulting} variant="outline" className="gap-2">
              {consulting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Consultar Status
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {os.nfe_mensagem_sefaz && os.nfe_status && os.nfe_status !== "autorizado" && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-1">
                <div className="flex items-center gap-2 text-red-700 font-medium text-sm">
                  <XCircle className="h-4 w-4" /> Rejeição da SEFAZ
                </div>
                <p className="text-sm text-red-600">{safeStr(os.nfe_mensagem_sefaz)}</p>
                {os.nfe_status && os.nfe_status !== "processando" && (
                  <p className="text-xs text-red-500">Status: {os.nfe_status}</p>
                )}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Transmita a NF-e direto para a SEFAZ via Focus NFe. A numeração e série são geradas
              automaticamente. O certificado digital e o emitente ({setting?.nfe_provider || "Focus NFe"}) já estão cadastrados no provedor.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">CFOP da operação</Label>
              <Select value={cfopValue} onValueChange={setSelectedCfop}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o CFOP" />
                </SelectTrigger>
                <SelectContent>
                  {availableCfops.map((c) => (
                    <SelectItem key={c.id} value={c.code}>
                      {c.code} — {c.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Versão interna/interestadual ajustada automaticamente pelo estado do destinatário.
              </p>
              {isBonificacaoSale && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Venda de bonificação: a NF-e usa CFOP de remessa (não de venda).
                </p>
              )}
            </div>
            {freightBlockReason && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-1">
                <div className="flex items-center gap-2 text-amber-700 font-medium text-sm">
                  <AlertCircle className="h-4 w-4" /> Frete pendente no pedido
                </div>
                <p className="text-sm text-amber-600">{freightBlockReason}</p>
              </div>
            )}
            <Button onClick={transmit} disabled={transmitting || !cfopValue || readOnly || !freightValid} className="gap-2">
              {transmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Transmitir NF-e
            </Button>

            <div className="border-t pt-3">
              <button
                onClick={() => setShowManual((v) => !v)}
                disabled={readOnly}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {showManual ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Registrar NF-e manualmente (emitida no ERLOCA)
              </button>
              {showManual && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Número da NF-e</Label>
                      <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Ex: 000.002.303" />
                    </div>
                    <div>
                      <Label className="text-xs">Data</Label>
                      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    </div>
                  </div>
                  <Button onClick={saveManual} disabled={saving || readOnly} variant="outline" size="sm" className="gap-2">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Salvar registro manual
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        <CceHistory source="os" entityId={os.id} history={os.nfe_cce_history} />
      </CardContent>
    </Card>
  );
}