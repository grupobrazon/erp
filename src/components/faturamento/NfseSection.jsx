import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Send, Loader2, CheckCircle2, RefreshCw, Download, XCircle, Wrench,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

const fmtMoney = (v) => `R$ ${(v || 0).toFixed(2)}`;
const safeStr = (v) => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((e) => e?.mensagem || e?.campo || JSON.stringify(e)).join("; ");
  if (typeof v === "object") return v.mensagem || v.error || JSON.stringify(v);
  return String(v);
};

export default function NfseSection({ os, sale, onUpdated, readOnly }) {
  const { toast } = useToast();
  const [transmitting, setTransmitting] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [consulting, setConsulting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const services = (sale && sale.services) ? sale.services : [];
  const totalServices = (sale && sale.total_services) || services.reduce((sum, s) => sum + (s.total || 0), 0);

  const isAutorizada = !os.nfse_cancelada && (os.nfse_status === "autorizado" || (!!os.nfse_numero));
  const isProcessando = os.nfse_status === "processando";
  const isCancelled = os.nfse_cancelada;
  const canCancel = !readOnly && !!os.nfse_ref && !isCancelled;

  const transmit = async () => {
    setTransmitting(true);
    try {
      const res = await base44.functions.invoke("emitNFSe", { os_id: os.id });
      const d = res.data;
      if (d.status === "autorizado") {
        toast({ title: "NFS-e autorizada", description: `Nº ${d.nfse_numero}` });
      } else if (d.status === "processando") {
        toast({ title: "NFS-e em processamento", description: "Consulte o status em instantes." });
      } else {
        toast({ title: "Erro na transmissão da NFS-e", description: safeStr(d.error) || "Verifique os dados", variant: "destructive" });
      }
      onUpdated();
    } catch (err) {
      toast({ title: "Erro ao transmitir NFS-e", description: safeStr(err?.response?.data?.error || err?.message), variant: "destructive" });
    } finally {
      setTransmitting(false);
    }
  };

  const consultStatus = async () => {
    setConsulting(true);
    try {
      const res = await base44.functions.invoke("consultNFSe", { os_id: os.id });
      const d = res.data;
      if (d.status === "autorizado") {
        toast({ title: "NFS-e autorizada", description: `Nº ${d.nfse_numero}` });
      } else if (d.status === "cancelado") {
        toast({ title: "NFS-e cancelada" });
      } else if (d.status === "erro") {
        toast({ title: "NFS-e rejeitada", description: safeStr(d.nfse_mensagem_sefaz), variant: "destructive" });
      } else {
        toast({ title: "NFS-e ainda em processamento", description: "Tente novamente em instantes." });
      }
      onUpdated();
    } catch (err) {
      toast({ title: "Erro ao consultar NFS-e", description: safeStr(err?.response?.data?.error || err?.message), variant: "destructive" });
    } finally {
      setConsulting(false);
    }
  };

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await base44.functions.invoke("downloadNfsePdf", { os_id: os.id });
      const d = res.data;
      if (d.base64) {
        const binary = atob(d.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = d.filename || `NFS-e_${os.code || os.id}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        toast({ title: "Erro ao baixar PDF", description: safeStr(d.error) || "Resposta inválida", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Erro ao baixar PDF", description: safeStr(err?.response?.data?.error || err?.message), variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const doCancel = async () => {
    if (cancelReason.length < 15) {
      toast({ title: "Justificativa deve ter no mínimo 15 caracteres", variant: "destructive" });
      return;
    }
    setCancelling(true);
    try {
      const res = await base44.functions.invoke("cancelNFSe", {
        ref: os.nfse_ref,
        justificativa: cancelReason,
        entity_id: os.id,
      });
      const d = res.data;
      if (d.status === "cancelado") {
        toast({ title: "NFS-e cancelada" });
      } else {
        toast({ title: "Cancelamento em processamento", description: "Consulte novamente em instantes." });
      }
      setShowCancel(false);
      setCancelReason("");
      onUpdated();
    } catch (err) {
      toast({ title: "Erro ao cancelar NFS-e", description: safeStr(err?.response?.data?.error || err?.message), variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Card className="border-t-4 border-t-accent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-accent" /> Nota Fiscal de Serviço (NFS-e) — Focus NFe
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-accent/30 bg-accent/5 p-3 space-y-1">
          <p className="text-xs text-muted-foreground">Serviços do pedido (LC 116/2003)</p>
          <div className="space-y-1">
            {services.map((s, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{s.quantity}x {s.service_name}{s.code ? ` · ${s.code}` : ""}</span>
                <span className="font-medium">{fmtMoney(s.total)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm font-semibold border-t pt-1 mt-1">
            <span>Total de Serviços</span>
            <span>{fmtMoney(totalServices)}</span>
          </div>
        </div>

        {isCancelled ? (
          <div className="space-y-2">
            <Badge variant="outline" className="bg-red-50 text-red-700 gap-1">
              <XCircle className="h-3 w-3" /> NFS-e Cancelada
            </Badge>
            {os.nfse_numero && <p className="text-sm">NFS-e Nº {os.nfse_numero}</p>}
            <p className="text-xs text-muted-foreground">{os.nfse_cancel_reason}</p>
          </div>
        ) : isAutorizada ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 gap-1">
                <CheckCircle2 className="h-3 w-3" /> NFS-e Autorizada
              </Badge>
              {os.nfse_numero && <span className="text-sm font-medium">Nº {os.nfse_numero}</span>}
              {os.nfse_data && <span className="text-xs text-muted-foreground">{os.nfse_data}</span>}
            </div>
            {os.nfse_codigo_verificacao && (
              <div>
                <p className="text-xs text-muted-foreground">Código de Verificação</p>
                <p className="font-mono text-xs break-all">{os.nfse_codigo_verificacao}</p>
              </div>
            )}
            {os.nfse_mensagem_sefaz && (
              <p className="text-xs text-muted-foreground italic">{safeStr(os.nfse_mensagem_sefaz)}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={downloadPdf} disabled={downloading} variant="outline" className="gap-2">
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Baixar NFS-e (PDF)
              </Button>
              {canCancel && (
                <Button onClick={() => setShowCancel((v) => !v)} variant="destructive" className="gap-2">
                  <XCircle className="h-4 w-4" /> Cancelar NFS-e
                </Button>
              )}
            </div>

            {showCancel && canCancel && (
              <div className="space-y-3 border-t pt-3">
                <Label className="text-xs">Justificativa do Cancelamento (mín. 15 caracteres)</Label>
                <Textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  placeholder="Descreva o motivo do cancelamento da NFS-e..."
                />
                <Button onClick={doCancel} disabled={cancelling} variant="destructive" size="sm" className="gap-2">
                  {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />} Confirmar Cancelamento
                </Button>
              </div>
            )}
          </div>
        ) : isProcessando ? (
          <div className="space-y-3">
            <Badge variant="outline" className="bg-amber-50 text-amber-700 gap-1">
              <RefreshCw className="h-3 w-3" /> Em processamento
            </Badge>
            <p className="text-sm text-muted-foreground">
              A NFS-e foi enviada e está sendo processada pela prefeitura.
            </p>
            {!readOnly && (
              <Button onClick={consultStatus} disabled={consulting} variant="outline" size="sm" className="gap-2">
                {consulting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Consultar Status
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {os.nfse_status && os.nfse_status !== "autorizado" && os.nfse_status !== "processando" && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-1">
                <div className="flex items-center gap-2 text-red-700 font-medium text-sm">
                  <XCircle className="h-4 w-4" /> Rejeição
                </div>
                <p className="text-sm text-red-600">{os.nfse_mensagem_sefaz}</p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Transmita a NFS-e dos serviços diretamente para a prefeitura via Focus NFe.
              Esta nota é <strong>independente</strong> da NF-e de produtos — o pedido misto gera
              duas notas (NF-e + NFS-e).
            </p>
            <Button onClick={transmit} disabled={transmitting || readOnly || services.length === 0} className="gap-2">
              {transmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Transmitir NFS-e
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}