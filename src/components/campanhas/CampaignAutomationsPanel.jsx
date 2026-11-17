import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Megaphone, Star, HeartHandshake, AlarmClock, PartyPopper, Loader2 } from "lucide-react";

// Cada automação da campanha tem o seu interruptor. O que está desligado não
// envia nada: nem pelo webhook (clique na hora), nem pela varredura das conversas.
const AUTOMACOES = [
  {
    field: "vip_reply_enabled",
    icon: Star,
    label: 'Resposta ao clique "QUERO SER VIP"',
    description:
      "Cria o link de adesão no cadastro do cliente e responde com imagem, áudio e link — na hora, pelo webhook, e também pela varredura das conversas do CRM.",
  },
  {
    field: "noconf_reply_enabled",
    icon: HeartHandshake,
    label: 'Resposta a "SEM CONDIÇÕES AGORA"',
    description:
      "Devolve a condição especial de troca de refil para quem responde que não tem condições no momento. Quem diz que não tem mais o equipamento não recebe a oferta.",
  },
  {
    field: "vip_reminder_enabled",
    icon: AlarmClock,
    label: "Lembrete de adesão (4 horas depois do link)",
    description:
      "Passadas 4 horas do link automático, quem ainda não assinou o termo recebe um reforço no WhatsApp.",
  },
  {
    field: "vip_welcome_enabled",
    icon: PartyPopper,
    label: "Boas-vindas ao aderir",
    description:
      "Quando o cliente assina um link gerado pela automação, recebe os parabéns e as orientações de pagamento.",
  },
];

// Ligada quando o campo está vazio (automações que já rodavam antes deste menu)
// ou igual a true.
const estaLigada = (settings, field) => settings[field] !== false;

export default function CampaignAutomationsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState(null);
  const [salvando, setSalvando] = useState(null);

  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSetting.list("-created_date", 1),
  });

  useEffect(() => {
    const s = settingsList[0];
    if (s) setSettings(s);
  }, [settingsList]);

  const alternar = async (field, value) => {
    if (!settings?.id) return;
    setSalvando(field);
    setSettings((current) => ({ ...current, [field]: value }));
    try {
      await base44.entities.SystemSetting.update(settings.id, { [field]: value });
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      const automacao = AUTOMACOES.find((a) => a.field === field);
      toast({
        title: value ? "Automação ligada" : "Automação desligada",
        description: value
          ? `${automacao?.label} já está respondendo os clientes.`
          : `${automacao?.label} parou de enviar mensagens.`,
      });
    } catch (err) {
      setSettings((current) => ({ ...current, [field]: !value }));
      toast({ title: "Erro ao salvar", description: err?.message, variant: "destructive" });
    } finally {
      setSalvando(null);
    }
  };

  const ligadas = settings ? AUTOMACOES.filter((a) => estaLigada(settings, a.field)).length : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          Automações da campanha
          {settings && (
            <Badge variant="outline" className="ml-1 border-border text-muted-foreground">
              {ligadas} de {AUTOMACOES.length} ligadas
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Liga e desliga cada automação das campanhas do WhatsApp (Atlas). O que fica ligado responde os clientes na
          hora; o que fica desligado não envia nada. Os textos de cada automação são editados logo abaixo, em Modelos
          de mensagem das automações.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!settings ? (
          <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando as automações...
          </p>
        ) : (
          AUTOMACOES.map((automacao) => {
            const ligada = estaLigada(settings, automacao.field);
            return (
              <div
                key={automacao.field}
                className="flex items-start justify-between gap-4 rounded-lg border p-3"
              >
                <div className="flex gap-3">
                  <automacao.icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${ligada ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Label className="text-sm font-medium">{automacao.label}</Label>
                      <Badge
                        variant="outline"
                        className={ligada
                          ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                          : "border-slate-200 bg-slate-100 text-slate-600"}
                      >
                        {ligada ? "Ligada" : "Desligada"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{automacao.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  {salvando === automacao.field && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  <Switch
                    checked={ligada}
                    disabled={salvando === automacao.field}
                    onCheckedChange={(value) => alternar(automacao.field, value)}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}