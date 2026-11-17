import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardList, Eye } from "lucide-react";

const money = (value) => (value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

const fmtDate = (date) => {
  if (!date) return "—";
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("pt-BR");
};

export default function OpenQuotesCard({ quotes, onViewAll }) {
  const items = quotes?.items || [];
  const count = quotes?.count || 0;
  const preview = items.slice(0, 10);

  return (
    <Card className="mb-6 border-primary/20">
      <CardHeader>
        <CardTitle className="text-base font-heading flex flex-wrap items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" /> Orçamentos em Aberto
          {count > 0 && (
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
              {count} {count === 1 ? "orçamento" : "orçamentos"} · R$ {money(quotes?.value)}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Pedidos que ainda estão na etapa Orçamento — situação atual da base, independente do mês selecionado.
          É a carteira para trabalhar a prospecção.
        </p>

        {count === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum orçamento em aberto.</p>
        ) : (
          <>
            <div className="space-y-2">
              {preview.map((quote) => (
                <div key={quote.sale_id} className="rounded-lg border p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{quote.order_number || "—"}</span>
                      <span className="text-sm truncate">{quote.client_name || "Cliente não informado"}</span>
                      {quote.returned && (
                        <Badge variant="outline" className="text-[11px] bg-amber-50 text-amber-700 border-amber-200">
                          Voltou para Orçamento
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {quote.seller_name ? `${quote.seller_name} · ` : ""}
                      {fmtDate(quote.date)}
                      {quote.days_open != null ? ` · ${quote.days_open} ${quote.days_open === 1 ? "dia" : "dias"} em aberto` : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="font-semibold text-sm">R$ {money(quote.value)}</p>
                    <Badge variant="secondary" className="text-[11px]">{quote.modality || "—"}</Badge>
                  </div>
                </div>
              ))}
            </div>

            {count > preview.length && (
              <p className="text-xs text-muted-foreground mt-2">
                Mostrando os {preview.length} maiores valores de {count}.
              </p>
            )}

            <div className="mt-3 pt-3 border-t flex justify-end">
              <Button variant="outline" size="sm" onClick={onViewAll}>
                <Eye className="h-3.5 w-3.5" /> Ver todos os {count}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}