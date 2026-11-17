import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, Loader2, Save, Copy, CheckCheck, ExternalLink } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function ThreeCPlusConfigCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    threec_api_token: "",
    threec_webhook_token: "",
    threec_base_url: "",
    threec_domain: "",
  });
  const [saving, setSaving] = useState(false);
  const [settingId, setSettingId] = useState(null);
  const [copied, setCopied] = useState(false);

  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSetting.list("-created_date", 1),
  });

  useEffect(() => {
    if (settings[0]) {
      const s = settings[0];
      setSettingId(s.id);
      setForm({
        threec_api_token: s.threec_api_token || "",
        threec_webhook_token: s.threec_webhook_token || "",
        threec_base_url: s.threec_base_url || "",
        threec_domain: s.threec_domain || "",
      });
    }
  }, [settings]);

  const webhookUrl = form.threec_webhook_token
    ? `https://brazon-comercial.base44.app/functions/webhook3C?token=${form.threec_webhook_token}`
    : "https://brazon-comercial.base44.app/functions/webhook3C?token=SEU_TOKEN_AQUI";

  const save = async () => {
    setSaving(true);
    try {
      const patch = {
        threec_api_token: form.threec_api_token,
        threec_webhook_token: form.threec_webhook_token,
        threec_base_url: form.threec_base_url,
        threec_domain: form.threec_domain,
      };
      if (settingId) {
        await base44.entities.SystemSetting.update(settingId, patch);
      } else {
        const created = await base44.entities.SystemSetting.create({ name: "Configuração do Sistema", ...patch });
        setSettingId(created.id);
      }
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      toast({ title: "Configuração do 3C Plus salva" });
    } catch (err) {
      toast({ title: "Erro ao salvar", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "URL do webhook copiada" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-primary" />
          Discador 3C Plus
        </CardTitle>
        <CardDescription>
          Configure a integração com o discador 3C Plus para envio de listas de clientes e recebimento de resultados de chamadas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Token da API (api_token)</Label>
          <Input
            value={form.threec_api_token}
            onChange={(e) => setForm({ ...form, threec_api_token: e.target.value })}
            placeholder="Token obtido em Configurações > API no painel do 3C Plus"
          />
          <p className="text-xs text-muted-foreground">
            Usado para autenticar o envio de listas de discagem para as campanhas.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Token do Webhook</Label>
          <Input
            value={form.threec_webhook_token}
            onChange={(e) => setForm({ ...form, threec_webhook_token: e.target.value })}
            placeholder="Ex: brazon3c2026 (você define este valor)"
          />
          <p className="text-xs text-muted-foreground">
            Token fixo incluído na URL do webhook. Defina um valor e use a mesma URL no painel do 3C Plus.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>URL base da API (opcional)</Label>
          <Input
            value={form.threec_base_url}
            onChange={(e) => setForm({ ...form, threec_base_url: e.target.value })}
            placeholder="http://app.3c.fluxoti.com.br/api/v1 (padrão)"
          />
          <p className="text-xs text-muted-foreground">
            Padrão: <code className="text-xs">http://app.3c.fluxoti.com.br/api/v1</code>. Altere apenas se o domínio da sua conta for diferente.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Domínio da empresa no 3C Plus (WebRTC + Socket.io)</Label>
          <Input
            value={form.threec_domain}
            onChange={(e) => setForm({ ...form, threec_domain: e.target.value })}
            placeholder="Ex: brazon.3c.plus"
          />
          <p className="text-xs text-muted-foreground">
            Domínio no formato <code className="text-xs">empresa.3c.plus</code>. Usado para carregar o softphone (WebRTC) e receber eventos em tempo real (Socket.io) das chamadas.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>URL do Webhook (cadastre no 3C Plus)</Label>
          <div className="flex items-center gap-2">
            <Input readOnly value={webhookUrl} className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" onClick={copyUrl} title="Copiar URL">
              {copied ? <CheckCheck className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Cadastre esta URL no painel do 3C Plus em <strong>Configurações → Integração → Webhooks</strong>, selecionando os eventos
            <code className="text-xs mx-1">call-was-connected</code> e
            <code className="text-xs mx-1">call-history-was-created</code>.
          </p>
        </div>

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Configuração
        </Button>
      </CardContent>
    </Card>
  );
}