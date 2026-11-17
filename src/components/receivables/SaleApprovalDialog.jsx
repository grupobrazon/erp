import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, CheckCircle, Truck, FileText, MapPin, StickyNote, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import IntegratedFlowStepper from "@/components/receivables/IntegratedFlowStepper";

export default function SaleApprovalDialog({ sale, osList = [], open, onOpenChange, onApprove, approving, onReprove, reprovePending }) {
  const navigate = useNavigate();
  if (!sale) return null;

  const items = sale.items || [];
  const payments = sale.payments || [];
  const subtotal = sale.total || items.reduce((s, i) => s + (i.total || 0), 0);
  const freightExempt = sale.freight_exempt;
  const freightValue = sale.freight || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="font-mono">{sale.order_number}</span>
            <Badge variant="outline">{sale.delivery_modality}</Badge>
            {sale.confirmation_type && <Badge variant="secondary">{sale.confirmation_type}</Badge>}
          </DialogTitle>
        </DialogHeader>

        <IntegratedFlowStepper sale={sale} osList={osList} />

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">Cliente: </span>{sale.client_name}</div>
          <div><span className="text-muted-foreground">Vendedor: </span>{sale.seller_name || "—"}</div>
          <div><span className="text-muted-foreground">Data: </span>{sale.date}</div>
          <div><span className="text-muted-foreground">Etapa: </span>{sale.stage}</div>
        </div>

        {/* OS vinculadas */}
        {osList.length > 0 && (
          <div className="rounded-lg border p-3 text-sm">
            <div className="font-medium mb-1">Ordem(ns) de Serviço</div>
            <div className="flex flex-wrap gap-2">
              {osList.map(os => (
                <div key={os.id} className="flex items-center gap-1">
                  <span className="font-mono text-xs">{os.code}</span>
                  <Badge variant="outline" className="text-[10px] py-0">{os.type}</Badge>
                  <Badge variant="secondary" className="text-[10px] py-0">{os.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Itens */}
        <div className="rounded-lg border overflow-hidden">
          <div className="px-3 py-2 bg-muted/50 text-sm font-medium flex items-center gap-1">
            <FileText className="h-4 w-4" /> Itens do Pedido
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-center">Qtd</TableHead>
                <TableHead className="text-right">Unit.</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{it.product_name}</TableCell>
                  <TableCell className="text-center">{it.quantity}</TableCell>
                  <TableCell className="text-right">R$ {(it.unit_price || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-medium">R$ {(it.total || 0).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Resumo financeiro */}
        <div className="rounded-lg border p-4 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal dos itens</span><span>R$ {subtotal.toFixed(2)}</span></div>
          {sale.additions > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Acréscimos</span><span>+ R$ {(sale.additions || 0).toFixed(2)}</span></div>}
          {sale.discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span>- R$ {(sale.discount || 0).toFixed(2)}</span></div>}
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground flex items-center gap-1"><Truck className="h-3 w-3" /> Frete</span>
            <div className="flex items-center gap-2">
              {freightExempt ? (
                <>
                  <Badge className="bg-emerald-100 text-emerald-700 border-transparent">FRETE BONIFICADO</Badge>
                  <span className="text-foreground font-medium">R$ 0,00</span>
                  <span className="text-muted-foreground line-through text-xs">R$ {freightValue.toFixed(2)}</span>
                </>
              ) : (
                <span>R$ {freightValue.toFixed(2)}</span>
              )}
            </div>
          </div>
          {sale.selected_carrier && sale.selected_service && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Transportadora</span>
              <span>{sale.selected_carrier} — {sale.selected_service}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base pt-2 border-t mt-2">
            <span>Total Geral</span>
            <span>R$ {(sale.grand_total || 0).toFixed(2)}</span>
          </div>
        </div>

        {/* Pagamentos */}
        <div className="rounded-lg border overflow-hidden">
          <div className="px-3 py-2 bg-muted/50 text-sm font-medium">Pagamentos</div>
          <div className="p-3 space-y-2">
            {payments.length === 0 ? (
              <span className="text-muted-foreground text-sm">Nenhum pagamento registrado</span>
            ) : payments.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={p.payment_status === "Realizada" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}>{p.payment_status}</Badge>
                  <span>{p.condition_name}</span>
                  <span className="font-medium">R$ {(p.amount || 0).toFixed(2)}</span>
                  {p.payment_moment && <span className="text-muted-foreground text-xs">({p.payment_moment})</span>}
                </div>
                {p.receipt_url && (
                  <a href={p.receipt_url} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1 text-xs">
                    <ExternalLink className="h-3 w-3" /> Comprovante
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Endereço de entrega */}
        {sale.delivery_address && sale.delivery_address.street && (
          <div className="rounded-lg border p-3 text-sm">
            <div className="font-medium mb-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> Endereço de Entrega</div>
            <div className="text-muted-foreground">
              {sale.delivery_address.street}, {sale.delivery_address.number} — {sale.delivery_address.neighborhood}
              <br />{sale.delivery_address.city} / {sale.delivery_address.state} — CEP {sale.delivery_address.zip_code}
            </div>
          </div>
        )}

        {/* Observações */}
        {sale.notes && (
          <div className="rounded-lg border p-3 text-sm">
            <div className="font-medium mb-1 flex items-center gap-1"><StickyNote className="h-3 w-3" /> Observações</div>
            <div className="text-muted-foreground whitespace-pre-wrap">{sale.notes}</div>
          </div>
        )}

        <DialogFooter className="flex justify-between gap-2 sm:justify-between">
          <Button variant="outline" size="sm" onClick={() => navigate(`/vendas/${sale.id}/editar`)} className="gap-1">
            <ExternalLink className="h-4 w-4" /> Abrir Pedido no Painel de Vendas
          </Button>
          <div className="flex gap-2">
            {onReprove && (
              <Button variant="outline" onClick={onReprove} disabled={reprovePending} className="gap-1 text-destructive hover:bg-destructive/5">
                {reprovePending ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : <XCircle className="h-4 w-4" />}
                Reprovar
              </Button>
            )}
            {onApprove && (
              <Button onClick={onApprove} disabled={approving} className="gap-1">
                {approving ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Confirmar Venda
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}