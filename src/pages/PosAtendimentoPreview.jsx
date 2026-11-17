import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Phone, PhoneOff, MessageCircle, ClipboardCheck, ArrowDown, Save,
  Radio, Search, Check, User, Package, AlertCircle, Coffee, LogOut,
} from "lucide-react";

const QUALIFICATIONS = [
  { id: 66373, name: "Comprou com revendedor", color: "#d32f2f", impact: "Positivo" },
  { id: 121642, name: "Bloquear contato", color: "#d32f2f", impact: "Positivo" },
  { id: 65403, name: "Retornar ligação", color: "#1a237e", impact: "Positivo" },
  { id: 65987, name: "Em dia", color: "#388e3c", impact: "Positivo" },
  { id: 65712, name: "Não tem mais o produto", color: "#d32f2f", impact: "Positivo" },
  { id: 65404, name: "Venda feita por telefone", color: "#388e3c", impact: "Positivo" },
  { id: 65402, name: "Telefone incorreto / Engano", color: "#1a237e", impact: "Negativo" },
  { id: 65401, name: "Falecido", color: "#212121", impact: "Negativo" },
  { id: 65400, name: "Sem interesse", color: "#bf360c", impact: "Positivo" },
  { id: 65399, name: "Em negociação whatsapp", color: "#388e3c", impact: "Negativo" },
  { id: 65398, name: "Sem contato / Ligação caiu", color: "#ffd600", impact: "Negativo" },
];

const SYSTEM_DEFAULTS = [
  { id: -2, name: "Não qualificada", color: "#9e9e9e" },
  { id: -3, name: "Caixa Postal", color: "#212121" },
  { id: -4, name: "Mudo", color: "#212121" },
];

const BREAKS = [
  "Reunião interna",
  "Banheiro",
  "Café/Lanche",
  "Almoço",
  "Em Negociação WhatsApp",
];

function StepConnector({ label }) {
  return (
    <div className="flex flex-col items-center py-1.5 select-none">
      <div className="h-5 w-px bg-border" />
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full border">
        <ArrowDown className="h-3 w-3" /> {label}
      </div>
      <div className="h-5 w-px bg-border" />
    </div>
  );
}

