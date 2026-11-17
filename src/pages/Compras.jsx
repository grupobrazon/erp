import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, PackageCheck, Clock, Pencil, Ban, ArrowDownToLine, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import PurchaseOrderDialog from "@/components/compras/PurchaseOrderDialog";
import PurchaseReceivingDialog from "@/components/compras/PurchaseReceivingDialog";
import PurchaseAdvanceDialog from "@/components/compras/PurchaseAdvanceDialog";
import SupplierManager from "@/components/compras/SupplierManager";

const STATUS_COLORS = {
  "Pedido": "bg-amber-100 text-amber-700",
  "Recebido": "bg-emerald-100 text-emerald-700",
  "Cancelado": "bg-rose-100 text-rose-700",
};

export default function Compras() {
  const queryClient = useQueryClient();
  const [subtab, setSubtab] = useState("pedido");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [receiving, setReceiving] = useState(null);
  const [advance, setAdvance] = useState(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["purchaseOrders"],
    queryFn: () => base44.entities.PurchaseOrder.list("-created_date", 500),
  });

  const pedidos = orders.filter(o => o.status === "Pedido");
  const recebidos = orders.filter(o => o.status === "Recebido");
  const list = subtab === "pedido" ? pedidos : recebidos;
  const filtered = list.filter(o => !search || o.code?.toLowerCase().includes(search.toLowerCase()) || o.supplier_name?.toLowerCase().includes(search.toLowerCase()));

  const totalPedidos = pedidos.reduce((s, o) => s + (o.grand_total || 0), 0);
  const totalRecebido = recebidos.reduce((s, o) => s + (o.grand_total || 0), 0);
  const antecipacoes = orders.filter(o => o.advance_payable_id).length;

  const cancel = async (o) => {
    if (!confirm("Cancelar este pedido de compra?")) return;
    await base44.entities.PurchaseOrder.update(o.id, { status: "Cancelado" });
    queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] });
  };

  return (
    <div>
      <PageHeader title="Compras" description="Pedidos de compra, recebimento fiscal (XML) ou não fiscal (PDF), de-para com estoque e geração de contas a pagar">
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Pedido
        </Button>
      </PageHeader>

      <Tabs defaultValue="pedidos" className="mt-6">
        <TabsList>
          <TabsTrigger value="pedidos">Pedidos de Compra</TabsTrigger>
          <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
        </TabsList>
        <TabsContent value="pedidos" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><Clock className="h-4 w-4 text-amber-600" /><span className="text-xs text-muted-foreground uppercase">Em Pedido</span></div>
          <p className="text-2xl font-bold">R$ {totalPedidos.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">{pedidos.length} pedido(s) aberto(s)</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><PackageCheck className="h-4 w-4 text-emerald-600" /><span className="text-xs text-muted-foreground uppercase">Recebido</span></div>
          <p className="text-2xl font-bold">R$ {totalRecebido.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">{recebidos.length} recebimento(s)</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><Percent className="h-4 w-4 text-violet-600" /><span className="text-xs text-muted-foreground uppercase">Antecipações</span></div>
          <p className="text-2xl font-bold">{antecipacoes}</p>
          <p className="text-xs text-muted-foreground">pedidos com entrada de fornecedor</p>
        </Card>
      </div>

      <div className="mb-4 flex items-center gap-4 flex-wrap">
        <Tabs value={subtab} onValueChange={setSubtab}>
          <TabsList>
            <TabsTrigger value="pedido">Pedidos ({pedidos.length})</TabsTrigger>
            <TabsTrigger value="recebido">Recebidos ({recebidos.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por código ou fornecedor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={PackageCheck} title="Nenhuma compra" description="Crie um pedido de compra para começar." />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Código</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-center">Itens</TableHead>
                <TableHead className="text-center">Fiscal</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(o => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs font-semibold">{o.code}</TableCell>
                  <TableCell className="font-medium">{o.supplier_name}</TableCell>
                  <TableCell className="text-sm">{o.date}</TableCell>
                  <TableCell className="text-center text-sm">{(o.items || []).length}</TableCell>
                  <TableCell className="text-center"><Badge variant="outline" className="text-[10px]">{o.is_fiscal !== false ? "NF-e" : "Não Fiscal"}</Badge></TableCell>
                  <TableCell className="text-sm">{o.payment_condition_name || "—"}</TableCell>
                  <TableCell className="text-right font-medium">R$ {(o.grand_total || 0).toFixed(2)}</TableCell>
                  <TableCell><Badge className={`${STATUS_COLORS[o.status] || "bg-muted"} border-transparent text-[10px]`}>{o.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1 items-center">
                      {o.status === "Pedido" && (
                        <>
                          {o.advance_payable_id && <Badge variant="outline" className="text-[10px] text-violet-600">Entrada</Badge>}
                          <Button variant="outline" size="sm" onClick={() => setAdvance(o)} className="gap-1"><Percent className="h-3 w-3" /> Antecipar</Button>
                          <Button variant="outline" size="sm" onClick={() => setReceiving(o)} className="gap-1"><ArrowDownToLine className="h-3 w-3" /> Receber</Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(o); setDialogOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => cancel(o)}><Ban className="h-3 w-3 text-destructive" /></Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

        </TabsContent>
        <TabsContent value="fornecedores">
          <SupplierManager />
        </TabsContent>
      </Tabs>

      <PurchaseOrderDialog open={dialogOpen} onOpenChange={setDialogOpen} editingItem={editing} />
      <PurchaseReceivingDialog purchaseOrder={receiving} open={!!receiving} onOpenChange={(v) => !v && setReceiving(null)} onReceived={() => queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] })} />
      <PurchaseAdvanceDialog purchaseOrder={advance} open={!!advance} onOpenChange={(v) => !v && setAdvance(null)} onDone={() => queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] })} />
    </div>
  );
}