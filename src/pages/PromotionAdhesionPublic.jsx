import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { openPromotionTermPdf } from "@/lib/promotionTermPdf";
import { AlertCircle, BadgeCheck, Check, CheckCircle2, Copy, Download, Droplets, Mail, PenLine, Save, ShieldCheck } from "lucide-react";

const fmtDate = (value) => {
  if (!value) return "";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : String(value);
};

// O sistema devolve o motivo real no corpo da resposta (link não encontrado, cancelado,
// programa encerrado). Sem isso a tela mostrava só "Request failed with status code 404".
const errorText = (err, fallback) => {
  const body = err?.response?.data?.error || err?.data?.error;
  if (body) return body;
  const msg = String(err?.message || "");
  return /status code/.test(msg) ? fallback : msg || fallback;
};

export default function PromotionAdhesionPublic() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [data, setData] = useState(null);
  const [termAccepted, setTermAccepted] = useState(false);
  const [dataSaved, setDataSaved] = useState(false);
  const [form, setForm] = useState({ name: "", document: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const link = `${window.location.origin}/programa/${token}`;

  const load = async () => {
    try {
      const res = await base44.functions.invoke("promotionAdhesion", { action: "get_by_token", token });
      const d = res.data || res;
      if (d.error) throw new Error(d.error);
      setData(d);
      setForm({
        name: d.client?.name || "",
        document: d.client?.document || "",
        email: d.client?.email || "",
        phone: d.client?.phone || "",
      });
    } catch (err) {
      setLoadError(errorText(err, "Não conseguimos abrir este link agora. Tente novamente em instantes."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token]);

  const saveData = async () => {
    setError("");
    setNotice("");
    if (!form.name || !form.document || !form.phone) {
      setError("Preencha nome completo, CPF/CNPJ e WhatsApp para salvar.");
      return;
    }
    setBusy(true);
    try {
      const res = await base44.functions.invoke("promotionAdhesion", {
        action: "save_data",
        token,
        name: form.name,
        document: form.document,
        email: form.email,
        phone: form.phone,
      });
      const d = res.data || res;
      if (d.error) throw new Error(d.error);
      setDataSaved(true);
      setNotice("Dados salvos com sucesso.");
    } catch (err) {
      setError(errorText(err, "Não foi possível salvar seus dados."));
    } finally {
      setBusy(false);
    }
  };

  const signDigitally = async () => {
    setError("");
    setNotice("");
    if (!termAccepted) {
      setError("Marque o aceite dos termos e condições para assinar digitalmente.");
      return;
    }
    setBusy(true);
    try {
      // Assinatura em um toque: se os dados ainda não estiverem salvos (ou a página
      // tiver sido recarregada no celular), salvamos aqui antes de registrar o aceite.
      if (!dataSaved) {
        const save = await base44.functions.invoke("promotionAdhesion", {
          action: "save_data",
          token,
          name: form.name,
          document: form.document,
          email: form.email,
          phone: form.phone,
        });
        const saved = save.data || save;
        if (saved.error) throw new Error(saved.error);
        setDataSaved(true);
      }
      const res = await base44.functions.invoke("promotionAdhesion", {
        action: "accept",
        token,
        name: form.name,
        document: form.document,
        email: form.email,
        phone: form.phone,
      });
      const d = res.data || res;
      if (d.error) throw new Error(d.error);
      setNotice("");
      await load();
    } catch (err) {
      setError(errorText(err, "Não foi possível concluir a adesão."));
    } finally {
      setBusy(false);
    }
  };

  const sendByEmail = async () => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const res = await base44.functions.invoke("promotionAdhesion", { action: "send_term_email", token, link });
      const d = res.data || res;
      if (d.error) throw new Error(d.error);
      setNotice(`Termo enviado para ${d.email}.`);
    } catch (err) {
      setError(errorText(err, "Não foi possível enviar o e-mail."));
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copie o link manualmente: " + link);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <div className="text-center max-w-sm">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-2" />
          <p className="text-destructive font-medium">{loadError}</p>
        </div>
      </div>
    );
  }

  const promotion = data?.promotion || {};
  const adhesion = data?.adhesion || {};
  const alreadyAccepted = adhesion.status === "Aceita";

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <div className="max-w-2xl mx-auto p-4 pb-16">
        <div className="flex items-center gap-2 mb-6 pt-4">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
            <Droplets className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-heading font-bold text-foreground leading-none">Brazon</div>
            <div className="text-[10px] text-muted-foreground">Purificação de Água</div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 mb-5">
          <h1 className="text-xl font-heading font-bold text-foreground">{promotion.name}</h1>
          {promotion.campaign_label && (
            <p className="text-sm text-primary font-medium mt-1">{promotion.campaign_label}</p>
          )}
          <div className="flex flex-wrap gap-2 mt-3 text-xs">
            {promotion.discount_percent > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 font-semibold">
                <BadgeCheck className="h-3.5 w-3.5" /> {promotion.discount_percent}% de desconto
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-muted-foreground">
              {promotion.is_lifetime ? "Benefício vitalício" : `Vigência até ${fmtDate(promotion.promotion_end_date)}`}
            </span>
            {promotion.adhesion_end_date && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1">
                Adesões até {fmtDate(promotion.adhesion_end_date)}
              </span>
            )}
          </div>
          {promotion.description && <p className="text-sm text-muted-foreground mt-3">{promotion.description}</p>}
          {promotion.benefits && (
            <div className="mt-3 rounded-lg bg-muted/60 p-3 text-[13px] whitespace-pre-wrap">{promotion.benefits}</div>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 mb-4 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        {notice && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 mb-4 text-sm text-primary flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0" /> {notice}
          </div>
        )}

        {alreadyAccepted ? (
          <>
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-6 text-center mb-5">
              <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <Check className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="font-heading font-bold text-emerald-900 text-lg mb-1">Adesão confirmada!</h2>
              <p className="text-sm text-emerald-800">
                {adhesion.accepted_name} — {fmtDate(adhesion.accepted_at ? String(adhesion.accepted_at).slice(0, 10) : "")}
              </p>
              <p className="text-xs text-emerald-700 mt-2">
                Código de adesão <strong>{adhesion.token}</strong>. Guarde este link: com ele você consulta e baixa o termo assinado sempre que precisar.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              <Button
                className="gap-2"
                onClick={() =>
                  openPromotionTermPdf({
                    promotion,
                    adhesion: { ...adhesion, terms_snapshot: adhesion.terms_snapshot || promotion.terms_text },
                    signatureUrl: adhesion.signature_url,
                  })
                }
              >
                <Download className="h-4 w-4" /> Baixar termo em PDF
              </Button>
              {(adhesion.accepted_email || adhesion.client_email) && (
                <Button variant="outline" className="gap-2" onClick={sendByEmail} disabled={busy}>
                  <Mail className="h-4 w-4" /> Enviar por e-mail
                </Button>
              )}
              <Button variant="outline" className="gap-2" onClick={copyLink}>
                <Copy className="h-4 w-4" /> {copied ? "Link copiado!" : "Copiar meu link"}
              </Button>
            </div>

            <details className="rounded-xl border bg-card p-4">
              <summary className="font-heading font-semibold text-sm cursor-pointer">Ler o termo de adesão aceito</summary>
              <div className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed max-h-80 overflow-y-auto">
                {adhesion.terms_snapshot || promotion.terms_text}
              </div>
            </details>
          </>
        ) : (
          <>
            <div className="rounded-xl border bg-card p-5 mb-4">
              <h2 className="font-heading font-semibold text-sm mb-2 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" /> Termo de adesão e condições
              </h2>
              <div className="whitespace-pre-wrap text-[13px] leading-relaxed max-h-72 overflow-y-auto rounded-lg border bg-muted/30 p-3">
                {promotion.terms_text}
              </div>
              <Button
                className={`w-full h-14 mt-4 gap-2 text-base font-semibold ${termAccepted ? "bg-emerald-600 hover:bg-emerald-600/90 text-white" : ""}`}
                onClick={() => {
                  setTermAccepted(!termAccepted);
                  setError("");
                }}
              >
                <CheckCircle2 className="h-5 w-5" />
                {termAccepted ? "Termos e condições aceitos" : "Aceitar os termos e condições"}
              </Button>
              {termAccepted && (
                <p className="text-xs text-emerald-700 text-center mt-2">Aceite registrado. Agora salve seus dados e clique em Assinar digitalmente.</p>
              )}
            </div>

            <div className="rounded-xl border bg-card p-5 mb-4">
              <h2 className="font-heading font-semibold text-sm mb-3">Confirme seus dados</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Nome completo *</label>
                  <Input
                    value={form.name}
                    onChange={(e) => { setForm({ ...form, name: e.target.value }); setDataSaved(false); }}
                    placeholder="Como está no seu documento"
                    className="h-11"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">CPF ou CNPJ *</label>
                  <Input
                    value={form.document}
                    onChange={(e) => { setForm({ ...form, document: e.target.value }); setDataSaved(false); }}
                    placeholder="Somente números"
                    className="h-11"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">WhatsApp *</label>
                  <Input
                    value={form.phone}
                    onChange={(e) => { setForm({ ...form, phone: e.target.value }); setDataSaved(false); }}
                    placeholder="DDD + número"
                    className="h-11"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">E-mail (opcional)</label>
                  <Input
                    value={form.email}
                    onChange={(e) => { setForm({ ...form, email: e.target.value }); setDataSaved(false); }}
                    placeholder="Se tiver e-mail"
                    className="h-11"
                  />
                </div>
              </div>

              <Button variant="outline" className="w-full h-12 mt-4 gap-2 font-semibold" disabled={busy} onClick={saveData}>
                {busy ? (
                  <span className="h-4 w-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar dados
              </Button>
              {dataSaved && (
                <div className="mt-2 text-xs text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Dados salvos com sucesso.
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-card p-5 mb-4">
              <Button className="w-full h-14 gap-2 text-base font-semibold" disabled={busy} onClick={signDigitally}>
                {busy ? (
                  <span className="h-5 w-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                ) : (
                  <PenLine className="h-5 w-5" />
                )}
                Assinar digitalmente
              </Button>
              {!termAccepted && (
                <p className="text-xs text-amber-700 text-center mt-3">
                  Toque no botão azul "Aceitar os termos e condições" para liberar a assinatura.
                </p>
              )}
              <p className="text-xs text-muted-foreground text-center mt-3">
                Nada de código por e-mail e nada de assinar com o dedo. Ao clicar em Assinar digitalmente, o seu aceite fica registrado com data, hora, nome e CPF/CNPJ.
              </p>
            </div>

            <p className="text-[11px] text-muted-foreground text-center">
              Ao assinar, seu aceite fica registrado no sistema do Grupo Brazon vinculado ao seu cadastro, com data, hora e assinatura digital.
            </p>
          </>
        )}
      </div>
    </div>
  );
}