function MockCallEnded() {
  return (
    <Card className="border-destructive/30 max-w-2xl mx-auto w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <PhoneOff className="h-4 w-4 text-destructive" />
          Ligação Encerrada
          <Badge variant="secondary" className="ml-auto font-mono text-xs">(31) 98888-1234</Badge>
        </CardTitle>
        <CardDescription>A chamada foi finalizada. Iniciando o fluxo de pós-atendimento.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border p-3 space-y-2 bg-muted/30">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Maria Aparecida Souza</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Package className="h-3.5 w-3.5" />
            Purificador iPure · <Badge variant="outline" className="text-xs font-mono">EQ00482</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MockFollowup() {
  const [done, setDone] = useState(false);
  return (
    <Card className="max-w-2xl mx-auto w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          Etapa 1 — Registrar Contato / Follow-up
          <span className="ml-auto text-xs font-normal text-muted-foreground">opcional</span>
        </CardTitle>
        <CardDescription>Registre o atendimento, se necessário. Pode pular se não houver contato útil.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border p-3 space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Tipo de contato</label>
              <div className="h-9 rounded-md border border-input px-3 flex items-center text-sm text-muted-foreground">Retorno / Negociação</div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Próximo retorno</label>
              <div className="h-9 rounded-md border border-input px-3 flex items-center text-sm text-muted-foreground">12/09/2026</div>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Observações do follow-up</label>
            <div className="min-h-[60px] rounded-md border border-input px-3 py-2 text-sm text-muted-foreground">
              Cliente quer aguardar promoção do refil. Retornar semana que vem.
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant={done ? "default" : "secondary"} onClick={() => setDone(true)} className="gap-1.5">
            {done ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {done ? "Contato salvo" : "Salvar contato"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDone(true)}>Pular registro</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function QualificationTable() {
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const filtered = QUALIFICATIONS.filter((q) =>
    q.name.toLowerCase().includes(query.toLowerCase()) || String(q.id).includes(query)
  );
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar lista de qualificação"
          className="pl-8 border-b border-[#e0e0e0] rounded-none border-0 focus-visible:ring-0 shadow-none"
        />
      </div>
      <div className="rounded-md border overflow-hidden">
        <div className="grid grid-cols-[28px_70px_1fr_90px] gap-2 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground bg-muted/40 border-b uppercase">
          <span>COR</span><span>ID</span><span>NOME</span><span className="text-right">IMPACTO</span>
        </div>
        <div className="max-h-[200px] overflow-y-auto divide-y">
          {filtered.map((q) => (
            <button
              key={q.id}
              onClick={() => setSelected(q.id)}
              className={`w-full grid grid-cols-[28px_70px_1fr_90px] gap-2 px-3 py-2 text-sm items-center text-left transition-colors ${
                selected === q.id ? "bg-primary/10" : "hover:bg-muted/40"
              }`}
            >
              <span className="flex justify-center">
                <span className="h-3 w-3 rounded-full inline-block" style={{ backgroundColor: q.color }} />
              </span>
              <span className="font-mono text-xs text-muted-foreground">{q.id}</span>
              <span>{q.name}</span>
              <span className="text-right text-xs" style={{ color: "#546e7a" }}>{q.impact}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">Nenhuma qualificação encontrada.</div>
          )}
        </div>
      </div>
      <div className="rounded-md border">
        <div className="px-3 py-1.5 text-xs font-semibold border-b bg-muted/30">Qualificações padrão do sistema</div>
        <div className="grid grid-cols-[28px_70px_1fr] gap-2 px-3 py-2 text-sm items-center">
          {SYSTEM_DEFAULTS.map((q) => (
            <React.Fragment key={q.id}>
              <span className="flex justify-center"><span className="h-3 w-3 rounded-full inline-block" style={{ backgroundColor: q.color }} /></span>
              <span className="font-mono text-xs text-muted-foreground">{q.id}</span>
              <span className="text-muted-foreground">{q.name}</span>
            </React.Fragment>
          ))}
        </div>
      </div>
      <Button size="sm" disabled={!selected} className="gap-1.5 w-full">
        <Save className="h-3.5 w-3.5" /> Salvar Classificação
      </Button>
      {!selected && <p className="text-xs text-muted-foreground text-center">Selecione uma qualificação para habilitar o salvamento.</p>}
    </div>
  );
}

function MockPostCall({ mode }) {
  return (
    <Card className="max-w-2xl mx-auto w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Coffee className="h-4 w-4 text-primary" />
          Etapa 2 — Pós-Atendimento
        </CardTitle>
        <CardDescription>Pausas acima, classificação da chamada abaixo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pauses — mesma posição de antes */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs font-medium text-muted-foreground">Pausar:</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {BREAKS.map((b) => (
              <Button key={b} size="sm" variant="outline" className="gap-1">
                <Coffee className="h-3.5 w-3.5" /> {b}
              </Button>
            ))}
          </div>
        </div>

        <div className="border-t pt-3">
          <div className="flex items-center gap-1.5 mb-2">
            <ClipboardCheck className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium">Classificação da Chamada</span>
          </div>
          <QualificationTable />
        </div>

        {/* Voltar a Disponível */}
        <div className="border-t pt-3 flex flex-col items-center gap-2">
          {mode === "auto" ? (
            <Button size="sm" variant="default" className="gap-1.5">
              <Radio className="h-3.5 w-3.5 animate-pulse" /> Voltar a Disponível (automático ao salvar)
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-2 text-amber-600 text-xs w-full">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>O 3C Plus não permite retorno automático após a classificação.</span>
              </div>
              <Button size="sm" variant="default" className="gap-1.5">
                <Radio className="h-3.5 w-3.5" /> Voltar a Disponível
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function PosAtendimentoPreview() {
  const [mode, setMode] = useState("auto");

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-2">
      <div className="text-center space-y-1 mb-3">
        <h1 className="text-xl font-semibold">Prévia do Fluxo de Pós-Atendimento</h1>
        <p className="text-sm text-muted-foreground">
          Ligação encerrada → Follow-up → Pós-Atendimento (pausas + classificação) → retorno à fila. (Apenas visual — ainda não implementado.)
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 py-2">
        <span className="text-xs font-medium text-muted-foreground">Cenário do retorno:</span>
        <Button size="sm" variant={mode === "auto" ? "default" : "outline"} onClick={() => setMode("auto")}>
          Retorno automático (preferido)
        </Button>
        <Button size="sm" variant={mode === "fallback" ? "default" : "outline"} onClick={() => setMode("fallback")}>
          Botão “Voltar a Disponível” (fallback)
        </Button>
      </div>

      <MockCallEnded />
      <StepConnector label="abrir follow-up" />
      <MockFollowup />
      <StepConnector label="salvar / pular" />
      <MockPostCall mode={mode} />

      <div className="mt-6 rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
        <p className="font-medium">Notas do fluxo:</p>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li><b>Registrar Contato / Follow-up</b> (opcional) e <b>Classificação da Chamada</b> (obrigatória) são etapas <b>separadas</b>.</li>
          <li>No Pós-Atendimento, as <b>pausas permanecem no topo</b> (Reunião interna, Banheiro, Café/Lanche, Almoço, Em Negociação WhatsApp) exatamente como antes, e a <b>classificação fica abaixo</b> das pausas.</li>
          <li>Cenário preferido: ao salvar a classificação, a vendedora volta automaticamente a Disponível.</li>
          <li>Se o 3C não permitir retorno automático, o botão “Voltar a Disponível” aparece <b>depois</b> da classificação e devolve a vendedora à fila.</li>
        </ul>
      </div>
    </div>
  );
}