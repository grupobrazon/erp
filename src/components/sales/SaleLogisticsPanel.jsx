import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Package, CheckCircle2, Clock, Truck, FileText, AlertTriangle } from "lucide-react";

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("pt-BR");
}

function InfoCell({ icon: Icon, label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className="text-sm font-medium">{children || "—"}</div>
    </div>
  );
}

export default function SaleLogisticsPanel({ sale, serviceOrder }) {
  const os = serviceOrder;
  const hasOS = !!os;

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" /> Ordem de Serviço & Logística
          </h3>
          {hasOS && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/ordens-servico?os=${os.id}`}>
                <ExternalLink className="h-3 w-3" /> Abrir OS
              </Link>
            </Button>
          )}
        </div>

        {!hasOS ? (
          <div className="text-sm text-muted-foreground py-6 text-center bg-muted/30 rounded-lg">
            {sale?.stage === "Pagamento Aprovado"
              ? "A OS será gerada automaticamente pelo fluxo de aprovação."
              : sale?.stage === "Em OS"
              ? "OS vinculada não encontrada."
              : "Nenhuma OS gerada — a ordem de serviço é criada após a aprovação financeira."}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-muted/20 rounded-lg">
              <InfoCell icon={FileText} label="Código da OS">
                <Link to={`/ordens-servico?os=${os.id}`} className="text-primary hover:underline font-mono">
                  {os.code || "—"}
                </Link>
              </InfoCell>
              <InfoCell label="Tipo de OS">{os.type}</InfoCell>
              <InfoCell label="Status da OS">
                <Badge variant="outline">{os.status || "—"}</Badge>
              </InfoCell>
              <InfoCell label="Pagamento Aprovado em">
                {formatDate(os.financial_approval_date || os.financial_approval_date)}
              </InfoCell>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-muted/20 rounded-lg">
              <InfoCell icon={FileText} label="Nota Simples">
                {os.nota_simples_number || "—"}
              </InfoCell>
              <InfoCell label="Número da Nota Fiscal">
                {os.invoice_number || "—"}
              </InfoCell>
              <InfoCell label="NF-e">
                {os.nfe_transmitted ? (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Autorizada
                  </Badge>
                ) : os.nfe_status ? (
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="h-3 w-3" /> {os.nfe_status}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="h-3 w-3" /> Pendente
                  </Badge>
                )}
              </InfoCell>
              <InfoCell label="Data de Faturamento">
                {formatDate(os.invoice_date || os.nota_simples_date)}
              </InfoCell>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-muted/20 rounded-lg">
              <InfoCell icon={Truck} label="Transportadora">
                {os.carrier || "—"}
              </InfoCell>
              <InfoCell label="Código de Rastreio">
                {os.tracking_code ? (
                  <span className="font-mono text-xs">{os.tracking_code}</span>
                ) : "—"}
              </InfoCell>
              <InfoCell label="Etiqueta Melhor Envio">
                {os.expedition_label_url ? (
                  <a href={os.expedition_label_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-sm inline-flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> Ver etiqueta
                  </a>
                ) : "—"}
              </InfoCell>
              <InfoCell label="Chave de Acesso NF-e">
                {os.nfe_chave ? (
                  <span className="font-mono text-xs">{os.nfe_chave.slice(0, 22)}…</span>
                ) : "—"}
              </InfoCell>
            </div>

            {os.production_needed && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-700">Produção Necessária</p>
                  <p className="text-amber-600 mt-0.5">
                    {os.status === "Produção Liberada"
                      ? "Produção liberada — aguarda faturamento antes da etiqueta."
                      : os.status === "Produção Iniciada"
                      ? "Produção em andamento na fábrica."
                      : "Aguardando liberação da produção."}
                    {os.production_deadline && ` Previsão: ${formatDate(os.production_deadline)}.`}
                  </p>
                </div>
              </div>
            )}

            {os.nfe_cancelled && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-700">NF-e Cancelada</p>
                  {os.nfe_cancel_reason && <p className="text-red-600 mt-0.5">{os.nfe_cancel_reason}</p>}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}