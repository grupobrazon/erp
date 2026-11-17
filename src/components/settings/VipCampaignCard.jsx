import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, Save, Loader2, Image as ImageIcon, Mic } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const DEFAULT_MESSAGE = `Olá {cliente}! 💙

Que bom ter você com a gente! Sua adesão ao Programa Cliente VIP Brazon garante desconto vitalício na troca de refil do seu purificador.

Ouça o áudio e veja a imagem abaixo. Depois é só abrir o link, conferir seus dados e assinar o termo digitalmente:

🔗 {link}

Qualquer dúvida, é só responder esta mensagem.`;

export default function VipCampaignCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [settingId, setSettingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [form, setForm] = useState({
    vip_reply_enabled: false,
    vip_reply_promotion_id: "",
    vip_reply_image_url: "",
    vip_reply_audio_url: "",
    vip_reply_message: DEFAULT_MESSAGE,
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSetting.list("-created_date", 1),
  });

  const { data: promotions = [] } = useQuery({
    queryKey: ["vipPromotions"],
    queryFn: () => base44.entities.Promotion.filter({ category: "Programa VIP", status: "Ativa" }),
  });

  useEffect(() => {
    const s = settings[0];
    if (!s) return;
    setSettingId(s.id);
    setForm({
      vip_reply_enabled: !!s.vip_reply_enabled,
      vip_reply_promotion_id: s.vip_reply_promotion_id || "",
      vip_reply_image_url: s.vip_reply_image_url || "",
      vip_reply_audio_url: s.vip_reply_audio_url || "",
      vip_reply_message: s.vip_reply_message || DEFAULT_MESSAGE,
    });
  }, [settings]);

  const upload = async (file, field, label) => {
    if (!file) return;
    setUploading(field);
    try {
      const res = await base44.integrations.Core.UploadPublicFile({ file });
      const url = res?.file_url || res?.data?.file_url || "";
      if (!url) throw new Error("Não foi possível enviar o arquivo.");
      setForm((current) => ({ ...current, [field]: url }));
      toast({ title: `${label} enviada`, description: "Clique em Salvar para valer na resposta automática." });
    } catch (err) {
      toast({ title: "Erro no envio do arquivo", description: err?.message, variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (!settingId) return;
    setSaving(true);
    try {
      const promotion = promotions.find((p) => p.id === form.vip_reply_promotion_id);
      await base44.entities.SystemSetting.update(settingId, {
        ...form,
        vip_reply_promotion_name: promotion?.name || "",
      });
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      toast({
        title: "Campanha VIP salva",
        description: form.vip_reply_enabled ? "A resposta automática está ligada." : "A resposta automática está desligada.",
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
          <Star className="h-5 w-5 text-primary" />
          Resposta automática — Quero ser VIP
        </CardTitle>
        <CardDescription>
          Quando o cliente clica no botão "QUERO SER VIP" da campanha no WhatsApp, o sistema cria o link de adesão no
          cadastro dele e responde com a imagem, o áudio e o link. Cadastre o evento <strong>InboundMessage</strong> na URL
          do webhook em GoHighLevel (CRM) acima para o sistema receber o clique.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label className="text-sm font-medium">Resposta automática ligada</Label>
            <p className="text-xs text-muted-foreground">Desligada, ninguém recebe resposta automática.</p>
          </div>
          <Switch
            checked={form.vip_reply_enabled}
            onCheckedChange={(value) => setForm({ ...form, vip_reply_enabled: value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Programa VIP</Label>
          <Select
            value={form.vip_reply_promotion_id}
            onValueChange={(value) => setForm({ ...form, vip_reply_promotion_id: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o programa VIP do link" />
            </SelectTrigger>
            <SelectContent>
              {promotions.map((promotion) => (
                <SelectItem key={promotion.id} value={promotion.id}>
                  {promotion.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {promotions.length === 0
              ? "Nenhum programa VIP ativo encontrado (Cadastros → Programas e Promoções)."
              : "É este programa que gera o link de adesão enviado ao cliente."}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <ImageIcon className="h-4 w-4 text-blue-600" />
            Imagem enviada na resposta
          </Label>
          <Input
            type="file"
            accept="image/*"
            disabled={uploading === "vip_reply_image_url"}
            onChange={(e) => upload(e.target.files?.[0], "vip_reply_image_url", "Imagem")}
          />
          {uploading === "vip_reply_image_url" && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Enviando imagem...
            </p>
          )}
          {form.vip_reply_image_url && (
            <div className="rounded-lg border p-2 space-y-1">
              <img src={form.vip_reply_image_url} alt="Imagem da resposta VIP" className="max-h-48 rounded" />
              <p className="text-xs text-muted-foreground break-all">{form.vip_reply_image_url}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Os arquivos ficam armazenados publicamente — qualquer pessoa com o link pode abrir — porque é assim que o
            WhatsApp baixa a mídia.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Mic className="h-4 w-4 text-emerald-600" />
            Áudio enviado na resposta
          </Label>
          <Input
            type="file"
            accept="audio/*"
            disabled={uploading === "vip_reply_audio_url"}
            onChange={(e) => upload(e.target.files?.[0], "vip_reply_audio_url", "Áudio")}
          />
          {uploading === "vip_reply_audio_url" && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Enviando áudio...
            </p>
          )}
          {form.vip_reply_audio_url && (
            <div className="rounded-lg border p-2 space-y-1">
              <audio controls src={form.vip_reply_audio_url} className="w-full" />
              <p className="text-xs text-muted-foreground break-all">{form.vip_reply_audio_url}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Use um arquivo de áudio (MP3, M4A ou OGG).</p>
        </div>

        <div className="space-y-1.5">
          <Label>Mensagem enviada ao cliente</Label>
          <Textarea
            value={form.vip_reply_message}
            onChange={(e) => setForm({ ...form, vip_reply_message: e.target.value })}
            rows={10}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Variáveis: <code className="bg-muted px-1 rounded">{`{cliente}`}</code>{" "}
            <code className="bg-muted px-1 rounded">{`{link}`}</code>
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