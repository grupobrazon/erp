import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Power, AlertTriangle } from "lucide-react";
import { isMaintenanceMissing } from "@/lib/maintenanceCheck";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { useNavigate } from "react-router-dom";

export default function Products() {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => base44.entities.Product.list("-created_date", 1000),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.Product.update(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  const filtered = products.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.code?.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = products.filter(p => p.is_active !== false).length;
  const inactiveCount = products.length - activeCount;

  return (
    <div>
      <PageHeader title="Produtos" description={`${activeCount} ativos${inactiveCount > 0 ? ` · ${inactiveCount} inativos` : ""} · ${products.length} total`}>
        <Button onClick={() => navigate("/produtos/novo")} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Produto
        </Button>
      </PageHeader>

      <div className="mb-6 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhum produto" description="Cadastre seus produtos para começar." />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead>Subgrupo</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Preço Venda</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => {
                const inactive = p.is_active === false;
                return (
                <TableRow key={p.id} className={`hover:bg-muted/30 ${inactive ? "opacity-50" : ""}`}>
                  <TableCell className="font-mono text-xs">{p.code || "-"}</TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {p.name}
                      {inactive && <Badge variant="secondary">Inativo</Badge>}
                      {isMaintenanceMissing(p) && (
                        <span title="Atenção: produto sem parametrização de manutenção — corrija no cadastro" className="text-amber-500">
                          <AlertTriangle className="h-4 w-4" />
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{p.group_name ? <Badge variant="secondary">{p.group_name}</Badge> : "-"}</TableCell>
                  <TableCell>{p.subgroup_name ? <Badge variant="outline">{p.subgroup_name}</Badge> : "-"}</TableCell>
                  <TableCell>{p.brand || "-"}</TableCell>
                  <TableCell className="text-right">R$ {(Number(p.cost) || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">R$ {(Number(p.sale_price) || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <span className={(Number(p.current_stock) || 0) <= (Number(p.min_stock) || 0) && Number(p.min_stock) > 0 ? "text-destructive font-semibold" : ""}>
                      {Number(p.current_stock) || 0}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => navigate(`/produtos/${p.id}/editar`)}><Pencil className="h-4 w-4" /></Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={inactive ? "Ativar" : "Inativar"}
                        onClick={() => toggleActiveMutation.mutate({ id: p.id, is_active: !inactive })}
                      >
                        <Power className={`h-4 w-4 ${inactive ? "text-muted-foreground" : "text-accent"}`} />
                      </Button>
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