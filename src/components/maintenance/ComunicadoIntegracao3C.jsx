import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Phone, Headphones, LogIn, LogOut, Coffee, PlayCircle,
  Users, BarChart3, Radio, CheckCircle2, Copy, Check,
  Sparkles, MessageCircle, UserCheck, PhoneCall
} from "lucide-react";

export default function ComunicadoIntegracao3C() {
  const [copied, setCopied] = useState(false);

  const mensagem = `🎉 NOVIDADE NO SISTEMA! 🎉

Pessoal, boa notícia! O 3C Plus já está 100% integrado dentro do nosso sistema ERP Brazon!

Agora vocês já podem fazer as ligações das campanhas diretamente por aqui — sem precisar abrir outra aba ou acessar o painel separado do discador.

✅ As listas da Adriana e da Isadora já subiram para a ligação e já estão prontas para uso!

━━━━━━━━━━━━━━━━━━━━━━━━━

📋 COMO ACESSAR — PASSO A PASSO:

1️⃣  Entre no sistema e vá no menu "Manutenção"
2️⃣  Clique na aba "Campanhas 3C Plus"
3️⃣  Selecione a sua campanha no campo "Campanha" (só vai aparecer as campanhas ativas que foram criadas para você)
4️⃣  Clique em "Entrar na Campanha"

━━━━━━━━━━━━━━━━━━━━━━━━━

🎧 O SOFTPHONE (TELEFONE) VAI APARECER NA TELA

Logo ao lado dos controles, vai aparecer o softphone do 3C Plus — é por ele que vocês escutam e falam com os clientes.

👉 Clique em "Permitir microfone" quando o navegador pedir (é só na primeira vez).

━━━━━━━━━━━━━━━━━━━━━━━━━

📞 COMO FUNCIONA — AS MESMAS FUNÇÕES DO 3C PLUS:

🟢 RECEBER LIGAÇÃO
Quando um cliente atende, a chamada cai automaticamente no seu softphone. Na tela vai aparecer:
• O nome do cliente
• O telefone
• O equipamento vinculado (se tiver)
• Botão para abrir o CRM do cliente
• Botão para criar uma venda

🔴 ENCERRAR LIGAÇÃO
Clique em "Encerrar Chamada" para finalizar a conversa a qualquer momento.

☕ PAUSAR (INTERVALO)
Quando estiver ociosa, vão aparecer os botões de pausa (Almoço, Banheiro, etc.). Clique para pausar.
👉 Para voltar a receber ligações, clique em "Retomar Ligações".

🔄 PÓS-ATENDIMENTO (ACW)
Depois de encerrar uma chamada, o sistema entra em "Pós-Atendimento". É o tempo para você finalizar as anotações do cliente.
👉 Clique em "Voltar a Disponível" para começar a receber novas ligações.

📊 HISTÓRICO DE CHAMADAS
Abaixo do discador, aparece o histórico de todas as ligações da campanha — quem atendeu, quem não atendeu, duração, e link da gravação.

📈 HISTÓRICO DE SESSÃO
O sistema registra automaticamente: horário de login, tempo logada, tempo em pausa, total de chamadas, chamadas atendidas e tempo de conversa. Tudo para acompanhar a produtividade!

━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ IMPORTANTE:

• Sempre façam LOGOUT ao final do expediente (botão "Sair da Campanha") para encerrar a sessão corretamente.
• Se trocarem de aba ou saírem do painel, a sessão é encerrada automaticamente.
• O microfone precisa estar permitido no navegador para as ligações funcionarem.
• Se a campanha não aparecer, peçam para o administrador verificar se a campanha foi criada e atribuída para vocês.

━━━━━━━━━━━━━━━━━━━━━━━━━

Qualquer dúvida, é só chamar! 🚀

Bom trabalho e boas vendas! 💪`;

  const handleCopy = () => {
    navigator.clipboard.writeText(mensagem);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const passos = [
    { icon: Users, titulo: "1. Acesse o menu Manutenção", desc: "Vá em Manutenção → aba Campanhas 3C Plus" },
    { icon: Radio, titulo: "2. Selecione sua campanha", desc: "Só aparecem as campanhas ativas atribuídas a você" },
    { icon: LogIn, titulo: "3. Entre na campanha", desc: "Clique em Entrar na Campanha para começar" },
    { icon: Headphones, titulo: "4. Softphone na tela", desc: "Permita o microfone e pronto — já pode ligar!" },
  ];

  const funcionalidades = [
    { icon: PhoneCall, titulo: "Receber ligações", desc: "Chamadas caem automaticamente no softphone com dados do cliente" },
    { icon: Phone, titulo: "Encerrar chamada", desc: "Botão para finalizar a conversa a qualquer momento" },
    { icon: Coffee, titulo: "Pausar / Intervalo", desc: "Botões de pausa (Almoço, Banheiro...) e Retomar Ligações" },
    { icon: PlayCircle, titulo: "Pós-Atendimento (ACW)", desc: "Tempo para anotar + botão Voltar a Disponível" },
    { icon: BarChart3, titulo: "Histórico de chamadas", desc: "Quem atendeu, duração, gravação — tudo visível" },
    { icon: UserCheck, titulo: "Histórico de sessão", desc: "Login, tempo, pausas, chamadas — produtividade registrada" },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-br from-primary/10 to-accent/5 border-primary/30">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold font-heading">Novidade no Sistema!</span>
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">3C Plus integrado ao ERP Brazon</CardTitle>
          <CardDescription className="text-base mt-2">
            Agora vocês podem fazer as ligações das campanhas diretamente pelo sistema — sem sair do ERP!
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Badge variant="default" className="gap-1.5 text-sm py-1.5">
              <CheckCircle2 className="h-4 w-4" /> Lista da Adriana já subiu
            </Badge>
            <Badge variant="default" className="gap-1.5 text-sm py-1.5">
              <CheckCircle2 className="h-4 w-4" /> Lista da Isadora já subiu
            </Badge>
            <Badge variant="secondary" className="gap-1.5 text-sm py-1.5">
              <Headphones className="h-4 w-4" /> Softphone integrado
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Passo a passo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Radio className="h-5 w-5 text-primary" />
            Como acessar — Passo a passo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {passos.map((p, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <p.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{p.titulo}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Funcionalidades */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Phone className="h-5 w-5 text-primary" />
            Funcionalidades — as mesmas do 3C Plus
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {funcionalidades.map((f, i) => (
              <div key={i} className="p-3 rounded-lg border border-border hover:border-primary/40 transition-colors">
                <div className="flex items-center gap-2 mb-1.5">
                  <f.icon className="h-4 w-4 text-accent" />
                  <span className="font-semibold text-sm">{f.titulo}</span>
                </div>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Avisos importantes */}
      <Card className="border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-amber-700 dark:text-amber-400">
            <MessageCircle className="h-5 w-5" />
            Importante lembrar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <LogOut className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
              <span>Sempre façam <strong>Logout</strong> ao final do expediente (botão "Sair da Campanha")</span>
            </li>
            <li className="flex items-start gap-2">
              <Headphones className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
              <span>O <strong>microfone</strong> precisa estar permitido no navegador</span>
            </li>
            <li className="flex items-start gap-2">
              <Radio className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
              <span>Se a campanha não aparecer, peçam para o <strong>administrador</strong> verificar a atribuição</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Mensagem para copiar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageCircle className="h-5 w-5 text-primary" />
            Mensagem pronta para enviar
          </CardTitle>
          <CardDescription>Clique para copiar e colar no WhatsApp / e-mail dos vendedores</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <pre className="whitespace-pre-wrap text-sm bg-muted rounded-lg p-4 border border-border font-body max-h-[400px] overflow-y-auto">
              {mensagem}
            </pre>
            <Button
              onClick={handleCopy}
              className="absolute top-3 right-3"
              size="sm"
              variant={copied ? "default" : "secondary"}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copiado!" : "Copiar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}