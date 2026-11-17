import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Save, Flag, Truck } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function RouteMessageTemplatesCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [intermediateStops, setIntermediateStops] = useState("");
  const [settingId, setSettingId] = useState(null);

  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSetting.list("-created_date", 10),
  });

  useEffect(() => {
    if (settings.length > 0) {
      setSettingId(settings[0].id);
      setIntermediateStops(settings[0].route_msg_intermediate_stops || "");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.SystemSetting.update(settingId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      toast({ title: "Modelo salvo", description: "O modelo de mensagem de rota foi atualizado." });
    },
    onError: (err) => toast({ title: "Erro ao salvar", description: err?.message, variant: "destructive" }),
  });

  const handleSave = () => {
    saveMutation.mutate({ route_msg_intermediate_stops: intermediateStops });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          Modelos de Mensagem — Rotas do Técnico
        </CardTitle>
        <CardDescription>
          Modelos de mensagem enviados ao técnico sobre suas rotas. Use as variáveis entre chaves para preenchimento automático.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Flag className="h-4 w-4 text-amber-600" />
            Mensagem — Paradas Intermediárias com Check-in
          </Label>
          <p className="text-xs text-muted-foreground">
            Enviada ao técnico quando sua rota contém paradas intermediárias (sem OS). Explica a obrigatoriedade do check-in em cada parada para contabilizar o KM corretamente.
          </p>
          <Textarea value={intermediateStops} onChange={e => setIntermediateStops(e.target.value)} rows={10} className="font-mono text-xs" />
          <p className="text-xs text-muted-foreground">
            Variáveis: <code className="bg-muted px-1 rounded">{`{tecnico}`}</code> <code className="bg-muted px-1 rounded">{`{rota_codigo}`}</code> <code className="bg-muted px-1 rounded">{`{data}`}</code> <code className="bg-muted px-1 rounded">{`{paradas}`}</code> <code className="bg-muted px-1 rounded">{`{total_paradas}`}</code>
          </p>
          <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
            <Truck className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              <strong>{`{paradas}`}</strong> é preenchido com a lista de paradas (identificação + endereço, uma por linha).
              <strong> {`{total_paradas}`}</strong> é o número de paradas intermediárias na rota.
            </p>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saveMutation.isPending || !settingId} className="gap-2">
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? "Salvando..." : "Salvar Modelo"}
        </Button>
      </CardContent>
    </Card>
  );
}