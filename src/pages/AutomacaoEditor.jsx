import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNodesState, useEdgesState, addEdge } from "reactflow";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTabs } from "@/lib/TabsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import NodePalette from "@/components/automacoes/NodePalette";
import AutomacaoCanvas from "@/components/automacoes/AutomacaoCanvas";
import NodeConfigPanel from "@/components/automacoes/NodeConfigPanel";
import CronSchedulerButton from "@/components/automacoes/CronSchedulerButton";
import { ArrowLeft, Save, Play, Copy, Power } from "lucide-react";

function generateToken() {
  return "whk_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function AutomacaoEditor() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { openTab } = useTabs();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [meta, setMeta] = useState({ nome: "", descricao: "", tipo_gatilho: "webhook", ativo: true, cron_expressao: "", entidade_alvo: "", evento_entidade: "create", webhook_token: "" });

  const { data: automacao, isLoading } = useQuery({
    queryKey: ["automacao", id],
    queryFn: () => base44.entities.Automacao.get(id),
    enabled: !!id,
  });

  const { data: credentials = [] } = useQuery({
    queryKey: ["automacao-credenciais"],
    queryFn: () => base44.entities.AutomacaoCredencial.list(),
  });

  useEffect(() => {
    if (automacao) {
      setMeta({
        nome: automacao.nome || "",
        descricao: automacao.descricao || "",
        tipo_gatilho: automacao.tipo_gatilho || "webhook",
        ativo: automacao.ativo ?? true,
        cron_expressao: automacao.cron_expressao || "",
        entidade_alvo: automacao.entidade_alvo || "",
        evento_entidade: automacao.evento_entidade || "create",
        webhook_token: automacao.webhook_token || "",
      });
      if (automacao.grafo) {
        setNodes(automacao.grafo.nodes || []);
        setEdges(automacao.grafo.edges || []);
      }
    }
  }, [automacao]);

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.Automacao.update(id, data),
    onSuccess: () => {
      toast({ title: "Automação salva" });
      qc.invalidateQueries({ queryKey: ["automacao", id] });
      qc.invalidateQueries({ queryKey: ["automacoes"] });
    },
  });

  const executeMutation = useMutation({
    mutationFn: (payload) => base44.functions.invoke("executarAutomacao", { automacao_id: id, payload, salvar_log: true }),
    onSuccess: (res) => {
      const data = res?.data || res;
      toast({
        title: data?.status === "sucesso" ? "Execução concluída" : "Execução com erro",
        variant: data?.status === "sucesso" ? "default" : "destructive",
        description: data?.erro || `${data?.nos_log?.length || 0} nó(s)`,
      });
      qc.invalidateQueries({ queryKey: ["automacoes"] });
    },
  });

  const onConnect = useCallback((conn) => setEdges((eds) => addEdge(conn, eds)), [setEdges]);

  const onAddNode = useCallback((node) => {
    setNodes((nds) => [...nds, node]);
  }, [setNodes]);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedId), [nodes, selectedId]);

  const updateNodeConfig = useCallback((nodeId, configPatch, dataPatch) => {
    setNodes((nds) => nds.map((n) => {
      if (n.id !== nodeId) return n;
      return {
        ...n,
        data: {
          ...n.data,
          ...(dataPatch || {}),
          config: { ...n.data.config, ...configPatch },
        },
      };
    }));
  }, [setNodes]);

  const deleteNode = useCallback((nodeId) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedId(null);
  }, [setNodes, setEdges]);

  const handleSave = () => {
    if (!meta.nome.trim()) return toast({ title: "Nome obrigatório", variant: "destructive" });
    const patch = {
      nome: meta.nome,
      descricao: meta.descricao,
      tipo_gatilho: meta.tipo_gatilho,
      ativo: meta.ativo,
      cron_expressao: meta.tipo_gatilho === "cron" ? meta.cron_expressao : undefined,
      entidade_alvo: meta.tipo_gatilho === "entidade" ? meta.entidade_alvo : undefined,
      evento_entidade: meta.tipo_gatilho === "entidade" ? meta.evento_entidade : undefined,
      webhook_token: meta.tipo_gatilho === "webhook" ? (meta.webhook_token || generateToken()) : undefined,
      grafo: { nodes, edges },
    };
    saveMutation.mutate(patch);
  };

  const copyWebhookUrl = () => {
    const url = `${window.location.origin}/api/functions/webhookAutomacao?token=${meta.webhook_token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "URL copiada" });
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-screen"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }

  if (!automacao && id) {
    return <div className="p-6 text-center text-muted-foreground">Automação não encontrada</div>;
  }

  const webhookUrl = meta.webhook_token ? `${window.location.origin}/api/functions/webhookAutomacao?token=${meta.webhook_token}` : "";

  return (
    <div className="h-[calc(100vh-130px)] flex flex-col rounded-lg border border-border overflow-hidden">
      {/* Top bar */}
      <div className="border-b border-border bg-card px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={() => openTab({ path: "/automacoes", label: "Automações", Icon: ArrowLeft })}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <Input
          value={meta.nome}
          onChange={(e) => setMeta({ ...meta, nome: e.target.value })}
          className="max-w-xs font-semibold"
          placeholder="Nome da automação"
        />
        <Badge variant={meta.ativo ? "default" : "secondary"}>{meta.ativo ? "Ativa" : "Inativa"}</Badge>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => executeMutation.mutate({})} disabled={executeMutation.isPending}>
          <Play className="h-4 w-4" /> Executar
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
          <Save className="h-4 w-4" /> Salvar
        </Button>
      </div>

      {/* Trigger config bar */}
      <div className="border-b border-border bg-muted/30 px-4 py-2.5 flex items-center gap-4 flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Gatilho:</Label>
          <Select value={meta.tipo_gatilho} onValueChange={(v) => setMeta({ ...meta, tipo_gatilho: v })}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="webhook">Webhook</SelectItem>
              <SelectItem value="cron">Cron</SelectItem>
              <SelectItem value="entidade">Entidade</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {meta.tipo_gatilho === "webhook" && (
          <div className="flex items-center gap-2 flex-1 min-w-[300px]">
            <Label className="text-xs text-muted-foreground">URL:</Label>
            <code className="text-xs bg-muted px-2 py-1 rounded truncate flex-1 font-mono">{webhookUrl || "Gere um token ao salvar"}</code>
            {webhookUrl && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyWebhookUrl}><Copy className="h-3.5 w-3.5" /></Button>}
          </div>
        )}

        {meta.tipo_gatilho === "cron" && (
          <div className="flex-1 max-w-sm">
            <CronSchedulerButton value={meta.cron_expressao} onChange={(v) => setMeta({ ...meta, cron_expressao: v })} />
          </div>
        )}

        {meta.tipo_gatilho === "entidade" && (
          <>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Entidade:</Label>
              <Input value={meta.entidade_alvo} onChange={(e) => setMeta({ ...meta, entidade_alvo: e.target.value })} className="h-8 w-40 text-xs font-mono" placeholder="Sale" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Evento:</Label>
              <Select value={meta.evento_entidade} onValueChange={(v) => setMeta({ ...meta, evento_entidade: v })}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="create">Criar</SelectItem>
                  <SelectItem value="update">Atualizar</SelectItem>
                  <SelectItem value="delete">Excluir</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        <Button variant="ghost" size="sm" onClick={() => setMeta({ ...meta, ativo: !meta.ativo })} title="Ativar/desativar">
          <Power className={`h-4 w-4 ${meta.ativo ? "text-emerald-500" : "text-muted-foreground"}`} />
        </Button>
      </div>

      {/* Editor body */}
      <div className="flex-1 flex min-h-0">
        <NodePalette onAddNode={onAddNode} />
        <AutomacaoCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onAddNode={onAddNode}
        />
        <NodeConfigPanel
          node={selectedNode}
          credentials={credentials}
          onUpdate={updateNodeConfig}
          onDelete={deleteNode}
        />
      </div>
    </div>
  );
}