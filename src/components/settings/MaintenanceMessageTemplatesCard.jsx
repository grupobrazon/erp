import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Save, Package, Wrench } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function MaintenanceMessageTemplatesCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [sendPart, setSendPart] = useState("");
  const [sendTechnician, setSendTechnician] = useState("");
  const [settingId, setSettingId] = useState(null);

  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSetting.list("-created_date", 10),
  });

  useEffect(() => {
    if (settings.length > 0) {
      setSettingId(settings[0].id);
      setSendPart(settings[0].maintenance_msg_send_part || "");
      setSendTechnician(settings[0].maintenance_msg_send_technician || "");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.SystemSetting.update(settingId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      toast({ title: "Modelos salvos", description: "Os modelos de mensagem foram atualizados." });
    },
    onError: (err) => toast({ title: "Erro ao salvar", description: err?.message, variant: "destructive" }),
  });

  const handleSave = () => {
    saveMutation.mutate({
      maintenance_msg_send_part: sendPart,
      maintenance_msg_send_technician: sendTechnician,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          Modelos de Mensagem — Manutenção/Garantia
        </CardTitle>
        <CardDescription>
          Modelos de mensagem enviados ao cliente durante a análise técnica. Use as variáveis entre chaves para preenchimento automático.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Package className="h-4 w-4 text-amber-600" />
            Mensagem — Envio de Peça para Análise
          </Label>
          <p className="text-xs text-muted-foreground">Enviada quando uma peça/produto é despachado para o cliente durante a análise.</p>
          <Textarea value={sendPart} onChange={e => setSendPart(e.target.value)} rows={8} className="font-mono text-xs" />
          <p className="text-xs text-muted-foreground">
            Variáveis: <code className="bg-muted px-1 rounded">{`{cliente}`}</code> <code className="bg-muted px-1 rounded">{`{os_codigo}`}</code> <code className="bg-muted px-1 rounded">{`{produto}`}</code> <code className="bg-muted px-1 rounded">{`{endereco}`}</code> <code className="bg-muted px-1 rounded">{`{prazo}`}</code>
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Wrench className="h-4 w-4 text-blue-600" />
            Mensagem — Ida do Técnico para Análise
          </Label>
          <p className="text-xs text-muted-foreground">Enviada quando um técnico é agendado para visitar o cliente e avaliar o equipamento.</p>
          <Textarea value={sendTechnician} onChange={e => setSendTechnician(e.target.value)} rows={8} className="font-mono text-xs" />
          <p className="text-xs text-muted-foreground">
            Variáveis: <code className="bg-muted px-1 rounded">{`{cliente}`}</code> <code className="bg-muted px-1 rounded">{`{os_codigo}`}</code> <code className="bg-muted px-1 rounded">{`{data}`}</code> <code className="bg-muted px-1 rounded">{`{periodo}`}</code> <code className="bg-muted px-1 rounded">{`{endereco}`}</code>
          </p>
        </div>

        <Button onClick={handleSave} disabled={saveMutation.isPending || !settingId} className="gap-2">
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? "Salvando..." : "Salvar Modelos"}
        </Button>
      </CardContent>
    </Card>
  );
}