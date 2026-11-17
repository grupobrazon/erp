import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import moment from "moment";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MessageSquare, RefreshCw, Loader2 } from "lucide-react";

const JANELAS = [
  { value: "24", label: "Últimas 24 horas" },
  { value: "72", label: "Últimos 3 dias" },
  { value: "168", label: "Últimos 7 dias" },
];

const SITUACOES = {
  respondido: { label: "Resposta enviada", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  outro_fluxo: { label: "Atendido por outro fluxo", className: "bg-slate-100 text-slate-700 border-slate-200" },
  aguardando: { label: "Aguardando resposta", className: "bg-amber-100 text-amber-900 border-amber-200" },
  sem_equipamento: { label: "Sem equipamento", className: "bg-sky-100 text-sky-900 border-sky-200" },
};

const LIMITE_LINHAS = 100;

function SituacaoBadge({ situacao }) {
  const config = SITUACOES[situacao] || SITUACOES.aguardando;
  return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
}

function ResumoInteracao({ titulo, resumo }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-sm font-medium">{titulo}</p>
      <p className="text-xs text-muted-foreground">
        {resumo.cliques} clique(s) · {resumo.respondidos} respondido(s) · {resumo.outro_fluxo} atendido(s) por outro fluxo
        {resumo.sem_equipamento > 0 ? ` · ${resumo.sem_equipamento} sem equipamento` : ""}
        {resumo.aguardando > 0 ? ` · ${resumo.aguardando} aguardando` : ""}
      </p>
    </div>
  );
}

export default function CampaignInteractionsCard() {
  const [horas, setHoras] = useState("24");

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["campaignInteractions", horas],
    queryFn: async () => {
      const resposta = await base44.functions.invoke("listCampaignInteractions", { horas: Number(horas) });
      return resposta.data;
    },
  });

  const linhas = data?.linhas || [];
  const resumo = data?.resumo || {};
  const visiveis = linhas.slice(0, LIMITE_LINHAS);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          Interações da campanha no WhatsApp
        </CardTitle>
        <CardDescription>
          Quem clicou em "QUERO SER VIP" e quem respondeu "SEM CONDIÇÕES AGORA" na campanha, com a situação de cada um —
          se já recebeu a resposta automática, se outro fluxo atendeu ou se ainda está aguardando. Leitura do histórico de
          conversas do CRM (GoHighLevel), sem enviar nada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={horas} onValueChange={setHoras}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JANELAS.map((janela) => (
                <SelectItem key={janela.value} value={janela.value}>{janela.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {isFetching ? "Lendo conversas..." : "Atualizar"}
          </Button>
          {data?.leitura_parcial && (
            <p className="text-xs text-muted-foreground">
              Muitas conversas no período: a leitura cobre as {data?.conversas_lidas} mais recentes.
            </p>
          )}
        </div>

        {data?.resumo && (
          <div className="grid gap-3 sm:grid-cols-2">
            <ResumoInteracao titulo="QUERO SER VIP" resumo={resumo["QUERO SER VIP"] || { cliques: 0, respondidos: 0, outro_fluxo: 0, aguardando: 0 }} />
            <ResumoInteracao titulo="SEM CONDIÇÕES AGORA" resumo={resumo["SEM CONDIÇÕES AGORA"] || { cliques: 0, respondidos: 0, outro_fluxo: 0, aguardando: 0 }} />
          </div>
        )}

        {linhas.length > 0 ? (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Interação</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((linha, index) => (
                  <TableRow key={`${linha.conversa_id}-${linha.interacao}-${index}`}>
                    <TableCell>
                      <div className="font-medium">{linha.nome || "—"}</div>
                      <div className="text-xs text-muted-foreground">{linha.telefone}</div>
                    </TableCell>
                    <TableCell className="text-sm">{linha.interacao}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {linha.clique_em ? moment(linha.clique_em).format("DD/MM/YYYY HH:mm") : "—"}
                    </TableCell>
                    <TableCell><SituacaoBadge situacao={linha.situacao} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {linhas.length > LIMITE_LINHAS && (
              <p className="border-t p-3 text-xs text-muted-foreground">
                Mostrando as {LIMITE_LINHAS} interações mais recentes de {linhas.length}.
              </p>
            )}
          </div>
        ) : (
          <p className="rounded-lg border p-3 text-sm text-muted-foreground">
            {isFetching ? "Lendo as conversas do CRM..." : "Nenhuma interação da campanha no período selecionado."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}