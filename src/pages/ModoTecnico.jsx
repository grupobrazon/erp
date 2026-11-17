import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wrench, CheckCircle2, Clock, MapPin, Package, ChevronRight, Calendar, Navigation, XCircle, FileText, AlertCircle } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarDays } from "lucide-react";

const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";
const fmtDateTime = (d) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";

const statusConfig = {
  "Pendente": { color: "bg-blue-100 text-blue-700", icon: Clock, label: "Em Aberto" },
  "Em Execução": { color: "bg-purple-100 text-purple-700", icon: Wrench, label: "Em Execução" },
  "Concluída Técnico": { color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2, label: "Concluída" },
  "Atendimento Interrompido": { color: "bg-rose-100 text-rose-700", icon: XCircle, label: "Interrompido" },
  "Atendido Parcialmente": { color: "bg-amber-100 text-amber-700", icon: AlertCircle, label: "Parcial" },
  "Aguardando Faturamento - Pós": { color: "bg-violet-100 text-violet-700", icon: CheckCircle2, label: "Aguard. Fat." },
  "Finalizada": { color: "bg-teal-100 text-teal-700", icon: CheckCircle2, label: "Finalizada" },
  "Cancelada": { color: "bg-rose-100 text-rose-700", icon: XCircle, label: "Cancelada" },
};

function TOSCard({ tos, onClick }) {
  const config = statusConfig[tos.status] || statusConfig["Pendente"];
  const StatusIcon = config.icon;
  const isInstall = tos.parent_os_type === "Entrega + Instalação";
  const TypeIcon = isInstall ? Wrench : Package;

  return (
    <Card className="cursor-pointer hover:border-primary/40 transition-colors" onClick={onClick}>
      <CardContent className="pt-4 pb-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <TypeIcon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <code className="font-mono font-bold text-sm">{tos.code}</code>
              <p className="text-[10px] text-muted-foreground">{tos.parent_os_type || "—"}</p>
            </div>
          </div>
          <Badge className={config.color + " gap-1 text-xs"}>
            <StatusIcon className="h-3 w-3" /> {config.label}
          </Badge>
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            {tos.client_name || "—"}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Calendar className="h-3 w-3" />
            {fmtDate(tos.appointment_date)}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Navigation className="h-3 w-3" />
            {(tos.km_displacement || 0).toFixed(1)} km de deslocamento
          </div>
          {tos.technician_notes && (
            <div className="flex items-start gap-2 text-muted-foreground text-xs pt-1 border-t">
              <FileText className="h-3 w-3 mt-0.5 shrink-0" />
              <span className="line-clamp-2">{tos.technician_notes}</span>
            </div>
          )}
          {tos.not_completed_reason && (
            <div className="flex items-start gap-2 text-rose-600 text-xs pt-1 border-t">
              <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span className="line-clamp-2">{tos.not_completed_reason}</span>
            </div>
          )}
          {tos.completed_at && (
            <div className="flex items-center gap-2 text-muted-foreground text-xs pt-1 border-t">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              Concluída em {fmtDateTime(tos.completed_at)}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-1 border-t">
          <span className="text-[10px] text-muted-foreground">
            {tos.sale_order_number ? `Pedido ${tos.sale_order_number}` : "—"}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function ModoTecnico() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("ativas");
  const [filtroDe, setFiltroDe] = useState("");
  const [filtroAte, setFiltroAte] = useState("");

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const { data: allTOS = [], isLoading } = useQuery({
    queryKey: ["techMyTOS", user?.full_name],
    queryFn: () => base44.entities.TechnicianServiceOrder.filter(
      { technician_name: user?.full_name || "__none__" },
      "-created_date",
      200
    ),
    enabled: !!user?.full_name,
  });

  const activeTOS = allTOS.filter(t => t.status === "Pendente" || t.status === "Em Execução");
  const doneTOS = allTOS.filter(t => t.status === "Concluída Técnico" || t.status === "Atendimento Interrompido" || t.status === "Atendido Parcialmente" || t.status === "Aguardando Faturamento - Pós" || t.status === "Finalizada" || t.status === "Cancelada");
  // Filtro por data de conclusão (completed_at) na aba Histórico
  const doneTOSFiltered = doneTOS.filter(t => {
    if (!filtroDe && !filtroAte) return true;
    const comp = t.completed_at ? t.completed_at.slice(0, 10) : null;
    if (!comp) return false;
    if (filtroDe && comp < filtroDe) return false;
    if (filtroAte && comp > filtroAte) return false;
    return true;
  });
  const displayTOS = tab === "ativas" ? activeTOS : doneTOSFiltered;

  return (
    <div className="min-h-[calc(100vh-120px)]">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <Wrench className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-lg">Minhas OS</h1>
            <p className="text-xs text-muted-foreground">{user?.full_name || "—"} · Somente visualização</p>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-blue-600" />
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Em Aberto</span>
            </div>
            <p className="text-2xl font-bold">{activeTOS.length}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Concluídas</span>
            </div>
            <p className="text-2xl font-bold">{doneTOS.length}</p>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="ativas">Em Aberto ({activeTOS.length})</TabsTrigger>
            <TabsTrigger value="concluidas">Histórico ({doneTOSFiltered.length})</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filtro por data de conclusão (apenas na aba Histórico) */}
        {tab === "concluidas" && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Concluída de</Label>
              <Input type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} className="w-[150px]" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> até</Label>
              <Input type="date" value={filtroAte} onChange={e => setFiltroAte(e.target.value)} className="w-[150px]" />
            </div>
            {(filtroDe || filtroAte) && (
              <button onClick={() => { setFiltroDe(""); setFiltroAte(""); }} className="text-xs text-muted-foreground hover:text-foreground underline">
                Limpar
              </button>
            )}
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : displayTOS.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title={tab === "ativas" ? "Nenhuma OS em aberto" : "Nenhuma OS no histórico"}
            description={tab === "ativas" ? "Suas ordens de serviço aparecerão aqui." : "Suas OS concluídas aparecerão aqui."}
          />
        ) : (
          <div className="space-y-3">
            {displayTOS.map(tos => (
              <TOSCard key={tos.id} tos={tos} onClick={() => navigate(`/modo-tecnico/${tos.id}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}