import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, FileText, Wrench, MapPin, User } from "lucide-react";

const fmtMoney = (v) => `R$ ${(v || 0).toFixed(2)}`;

const statusColors = {
  "Rascunho": "bg-gray-100 text-gray-700",
  "Aprovada": "bg-blue-100 text-blue-700",
  "Aguardando Financeiro": "bg-amber-100 text-amber-700",
  "Aprovada Financeiro": "bg-emerald-100 text-emerald-700",
  "Faturada": "bg-emerald-100 text-emerald-700",
  "Cancelada": "bg-red-100 text-red-700",
};

const typeColors = {
  "Demonstração": "bg-violet-100 text-violet-700",
  "Remessa": "bg-blue-100 text-blue-700",
  "Consignação": "bg-indigo-100 text-indigo-700",
  "Devolução": "bg-amber-100 text-amber-700",
  "Retorno": "bg-teal-100 text-teal-700",
};

export default function RemessaViewDialog({ remessa, open, onOpenChange }) {
  if (!remessa) return null;

  const addr = remessa.delivery_address || {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono">{remessa.code || "Remessa"}</span>
            <Badge variant="secondary" className={typeColors[remessa.remessa_type] || ""}>{remessa.remessa_type}</Badge>
            <Badge variant="outline" className={statusColors[remessa.status] || ""}>{remessa.status}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dados gerais */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Cliente</p>
                <p className="font-medium">{remessa.client_name || "—"}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Data</p>
              <p className="font-medium">{remessa.date || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Modalidade</p>
              <p className="font-medium">{remessa.delivery_modality || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">CFOP</p>
              <p className="font-mono font-medium">{remessa.cfop_code || "—"}</p>
            </div>
          </div>

          {/* Endereço de entrega */}
          {(addr.street || addr.city) && (
            <div className="border-t pt-3">
              <p className="text-xs font-medium mb-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> Endereço de Entrega</p>
              <p className="text-sm text-muted-foreground">
                {addr.street ? `${addr.street}, ${addr.number || "S/N"}` : ""}
                {addr.neighborhood ? ` — ${addr.neighborhood}` : ""}
                {addr.city ? ` — ${addr.city}/${addr.state || ""}` : ""}
                {addr.zip_code ? ` — CEP ${addr.zip_code}` : ""}
              </p>
            </div>
          )}

          {/* Itens */}
          <div className="border-t pt-3">
            <p className="text-xs font-medium mb-2">Itens</p>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2">Produto</th>
                    <th className="text-right p-2 w-20">Qtd</th>
                    <th className="text-right p-2 w-28">V. Unit.</th>
                    <th className="text-right p-2 w-28">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(remessa.items || []).map((it, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{it.product_name}</td>
                      <td className="p-2 text-right">{it.quantity}</td>
                      <td className="p-2 text-right">{fmtMoney(it.unit_price)}</td>
                      <td className="p-2 text-right font-medium">{fmtMoney(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-right mt-2">
              <Badge variant="secondary">Total: {fmtMoney(remessa.grand_total)}</Badge>
            </div>
          </div>

          {/* Aprovação financeira */}
          <div className="border-t pt-3">
            <p className="text-xs font-medium mb-2 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Aprovação Financeira</p>
            {remessa.financial_approved_by ? (
              <div className="text-sm space-y-1">
                <p>Aprovado por: <span className="font-medium">{remessa.financial_approved_by}</span></p>
                <p className="text-xs text-muted-foreground">{remessa.financial_approval_date ? new Date(remessa.financial_approval_date).toLocaleString("pt-BR") : ""}</p>
              </div>
            ) : remessa.status === "Aguardando Financeiro" ? (
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <Clock className="h-4 w-4" /> Aguardando aprovação do financeiro
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Não enviada para o financeiro</p>
            )}
          </div>

          {/* OS vinculada */}
          {remessa.os_id && (
            <div className="border-t pt-3">
              <p className="text-xs font-medium mb-1 flex items-center gap-1"><Wrench className="h-3 w-3" /> Ordem de Serviço</p>
              <p className="text-sm font-mono font-semibold">{remessa.os_code}</p>
            </div>
          )}

          {/* Faturamento */}
          {remessa.status === "Faturada" && (
            <div className="border-t pt-3">
              <p className="text-xs font-medium mb-1 flex items-center gap-1"><FileText className="h-3 w-3" /> Faturamento</p>
              <div className="text-sm space-y-1">
                {remessa.invoice_type && <p>Tipo: <Badge variant="secondary">{remessa.invoice_type}</Badge></p>}
                {remessa.invoice_number && <p>NF-e Nº: <span className="font-mono font-medium">{remessa.invoice_number}</span></p>}
                {remessa.nota_simples_number && <p>Nota Simples Nº: <span className="font-mono font-medium">{remessa.nota_simples_number}</span></p>}
                <p className="text-xs text-muted-foreground">Data: {remessa.invoice_date || "—"}</p>
              </div>
            </div>
          )}

          {/* Observações */}
          {remessa.notes && (
            <div className="border-t pt-3">
              <p className="text-xs font-medium mb-1">Observações</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{remessa.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}