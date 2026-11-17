import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquareText, Save, PartyPopper, Truck, AlarmClock } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// Modelos padrão do sistema: são os mesmos textos que as automações usam quando o
// campo está vazio no cadastro de configurações. Editando aqui, o texto salvo passa
// a ser o enviado.
const BOAS_VINDAS_INSTALACAO = `🎉 💙 *PARABÉNS! AGORA VOCÊ FAZ PARTE DO GRUPO VIP BRAZON!*

Você acaba de garantir acesso a condições exclusivas e benefícios especiais!

✨ *Confira suas vantagens:*
✅ *20% de desconto VITALÍCIO* em todas as suas futuras trocas de refil!
✅ Seu refil de R$ 295,00 sai por apenas *R$ 236,00!*
✅ *Pagamento facilitado:* via Pix ou em até 4x sem juros no cartão de crédito.
✅ *Instalação GRATUITA!* Nossa equipe técnica irá até você realizar a troca do refil, sem custo adicional.

💙 Nossa equipe entrará em contato para agendar a visita do técnico.

Para darmos andamento, como prefere realizar o pagamento: *Pix ou cartão de crédito?*

🥰 É um prazer ter você no VIP Brazon!`;

const BOAS_VINDAS_FRETE = `🎉 💙 *PARABÉNS! AGORA VOCÊ FAZ PARTE DO GRUPO VIP BRAZON!*

Você acaba de garantir acesso a condições exclusivas e benefícios especiais!

✨ *E temos uma novidade ainda melhor para você!*
✅ *20% de desconto VITALÍCIO* em todas as suas futuras compras de refil!
✅ Seu refil de R$ 295,00 sai por apenas *R$ 236,00!*
✅ *Pagamento facilitado:* via Pix ou em até 4x sem juros no cartão de crédito.
🚚 *20% de desconto especial no FRETE* para o envio do seu refil!

💙 Queremos facilitar sua compra e garantir que você mantenha seu purificador em dia, com economia!

📍 *Podemos confirmar seu endereço de entrega?*
_Endereço cadastrado:_ {endereco}

Assim, já conseguimos calcular o frete com seu desconto VIP!

*E como prefere realizar o pagamento: Pix ou cartão de crédito?*

🤩 É um prazer ter você no VIP Brazon!`;

const LEMBRETE_ADESAO = `💙 Olá! Ainda não identificamos sua adesão ao *Grupo VIP Brazon* pelo link enviado.

🥰 *Não deixe de aproveitar essa condição imperdível!*

✨ O refil que normalmente custa *R$ 295,00* sai por apenas *R$ 236,00*, com *20% de desconto imediato e vitalício* nas suas futuras trocas!

✅ *Pagamento facilitado:* via Pix ou em até 4x sem juros no cartão.

💙 *Para garantir seu benefício, basta acessar o link enviado acima e aceitar o Termo de Adesão ao VIP Brazon.*

Assim que concluir, nos avise por aqui para darmos andamento ao seu pedido! 🥰`;

const MODELOS = [
  {
    field: "vip_welcome_msg_instalacao",
    icon: PartyPopper,
    label: "Boas-vindas — instalação gratuita (DDD 11 e 31)",
    description:
      "Enviada quando o cliente assina um link gerado pela automação e o atendimento é por rota de técnico, com instalação gratuita.",
    variaveis: ["{cliente}", "{endereco}"],
    padrao: BOAS_VINDAS_INSTALACAO,
  },
  {
    field: "vip_welcome_msg_frete",
    icon: Truck,
    label: "Boas-vindas — envio por transportadora",
    description:
      "Enviada quando o cliente assina um link gerado pela automação e o refil vai por transportadora, com desconto no frete.",
    variaveis: ["{cliente}", "{endereco}"],
    padrao: BOAS_VINDAS_FRETE,
  },
  {
    field: "vip_reminder_message",
    icon: AlarmClock,
    label: "Lembrete de adesão (4 horas depois do link)",
    description:
      "Enviado a quem recebeu o link pela automação e ainda não assinou o termo de adesão.",
    variaveis: ["{cliente}"],
    padrao: LEMBRETE_ADESAO,
  },
];

const valoresIniciais = () =>
  MODELOS.reduce((acc, modelo) => ({ ...acc, [modelo.field]: modelo.padrao }), {});

export default function CampaignMessagesCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [settingId, setSettingId] = useState(null);
  const [form, setForm] = useState(valoresIniciais);

  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSetting.list("-created_date", 1),
  });

  useEffect(() => {
    const s = settings[0];
    if (!s) return;
    setSettingId(s.id);
    setForm({
      vip_welcome_msg_instalacao: s.vip_welcome_msg_instalacao || BOAS_VINDAS_INSTALACAO,
      vip_welcome_msg_frete: s.vip_welcome_msg_frete || BOAS_VINDAS_FRETE,
      vip_reminder_message: s.vip_reminder_message || LEMBRETE_ADESAO,
    });
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.SystemSetting.update(settingId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      toast({ title: "Modelos salvos", description: "As próximas mensagens já saem com o texto novo." });
    },
    onError: (err) => toast({ title: "Erro ao salvar", description: err?.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareText className="h-5 w-5 text-primary" />
          Modelos de mensagem das automações
        </CardTitle>
        <CardDescription>
          Textos das mensagens automáticas da campanha. As variáveis entre chaves são preenchidas no envio e um campo
          deixado vazio volta a usar o modelo padrão do sistema.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {MODELOS.map((modelo) => (
          <div key={modelo.field} className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <modelo.icon className="h-4 w-4 text-primary" />
              {modelo.label}
            </Label>
            <p className="text-xs text-muted-foreground">{modelo.description}</p>
            <Textarea
              value={form[modelo.field] || ""}
              onChange={(e) => setForm((current) => ({ ...current, [modelo.field]: e.target.value }))}
              rows={10}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Variáveis:{" "}
              {modelo.variaveis.map((variavel) => (
                <code key={variavel} className="bg-muted px-1 rounded mr-1">{variavel}</code>
              ))}
            </p>
          </div>
        ))}

        <Button
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending || !settingId}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? "Salvando..." : "Salvar Modelos"}
        </Button>
      </CardContent>
    </Card>
  );
}