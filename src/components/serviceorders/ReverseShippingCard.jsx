import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ExternalLink, Copy, Check, PackageCheck, Truck, MapPinned, Building2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// Estágios da timeline da coleta reversa
const STAGES = [
  { key: "generated", label: "Código Gerado", icon: PackageCheck },
  { key: "posted", label: "Postado", icon: Truck },
  { key: "delivered", label: "Recebida na Empresa", icon: Building2 },
];

function stageIndex(status) {
  if (!status) return 0;
  if (status === "delivered" || status === "Recebida na Empresa") return 3;
  if (status === "posted" || status === "Em Retorno") return 2;
  if (status === "released" || status === "generated") return 1;
  return 1; // padrão: código gerado, aguardando postagem
}

function buildWhatsAppMessage(clientName, shipments, orderCode, parentCode) {
  const items = shipments
    .map((s, i) => `• ${s.volume_label_tag || `Volume ${s.volume_index || i + 1}`}`)
    .join("\n");

  const codes = shipments
    .filter((s) => s.tracking_code)
    .map((s) => `🏷️ *Código:* ${s.tracking_code} (${s.service_name || "Correios"})`)
    .join("\n");

  return `🛵 *BRAZON — COLETA REVERSA*

Olá${clientName ? ` ${clientName}` : ""}! Geramos o código de devolução para o(s) item(ns) abaixo:

📦 *Itens para devolução:*
${items}

${codes || "🏷️ *Código:* disponível no painel (entre em contato se não recebeu)"}

📋 *Como proceder:*
1️⃣ Embale o(s) produto(s) em uma caixa/sembalagem
2️⃣ Vá até a *agência dos Correios* mais próxima
3️⃣ Apresente o *código de devolução* no balcão
4️⃣ O Correios fará a postagem gratuita de volta para a Brazon

⚠️ O código deve ser utilizado em até *30 dias*.

_OS Reversa: ${orderCode || "—"}${parentCode ? ` (ref: ${parentCode})` : ""}_

_Dúvidas? Estamos à disposição!_`;
}

export default function ReverseShippingCard({ shipments, clientName, orderCode, parentCode, onTrack, trackingLoading }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const firstShipment = shipments[0] || {};
  const currentStage = stageIndex(firstShipment.status);

  const waMessage = buildWhatsAppMessage(clientName, shipments, orderCode, parentCode);

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      if (label === "wa") {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
      toast({ title: "Copiado!", description: label === "wa" ? "Mensagem copiada para o WhatsApp" : `${label} copiado` });
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2">
      {/* Timeline visual */}
      <div className="rounded-md border p-3 bg-gradient-to-b from-muted/20 to-transparent">
        <div className="text-sm font-medium mb-3 flex items-center gap-1">
          <Truck className="h-4 w-4 text-primary" /> Coleta Reversa — Correios
        </div>
        <div className="flex items-center justify-between gap-1">
          {STAGES.map((stage, i) => {
            const Icon = stage.icon;
            const active = i < currentStage;
            const current = i === currentStage - 1;
            return (
              <React.Fragment key={stage.key}>
                <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                  <div
                    className={`flex items-center justify-center h-9 w-9 rounded-full border-2 transition-colors ${
                      active
                        ? "bg-primary border-primary text-primary-foreground"
                        : current
                        ? "bg-primary/10 border-primary text-primary"
                        : "bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className={`text-[10px] text-center leading-tight font-medium ${active || current ? "text-foreground" : "text-muted-foreground"}`}>
                    {stage.label}
                  </span>
                </div>
                {i < STAGES.length - 1 && (
                  <div className={`h-0.5 flex-1 rounded-full ${i < currentStage - 1 ? "bg-primary" : "bg-border"}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Detalhes por volume */}
      {shipments.map((s, i) => (
        <div key={i} className="rounded-md border p-3 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs">
              <div className="font-medium">{s.volume_label_tag || `Volume ${s.volume_index}`}</div>
              <div className="text-muted-foreground">{s.carrier || "Correios"} {s.service_name ? `• ${s.service_name}` : ""}</div>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {s.status === "delivered" ? "Entregue" : s.status === "posted" ? "Postado" : "Postagem Pendente"}
            </Badge>
          </div>

          {s.tracking_code && (
            <div className="flex items-center gap-2 bg-muted/40 rounded-md px-2 py-1.5">
              <span className="text-xs text-muted-foreground shrink-0">Código:</span>
              <code className="text-sm font-mono font-semibold flex-1">{s.tracking_code}</code>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(s.tracking_code, "Código")}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            {s.label_url && (
              <Button variant="outline" size="sm" className="h-7 gap-1" asChild>
                <a href={s.label_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /> Painel ME</a>
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7 gap-1" onClick={onTrack} disabled={trackingLoading || !s.tracking_code}>
              <Search className="h-3 w-3" /> {trackingLoading ? "Rastreando..." : "Rastrear"}
            </Button>
          </div>
        </div>
      ))}

      {/* Mensagem de WhatsApp para o cliente */}
      <div className="rounded-md border border-emerald-200 bg-emerald-50/30 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-emerald-800 flex items-center gap-1">
            <MapPinned className="h-4 w-4" /> Instruções para o Cliente
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
            onClick={() => copyToClipboard(waMessage, "wa")}
          >
            {copied ? <><Check className="h-3 w-3" /> Copiado!</> : <><Copy className="h-3 w-3" /> Copiar Mensagem</>}
          </Button>
        </div>
        <pre className="text-xs whitespace-pre-wrap font-sans text-foreground/80 bg-white/60 rounded-md p-2 max-h-44 overflow-y-auto leading-relaxed">
{waMessage}
        </pre>
      </div>
    </div>
  );
}