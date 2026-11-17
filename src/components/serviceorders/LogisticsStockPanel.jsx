import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, Wrench, CheckCircle2, AlertTriangle } from "lucide-react";

export default function LogisticsStockPanel({ sale, onStockConfirmed, onNeedProduction, productionCompleted }) {
  const [stockConfirmed, setStockConfirmed] = useState(false);

  useEffect(() => {
    setStockConfirmed(false);
    onStockConfirmed?.(false);
  }, [sale?.id]);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => base44.entities.Product.list("-created_date", 500),
  });

  const items = sale?.items || [];
  const productMap = {};
  for (const p of products) productMap[p.id] = p;

  const allHaveStock = items.length > 0 && items.every(item => {
    const product = productMap[item.product_id];
    return product && (product.current_stock ?? 0) >= (item.quantity || 0);
  });

  const handleConfirm = () => {
    setStockConfirmed(true);
    onStockConfirmed?.(true);
  };

  return (
    <div className="space-y-3">
      {/* Itens do pedido com saldo de estoque */}
      <div className="rounded-md border p-3">
        <div className="text-sm font-medium mb-2 flex items-center gap-1"><Package className="h-4 w-4 text-primary" /> Itens do Pedido & Saldo de Estoque</div>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum item no pedido.</p>
        ) : (
          <div className="space-y-1">
            {items.map((item, i) => {
              const product = productMap[item.product_id];
              const stock = product?.current_stock ?? null;
              const needed = item.quantity || 0;
              const hasStock = stock != null && stock >= needed;
              return (
                <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate">{item.product_name}</span>
                    <span className="text-muted-foreground ml-2">{needed}x</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {stock != null ? (
                      <>
                        <span className="text-xs text-muted-foreground">Saldo: {stock}</span>
                        <Badge className={hasStock ? "bg-emerald-100 text-emerald-700 border-transparent" : "bg-red-100 text-red-700 border-transparent"}>
                          {hasStock ? "OK" : `Faltam ${needed - stock}`}
                        </Badge>
                      </>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">Sem cadastro</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Ações: Confirmar estoque OU Preciso produzir — logo abaixo dos itens */}
      {!stockConfirmed ? (
        <div className="space-y-2">
          {!allHaveStock && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                Saldo insuficiente para um ou mais itens. Você pode confirmar mesmo assim (estoque físico pode divergir) ou enviar para produção.
              </p>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={handleConfirm} className="gap-1 flex-1">
              <CheckCircle2 className="h-4 w-4" /> Confirmar Estoque Verificado
            </Button>
            {!productionCompleted && (
              <Button size="sm" variant="outline" onClick={onNeedProduction} className="gap-1">
                <Wrench className="h-4 w-4" /> Preciso Produzir
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-700 flex items-center gap-1">
          <CheckCircle2 className="h-4 w-4" /> Estoque verificado — liberação para expedição/rota habilitada abaixo.
        </div>
      )}
    </div>
  );
}