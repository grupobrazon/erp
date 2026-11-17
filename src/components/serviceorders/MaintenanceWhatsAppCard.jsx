import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { MessageCircle, Copy, Check, Send, Wrench, ShieldCheck, Search } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Gerador de mensagens WhatsApp para OS de Manutenção.
 * Três modelos padronizados: Análise, Assistência Técnica e Garantia.
 * Puxa dados do cliente e do agendamento, permite copiar e abrir no WhatsApp.
 */
export default function MaintenanceWhatsAppCard({ order, client, appointment }) {
  const { toast } = useToast();
  const [template, setTemplate] = useState("analise");
  const [displacementFee, setDisplacementFee] = useState("60,00");
  const [copied, setCopied] = useState(false);

  const clientName = client?.name || order?.client_name || "[NOME DO CLIENTE]";
  const firstName = clientName.split(" ")[0] || clientName;

  const dateLabel = appointment?.date
    ? format(new Date(appointment.date + "T00:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    : "[DATA]";

  const periodLabel = appointment?.time_type === "Manhã"
    ? "MANHÃ"
    : appointment?.time_type === "Tarde"
    ? "TARDE"
    : appointment?.time_type === "Dia Inteiro"
    ? "DIA INTEIRO"
    : appointment?.specific_time
    ? `às ${appointment.specific_time}`
    : "[MANHÃ/TARDE]";

  const fullAddress = useMemo(() => {
    const addr = order?.delivery_address || {};
    const parts = [
      addr.street,
      addr.number && `nº ${addr.number}`,
      addr.complement,
      addr.neighborhood && `bairro ${addr.neighborhood}`,
      addr.city && `${addr.city}/${addr.state || ""}`,
      addr.zip_code && `CEP ${addr.zip_code}`,
    ].filter(Boolean).join(", ");
    return parts || "—";
  }, [order]);

  const feeValue = displacementFee.replace(/[^\d,.]/g, "") || "60,00";

  const templates = {
    analise: `Olá, ${firstName}! Tudo bem?

Estamos confirmando o seu atendimento técnico para ${dateLabel}, no período ${periodLabel}.

A Ordem de Serviço foi aberta inicialmente na modalidade ANÁLISE, destinada à avaliação do equipamento para identificarmos a origem da ocorrência e verificarmos se o atendimento está ou não coberto pela garantia.

Neste primeiro momento, não haverá nenhuma cobrança antecipada.

Durante a visita, o técnico realizará a análise do equipamento:

• Caso seja constatado um problema coberto pela garantia, o atendimento seguirá sem cobrança da taxa de deslocamento, conforme as condições de garantia aplicáveis.

• Caso seja constatado que a ocorrência não está coberta pela garantia, será aplicada uma taxa de deslocamento no valor de R$ ${feeValue}.

Se, nesse segundo caso, também houver necessidade de peças, reparos ou serviços de manutenção, será apresentado previamente um orçamento ao cliente, e qualquer serviço adicional somente será realizado mediante sua autorização.

Para formalizarmos o atendimento, pedimos, por gentileza, que responda a esta mensagem com "DE ACORDO", confirmando ciência das condições acima e do agendamento.

Atenciosamente,
Equipe de Assistência Técnica | Brazon`,

    assistencia: `Olá, ${firstName}! Tudo bem?

Estamos confirmando o seu atendimento de Assistência Técnica para ${dateLabel}, no período ${periodLabel}.

Para este atendimento, será aplicada uma taxa de deslocamento no valor de R$ ${feeValue}, referente à visita técnica ao endereço informado.

Durante o atendimento, o técnico realizará a avaliação do equipamento para identificar os reparos necessários.

Caso seja necessária a substituição de peças ou a realização de serviços adicionais, será apresentado previamente um orçamento, contendo os respectivos valores. O reparo somente será realizado após a sua autorização.

Para formalizarmos o atendimento, pedimos, por gentileza, que responda a esta mensagem com "DE ACORDO", confirmando ciência da taxa de deslocamento, das condições do atendimento e do agendamento.

Atenciosamente,
Equipe de Assistência Técnica | Brazon`,

    garantia: `Olá, ${firstName}! Tudo bem?

Estamos confirmando o seu atendimento técnico em GARANTIA para ${dateLabel}, no período ${periodLabel}.

Após a análise prévia do seu atendimento, a ocorrência foi direcionada para atendimento em garantia.

Dessa forma, não haverá cobrança de taxa de deslocamento, mão de obra ou dos reparos cobertos pela garantia, conforme as condições aplicáveis ao produto.

Nosso técnico realizará o atendimento no endereço informado e adotará os procedimentos necessários para avaliação e correção da ocorrência.

Pedimos, por gentileza, que responda a esta mensagem com "DE ACORDO" para confirmar o agendamento.

Atenciosamente,
Equipe de Assistência Técnica | Brazon`,
  };

  const message = templates[template] || "";
  const hasPhone = !!(client?.phone1 || client?.phone2);

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

  const templateOptions = [
    { value: "analise", label: "Análise", icon: Search, desc: "Avaliação do equipamento — pode haver cobrança" },
    { value: "assistencia", label: "Assistência Técnica", icon: Wrench, desc: "Cobrança de taxa de deslocamento" },
    { value: "garantia", label: "Garantia", icon: ShieldCheck, desc: "Sem cobrança — reparo coberto" },
  ];

  return (
    <div className="rounded-lg border border-green-200 bg-green-50/30 p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-green-800">
        <MessageCircle className="h-4 w-4" /> Mensagem de Confirmação (WhatsApp)
      </div>
      <p className="text-xs text-muted-foreground">
        Selecione o modelo conforme o tipo de atendimento, copie e envie direto no WhatsApp do cliente.
      </p>

      <div>
        <Label className="text-xs">Modelo de Mensagem</Label>
        <Select value={template} onValueChange={setTemplate}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {templateOptions.map(opt => {
              const Icon = opt.icon;
              return (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5" />
                    <span>
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-xs text-muted-foreground ml-1">— {opt.desc}</span>
                    </span>
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {template !== "garantia" && (
        <div>
          <Label className="text-xs">Taxa de Deslocamento (R$)</Label>
          <Input
            value={displacementFee}
            onChange={e => setDisplacementFee(e.target.value)}
            placeholder="60,00"
            className="h-8"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copyMessage} className="gap-2">
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copiado!" : "Copiar Mensagem"}
        </Button>
        {hasPhone && (
          <Button type="button" variant="outline" size="sm" onClick={openWhatsApp} className="gap-2">
            <Send className="h-4 w-4" /> Abrir no WhatsApp
          </Button>
        )}
      </div>

      {!hasPhone && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          Cliente sem telefone cadastrado — copie a mensagem e envie manualmente.
        </p>
      )}

      <Textarea
        rows={16}
        value={message}
        readOnly
        className="text-sm font-mono bg-white"
      />
    </div>
  );
}