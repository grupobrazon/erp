import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { openPromotionTermPdf } from "@/lib/promotionTermPdf";
import { buildPublicLink } from "@/lib/publicAppUrl";
import { Copy, Download, Link2, Mail, MessageCircle, XCircle } from "lucide-react";

const onlyDigits = (value) => String(value || "").replace(/\D/g, "");

const fmtDateTime = (value) => {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return String(value);
  }
};

// Mensagem pronta para enviar ao cliente: aparece na tela para copiar inteira
const buildMessage = (promotion, adhesion, link) => {
  const firstName = String(adhesion.client_name || "").split(" ")[0] || "cliente";
  const programName = promotion?.name || adhesion.promotion_name || "Programa Cliente VIP Brazon";
  const discount = promotion?.discount_percent || adhesion.accepted_discount_percent || 0;
  const benefit = `${discount ? `${discount}% de desconto ` : "desconto "}${promotion?.is_lifetime ? "vitalício " : ""}em elementos filtrantes (refis) do purificador Brazon/MaxFilter`;

  if (adhesion.status === "Aceita") {
    return [
      `Olá ${firstName}!`,
      "",
      `Sua adesão ao ${programName} está confirmada ✅ O seu benefício de ${benefit} já está ativo no seu cadastro.`,
      "",
      "Sempre que precisar de refil, é só falar com a gente: o desconto já é aplicado automaticamente.",
      "",
      `Para consultar o termo assinado: ${link}`,
      "",
      "Grupo Brazon",
    ].join("\n");
  }

  return [
    `Olá ${firstName}!`,
    "",
    `Você foi convidado(a) a participar do ${programName} e garantir ${benefit}.`,
    "",
    "Para ativar a promoção no seu cadastro e já garantir o desconto, siga estes passos:",
    "",
    "1) Acesse o link de adesão abaixo.",
    "2) Confira seus dados (nome e CPF/CNPJ já estão preenchidos).",
    "3) Leia o termo e assine digitalmente, direto na tela.",
    "4) Ao confirmar, o termo assinado é salvo automaticamente.",
    "",
    "Assim que o termo for assinado, a promoção fica ativa e suas próximas compras de refil já saem com o desconto.",
    "",
    `🔗 Link de adesão: ${link}`,
    `Código de adesão: ${adhesion.token}`,
    "",
    "Qualquer dúvida, é só responder esta mensagem.",
    "Grupo Brazon",
  ].join("\n");
};

export default function AdhesionLinkCard({ promotion, adhesion, clientPhone, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const link = buildPublicLink(`/programa/${adhesion.token}`);
  const accepted = adhesion.status === "Aceita";
  const cancelled = adhesion.status === "Cancelada";
  const clientMessage = buildMessage(promotion, adhesion, link);

  const flash = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 4000);
  };

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(`${label} copiado!`);
    } catch {
      flash(text);
    }
  };

  const openTerm = async () => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke("promotionAdhesion", { action: "get_by_token", token: adhesion.token });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      openPromotionTermPdf({
        promotion: data.promotion,
        adhesion: { ...data.adhesion, terms_snapshot: data.adhesion.terms_snapshot || data.promotion.terms_text },
        signatureUrl: data.adhesion.signature_url,
      });
    } catch (err) {
      flash(err?.message || "Não foi possível abrir o termo.");
    } finally {
      setBusy(false);
    }
  };

  const sendEmail = async () => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke("promotionAdhesion", { action: "send_term_email", token: adhesion.token, link });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      flash(`Termo enviado para ${data.email}.`);
      onChanged?.();
    } catch (err) {
      flash(err?.message || "Não foi possível enviar o e-mail.");
    } finally {
      setBusy(false);
    }
  };

  const whatsapp = () => {
    const digits = onlyDigits(clientPhone || adhesion.client_phone);
    const full = digits.length > 11 ? digits : `55${digits}`;
    window.open(`https://wa.me/${full}?text=${encodeURIComponent(clientMessage)}`, "_blank");
  };

  const cancel = async () => {
    await base44.entities.PromotionAdhesion.update(adhesion.id, { status: "Cancelada" });
    flash("Link cancelado.");
    onChanged?.();
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <Link2 className="h-4 w-4 text-primary" />
          <span className="font-mono text-xs">{adhesion.token}</span>
          <Badge variant={accepted ? "secondary" : cancelled ? "outline" : "default"} className={accepted ? "bg-emerald-100 text-emerald-700" : ""}>
            {accepted ? "Termo aceito" : cancelled ? "Cancelado" : "Aguardando aceite do cliente"}
          </Badge>
        </div>
        {accepted && <span className="text-xs text-muted-foreground">Aceite em {fmtDateTime(adhesion.accepted_at)}</span>}
      </div>

      <p className="text-xs font-medium text-muted-foreground">Link do cliente — envie por WhatsApp ou e-mail:</p>
      <Input readOnly value={link} className="text-xs bg-background font-mono" onFocus={(e) => e.target.select()} />

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Mensagem para enviar ao cliente — selecione ou use "Copiar mensagem":</p>
        <Textarea
          readOnly
          value={clientMessage}
          rows={11}
          className="text-xs bg-background resize-none leading-relaxed"
          onFocus={(e) => e.target.select()}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="gap-1.5" onClick={() => copy(clientMessage, "Mensagem")}>
          <Copy className="h-3.5 w-3.5" /> Copiar mensagem
        </Button>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => copy(adhesion.token, "Código")}>
          <Copy className="h-3.5 w-3.5" /> Copiar código
        </Button>
        {!cancelled && (
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={whatsapp}>
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </Button>
        )}
        {accepted && (
          <>
            <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={openTerm}>
              <Download className="h-3.5 w-3.5" /> Ver termo
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={sendEmail}>
              <Mail className="h-3.5 w-3.5" /> Enviar por e-mail
            </Button>
          </>
        )}
        {!accepted && !cancelled && (
          <Button type="button" size="sm" variant="ghost" className="gap-1.5 text-destructive" onClick={cancel}>
            <XCircle className="h-3.5 w-3.5" /> Cancelar link
          </Button>
        )}
      </div>

      {message && <p className="text-xs text-muted-foreground break-all">{message}</p>}
    </div>
  );
}