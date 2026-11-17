import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Check, Package, Truck, MapPin, ExternalLink, PackageCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import ExpeditionStepper from "@/components/serviceorders/ExpeditionStepper";

export default function ExpedicaoPublic() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const res = await base44.functions.invoke('confirmExpeditionStep', { os_id: id, action: 'get' });
      const d = res.data || res;
      if (d.error) throw new Error(typeof d.error === 'string' ? d.error : JSON.stringify(d.error));
      setData(d);
    } catch (err) {
      setError(err?.message || "Erro ao carregar OS");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const [signedBy, setSignedBy] = useState("");

  const doAction = async (action, extra = {}) => {
    setActing(true);
    try {
      const res = await base44.functions.invoke('confirmExpeditionStep', { os_id: id, action, ...extra });
      const d = res.data || res;
      if (d.error) throw new Error(typeof d.error === 'string' ? d.error : JSON.stringify(d.error));
      setData(prev => ({ ...prev, os: { ...prev.os, status: d.status, ...(extra.signed_by ? { separation_signed_by: extra.signed_by } : {}) } }));
    } catch (err) {
      setError(err?.message || "Erro ao confirmar");
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <div className="text-center max-w-sm">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-2" />
          <p className="text-destructive font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const os = data.os;
  const items = data.items || [];
  const addr = os.delivery_address || {};
  const isExpedition = os.type === "Expedição";

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        {isExpedition ? <Truck className="h-6 w-6 text-primary" /> : <Package className="h-6 w-6 text-primary" />}
        <h1 className="text-xl font-bold font-mono">{os.code}</h1>
      </div>

      {/* Status */}
      <div className="rounded-lg border p-3 mb-3 bg-card">
        <div className="text-xs text-muted-foreground">Status</div>
        <div className="font-semibold text-sm">{os.status}</div>
      </div>

      {/* Stepper */}
      <div className="rounded-lg border p-3 mb-3 bg-card">
        <ExpeditionStepper status={os.status} type={os.type} />
      </div>

      {/* Cliente + Endereço */}
      <div className="rounded-lg border p-3 mb-3 bg-card">
        <div className="text-xs text-muted-foreground mb-0.5">Cliente</div>
        <div className="font-medium text-sm mb-2">{os.client_name}</div>
        {addr.street && (
          <div className="text-xs text-muted-foreground border-t pt-2">
            <MapPin className="h-3 w-3 inline mr-1" />
            {addr.street}, {addr.number} — {addr.neighborhood}<br />
            {addr.city}/{addr.state} — CEP {addr.zip_code}
          </div>
        )}
      </div>

      {/* Romaneio info */}
      {(os.separation_date || os.exit_date || os.separation_signed_by) && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 mb-3 text-sm">
          <div className="font-medium text-violet-800 mb-1">Romaneio de Separação</div>
          {os.separation_date && <div className="text-xs text-muted-foreground">Separação: {os.separation_date}</div>}
          {os.exit_date && <div className="text-xs text-muted-foreground">Saída: {os.exit_date}</div>}
          {os.separation_signed_by && <div className="text-xs text-muted-foreground">Separado por: {os.separation_signed_by}</div>}
        </div>
      )}

      {/* Itens para Separação */}
      <div className="rounded-lg border p-3 mb-3 bg-card">
        <div className="font-medium text-sm mb-2 flex items-center gap-1">
          <Package className="h-4 w-4" /> Itens para Separação
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum item</p>
        ) : (
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                <div>
                  <div>{item.product_name}</div>
                </div>
                <span className="font-bold text-primary text-base">{item.quantity}x</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Etiqueta */}
      {os.expedition_label_url && (
        <Button variant="outline" className="w-full mb-3 gap-1" asChild>
          <a href={os.expedition_label_url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" /> Visualizar / Imprimir Etiqueta
          </a>
        </Button>
      )}

      {/* Rastreio */}
      {os.tracking_code && (
        <div className="rounded-lg border p-3 mb-3 bg-card text-sm">
          <div className="text-xs text-muted-foreground">Código de Rastreio</div>
          <code className="text-xs bg-muted px-2 py-1 rounded inline-block mt-1">{os.tracking_code}</code>
        </div>
      )}

      {/* Ações por status */}
      {os.status === "Etiqueta Gerada" && isExpedition && (
        <Button className="w-full gap-2 mb-3" disabled={acting} onClick={() => doAction('confirm_separation')}>
          {acting ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : <PackageCheck className="h-4 w-4" />}
          Confirmar Separação
        </Button>
      )}

      {os.status === "Separação" && isExpedition && (
        <div className="mb-3 space-y-2">
          <input
            type="text"
            placeholder="Seu nome (assinatura digital)"
            value={signedBy}
            onChange={(e) => setSignedBy(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
          <Button className="w-full gap-2" disabled={acting || !signedBy} onClick={() => doAction('confirm_stock_exit', { signed_by: signedBy })}>
            {acting ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : <PackageCheck className="h-4 w-4" />}
            Confirmar Separação — Pronto para Saída
          </Button>
        </div>
      )}

      {os.status === "Saída do Estoque" && isExpedition && (
        <Button className="w-full gap-2 mb-3" disabled={acting} onClick={() => doAction('confirm_transport')}>
          {acting ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : <Truck className="h-4 w-4" />}
          Confirmar Saída — Em Transporte
        </Button>
      )}

      {os.status === "Em Transporte" && isExpedition && (
        <Button className="w-full gap-2 mb-3" disabled={acting} onClick={() => doAction('confirm_delivery')}>
          {acting ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : <PackageCheck className="h-4 w-4" />}
          Confirmar Entrega
        </Button>
      )}

      {(os.status === "Entregue" || os.status === "Concluída") && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-center text-emerald-800 font-medium">
          <Check className="h-8 w-8 mx-auto mb-1" /> OS Concluída
        </div>
      )}

      {(os.status === "Aprovação Comercial" || os.status === "Aprovação Financeira") && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-center text-amber-800 text-sm">
          <AlertCircle className="h-5 w-5 mx-auto mb-1" /> Aguardando liberação para expedição.
        </div>
      )}

      {os.status === "Produção/Expedição" && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 p-4 text-center text-orange-800 text-sm">
          <AlertCircle className="h-5 w-5 mx-auto mb-1" /> Em produção/expedição — aguarde a geração da etiqueta.
        </div>
      )}

      {(os.status === "Em Produção" || os.status === "Produção Liberada") && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-center text-amber-800 text-sm">
          <AlertCircle className="h-5 w-5 mx-auto mb-1" /> Em produção na fábrica — aguarde a liberação.
        </div>
      )}

      {os.status === "Cancelada" && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-center text-red-800 font-medium">
          OS Cancelada
        </div>
      )}
    </div>
  );
}