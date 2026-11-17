import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { usePermissions } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { History, Undo2, Loader2, ShieldAlert } from "lucide-react";

const REVERTIBLE = ["Confirmada", "Pagamento Aprovado", "Em OS"];

export default function SaleSupervisorPanel({ sale, saleId, orderNumber, linkedOS, onReverted }) {
  const { canRevertSale } = usePermissions();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const stage = sale?.stage;
  const canRevert = canRevertSale && saleId && REVERTIBLE.includes(stage);
  const logs = sale?.supervisor_logs || [];

  const handleRevert = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke("revertSaleToQuote", { sale_id: saleId, reason: reason.trim() });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["sale-linked-os", saleId] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      try {
        await base44.functions.invoke("alerts", {
          action: "create",
          seller_id: sale?.seller_id,
          user_name: sale?.seller_name || "",
          type: "Estorno de Pedido",
          title: `Pedido ${orderNumber || saleId} estornado por supervisor`,
          message: reason.trim(),
          related_sale_id: saleId,
          related_order_number: orderNumber || "",
        });
        queryClient.invalidateQueries({ queryKey: ["my-alerts"] });
      } catch (_e) { /* ignora falha no alerta */ }
      const fresh = await base44.entities.Sale.get(saleId);
      onReverted(fresh);
      setOpen(false);
      setReason("");
    } catch (err) {
      alert("Erro ao estornar: " + (err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  if (!canRevert && logs.length === 0) return null;

  return (
    <>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-blue-600" />
              <h3 className="font-medium">Controle de Supervisor</h3>
            </div>
            {canRevert && (
              <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
                <Undo2 className="h-4 w-4" /> Estornar para Orçamento
              </Button>
            )}
          </div>

          {canRevert && (
            <p className="text-xs text-muted-foreground">
              Permite retroceder o pedido à etapa de orçamento para ajustar a condição de pagamento e retomar o fluxo.
              As etapas realizadas (ex.: OS gerada) são estornadas. Não é permitido para pedidos já faturados.
              {linkedOS && <> OS vinculada: <span className="font-mono font-medium text-foreground">{linkedOS.code}</span>.</>}
            </p>
          )}

          {logs.length > 0 && (
            <div className="rounded-lg border divide-y">
              <div className="px-3 py-2 bg-muted/40 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                <History className="h-3 w-3" /> Histórico de Estornos
              </div>
              {logs.map((log, idx) => (
                <div key={idx} className="px-3 py-3 text-sm space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{new Date(log.date).toLocaleString("pt-BR")}</Badge>
                    <span className="text-muted-foreground">de</span>
                    <Badge variant="outline" className="text-[10px]">{log.previous_stage}</Badge>
                    <span className="text-muted-foreground">→ Orçamento</span>
                    <span className="text-muted-foreground ml-auto">por <strong className="text-foreground">{log.user_name}</strong></span>
                  </div>
                  {log.reversed_os_codes?.length > 0 && (
                    <p className="text-xs text-muted-foreground">OS estornadas: {log.reversed_os_codes.join(", ")}</p>
                  )}
                  <p className="text-sm"><span className="text-muted-foreground">Motivo: </span>{log.reason}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Undo2 className="h-4 w-4" /> Estornar Pedido para Orçamento</DialogTitle>
            <DialogDescription>
              O pedido <strong className="font-mono text-foreground">{orderNumber || saleId}</strong> está em <strong className="text-foreground">{stage}</strong>.
              Esta ação reverte as etapas realizadas{linkedOS && <> (a OS <span className="font-mono">{linkedOS.code}</span> será estornada)</>} e retorna o pedido ao orçamento para reajuste.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Justifique o motivo do estorno *</Label>
              <Textarea rows={4} value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex: cliente efetuou o pagamento; necessário ajustar a condição de pagamento e retomar o fluxo." />
            </div>
            <p className="text-xs text-amber-600 flex items-center gap-1"><ShieldAlert className="h-3 w-3" /> O registro fica no histórico do pedido com seu nome e a justificativa.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRevert} disabled={busy || !reason.trim()} className="gap-1">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
              Confirmar Estorno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}