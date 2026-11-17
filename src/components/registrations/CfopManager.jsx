import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Pencil, Check, X, Loader2, ListPlus } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const CATEGORIAS = ["Venda", "Remessa", "Demonstração", "Devolução", "Outro"];

export default function CfopManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [categoria, setCategoria] = useState("Venda");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ code: "", description: "", categoria: "Venda" });

  const { data: cfops = [], isLoading } = useQuery({
    queryKey: ["cfops"],
    queryFn: () => base44.entities.Cfop.list("-created_date", 200),
  });

  const add = async () => {
    if (!code || !description) {
      toast({ title: "Preencha código e descrição", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      await base44.entities.Cfop.create({
        code: code.trim(),
        description: description.trim(),
        categoria,
        is_active: true,
      });
      setCode("");
      setDescription("");
      setCategoria("Venda");
      queryClient.invalidateQueries({ queryKey: ["cfops"] });
      toast({ title: "CFOP cadastrado" });
    } catch (err) {
      toast({ title: "Erro ao cadastrar", description: err?.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id) => {
    try {
      await base44.entities.Cfop.delete(id);
      queryClient.invalidateQueries({ queryKey: ["cfops"] });
      toast({ title: "CFOP removido" });
    } catch (err) {
      toast({ title: "Erro ao remover", description: err?.message, variant: "destructive" });
    }
  };

  const startEdit = (c) => {
    setEditingId(c.id);
    setEditForm({ code: c.code, description: c.description, categoria: c.categoria || "Venda" });
  };

  const saveEdit = async () => {
    if (!editForm.code || !editForm.description) {
      toast({ title: "Preencha código e descrição", variant: "destructive" });
      return;
    }
    try {
      await base44.entities.Cfop.update(editingId, {
        code: editForm.code.trim(),
        description: editForm.description.trim(),
        categoria: editForm.categoria,
      });
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["cfops"] });
      toast({ title: "CFOP atualizado" });
    } catch (err) {
      toast({ title: "Erro ao atualizar", description: err?.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListPlus className="h-5 w-5 text-primary" /> CFOPs
        </CardTitle>
        <CardDescription>
          Cadastre os CFOPs utilizados na emissão de NF-e. O sistema seleciona automaticamente a
          versão interna (5xxx) ou interestadual (6xxx) conforme o estado do destinatário.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-[140px_1fr_180px_auto] gap-3 items-end">
          <div>
            <Label className="text-xs">Código</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="5102" />
          </div>
          <div>
            <Label className="text-xs">Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Venda de mercadoria" />
          </div>
          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={add} disabled={adding} className="gap-2">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar
          </Button>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-36">Categoria</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    <Loader2 className="h-4 w-4 animate-spin inline" />
                  </TableCell>
                </TableRow>
              ) : cfops.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    Nenhum CFOP cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                cfops.map((c) =>
                  editingId === c.id ? (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Input value={editForm.code} onChange={(e) => setEditForm((f) => ({ ...f, code: e.target.value }))} className="h-8" />
                      </TableCell>
                      <TableCell>
                        <Input value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} className="h-8" />
                      </TableCell>
                      <TableCell>
                        <Select value={editForm.categoria} onValueChange={(v) => setEditForm((f) => ({ ...f, categoria: v }))}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CATEGORIAS.map((cat) => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={saveEdit}>
                            <Check className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setEditingId(null)}>
                            <X className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono font-medium">{c.code}</TableCell>
                      <TableCell>{c.description}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{c.categoria}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => startEdit(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => remove(c.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                )
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}