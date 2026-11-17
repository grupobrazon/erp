import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Pencil, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Route, Plus } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { usePermissions } from "@/lib/permissions";
import ManualZoneAssignmentDialog from "@/components/clients/ManualZoneAssignmentDialog";
import AddressHistorySection from "@/components/clients/AddressHistorySection";

export default function ClientRouteTab({ client }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canAssignZone } = usePermissions();
  const [recalculating, setRecalculating] = useState(false);
  const [recalcRegional, setRecalcRegional] = useState(false);
  const [showManualZone, setShowManualZone] = useState(false);

  const assignments = client.route_assignments || [];
  const hasAddress = !!(client.city && client.neighborhood);

  const recalcularRota = async () => {
    setRecalculating(true);
    try {
      const res = await base44.functions.invoke("assignClientsToZones", {
        client_id: client.id,
        dry_run: false,
      });
      const data = res.data || res;
      toast({
        title: "Rota recalculada",
        description: `${data.updates_count || 0} atualização(ões) aplicada(s).`,
      });
      queryClient.invalidateQueries({ queryKey: ["client", client.id] });
    } catch (err) {
      toast({
        title: "Erro ao recalcular rota",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setRecalculating(false);
    }
  };

  const recalcularRegional = async () => {
    setRecalcRegional(true);
    try {
      const res = await base44.functions.invoke("assignClientRegional", { client_id: client.id });
      const data = res.data || res;
      toast({
        title: "Regional recalculada",
        description: data?.stats ? `Regional: ${data.stats.assigned ? "atribuída" : "não parametrizada"}` : "",
      });
      queryClient.invalidateQueries({ queryKey: ["client", client.id] });
    } catch (err) {
      toast({ title: "Erro ao recalcular regional", description: err?.message, variant: "destructive" });
    } finally {
      setRecalcRegional(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Endereço principal do cliente */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-primary" /> Endereço de Cadastro
            </CardTitle>
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link to={`/clientes/${client.id}/editar`}>
                <Pencil className="h-3.5 w-3.5" /> Editar Endereço
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {client.street || client.number || client.neighborhood || client.city ? (
            <>
              <p>
                {client.street || "—"}
                {client.number ? `, ${client.number}` : ""}
                {client.complement ? ` - ${client.complement}` : ""}
              </p>
              <p className="text-muted-foreground">
                {client.neighborhood || "—"} - {client.city || "—"}/{client.state || "—"}
              </p>
              <p className="text-xs text-muted-foreground">CEP: {client.zip_code || "—"}</p>
            </>
          ) : (
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">Cliente sem endereço cadastrado. Edite o cadastro para informar o endereço.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Zonas / Calendários atribuídos */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Route className="h-4 w-4 text-primary" /> Rota Atribuída
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={recalcularRota}
                disabled={recalculating || !hasAddress}
                className="gap-1.5"
              >
                {recalculating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Recalcular Rota
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={recalcularRegional}
                disabled={recalcRegional || !client.id}
                className="gap-1.5"
              >
                {recalcRegional ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MapPin className="h-3.5 w-3.5" />
                )}
                Recalcular Regional
              </Button>
              {canAssignZone && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowManualZone(true)}
                  disabled={!client.id}
                  className="gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Atribuir Zona
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-3 pb-3 border-b">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Regional:</span>
              <Badge variant={client.regional && client.regional !== "NÃO PARAMETRIZADA" ? "default" : "secondary"}>
                {client.regional || "NÃO PARAMETRIZADA"}
              </Badge>
            </div>
          </div>
          {!hasAddress ? (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50/50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm">
                Sem endereço (cidade/bairro). Edite o cadastro e clique em "Recalcular Rota" para atribuir as zonas automaticamente.
              </span>
            </div>
          ) : assignments.length === 0 ? (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50/50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm">
                Nenhuma zona/calendário atribuído. Clique em "Recalcular Rota" para buscar zonas compatíveis com o endereço deste cliente.
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-emerald-600 text-sm">
                <CheckCircle2 className="h-4 w-4" />
                <span>{assignments.length} zona(s) atribuída(s) a este cliente</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {assignments.map((a, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    <MapPin className="h-3 w-3" />
                    {a.zone_name || "Zona sem nome"}
                    {a.calendar_name && (
                      <span className="text-muted-foreground">· {a.calendar_name}</span>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Compatibilidade: campos legados */}
          {(client.route_zone_name || client.route_calendar_name) && assignments.length === 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              {client.route_zone_name && <div>Zona (legado): {client.route_zone_name}</div>}
              {client.route_calendar_name && <div>Calendário (legado): {client.route_calendar_name}</div>}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground px-1">
        A rota é calculada automaticamente com base na cidade, bairro e CEP do cliente. Após editar o endereço, clique em "Recalcular Rota" para atualizar as zonas atribuídas. Se nenhuma zona for encontrada, clique em "Atribuir Zona" para incluir o cliente manualmente.
      </p>

      <AddressHistorySection client={client} />

      {canAssignZone && (
        <ManualZoneAssignmentDialog
          open={showManualZone}
          onOpenChange={setShowManualZone}
          client={client}
          onAssigned={() => queryClient.invalidateQueries({ queryKey: ["client", client.id] })}
        />
      )}
    </div>
  );
}