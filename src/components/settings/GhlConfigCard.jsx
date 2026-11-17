import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Webhook, Loader2, Save, RefreshCw, Copy, CheckCheck, ExternalLink } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function GhlConfigCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    ghl_location_id: "",
    ghl_auto_sync: false,
    ghl_webhook_token: "",
  });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
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
        ghl_location_id: s.ghl_location_id || "",
        ghl_auto_sync: s.ghl_auto_sync || false,
        ghl_webhook_token: s.ghl_webhook_token || "",
      });
    }
  }, [settings]);

  const webhookUrl = form.ghl_webhook_token
    ? `https://brazon-comercial.base44.app/functions/webhookGhl?token=${form.ghl_webhook_token}`
    : "https://brazon-comercial.base44.app/functions/webhookGhl?token=SEU_TOKEN_AQUI";

  const lastPull = settings[0]?.ghl_last_pull_date;
  const lastSummary = settings[0]?.ghl_last_pull_summary;

  const save = async () => {
    setSaving(true);
    try {
      const patch = {
        ghl_location_id: form.ghl_location_id,
        ghl_auto_sync: form.ghl_auto_sync,
        ghl_webhook_token: form.ghl_webhook_token,
      };
      if (settingId) {
        await base44.entities.SystemSetting.update(settingId, patch);
      } else {
        const created = await base44.entities.SystemSetting.create({ name: "Configuração do Sistema", ...patch });
        setSettingId(created.id);
      }
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      toast({ title: "Configuração do GoHighLevel salva" });
    } catch (err) {
      toast({ title: "Erro ao salvar", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const res = await base44.functions.invoke("pullGhlUpdates", {});
      const d = res.data || res;
      toast({
        title: "Sincronização concluída",
        description: `${d.matched || 0} clientes vinculados (${d.by_email || 0} por e-mail, ${d.by_phone || 0} por telefone) de ${d.contacts_fetched || 0} contatos${d.ambiguous ? ` · ${d.ambiguous} vínculo(s) ambíguo(s) não vinculado(s)` : ""}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (err) {
      toast({ title: "Erro na sincronização", description: err?.message, variant: "destructive" });
    } finally {
      setSyncing(false);
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
          <Webhook className="h-5 w-5 text-primary" />
          GoHighLevel (CRM)
        </CardTitle>
        <CardDescription>
          Enriquecimento de clientes com dados do GoHighLevel. O ERP puxa tags e atividade do CRM e só vincula quando UM único contato casa por e-mail ou telefone — sem enviar dados do ERP para o GHL.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Location ID</Label>
          <Input
            value={form.ghl_location_id}
            onChange={(e) => setForm({ ...form, ghl_location_id: e.target.value })}
            placeholder="ID da sub-conta no GHL (ex: ve9EPM428h8vShlRW1KT)"
          />
          <p className="text-xs text-muted-foreground">
            Obtido em <strong>Settings → Business Info</strong> ou na URL do painel do GHL. Obrigatório para todas as chamadas.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Token do Webhook (opcional)</Label>
          <Input
            value={form.ghl_webhook_token}
            onChange={(e) => setForm({ ...form, ghl_webhook_token: e.target.value })}
            placeholder="Ex: brazonghl2026 (você define este valor)"
          />
          <p className="text-xs text-muted-foreground">
            Token fixo incluído na URL do webhook para receber atualizações em tempo real do GHL.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>URL do Webhook (cadastre no GHL)</Label>
          <div className="flex items-center gap-2">
            <Input readOnly value={webhookUrl} className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" onClick={copyUrl} title="Copiar URL">
              {copied ? <CheckCheck className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Cadastre esta URL no GHL em <strong>Settings → Webhooks</strong> para receber eventos de contato em tempo real.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label className="text-sm font-medium">Sincronização automática</Label>
            <p className="text-xs text-muted-foreground">Pull agendado do GHL a cada 30 minutos (via workflow)</p>
          </div>
          <Switch
            checked={form.ghl_auto_sync}
            onCheckedChange={(v) => setForm({ ...form, ghl_auto_sync: v })}
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={save} disabled={saving} className="flex-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
          <Button onClick={syncNow} disabled={syncing || !form.ghl_location_id} variant="outline" className="flex-1">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sincronizar agora
          </Button>
        </div>

        {lastPull && (
          <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-emerald-600 border-emerald-200">Último pull</Badge>
              <span className="text-muted-foreground">
                {new Date(lastPull).toLocaleString("pt-BR")}
              </span>
            </div>
            {lastSummary && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
                <span className="text-muted-foreground">Contatos lidos: <strong className="text-foreground">{lastSummary.contacts_fetched ?? 0}</strong></span>
                <span className="text-muted-foreground">Clientes vinculados: <strong className="text-foreground">{lastSummary.matched ?? 0}</strong></span>
                <span className="text-muted-foreground">Por e-mail: <strong className="text-foreground">{lastSummary.by_email ?? 0}</strong></span>
                <span className="text-muted-foreground">Por telefone: <strong className="text-foreground">{lastSummary.by_phone ?? 0}</strong></span>
                <span className="text-muted-foreground">Ambíguos (não vinculados): <strong className="text-foreground">{lastSummary.ambiguous ?? 0}</strong></span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}