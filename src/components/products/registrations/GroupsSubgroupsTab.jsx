import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import EmptyState from "@/components/ui/EmptyState";
import ProductGroupFormDialog from "@/components/products/ProductGroupFormDialog";
import ProductSubgroupFormDialog from "@/components/products/ProductSubgroupFormDialog";

export default function GroupsSubgroupsTab() {
  const queryClient = useQueryClient();
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [subgroupDialogOpen, setSubgroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [editingSubgroup, setEditingSubgroup] = useState(null);

  const { data: groups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ["productGroups"],
    queryFn: () => base44.entities.ProductGroup.list("-created_date", 200),
  });

  const { data: subgroups = [], isLoading: loadingSubgroups } = useQuery({
    queryKey: ["productSubgroups"],
    queryFn: () => base44.entities.ProductSubgroup.list("-created_date", 500),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id) => base44.entities.ProductGroup.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["productGroups"] }),
  });

  const deleteSubgroupMutation = useMutation({
    mutationFn: (id) => base44.entities.ProductSubgroup.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["productSubgroups"] }),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Grupos</CardTitle>
          <Button size="sm" onClick={() => { setEditingGroup(null); setGroupDialogOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Grupo
          </Button>
        </CardHeader>
        <CardContent>
          {loadingGroups ? (
            <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
          ) : groups.length === 0 ? (
            <EmptyState title="Nenhum grupo cadastrado" description="Crie o primeiro grupo de produtos." />
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Prefixo</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {groups.map(g => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.name}</TableCell>
                    <TableCell><Badge variant="outline" className="font-mono">{g.prefix}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setEditingGroup(g); setGroupDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteGroupMutation.mutate(g.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Subgrupos</CardTitle>
          <Button size="sm" onClick={() => { setEditingSubgroup(null); setSubgroupDialogOpen(true); }} disabled={groups.length === 0} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Subgrupo
          </Button>
        </CardHeader>
        <CardContent>
          {loadingSubgroups ? (
            <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
          ) : subgroups.length === 0 ? (
            <EmptyState title="Nenhum subgrupo cadastrado" description="Crie um grupo antes de cadastrar subgrupos." />
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Grupo</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {subgroups.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.group_name}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setEditingSubgroup(s); setSubgroupDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteSubgroupMutation.mutate(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ProductGroupFormDialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen} group={editingGroup} />
      <ProductSubgroupFormDialog open={subgroupDialogOpen} onOpenChange={setSubgroupDialogOpen} subgroup={editingSubgroup} groups={groups} />
    </div>
  );
}