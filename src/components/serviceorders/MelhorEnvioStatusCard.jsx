import React, { useState } from "react";
import { Truck, PackageCheck, Clock, AlertCircle, RefreshCw, ExternalLink, Copy, Check, MapPin, CheckCircle2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildTrackingUrl } from "@/lib/melhorEnvioTracking";
import ExtravioDialog from "./ExtravioDialog";

// Rótulos amigáveis para os status do Melhor Envio
const ME_STATUS_LABELS = {
  generated: { label: "Etiqueta Gerada", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  posted: { label: "Postado / Em Transporte", color: "bg-sky-100 text-sky-700 border-sky-200" },
  delivered: { label: "Entregue", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  canceled: { label: "Cancelada", color: "bg-red-100 text-red-700 border-red-200" },
  undelivered: { label: "Não Entregue", color: "bg-amber-100 text-amber-700 border-amber-200" },
  pending: { label: "Pendente", color: "bg-slate-100 text-slate-700 border-slate-200" },
  released: { label: "Liberado", color: "bg-teal-100 text-teal-700 border-teal-200" },
};

const fmtDateTime = (d) =>
  d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }) : "—";

// Etapa atual do ciclo de acompanhamento (0 = etiqueta gerada / postagem pendente, 1 = em transporte, 2 = entregue)
function trackingStep(meStatus) {
  const s = String(meStatus || "").toLowerCase();
  if (s === "delivered") return 2;
  if (s === "posted") return 1;
  return 0; // generated, released, pending, etc. → postagem pendente
}

const TIMELINE_STEPS = [
  { icon: PackageCheck, label: "Postagem Pendente" },
  { icon: Truck, label: "Em Transporte" },
  { icon: MapPin, label: "Entregue" },
];

