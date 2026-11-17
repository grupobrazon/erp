import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import MaintenanceFormDialog from "@/components/maintenance/MaintenanceFormDialog";

const resultColors = {
  Realizada: "bg-emerald-100 text-emerald-700",
  Reagendada: "bg-amber-100 text-amber-700",
  Cancelada: "bg-red-100 text-red-700",
  "Sem acesso ao local": "bg-slate-100 text-slate-600",
};

export default function Maintenances() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: maintenances = [], isLoading } = useQuery({
    queryKey: ["maintenances"],
    queryFn: () => base44.entities.Maintenance.list("-date", 200),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Maintenance.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maintenances"] }),
  });

  const filtered = maintenances.filter(m =>
    !search || m.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    m.equipment_code?.toLowerCase().includes(search.toLowerCase()) || m.technician?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader title="Manutenções" description={`${maintenances.length} manutenções registradas`}>
        <Button onClick={() => setDialogOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Nova Manutenção</Button>
      </PageHeader>

      <div className="mb-6 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por cliente, equipamento ou técnico..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhuma manutenção" description="Registre a primeira manutenção." />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Data</TableHead>
                <TableHead>Equipamento</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Técnico</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(m => (
                <TableRow key={m.id} className="hover:bg-muted/30">
                  <TableCell>{m.date}</TableCell>
                  <TableCell className="font-mono text-xs">{m.equipment_code || "-"}</TableCell>
                  <TableCell className="font-medium">{m.client_name || "-"}</TableCell>
                  <TableCell>{m.type}</TableCell>
                  <TableCell>{m.technician || "-"}</TableCell>
                  <TableCell>{m.result ? <Badge variant="secondary" className={resultColors[m.result]}>{m.result}</Badge> : "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <MaintenanceFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}