import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ShoppingCart, Copy, XCircle, Link2, RefreshCw, CalendarClock } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import TablePagination from "@/components/maintenance/TablePagination";

const STATUS_BADGE = {
  "Pendente": { variant: "secondary", label: "Pendente" },
  "Agendado": { variant: "default", label: "Agendado" },
  "Convertido": { variant: "outline", label: "Convertido" },
  "Cancelado": { variant: "outline", label: "Cancelado" },
};

const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

export default function AgendamentosTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Agendado");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const { data: agendamentos = [], isLoading } = useQuery({
    queryKey: ["agendamentos"],
    queryFn: async () => {
      const map = new Map();
      const b1 = await base44.entities.Agendamento.list("-created_date", 5000);
      for (const r of b1) map.set(r.id, r);
      const b2 = await base44.entities.Agendamento.list("created_date", 5000);
      for (const r of b2) map.set(r.id, r);
      return [...map.values()];
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return [...agendamentos]
      .filter(a => statusFilter === "all" || a.status === statusFilter)
      .filter(a => !q || (a.client_name || "").toLowerCase().includes(q) || (a.equipment_code || "").toLowerCase().includes(q) || (a.purifier_model || "").toLowerCase().includes(q))
      .sort((a, b) => (b.created_date || "").localeCompare(a.created_date || ""));
  }, [agendamentos, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const copyLink = async (a) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://brazon-flow-erp.base44.app";
    const link = `${origin}/agendar-refil/${a.token}`;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Link copiado!" });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  const openWhats = (a) => {
    const msg = `Olá${a.client_name ? `, ${a.client_name.split(" ")[0]}` : ""}! 👋\n\nEstá na hora de trocar o refil do seu purificador${a.purifier_model ? ` ${a.purifier_model}` : ""}.\n\nAgende o melhor dia e horário para a visita do técnico clicando no link abaixo:\n\n${typeof window !== "undefined" ? window.location.origin : ""}/agendar-refil/${a.token}\n\n— Brazon`;
    const num = (a.client_phone || "").replace(/\D/g, "");
    window.open(`https://wa.me/${num ? "55" + num : ""}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const createPedido = async (a) => {
    try {
      await base44.entities.Agendamento.update(a.id, { status: "Convertido" });
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      navigate(`/vendas/nova?equipment_id=${a.equipment_id || ""}`);
    } catch (err) {
      toast({ title: "Erro ao converter", description: err?.message, variant: "destructive" });
    }
  };

  const cancel = async (a) => {
    if (!confirm("Cancelar este agendamento?")) return;
    try {
      await base44.entities.Agendamento.update(a.id, { status: "Cancelado" });
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      toast({ title: "Agendamento cancelado" });
    } catch (err) {
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente, patrimônio..." className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Agendado">Agendados</SelectItem>
            <SelectItem value="Pendente">Pendentes</SelectItem>
            <SelectItem value="Convertido">Convertidos</SelectItem>
            <SelectItem value="Cancelado">Cancelados</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => queryClient.invalidateQueries({ queryKey: ["agendamentos"] })}>
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      <div className="rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : paged.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground text-sm">
            Nenhum agendamento neste filtro. Gere links de agendamento pela aba "CRM / Agendamento" para que os clientes marquem a troca de refil.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Purificador</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Obs. do cliente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map(a => {
                const st = STATUS_BADGE[a.status] || { variant: "outline", label: a.status };
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{a.client_name || "—"}</div>
                      {a.equipment_code && <div className="text-xs text-muted-foreground font-mono">{a.equipment_code}</div>}
                    </TableCell>
                    <TableCell className="text-sm">{a.purifier_model || "—"}</TableCell>
                    <TableCell className="text-sm font-medium">
                      {a.scheduled_date ? (
                        <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3 text-muted-foreground" />{fmtDate(a.scheduled_date)}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{a.window || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={a.client_obs || ""}>{a.client_obs || "—"}</TableCell>
                    <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {a.status === "Agendado" && (
                          <Button size="sm" variant="secondary" className="gap-1" onClick={() => createPedido(a)}>
                            <ShoppingCart className="h-3 w-3" /> Criar Pedido
                          </Button>
                        )}
                        {a.status === "Pendente" && (
                          <>
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => copyLink(a)}>
                              <Copy className="h-3 w-3" /> Link
                            </Button>
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => openWhats(a)}>
                              <Link2 className="h-3 w-3" /> Zap
                            </Button>
                          </>
                        )}
                        {(a.status === "Pendente" || a.status === "Agendado") && (
                          <Button size="sm" variant="ghost" onClick={() => cancel(a)} title="Cancelar">
                            <XCircle className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <TablePagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>
    </div>
  );
}