import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Phone, PhoneCall, PhoneMissed, PhoneOff, Voicemail, Send, ExternalLink, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import SendCampaignDialog from "@/components/campanhas3c/SendCampaignDialog";

const statusStyles = {
  "Pendente": "bg-muted text-muted-foreground",
  "Enviada": "bg-blue-100 text-blue-700",
  "Em Discagem": "bg-amber-100 text-amber-700",
  "Concluída": "bg-emerald-100 text-emerald-700",
  "Erro": "bg-red-100 text-red-700",
};

const callStatusIcon = {
  "Atendida": <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />,
  "Não Atendida": <PhoneMissed className="w-3.5 h-3.5 text-amber-600" />,
  "Ocupado": <PhoneOff className="w-3.5 h-3.5 text-orange-600" />,
  "Caixa Postal": <Voicemail className="w-3.5 h-3.5 text-violet-600" />,
  "Inválido": <AlertCircle className="w-3.5 h-3.5 text-red-600" />,
  "Outro": <Phone className="w-3.5 h-3.5 text-muted-foreground" />,
};

export default function Campanhas3C() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);

  const { data: campanhas = [], isLoading } = useQuery({
    queryKey: ["campanhas3c"],
    queryFn: async () => {
      const res = await base44.entities.Campanha3C.list("-created_date", 100);
      return res;
    },
  });

  const { data: chamadas = [] } = useQuery({
    queryKey: ["chamadas3c", selectedCampaign?.id],
    queryFn: async () => {
      if (!selectedCampaign) return [];
      const res = await base44.entities.Chamada3C.filter(
        { campanha_3c_id: selectedCampaign.id },
        "-call_date",
        200
      );
      return res;
    },
    enabled: !!selectedCampaign,
  });

  const totalCalls = campanhas.reduce((sum, c) => (c.metrics?.total_calls || 0) + sum, 0);
  const totalAtendidas = campanhas.reduce((sum, c) => (c.metrics?.atendidas || 0) + sum, 0);
  const totalClients = campanhas.reduce((sum, c) => (c.client_count || 0) + sum, 0);

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Campanhas 3C Plus" description="Envie listas de clientes para o discador 3C Plus e acompanhe os resultados das chamadas.">
        <Button onClick={() => setDialogOpen(true)}>
          <Send className="w-4 h-4" /> Nova Campanha
        </Button>
      </PageHeader>

      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Campanhas</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{campanhas.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Contatos Enviados</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{totalClients}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Chamadas Realizadas</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{totalCalls}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Atendidas</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-emerald-600">{totalAtendidas}</p></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="campanhas" className="w-full">
        <TabsList>
          <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
          <TabsTrigger value="chamadas" disabled={!selectedCampaign}>
            Resultados {selectedCampaign ? `· ${selectedCampaign.name}` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campanhas">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campanha</TableHead>
                    <TableHead>Vendedora</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead className="text-center">Contatos</TableHead>
                    <TableHead className="text-center">Chamadas</TableHead>
                    <TableHead className="text-center">Atendidas</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                  )}
                  {!isLoading && campanhas.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma campanha enviada ainda. Clique em "Nova Campanha".</TableCell></TableRow>
                  )}
                  {campanhas.map((c) => {
                    const m = c.metrics || {};
                    return (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedCampaign(c)}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.seller_name || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.batch_protocol || "—"}</TableCell>
                        <TableCell className="text-center">{c.client_count || 0}</TableCell>
                        <TableCell className="text-center">{m.total_calls || 0}</TableCell>
                        <TableCell className="text-center text-emerald-600 font-medium">{m.atendidas || 0}</TableCell>
                        <TableCell><Badge className={statusStyles[c.status] || statusStyles["Pendente"]}>{c.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          {c.status === "Erro" && <span className="text-xs text-red-600" title={c.error_message}>Ver erro</span>}
                          {c.status === "Enviada" && <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" />}
                          {(c.status === "Em Discagem" || c.status === "Concluída") && <Clock className="w-4 h-4 text-amber-600 inline" />}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chamadas">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead className="text-center">Duração</TableHead>
                    <TableHead>Agente</TableHead>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead className="text-right">Gravação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chamadas.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum resultado recebido ainda.</TableCell></TableRow>
                  )}
                  {chamadas.map((ch) => (
                    <TableRow key={ch.id}>
                      <TableCell className="font-medium">{ch.client_name || "—"}</TableCell>
                      <TableCell className="text-sm">{ch.phone || "—"}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          {callStatusIcon[ch.call_status]}
                          {ch.call_status}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-sm">{ch.call_duration || 0}s</TableCell>
                      <TableCell className="text-sm">{ch.agent_name || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {ch.call_date ? new Date(ch.call_date).toLocaleString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {ch.recording_url ? (
                          <a href={ch.recording_url} target="_blank" rel="noreferrer" className="inline-flex">
                            <ExternalLink className="w-4 h-4 text-primary" />
                          </a>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <SendCampaignDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSent={() => {
          queryClient.invalidateQueries({ queryKey: ["campanhas3c"] });
          toast({ title: "Campanha enviada", description: "Lista de contatos enviada para o 3C Plus." });
        }}
      />
    </div>
  );
}