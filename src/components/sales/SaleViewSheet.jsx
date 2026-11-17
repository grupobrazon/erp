import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import SaleResaleToggle from "@/components/sales/SaleResaleToggle";

const fmtMoney = (v) => `R$ ${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";
const fmtDateTime = (d) => d ? new Date(d).toLocaleString("pt-BR") : "—";

const stageColor = (stage) =>
  stage === "Confirmada" ? "bg-emerald-100 text-emerald-700"
  : stage === "Cancelada" ? "bg-red-100 text-red-700"
  : stage === "Pagamento Aprovado" ? "bg-blue-100 text-blue-700"
  : stage === "Em OS" ? "bg-purple-100 text-purple-700"
  : stage === "Faturada" ? "bg-indigo-100 text-indigo-700"
  : stage === "Concluída" ? "bg-teal-100 text-teal-700"
  : "bg-amber-100 text-amber-700";

function InfoRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground break-words">{value || "—"}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</h4>
      <div className="rounded-lg border bg-card p-3">{children}</div>
    </div>
  );
}

function AddressBlock({ addr }) {
  if (!addr?.street) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span className="text-sm">
      {addr.street}, {addr.number || "s/n"}{addr.complement ? ` - ${addr.complement}` : ""}<br />
      {addr.neighborhood || "—"} — {addr.city || "—"}/{addr.state || "—"}<br />
      CEP: {addr.zip_code || "—"}
    </span>
  );
}

export default function SaleViewSheet({ sale, open, onOpenChange, onSaleUpdated }) {
  const saleId = sale?.id;

  const { data: client, isLoading: loadingClient } = useQuery({
    queryKey: ["client-view", sale?.client_id],
    queryFn: () => base44.entities.Client.get(sale.client_id),
    enabled: !!open && !!sale?.client_id,
  });

  const { data: billingLocations = [] } = useQuery({
    queryKey: ["billingLocations-view"],
    queryFn: () => base44.entities.BillingLocation.list("-created_date", 200),
    enabled: !!open,
  });

  const { data: serviceOrders = [] } = useQuery({
    queryKey: ["sale-linked-os-view", saleId],
    queryFn: () => base44.entities.ServiceOrder.filter({ sale_id: saleId }, "-created_date", 50),
    enabled: !!open && !!saleId,
  });

  if (!sale) return null;

  const billingLocation = billingLocations.find(l => l.id === sale.billing_location_id);
  const totalItems = (sale.items || []).reduce((s, i) => s + (i.total || 0), 0);
  const grandTotal = totalItems + (sale.total_services || 0) + (sale.additions || 0) + (sale.freight || 0) - (sale.discount || 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pr-10">
          <SheetTitle className="flex items-center gap-2">
            Pedido <span className="font-mono">{sale.order_number || "—"}</span>
          </SheetTitle>
          <SheetDescription className="sr-only">Visualização somente leitura do pedido</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Marcação de revenda — somente administrador */}
          <SaleResaleToggle sale={sale} onUpdated={onSaleUpdated} />

          {/* Cabeçalho do pedido */}
          <Section title="Identificação">
            <div className="grid grid-cols-2 gap-x-4">
              <InfoRow label="Pedido" value={sale.order_number} />
              <InfoRow label="Data" value={fmtDate(sale.date)} />
              <InfoRow label="Etapa" value={
                <Badge variant="secondary" className={stageColor(sale.stage)}>
                  {sale.stage || sale.status || "—"}
                  {sale.confirmation_type === "Parcial" && sale.stage === "Confirmada" && " (Parcial)"}
                </Badge>
              } />
              <InfoRow label="Modalidade" value={sale.delivery_modality} />
              <InfoRow label="Vendedor" value={sale.seller_name} />
              <InfoRow label="Prev. Faturamento" value={fmtDate(sale.billing_forecast)} />
              <InfoRow label="Local Faturamento" value={sale.billing_location_name || billingLocation?.name} />
              <InfoRow label="Local Estoque" value={sale.stock_location_name} />
              {sale.is_counter_sale && <InfoRow label="Venda de Balcão" value="Sim" />}
            </div>
          </Section>

          {/* Cliente */}
          <Section title="Cliente">
            {loadingClient ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
            ) : (
              <div className="grid grid-cols-2 gap-x-4">
                <InfoRow label="Código" value={client?.new_code || client?.old_code || "—"} />
                <InfoRow label="Nome / Razão Social" value={client?.name || sale.client_name} />
                <InfoRow label="CPF / CNPJ" value={client?.document} />
                <InfoRow label="E-mail" value={client?.email} />
                <InfoRow label="Telefone" value={client?.phone1} />
                <div className="col-span-2 py-1.5">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Endereço</span>
                  <AddressBlock addr={client ? { street: client.street, number: client.number, complement: client.complement, neighborhood: client.neighborhood, city: client.city, state: client.state, zip_code: client.zip_code } : null} />
                </div>
              </div>
            )}
          </Section>

          {/* Endereços do pedido */}
          <Section title="Endereços">
            <div className="grid grid-cols-1 gap-2">
              <div>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Faturamento</span>
                <AddressBlock addr={sale.billing_address} />
              </div>
              {sale.delivery_different && (
                <div>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Entrega</span>
                  <AddressBlock addr={sale.delivery_address} />
                </div>
              )}
            </div>
          </Section>

          {/* Itens */}
          <Section title={`Itens (${(sale.items || []).length})`}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Produto</TableHead>
                  <TableHead className="text-xs text-center">Qtd</TableHead>
                  <TableHead className="text-xs text-right">Unit.</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sale.items || []).map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-sm">
                      {item.product_name || "—"}
                      {item.purifier_model && (
                        <div className="text-xs text-primary font-medium mt-0.5">Modelo do Purificador: {item.purifier_model}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-center">{item.quantity || 0}</TableCell>
                    <TableCell className="text-sm text-right">{fmtMoney(item.unit_price)}</TableCell>
                    <TableCell className="text-sm text-right font-medium">{fmtMoney(item.total)}</TableCell>
                  </TableRow>
                ))}
                {(sale.items || []).length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-3">Nenhum item.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Section>

          {/* Serviços */}
          {(sale.services || []).length > 0 && (
            <Section title={`Serviços (${sale.services.length})`}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Serviço</TableHead>
                    <TableHead className="text-xs text-center">Qtd</TableHead>
                    <TableHead className="text-xs text-right">Unit.</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sale.services.map((s, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-sm">{s.service_name || "—"}</TableCell>
                      <TableCell className="text-sm text-center">{s.quantity || 0}</TableCell>
                      <TableCell className="text-sm text-right">{fmtMoney(s.unit_price)}</TableCell>
                      <TableCell className="text-sm text-right font-medium">{fmtMoney(s.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>
          )}

          {/* Totais */}
          <Section title="Totais">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal itens:</span><span>{fmtMoney(totalItems)}</span></div>
              {(sale.total_services || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Subtotal serviços:</span><span>{fmtMoney(sale.total_services)}</span></div>}
              {(sale.additions || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Acréscimos:</span><span>{fmtMoney(sale.additions)}</span></div>}
              {(sale.discount || 0) > 0 && <div className="flex justify-between text-red-600"><span>Desconto:</span><span>-{fmtMoney(sale.discount)}</span></div>}
              {(sale.freight || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Frete ({sale.selected_carrier || ""} {sale.selected_service || ""}):</span><span>{fmtMoney(sale.freight)}</span></div>}
              {sale.freight_exempt && (sale.freight_exempt_value || 0) > 0 && <div className="flex justify-between text-emerald-600"><span>Frete isentado:</span><span>R$ 0,00</span></div>}
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-bold"><span>Total Geral:</span><span>{fmtMoney(grandTotal)}</span></div>
              {(sale.received_amount || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Recebido:</span><span>{fmtMoney(sale.received_amount)}</span></div>}
              {(sale.change_amount || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Troco:</span><span>{fmtMoney(sale.change_amount)}</span></div>}
            </div>
          </Section>

          {/* Pagamentos */}
          {(sale.payments || []).length > 0 && (
            <Section title="Pagamentos">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Condição</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                    <TableHead className="text-xs text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sale.payments.map((p, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-sm">{p.condition_name || "—"}</TableCell>
                      <TableCell className="text-sm text-center">
                        <Badge variant="outline" className={p.payment_status === "Realizada" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}>
                          {p.payment_status || "Pendente"}{p.payment_moment ? ` — ${p.payment_moment}` : ""}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-right font-medium">{fmtMoney(p.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>
          )}

          {/* Frete / Volumes */}
          {(sale.shipping_volumes || []).length > 0 && (
            <Section title={`Volumes de Frete (${sale.shipping_volumes.length})`}>
              <div className="grid grid-cols-1 gap-1 text-sm">
                {sale.shipping_volumes.map((v, idx) => (
                  <div key={idx} className="flex justify-between border-b last:border-0 py-1">
                    <span>{v.label_tag || v.product_name || `Vol. ${v.index}`}</span>
                    <span className="text-muted-foreground">{v.quantity}x · {v.weight}kg · {v.height}x{v.width}x{v.length}cm</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Ordens de Serviço vinculadas */}
          {serviceOrders.length > 0 && (
            <Section title={`OS Vinculadas (${serviceOrders.length})`}>
              <div className="space-y-1 text-sm">
                {serviceOrders.map(os => (
                  <div key={os.id} className="flex justify-between border-b last:border-0 py-1">
                    <span className="font-mono">{os.code}</span>
                    <span className="text-muted-foreground">{os.type} · {os.status}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Cancelamento */}
          {sale.cancellation_status && sale.cancellation_status !== "Não Solicitado" && (
            <Section title="Cancelamento">
              <div className="grid grid-cols-2 gap-x-4">
                <InfoRow label="Status" value={<Badge variant="outline" className="bg-amber-50 text-amber-700">{sale.cancellation_status}</Badge>} />
                <InfoRow label="Solicitado por" value={sale.cancellation_requested_by} />
                <InfoRow label="Solicitação" value={fmtDateTime(sale.cancellation_requested_date)} />
                <InfoRow label="Motivo" value={sale.cancellation_reason} />
                {sale.cancellation_approved_by && <InfoRow label="Aprovado por" value={sale.cancellation_approved_by} />}
                {sale.cancellation_approved_date && <InfoRow label="Aprovação" value={fmtDateTime(sale.cancellation_approved_date)} />}
              </div>
            </Section>
          )}

          {/* Observações */}
          {sale.notes && (
            <Section title="Observações">
              <p className="text-sm whitespace-pre-wrap text-foreground">{sale.notes}</p>
            </Section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}