export default function MelhorEnvioStatusCard({ order, onRefresh, refreshing, onManualDeliver, manualDelivering, onExtravioCompleted }) {
  const [copied, setCopied] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [extravioOpen, setExtravioOpen] = useState(false);
  const labels = Array.isArray(order.melhor_envio_labels) ? order.melhor_envio_labels : [];
  if (labels.length === 0 && !order.tracking_code && !order.melhor_envio_status) return null;

  const meStatus = String(order.melhor_envio_status || "").toLowerCase();
  const statusInfo = ME_STATUS_LABELS[meStatus] || (meStatus
    ? { label: meStatus, color: "bg-slate-100 text-slate-700 border-slate-200" }
    : null);

  const step = trackingStep(meStatus);
  const isPending = step === 0 && meStatus !== "canceled" && meStatus !== "undelivered";
  const canManualDeliver = onManualDeliver && meStatus !== "delivered" && meStatus !== "canceled" && step < 2;

  // Todos os códigos de rastreio (1 por volume). Quando há múltiplos volumes,
  // cada um tem seu próprio rastreio — a mensagem e o botão de copiar incluem todos.
  const allLabels = labels.length > 0
    ? labels
    : (order.tracking_code ? [{ tracking_code: order.tracking_code }] : []);
  let allTrackingUrls = allLabels
    .map(l => buildTrackingUrl(l.tracking_code))
    .filter(Boolean);
  // Fallback: se os rastreios por volume estiverem vazios mas a OS tem tracking_code,
  // usa o rastreio da OS (caso de etiquetas geradas antes do preenchimento por volume)
  if (allTrackingUrls.length === 0 && order.tracking_code) {
    allTrackingUrls = [buildTrackingUrl(order.tracking_code)];
  }
  const trackingUrl = allTrackingUrls[0] || "";

  const handleCopyLink = async () => {
    if (allTrackingUrls.length === 0) return;
    const text = allTrackingUrls.length === 1 ? allTrackingUrls[0] : allTrackingUrls.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.open(allTrackingUrls[0], "_blank");
    }
  };

  // Mensagem pronta de WhatsApp para o cliente — preenche nome e todos os links de rastreio
  const buildWhatsAppMessage = () => {
    const nome = order.client_name || "cliente";
    let rastreioSection;
    if (allTrackingUrls.length === 0) {
      rastreioSection = "🔎 Acompanhe seu pedido:\n(será enviado em breve)";
    } else if (allTrackingUrls.length === 1) {
      rastreioSection = `🔎 Acompanhe seu pedido:\n${allTrackingUrls[0]}`;
    } else {
      const volLines = allTrackingUrls.map((url, i) => `📦 Volume ${i + 1}: ${url}`).join("\n");
      rastreioSection = `🔎 Acompanhe seus pedidos (${allTrackingUrls.length} volumes):\n${volLines}`;
    }
    return `Olá, ${nome}! 😊

Temos uma ótima notícia: seu produto já foi postado e está a caminho! 📦✨

Agradecemos sinceramente pela confiança em escolher a Brazon e, principalmente, pela compreensão durante esse período.

Sabemos que, em alguns casos, não conseguimos proporcionar a experiência que gostaríamos até aqui, especialmente em relação aos prazos de entrega, e pedimos desculpas por qualquer transtorno causado.

Estamos trabalhando intensamente para normalizar nossas operações e aprimorar nossos processos. A sua confiança é muito importante para nós.

Você pode acompanhar todas as atualizações da entrega pelo link abaixo:

${rastreioSection}

Após a conclusão da sua entrega, enviaremos uma pesquisa de satisfação. Sua opinião será muito importante para entendermos onde podemos melhorar e continuarmos evoluindo para proporcionar uma experiência cada vez melhor aos nossos clientes.

Mais uma vez, obrigada pela confiança, pela compreensão e por escolher a Brazon. 💙`;
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(buildWhatsAppMessage());
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2000);
    } catch {}
  };

  return (
    <div className="rounded-md border border-sky-200 bg-sky-50/40 p-3">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-sky-900">
          <Truck className="h-4 w-4" /> Acompanhamento Melhor Envio
        </div>
        {onRefresh && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Atualizando..." : "Atualizar agora"}
          </Button>
        )}
      </div>

      {/* Linha do tempo do acompanhamento */}
      <div className="flex items-center gap-1 mb-3">
        {TIMELINE_STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = i <= step;
          const current = i === step;
          return (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                <div className={`flex items-center justify-center h-7 w-7 rounded-full border-2 transition-colors ${
                  active ? "bg-sky-600 border-sky-600 text-white" : "bg-white border-slate-300 text-slate-400"
                } ${current ? "ring-2 ring-sky-300" : ""}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <span className={`text-[10px] font-medium leading-tight text-center ${active ? "text-sky-900" : "text-slate-400"}`}>
                  {s.label}
                </span>
              </div>
              {i < TIMELINE_STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 rounded-full ${i < step ? "bg-sky-600" : "bg-slate-200"}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {isPending && (
        <div className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-2">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span><strong>Postagem pendente</strong> — a etiqueta foi gerada, mas a mercadoria ainda não foi postada na transportadora.</span>
        </div>
      )}

      {canManualDeliver && (
        <div className="flex items-start gap-1.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5 mb-2">
          <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="mb-1">O Melhor Envio não registrou a postagem/entrega (etiqueta pode ter expirado ou sido postada direto na transportadora). Se você confirmou a entrega com o cliente, marque manualmente:</div>
            <Button
              variant="default"
              size="sm"
              className="h-7 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700"
              onClick={onManualDeliver}
              disabled={manualDelivering}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {manualDelivering ? "Confirmando..." : "Confirmar entrega manualmente"}
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-muted-foreground text-xs">Transportadora:</span>
          <div className="font-medium">{order.carrier || "—"}</div>
        </div>
        <div>
          <span className="text-muted-foreground text-xs">Status no Melhor Envio:</span>
          <div className="mt-0.5">
            {statusInfo ? (
              <Badge variant="outline" className={statusInfo.color}>{statusInfo.label}</Badge>
            ) : (
              <span className="text-muted-foreground text-xs">Aguardando sincronização</span>
            )}
          </div>
        </div>
        <div className="col-span-2">
          <span className="text-muted-foreground text-xs">Código de rastreio:</span>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            {order.tracking_code ? (
              <a
                href={trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs bg-sky-100 text-sky-800 px-2 py-0.5 rounded font-mono hover:bg-sky-200 transition-colors"
              >
                {order.tracking_code}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="text-xs text-amber-700 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Será preenchido na próxima sincronização automática
              </span>
            )}
          </div>
        </div>

        {allTrackingUrls.length > 0 && (
          <div className="col-span-2">
            <span className="text-muted-foreground text-xs">
              {allTrackingUrls.length > 1
                ? `Links de rastreio para o cliente (${allTrackingUrls.length} volumes):`
                : "Link de rastreio para o cliente:"}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <code className="text-[11px] bg-white border border-slate-200 text-slate-700 px-2 py-1 rounded flex-1 truncate font-mono">
                {allTrackingUrls.length === 1 ? allTrackingUrls[0] : `${allTrackingUrls.length} links — clique em Copiar`}
              </code>
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs flex-shrink-0" onClick={handleCopyLink}>
                {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copiado!" : "Copiar"}
              </Button>
              <a href={allTrackingUrls[0]} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs flex-shrink-0">
                  <ExternalLink className="h-3 w-3" /> Abrir
                </Button>
              </a>
            </div>
          </div>
        )}

        {trackingUrl && (
          <div className="col-span-2">
            <Button variant="secondary" size="sm" className="w-full h-8 gap-1.5 text-xs" onClick={handleCopyMessage}>
              {copiedMsg ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedMsg ? "Mensagem copiada!" : "Copiar mensagem de WhatsApp para o cliente"}
            </Button>
          </div>
        )}

        {labels.length > 0 && step < 2 && (
          <div className="col-span-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 gap-1.5 text-xs border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
              onClick={() => setExtravioOpen(true)}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Marcar extravio e reenviar
            </Button>
          </div>
        )}

        {labels.length > 1 && (
          <div className="col-span-2 border-t pt-2 mt-1">
            <div className="text-xs text-muted-foreground mb-1">Rastreio por volume:</div>
            <div className="space-y-0.5">
              {labels.map((lbl, i) => {
                const volUrl = buildTrackingUrl(lbl.tracking_code);
                return (
                  <div key={i} className="flex justify-between items-center text-xs gap-2">
                    <span className="text-muted-foreground truncate">{lbl.label_tag || `Vol. ${lbl.volume_index}`}</span>
                    {lbl.tracking_code ? (
                      <a href={volUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-sky-700 hover:underline flex items-center gap-1 flex-shrink-0">
                        {lbl.tracking_code} <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    ) : (
                      <code className="font-mono text-xs">—</code>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="col-span-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          Última sincronização: <strong>{fmtDateTime(order.melhor_envio_status_date)}</strong>
          <span className="text-muted-foreground/70">(atualização automática a cada 10 min)</span>
        </div>
      </div>

      <ExtravioDialog
        open={extravioOpen}
        onOpenChange={setExtravioOpen}
        serviceOrder={order}
        onCompleted={onExtravioCompleted}
      />
    </div>
  );
}