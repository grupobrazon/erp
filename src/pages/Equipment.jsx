import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Eye, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";

const statusColors = {
  Ativo: "bg-emerald-100 text-emerald-700",
  Inativo: "bg-slate-100 text-slate-600",
  Retirado: "bg-red-100 text-red-700",
  "Em manutenção": "bg-amber-100 text-amber-700",
  Substituído: "bg-purple-100 text-purple-700",
};

export default function EquipmentPage() {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ["equipment"],
    queryFn: () => base44.entities.Equipment.list("-created_date", 200),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Equipment.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["equipment"] }),
  });

  const today = format(new Date(), "yyyy-MM-dd");
  const filtered = equipment.filter(eq =>
    !search || eq.code?.toLowerCase().includes(search.toLowerCase()) ||
    eq.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    eq.product_name?.toLowerCase().includes(search.toLowerCase()) ||
    eq.serial_number?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader title="Equipamentos" description={`${equipment.length} equipamentos cadastrados`}>
        <Button onClick={() => navigate("/equipamentos/novo")} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Equipamento
        </Button>
      </PageHeader>

      <div className="mb-6 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por código, cliente, produto ou série..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhum equipamento" description="Cadastre equipamentos para começar o controle." />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Código</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Nº Série</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Próx. Manutenção</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(eq => {
                const isOverdue = eq.next_maintenance_date && eq.next_maintenance_date < today;
                return (
                  <TableRow key={eq.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs">{eq.code || "-"}</TableCell>
                    <TableCell className="font-medium">{eq.product_name || eq.model || "-"}</TableCell>
                    <TableCell>{eq.client_name || "-"}</TableCell>
                    <TableCell className="text-sm">{eq.serial_number || "-"}</TableCell>
                    <TableCell><Badge variant="secondary" className={statusColors[eq.status]}>{eq.status}</Badge></TableCell>
                    <TableCell>
                      {eq.next_maintenance_date ? (
                        <span className={isOverdue ? "text-destructive font-semibold flex items-center gap-1" : ""}>
                          {isOverdue && <AlertTriangle className="h-3 w-3" />}
                          {eq.next_maintenance_date}
                        </span>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" asChild><Link to={`/equipamentos/${eq.id}`}><Eye className="h-4 w-4" /></Link></Button>
                        {(eq.imported || !eq.sale_id) && (
                          <Button variant="ghost" size="icon" onClick={() => navigate(`/equipamentos/${eq.id}/editar`)}><Pencil className="h-4 w-4" /></Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(eq.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

    </div>
  );
}