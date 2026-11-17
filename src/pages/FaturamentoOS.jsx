import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import NotaSimplesSection from "@/components/faturamento/NotaSimplesSection";
import NFeSection from "@/components/faturamento/NFeSection";
import NfseSection from "@/components/faturamento/NfseSection";
import { usePermissions } from "@/lib/permissions";

const statusColors = {
  "Aprovação Comercial": "bg-amber-100 text-amber-700",
  "Aprovação Financeira": "bg-blue-100 text-blue-700",
  "Produção/Expedição": "bg-orange-100 text-orange-700",
  "Etiqueta Gerada": "bg-indigo-100 text-indigo-700",
  "Separação": "bg-violet-100 text-violet-700",
  "Saída do Estoque": "bg-cyan-100 text-cyan-700",
  "Em Transporte": "bg-sky-100 text-sky-700",
  "Em Andamento": "bg-purple-100 text-purple-700",
  "OK - Aprov. Financeira": "bg-blue-100 text-blue-700",
  "Aguardando Faturamento Final": "bg-violet-100 text-violet-700",
  "Concluída": "bg-emerald-100 text-emerald-700",
  "Entregue": "bg-emerald-100 text-emerald-700",
  "Cancelada": "bg-red-100 text-red-700",
};

const fmtMoney = (v) => `R$ ${(v || 0).toFixed(2)}`;

export default function FaturamentoOS() {
  const { osId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canBill } = usePermissions();

  const { data: os, isLoading } = useQuery({
    queryKey: ["serviceOrder", osId],
    queryFn: () => base44.entities.ServiceOrder.get(osId),
    enabled: !!osId,
  });

  const { data: sale } = useQuery({
    queryKey: ["sale", os?.sale_id],
    queryFn: () => base44.entities.Sale.get(os.sale_id),
    enabled: !!os?.sale_id,
  });

  const { data: client } = useQuery({
    queryKey: ["client", os?.client_id],
    queryFn: () => base44.entities.Client.get(os.client_id),
    enabled: !!os?.client_id,
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSetting.list("-created_date", 1),
  });
  const setting = settings[0];

  const reload = () => queryClient.invalidateQueries({ queryKey: ["serviceOrder", osId] });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!os) {
    return <EmptyState title="OS não encontrada" description="A ordem de serviço não foi localizada." />;
  }

  return (
    <div>
      <PageHeader
        title={`Faturamento — ${os.code}`}
        description="Gere a nota simples e registre a nota fiscal da ordem de expedição"
      >
        <Button variant="outline" onClick={() => navigate("/faturamento")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </PageHeader>

      <Card className="mb-6">
        <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Cliente</p>
            <p className="font-medium">{client?.name || os.client_name || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pedido</p>
            <p className="font-mono">{os.sale_order_number || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Valor</p>
            <p className="font-medium">{sale ? fmtMoney(sale.grand_total) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Status OS</p>
            <Badge variant="secondary" className={statusColors[os.status] || ""}>
              {os.status}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <NotaSimplesSection os={os} setting={setting} onUpdated={reload} readOnly={!canBill} />

      {os.nota_simples_number && <NFeSection os={os} sale={sale} setting={setting} onUpdated={reload} readOnly={!canBill} />}

      {sale?.services?.length > 0 && (
        <NfseSection os={os} sale={sale} onUpdated={reload} readOnly={!canBill} />
      )}
    </div>
  );
}