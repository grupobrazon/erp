import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import {
  Plus, Play, Pencil, Trash2, Power, History, Globe, Clock, Database, Copy,
} from "lucide-react";
import { useTabs } from "@/lib/TabsContext";
import GhlLogsPanel from "@/components/automacoes/GhlLogsPanel";

function generateToken() {
  return "whk_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function Automacoes() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { openTab } = useTabs();
  const [newOpen, setNewOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(null);
  const [form, setForm] = useState({ nome: "", descricao: "", tipo_gatilho: "webhook" });

  const { data: automacoes = [], isLoading } = useQuery({
    queryKey: ["automacoes"],
    queryFn: () => base44.entities.Automacao.list("-updated_date", 100),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Automacao.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automacoes"] });
      setNewOpen(false);
      setForm({ nome: "", descricao: "", tipo_gatilho: "webhook" });
      toast({ title: "Automação criada" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Automacao.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automacoes"] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, ativo }) => base44.entities.Automacao.update(id, { ativo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automacoes"] }),
  });

  const executeMutation = useMutation({
    mutationFn: ({ id, payload }) => base44.functions.invoke("executarAutomacao", { automacao_id: id, payload, salvar_log: true }),
    onSuccess: (res) => {
      const data = res?.data || res;
      toast({
        title: data?.status === "sucesso" ? "Execução concluída" : "Execução com erro",
        variant: data?.status === "sucesso" ? "default" : "destructive",
        description: data?.erro ? `Erro: ${data.erro}` : `${data?.nos_log?.length || 0} nó(s) executado(s)`,
      });
      qc.invalidateQueries({ queryKey: ["automacoes"] });
      qc.invalidateQueries({ queryKey: ["automacao-execucoes"] });
    },
    onError: (e) => toast({ title: "Erro ao executar", variant: "destructive", description: e.message }),
  });

  const handleCreate = () => {
    if (!form.nome.trim()) return toast({ title: "Nome obrigatório", variant: "destructive" });
    const token = form.tipo_gatilho === "webhook" ? generateToken() : undefined;
    createMutation.mutate({
      nome: form.nome,
      descricao: form.descricao,
      tipo_gatilho: form.tipo_gatilho,
      ativo: true,
      webhook_token: token,
      grafo: { nodes: [], edges: [] },
      total_execucoes: 0,
      total_sucessos: 0,
    });
  };

  const handleExecute = (auto) => {
    executeMutation.mutate({ id: auto.id, payload: {} });
  };

  const copyWebhookUrl = (auto) => {
    const url = `${window.location.origin}/api/functions/webhookAutomacao?token=${auto.webhook_token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "URL do webhook copiada" });
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Automações" description="Fluxos visuais estilo n8n com gatilhos webhook, cron e evento de entidade">
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" /> Nova Automação</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Automação</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2} />
              </div>
              <div>
                <Label>Tipo de gatilho</Label>
                <Select value={form.tipo_gatilho} onValueChange={(v) => setForm({ ...form, tipo_gatilho: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="webhook">Webhook (HTTP público)</SelectItem>
                    <SelectItem value="cron">Agendado (Cron)</SelectItem>
                    <SelectItem value="entidade">Evento de Entidade</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : automacoes.length === 0 ? (
        <EmptyState title="Nenhuma automação" description="Crie sua primeira automação para começar" icon={Plus} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {automacoes.map((auto) => (
            <Card key={auto.id} className={!auto.ativo ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{auto.nome}</CardTitle>
                    {auto.descricao && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{auto.descricao}</p>}
                  </div>
                  <TriggerBadge tipo={auto.tipo_gatilho} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{auto.total_execucoes || 0} execuções</span>
                  <span className="text-emerald-600">{auto.total_sucessos || 0} sucessos</span>
                  {auto.ultimo_disparo && <span>últ: {new Date(auto.ultimo_disparo).toLocaleDateString("pt-BR")}</span>}
                </div>

                {auto.tipo_gatilho === "webhook" && auto.webhook_token && (
                  <div className="flex items-center gap-1.5">
                    <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate flex-1">
                      ...{auto.webhook_token.slice(-12)}
                    </code>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyWebhookUrl(auto)} title="Copiar URL">
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                <div className="flex items-center gap-1.5 pt-1">
                  <Button size="sm" onClick={() => handleExecute(auto)} disabled={executeMutation.isPending}>
                    <Play className="h-3.5 w-3.5" /> Executar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openTab({ path: `/automacoes/editar/${auto.id}`, label: `Editor: ${auto.nome}`, Icon: Pencil })}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setLogsOpen(auto)}>
                    <History className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleMutation.mutate({ id: auto.id, ativo: !auto.ativo })} title={auto.ativo ? "Desativar" : "Ativar"}>
                    <Power className={`h-3.5 w-3.5 ${auto.ativo ? "text-emerald-500" : "text-muted-foreground"}`} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm("Excluir esta automação?")) deleteMutation.mutate(auto.id); }}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <GhlLogsPanel />

      {logsOpen && <ExecucoesDialog automacao={logsOpen} onClose={() => setLogsOpen(null)} />}
    </div>
  );
}

function TriggerBadge({ tipo }) {
  const map = {
    webhook: { icon: Globe, label: "Webhook", color: "bg-amber-100 text-amber-800" },
    cron: { icon: Clock, label: "Cron", color: "bg-blue-100 text-blue-800" },
    entidade: { icon: Database, label: "Entidade", color: "bg-violet-100 text-violet-800" },
  };
  const m = map[tipo] || map.webhook;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${m.color}`}>
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}

function ExecucoesDialog({ automacao, onClose }) {
  const { data: execucoes = [] } = useQuery({
    queryKey: ["automacao-execucoes", automacao.id],
    queryFn: () => base44.entities.AutomacaoExecucao.filter({ automacao_id: automacao.id }, "-started_at", 20),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico de Execuções — {automacao.nome}</DialogTitle>
        </DialogHeader>
        {execucoes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma execução registrada</p>
        ) : (
          <div className="space-y-2">
            {execucoes.map((ex) => (
              <div key={ex.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <Badge variant={ex.status === "sucesso" ? "default" : "destructive"}>{ex.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(ex.started_at).toLocaleString("pt-BR")} · {ex.duracao_ms}ms
                  </span>
                </div>
                {ex.erro_geral && <p className="text-xs text-destructive mt-1">{ex.erro_geral}</p>}
                {ex.nos_log && ex.nos_log.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {ex.nos_log.map((nl, i) => (
                      <div key={i} className="text-xs flex items-center gap-2">
                        <span className={nl.status === "sucesso" ? "text-emerald-600" : "text-destructive"}>●</span>
                        <span className="font-medium">{nl.node_label}</span>
                        {nl.erro && <span className="text-destructive truncate">— {nl.erro}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}