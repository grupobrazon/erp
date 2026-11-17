import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { HeartHandshake, Save, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const DEFAULT_MESSAGE = `💙 Entendemos perfeitamente! Sabemos que nem sempre o momento financeiro é o mais favorável, e é justamente por isso que queremos te apresentar uma condição especial! 😊

✨ Com o VIP Brazon, conseguimos facilitar a troca do seu refil:

✅ De R$ 295,00 por apenas R$ 236,00, com 20% de desconto!

✅ Parcelamento em até 4x de R$ 59,00 sem juros!

✅ 20% de desconto vitalício em todas as suas próximas trocas de refil!

💙 Essa é uma condição inédita da Brazon, criada para ajudar você a manter a manutenção do seu purificador em dia, com mais economia!

Adquirindo seu refil ainda neste mês de outubro, você garante sua entrada no Grupo VIP Brazon e esse benefício para sempre! 😍

Vamos aproveitar essa oportunidade e facilitar sua troca de refil? 💙`;

export default function NoConditionsReplyCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [settingId, setSettingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ noconf_reply_enabled: false, noconf_reply_message: DEFAULT_MESSAGE });

  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSetting.list("-created_date", 1),
  });

  useEffect(() => {
    const s = settings[0];
    if (!s) return;
    setSettingId(s.id);
    setForm({
      noconf_reply_enabled: !!s.noconf_reply_enabled,
      noconf_reply_message: s.noconf_reply_message || DEFAULT_MESSAGE,
    });
  }, [settings]);

  const save = async () => {
    if (!settingId) return;
    setSaving(true);
    try {
      await base44.entities.SystemSetting.update(settingId, form);
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      toast({
        title: "Resposta automática salva",
        description: form.noconf_reply_enabled
          ? "Quem responder que não tem condições agora recebe esta mensagem."
          : "A resposta automática está desligada.",
      });
    } catch (err) {
      toast({ title: "Erro ao salvar", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HeartHandshake className="h-5 w-5 text-primary" />
          Resposta automática — Sem condições agora
        </CardTitle>
        <CardDescription>
          Quando o cliente responde à campanha no WhatsApp que não tem condições no momento (botão "SEM CONDIÇÕES
          AGORA"), o sistema devolve a condição especial de troca de refil. Para o clique ser recebido na hora,
          cadastre o evento <strong>InboundMessage</strong> na URL do webhook em GoHighLevel (CRM) acima — a varredura
          das conversas também alcança os cliques que chegarem antes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label className="text-sm font-medium">Resposta automática ligada</Label>
            <p className="text-xs text-muted-foreground">Desligada, ninguém recebe a mensagem.</p>
          </div>
          <Switch
            checked={form.noconf_reply_enabled}
            onCheckedChange={(value) => setForm({ ...form, noconf_reply_enabled: value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Mensagem enviada ao cliente</Label>
          <Textarea
            value={form.noconf_reply_message}
            onChange={(e) => setForm({ ...form, noconf_reply_message: e.target.value })}
            rows={14}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Variável disponível: <code className="bg-muted px-1 rounded">{`{cliente}`}</code> (primeiro nome).
          </p>
        </div>

        <Button onClick={save} disabled={saving || !settingId} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </CardContent>
    </Card>
  );
}