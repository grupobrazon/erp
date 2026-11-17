import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeftRight, Search, CheckCircle2, Clock } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const fmtDate = (d) => d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";

export default function RomaneioTrocaDemanda() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [concludingId, setConcludingId] = useState(null);

  const { data: romaneios = [], isLoading } = useQuery({
    queryKey: ["romaneioTrocaDemanda"],
    queryFn: () => base44.entities.RomaneioTrocaDemanda.list("-created_date", 200),
  });

  const filtered = romaneios.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.code || "").toLowerCase().includes(q) ||
      (r.os_code || "").toLowerCase().includes(q) ||
      (r.client_name || "").toLowerCase().includes(q) ||
      (r.sale_order_number || "").toLowerCase().includes(q);
  });

  const conclude = async (r) => {
    setConcludingId(r.id);
    try {
      await base44.entities.RomaneioTrocaDemanda.update(r.id, { status: "Concluído" });
      toast({ title: "Romaneio concluído", description: `${r.code} — itens recebidos no estoque.` });
      queryClient.invalidateQueries({ queryKey: ["romaneioTrocaDemanda"] });
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setConcludingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Romaneios de Troca de Demanda"
        description="Itens produzidos que foram transferidos do pedido específico para o estoque da empresa (produção continuou para estoque após solicitação de cancelamento da logística)."
      />

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código, OS, cliente, pedido..." className="pl-10" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} title="Nenhum romaneio de troca" description="Romaneios de troca de demanda aparecerão aqui quando a produção decidir continuar a produção para o estoque." />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Romaneio</TableHead>
                <TableHead>OS / Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Itens</TableHead>
                <TableHead className="text-center">Data</TableHead>
                <TableHead className="text-center">Gerado por</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => (
                <TableRow key={r.id}>
                  <TableCell><span className="font-mono font-semibold text-sm">{r.code}</span></TableCell>
                  <TableCell>
                    <div className="font-mono text-xs">{r.os_code || "—"}</div>
                    <div className="text-xs text-muted-foreground">Pedido {r.sale_order_number || "—"}</div>
                  </TableCell>
                  <TableCell className="text-sm">{r.client_name || "—"}</TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      {(r.items || []).map((item, i) => (
                        <div key={i} className="text-xs flex items-center gap-1">
                          <span className="truncate max-w-[160px]">{item.product_name}</span>
                          <span className="font-bold text-primary">{item.quantity}x</span>
                        </div>
                      ))}
                      {(!r.items || r.items.length === 0) && <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-xs">{fmtDate(r.date)}</TableCell>
                  <TableCell className="text-center text-xs">{r.generated_by || "—"}</TableCell>
                  <TableCell className="text-center">
                    {r.status === "Concluído" ? (
                      <Badge className="bg-emerald-100 text-emerald-700 gap-1"><CheckCircle2 className="h-3 w-3" /> Concluído</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700 gap-1"><Clock className="h-3 w-3" /> Pendente</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {r.status === "Pendente" && (
                      <Button size="sm" variant="outline" disabled={concludingId === r.id} onClick={() => conclude(r)}>
                        {concludingId === r.id ? "Concluindo..." : "Receber no Estoque"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}