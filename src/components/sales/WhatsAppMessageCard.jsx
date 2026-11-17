import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MessageCircle, Copy, Check, Loader2, Sparkles, Send } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function WhatsAppMessageCard({
  client,
  date,
  timeType,
  specificTime,
  serviceDetailTypes,
  serviceDetailNotes,
  items,
  services,
  deliveryModality,
}) {
  const { toast } = useToast();
  const [clientNote, setClientNote] = useState("");
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const canGenerate = !!client?.name && !!date;

  const fullAddress = [
    client?.street,
    client?.number && `nº ${client.number}`,
    client?.complement,
    client?.neighborhood && `bairro ${client.neighborhood}`,
    client?.city && `${client.city}/${client.state || ""}`,
    client?.zip_code && `CEP ${client.zip_code}`,
  ].filter(Boolean).join(", ");

  const periodLabel = {
    Manhã: "no período da manhã",
    Tarde: "no período da tarde",
    "Dia Inteiro": "durante todo o dia",
    "Horário Específico": `às ${specificTime || "horário a confirmar"}`,
  }[timeType] || "em horário a confirmar";

  const dateLabel = date
    ? format(new Date(date + "T00:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    : "";

  const productList = (items || []).map(i => `${i.product_name} (${i.quantity}x)`).join(", ");
  const serviceList = (services || []).map(s => `${s.service_name} (${s.quantity}x)`).join(", ");
  const serviceTypeList = (serviceDetailTypes || []).map(t => t.service_type_name).join(", ");

  const generateMessage = async () => {
    setGenerating(true);
    try {
      const prompt = `Gere uma mensagem de WhatsApp de confirmação de agendamento para um cliente da Brazon (empresa de purificadores de água e bebedouros). A mensagem deve ser bonita, acolhedora e bem formatada para WhatsApp — com emojis, seções separadas por linhas em branco e linguagem simples que o cliente entenda.

DADOS DO AGENDAMENTO:
- Nome do cliente: ${client?.name || ""}
- Data do agendamento: ${dateLabel}
- Período: ${periodLabel}
- Endereço completo: ${fullAddress || "Não informado"}
- Modalidade de entrega: ${deliveryModality || "Entrega"}
- Produtos que serão entregues: ${productList || "Nenhum"}
- Serviços contratados: ${serviceList || "Nenhum"}
- Tipos de serviço do atendimento: ${serviceTypeList || "Nenhum"}
- Observação do técnico (detalhamento do serviço): ${serviceDetailNotes || "Nenhuma"}
- Observação adicional para o cliente: ${clientNote || "Nenhuma"}

ESTRUTURA OBRIGATÓRIA DA MENSAGEM (use emojis como marcadores visuais):
1. Linha 1: Saudação com emoji + primeiro nome do cliente (ex: "Olá, {nome}! 😊" ou "Bom dia, {nome}! ☀️")
2. Linha em branco
3. Título com emoji: "📅 Confirmação de Agendamento Brazon"
4. Linha em branco
5. Texto acolhedor: "Conforme conversamos, seu agendamento está marcado para o dia {data por extenso}, {período}."
6. Linha em branco
7. Seção "📍 Endereço do atendimento:" seguida do endereço completo
8. Linha em branco
9. Seção "📦 O que vamos levar:" — liste os produtos de forma amigável (um por linha com emoji 📌), traduzindo termos técnicos
10. Se houver serviços contratados, seção "🔧 Serviços:" — liste de forma simples (um por linha com emoji)
11. Se houver observações do técnico ou para o cliente, incorpore-as de forma natural e amigável em uma seção "💬 Observações:" (não cite "observação do técnico" — apenas repasse a informação que o cliente precisa saber)
12. Linha em branco
13. Rodapé com emoji: "☎️ Um dia útil antes, o nosso setor de logística entrará em contato para a confirmação final do agendamento."
14. Linha em branco
15. Encerramento carinhoso: "Obrigada pela confiança! 💙"

REGRAS:
- Use linguagem simples, amigável e acolhedora, como uma conversa com o cliente
- Não use jargões técnicos nem termos internos da empresa
- Seja completo — não omita nenhum dado importante
- USE emojis (📅, 📍, 📦, 📌, 🔧, 💬, ☎️, 😊, 💙, etc.) para deixar a mensagem bonita e organizada
- Separe cada seção com uma linha em branco para legibilidade
- Não use formatação markdown (sem asteriscos, sem negrito) — apenas texto puro com emojis e quebras de linha
- Retorne apenas o texto da mensagem, sem aspas, sem comentários, sem formatação extra`;

      const res = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            message: { type: "string" },
          },
        },
      });
      setMessage(res?.message || "");
    } catch (err) {
      toast({ title: "Erro ao gerar mensagem", description: err?.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const copyMessage = () => {
    navigator.clipboard.writeText(message);
    setCopied(true);
    toast({ title: "Mensagem copiada!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const openWhatsApp = () => {
    const rawPhone = client?.phone1 || client?.phone2 || "";
    const digits = rawPhone.replace(/\D/g, "");
    const formatted = digits.startsWith("55") ? digits : `55${digits}`;
    const url = `https://wa.me/${formatted}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  };

  const hasPhone = !!(client?.phone1 || client?.phone2);

  return (
    <Card className="border-green-200">
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-green-600" />
          <h3 className="font-medium">Mensagem de Confirmação (WhatsApp)</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Gere uma mensagem de confirmação de agendamento para copiar e enviar ao cliente no WhatsApp.
        </p>

        <div>
          <Label className="text-xs">Observação para o cliente (opcional)</Label>
          <Textarea
            rows={2}
            value={clientNote}
            onChange={(e) => setClientNote(e.target.value)}
            placeholder="Adicione uma observação que será incluída na mensagem para o cliente"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Esta observação será incorporada pela IA na mensagem de forma natural.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={generateMessage}
            disabled={generating || !canGenerate}
            className="gap-2"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "Gerando..." : message ? "Regenerar Mensagem" : "Gerar Mensagem"}
          </Button>
          {message && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={copyMessage} className="gap-2">
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copiado!" : "Copiar"}
              </Button>
              {hasPhone && (
                <Button type="button" variant="outline" size="sm" onClick={openWhatsApp} className="gap-2">
                  <Send className="h-4 w-4" />
                  Abrir no WhatsApp
                </Button>
              )}
            </>
          )}
        </div>

        {!canGenerate && (
          <p className="text-xs text-muted-foreground">
            Selecione o cliente e a data do agendamento acima para gerar a mensagem.
          </p>
        )}

        {message && (
          <Textarea
            rows={10}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="text-sm"
          />
        )}
      </CardContent>
    </Card>
  );
}