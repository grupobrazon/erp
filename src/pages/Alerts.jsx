import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Eye, XCircle, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/use-toast";

export default function Alerts() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: res, isLoading } = useQuery({
    queryKey: ["my-alerts"],
    queryFn: () => base44.functions.invoke("alerts", { action: "list" }),
  });
  const alerts = res?.data?.alerts || res?.alerts || [];
  const unreadCount = alerts.filter((a) => !a.read).length;

  const ackMutation = useMutation({
    mutationFn: (alertId) => base44.functions.invoke("alerts", { action: "acknowledge", alert_id: alertId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-alerts"] }),
  });

  const ackAllMutation = useMutation({
    mutationFn: () => base44.functions.invoke("alerts", { action: "acknowledge_all" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-alerts"] });
      toast({ title: "Todos os alertas foram marcados como lidos" });
    },
  });

  const typeIcon = (type) => {
    if (type === "Reprovação Financeira") return <XCircle className="h-5 w-5 text-red-500" />;
    if (type === "Estorno de Pedido") return <Undo2 className="h-5 w-5 text-amber-500" />;
    return <Bell className="h-5 w-5 text-primary" />;
  };

  return (
    <div>
      <PageHeader title="Alertas" description="Reprovações e estornos de pedidos direcionados a você">
        {unreadCount > 0 && (
          <Button variant="outline" onClick={() => ackAllMutation.mutate()} disabled={ackAllMutation.isPending} className="gap-2">
            <CheckCheck className="h-4 w-4" /> Dar ciência em todos
          </Button>
        )}
      </PageHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState title="Nenhum alerta" description="Você não tem notificações de reprovação ou estorno no momento." icon={Bell} />
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <Card key={a.id} className={!a.read ? "border-primary/40 bg-primary/[0.03]" : ""}>
              <CardContent className="pt-5 flex items-start gap-3">
                <div className="mt-0.5">{typeIcon(a.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{a.title}</span>
                    {!a.read && <Badge className="bg-red-500 text-white">Nova</Badge>}
                    <Badge variant="outline" className="text-[10px]">{a.type}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.message}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                    <span>{new Date(a.created_date).toLocaleString("pt-BR")}</span>
                    {a.created_by_name && <span>por {a.created_by_name}</span>}
                    {a.related_sale_id && (
                      <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => navigate(`/vendas/${a.related_sale_id}/editar`)}>
                        <Eye className="h-3 w-3" /> Abrir pedido
                      </Button>
                    )}
                  </div>
                </div>
                {!a.read && (
                  <Button size="sm" variant="outline" onClick={() => ackMutation.mutate(a.id)} disabled={ackMutation.isPending} className="gap-1 flex-shrink-0">
                    <CheckCheck className="h-3 w-3" /> Dar ciência
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}