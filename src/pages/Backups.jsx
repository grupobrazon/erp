import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Database, Download, RotateCcw, Trash2, AlertTriangle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

const ENTITY_LABELS = {
  Client: "Clientes", Address: "Endereços", Contact: "Contatos",
  Product: "Produtos", ProductGroup: "Grupos", ProductSubgroup: "Subgrupos",
  StockUnit: "Unidades", SupplySource: "Fontes de Fornecimento", ProductTypeOption: "Tipos de Produto",
  Equipment: "Equipamentos", Sale: "Vendas", StockMovement: "Movimentações de Estoque",
  Maintenance: "Manutenções", ServiceOrder: "Ordens de Serviço"
};

export default function Backups() {
  const queryClient = useQueryClient();
  const [restoreBackup, setRestoreBackup] = useState(null);
  const [selectedEntities, setSelectedEntities] = useState([]);
  const [restoreResult, setRestoreResult] = useState(null);

  const { data: backups = [], isLoading } = useQuery({
    queryKey: ["backups"],
    queryFn: () => base44.entities.Backup.list("-date", 100),
  });

  const createMutation = useMutation({
    mutationFn: () => base44.functions.invoke("createDatabaseBackup", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (payload) => base44.functions.invoke("restoreFromBackup", payload),
    onSuccess: (res) => {
      setRestoreResult(res.data?.result || res.data);
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Backup.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backups"] }),
  });

  const parseSummary = (s) => {
    try { return typeof s === "string" ? JSON.parse(s) : (s || {}); } catch { return {}; }
  };

  const formatDate = (d) => {
    if (!d) return "-";
    return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const openRestore = (backup) => {
    setRestoreBackup(backup);
    setSelectedEntities([]);
    setRestoreResult(null);
  };

  const toggleEntity = (name) => {
    setSelectedEntities(prev => prev.includes(name) ? prev.filter(e => e !== name) : [...prev, name]);
  };

  const confirmRestore = () => {
    restoreMutation.mutate({
      backup_id: restoreBackup.id,
      entity_names: selectedEntities,
      replace: true
    });
  };

  return (
    <div>
      <PageHeader title="Backups do Banco de Dados" description="Backups automáticos diários · retenção de 30 dias">
        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="gap-2">
          <Database className="h-4 w-4" />
          {createMutation.isPending ? "Criando..." : "Criar Backup Agora"}
        </Button>
      </PageHeader>

      <Card className="mb-6 border-accent/30 bg-accent/5">
        <CardContent className="flex items-start gap-3 pt-6">
          <Shield className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Como funciona a restauração</p>
            <p>Restaurar <strong>substitui completamente</strong> os dados atuais das entidades selecionadas pelos dados do backup. Os registros atuais serão apagados e recriados a partir do backup. Use com cuidado — esta ação não pode ser desfeita.</p>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : backups.length === 0 ? (
        <EmptyState title="Nenhum backup" description="Crie seu primeiro backup manualmente. O backup automático diário será ativado em breve." icon={Database} />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Registros</TableHead>
                <TableHead>Resumo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map(b => {
                const summary = parseSummary(b.summary);
                const topEntities = Object.entries(summary).filter(([, v]) => v > 0).slice(0, 4);
                return (
                  <TableRow key={b.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium whitespace-nowrap">{formatDate(b.date)}</TableCell>
                    <TableCell>
                      <Badge variant={b.type === "Manual" ? "default" : "secondary"}>{b.type}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{b.total_records || 0}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {topEntities.map(([name, count]) => (
                          <Badge key={name} variant="outline" className="text-xs">
                            {ENTITY_LABELS[name] || name}: {count}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" title="Baixar arquivo" asChild>
                          <a href={b.file_url} download={`backup-${b.date?.slice(0, 10)}.json`}>
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button variant="ghost" size="icon" title="Restaurar" onClick={() => openRestore(b)}>
                          <RotateCcw className="h-4 w-4 text-accent" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Excluir backup" onClick={() => deleteMutation.mutate(b.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
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

      {/* Restore Dialog */}
      <Dialog open={!!restoreBackup} onOpenChange={(open) => !open && setRestoreBackup(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Restaurar Backup</DialogTitle>
            <DialogDescription>
              Backup de {restoreBackup && formatDate(restoreBackup.date)} · {restoreBackup?.total_records || 0} registros
            </DialogDescription>
          </DialogHeader>

          {restoreResult ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-accent">
                <Shield className="h-5 w-5" />
                <span className="font-medium">Restauração concluída</span>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4 space-y-1 max-h-60 overflow-y-auto">
                {Object.entries(restoreResult).map(([ent, info]) => (
                  <div key={ent} className="flex justify-between text-sm">
                    <span>{ENTITY_LABELS[ent] || ent}</span>
                    <span className="font-mono">{info.restored} restaurados{info.skipped ? " (vazio no backup)" : ""}</span>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button onClick={() => setRestoreBackup(null)}>Fechar</Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">
                  Os dados atuais das entidades selecionadas serão <strong>apagados e substituídos</strong> pelos dados do backup.
                </p>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {Object.entries(parseSummary(restoreBackup?.summary)).map(([name, count]) => (
                  count > 0 && (
                    <div key={name} className="flex items-center gap-3 py-1">
                      <Checkbox
                        id={`ent-${name}`}
                        checked={selectedEntities.includes(name)}
                        onCheckedChange={() => toggleEntity(name)}
                      />
                      <Label htmlFor={`ent-${name}`} className="flex-1 cursor-pointer text-sm">
                        {ENTITY_LABELS[name] || name}
                      </Label>
                      <Badge variant="outline" className="text-xs">{count}</Badge>
                    </div>
                  )
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRestoreBackup(null)}>Cancelar</Button>
                <Button
                  variant="destructive"
                  disabled={selectedEntities.length === 0 || restoreMutation.isPending}
                  onClick={confirmRestore}
                >
                  {restoreMutation.isPending ? "Restaurando..." : `Restaurar (${selectedEntities.length})`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}