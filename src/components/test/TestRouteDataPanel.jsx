import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Trash2, Plus, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function TestRouteDataPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [calendarId, setCalendarId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [count, setCount] = useState(5);
  const [technicianName, setTechnicianName] = useState("");

  const { data: calendars = [] } = useQuery({
    queryKey: ["calendars-rota-list"],
    queryFn: () => base44.entities.CalendarioRota.filter({ is_active: true }, "name", 50),
  });

  const generateMutation = useMutation({
    mutationFn: (payload) => base44.functions.invoke("generateTestRouteData", payload),
    onSuccess: (res) => {
      toast({
        title: "Dados de teste gerados",
        description: `${res.created.tos} TOS, ${res.created.appointments} agendamentos, ${res.created.os} OS, ${res.created.sales} vendas, ${res.created.clients} clientes em ${res.calendar?.name || ""} (${res.calendar?.date || ""}).`,
      });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-rota"] });
      queryClient.invalidateQueries({ queryKey: ["technicianServiceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["rotas-tecnico"] });
    },
    onError: (err) => toast({ title: "Erro ao gerar dados", description: err?.message, variant: "destructive" }),
  });

  const cleanupMutation = useMutation({
    mutationFn: () => base44.functions.invoke("generateTestRouteData", { action: "cleanup" }),
    onSuccess: (res) => {
      const d = res.deleted;
      toast({
        title: "Dados de teste removidos",
        description: `${d.tos} TOS, ${d.appointments} agendamentos, ${d.os} OS, ${d.sales} vendas, ${d.clients} clientes deletados.`,
      });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-rota"] });
      queryClient.invalidateQueries({ queryKey: ["technicianServiceOrders"] });
      queryClient.invalidateQueries({ queryKey: ["rotas-tecnico"] });
    },
    onError: (err) => toast({ title: "Erro ao limpar dados", description: err?.message, variant: "destructive" }),
  });

  return (
    <Card className="border-pink-300 bg-pink-50/40">
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-pink-600" />
          <h3 className="font-semibold text-sm">Dados de Teste — Rotas</h3>
          <Badge variant="outline" className="text-[10px] text-pink-700 border-pink-300">TESTE</Badge>
        </div>

        <p className="text-xs text-muted-foreground">
          Gera clientes, vendas, OS, agendamentos e OS do Técnico (TOS) de teste para testar rotas.
          Os dados são marcados e podem ser deletados depois com o botão "Limpar Dados de Teste".
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Calendário</Label>
            <Select value={calendarId} onValueChange={setCalendarId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {calendars.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data do Agendamento</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Quantidade</Label>
            <Input type="number" min={1} max={20} value={count} onChange={e => setCount(Number(e.target.value) || 1)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Técnico (opcional)</Label>
            <Input value={technicianName} onChange={e => setTechnicianName(e.target.value)} placeholder="Nome do técnico" className="h-9" />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Button
            size="sm"
            disabled={!calendarId || !date || generateMutation.isPending}
            onClick={() => generateMutation.mutate({ action: "generate", calendar_id: calendarId, date, count, technician_name: technicianName })}
          >
            <Plus className="h-3.5 w-3.5" /> {generateMutation.isPending ? "Gerando..." : "Gerar Dados de Teste"}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={cleanupMutation.isPending}
            onClick={() => {
              if (window.confirm("Confirma a exclusão de TODOS os dados de teste de rotas? Esta ação não pode ser desfeita.")) {
                cleanupMutation.mutate();
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> {cleanupMutation.isPending ? "Limpando..." : "Limpar Dados de Teste"}
          </Button>
        </div>

        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>Os dados de teste são criados com marcador próprio e não afetam dados reais. Use "Limpar" para remover todos os registros de teste após concluir os testes de rota.</span>
        </div>
      </CardContent>
    </Card>
  );
}