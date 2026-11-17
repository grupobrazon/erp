import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Truck, Save } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import RomaneioTrackingTestBox from "@/components/settings/RomaneioTrackingTestBox";
import RomaneioTrackingList from "@/components/settings/RomaneioTrackingList";

export default function RomaneioTrackingCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [settingId, setSettingId] = useState(null);
  const [form, setForm] = useState({ enabled: false, template_id: "", message: "" });

  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSetting.list("-created_date", 1),
  });

  useEffect(() => {
    const s = settings[0];
    if (!s) return;
    setSettingId(s.id);
    setForm({
      enabled: s.romaneio_tracking_enabled === true,
      template_id: s.romaneio_window_template_id || "",
      message: s.romaneio_window_message || "",
    });
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.SystemSetting.update(settingId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      toast({ title: "Aviso de rastreio salvo" });
    },
    onError: (err) => toast({ title: "Erro ao salvar", description: err?.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          Aviso de rastreio no WhatsApp (OS em transporte)
        </CardTitle>
        <CardDescription>
          Quando a OS é despachada no romaneio (<strong>Saída do Estoque</strong>) ou entra em{" "}
          <strong>Em Transporte</strong>, o sistema envia o código de rastreio no WhatsApp do cliente. Se a janela de atendimento do Meta estiver fechada, a mensagem é recusada: então enviamos o modelo
          aprovado perguntando se o cliente pode falar agora, repetimos essa pergunta a cada 24 horas e, assim que ele
          responde, enviamos o código. O andamento aparece no detalhe da OS, com o check de mensagem enviada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium">Avisar o cliente automaticamente</p>
            <p className="text-xs text-muted-foreground">
              Valem os romaneios de 21/10/2026 em diante (as OS anteriores não recebem aviso) e as novas entram
              automaticamente conforme são despachadas.
            </p>
          </div>
          <Switch
            checked={form.enabled}
            onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
          />
        </div>

        <div className="space-y-1.5">
          <Label>ID do modelo aprovado no CRM (opcional)</Label>
          <Input
            value={form.template_id}
            onChange={(e) => setForm((f) => ({ ...f, template_id: e.target.value }))}
            placeholder="Deixe em branco para usar o conversar_agora"
          />
          <p className="text-xs text-muted-foreground">
            Fora da janela do Meta só um modelo aprovado inicia conversa. Em branco, o sistema usa o modelo{" "}
            <em>conversar_agora (pt_BR)</em> — o mesmo da campanha. Se preferir fixar outro modelo, abra-o no CRM e
            cole aqui o ID que aparece na barra de endereço.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Mensagem reserva (usada se o modelo não estiver configurado)</Label>
          <Textarea
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            rows={5}
            placeholder="Cole aqui o texto que deve ser enviado quando a janela estiver fechada"
          />
          <p className="text-xs text-muted-foreground">
            Só funciona se a janela do cliente estiver aberta — o modelo aprovado acima é o caminho garantido.
          </p>
        </div>

        <Button
          onClick={() => saveMutation.mutate({
            romaneio_tracking_enabled: form.enabled,
            romaneio_window_template_id: form.template_id,
            romaneio_window_message: form.message,
          })}
          disabled={saveMutation.isPending || !settingId}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? "Salvando..." : "Salvar"}
        </Button>

        <RomaneioTrackingTestBox />

        <RomaneioTrackingList />
      </CardContent>
    </Card>
  );
}