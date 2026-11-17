import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import EmptyState from "@/components/ui/EmptyState";

const ACCOUNT_TYPES = ["Conta Corrente", "Poupança", "Conta Pagamento"];

export default function BankAccountManager() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: "", bank_name: "", bank_code: "", agency: "",
    account_number: "", account_digit: "", account_type: "Conta Corrente",
    holder_name: "", cnpj: "", pix_key: "", initial_balance: 0, is_active: true,
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["bankAccounts"],
    queryFn: () => base44.entities.BankAccount.list("-created_date", 200),
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.BankAccount.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bankAccounts"] }); resetForm(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BankAccount.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bankAccounts"] }); resetForm(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.BankAccount.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bankAccounts"] }),
  });

  const resetForm = () => {
    setForm({ name: "", bank_name: "", bank_code: "", agency: "", account_number: "", account_digit: "", account_type: "Conta Corrente", holder_name: "", cnpj: "", pix_key: "", initial_balance: 0, is_active: true });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingId) updateMut.mutate({ id: editingId, data: form });
    else createMut.mutate(form);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name || "", bank_name: item.bank_name || "", bank_code: item.bank_code || "",
      agency: item.agency || "", account_number: item.account_number || "", account_digit: item.account_digit || "",
      account_type: item.account_type || "Conta Corrente", holder_name: item.holder_name || "",
      cnpj: item.cnpj || "", pix_key: item.pix_key || "", initial_balance: item.initial_balance || 0,
      is_active: item.is_active !== false,
    });
    setShowForm(true);
  };

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!showForm ? (
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Conta
          </Button>
        ) : (
          <Button variant="outline" onClick={resetForm} className="gap-2">
            <X className="h-4 w-4" /> Cancelar
          </Button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Nome da Conta *</Label>
              <Input required value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ex: Conta Itaú Operacional" />
            </div>
            <div>
              <Label className="text-xs">Banco</Label>
              <Input value={form.bank_name} onChange={e => set("bank_name", e.target.value)} placeholder="Ex: Itaú Unibanco" />
            </div>
            <div>
              <Label className="text-xs">Código do Banco</Label>
              <Input value={form.bank_code} onChange={e => set("bank_code", e.target.value)} placeholder="Ex: 341" />
            </div>
            <div>
              <Label className="text-xs">Agência</Label>
              <Input value={form.agency} onChange={e => set("agency", e.target.value)} placeholder="Ex: 1234" />
            </div>
            <div>
              <Label className="text-xs">Número da Conta</Label>
              <Input value={form.account_number} onChange={e => set("account_number", e.target.value)} placeholder="Ex: 56789" />
            </div>
            <div>
              <Label className="text-xs">Dígito</Label>
              <Input value={form.account_digit} onChange={e => set("account_digit", e.target.value)} placeholder="Ex: 0" />
            </div>
            <div>
              <Label className="text-xs">Tipo de Conta</Label>
              <Select value={form.account_type} onValueChange={v => set("account_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Titular</Label>
              <Input value={form.holder_name} onChange={e => set("holder_name", e.target.value)} placeholder="Nome do titular" />
            </div>
            <div>
              <Label className="text-xs">CNPJ</Label>
              <Input value={form.cnpj} onChange={e => set("cnpj", e.target.value)} placeholder="CNPJ da empresa" />
            </div>
            <div>
              <Label className="text-xs">Chave PIX</Label>
              <Input value={form.pix_key} onChange={e => set("pix_key", e.target.value)} placeholder="Chave PIX" />
            </div>
            <div>
              <Label className="text-xs">Saldo Inicial (R$)</Label>
              <Input type="number" step="0.01" value={form.initial_balance} onChange={e => set("initial_balance", parseFloat(e.target.value) || 0)} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={form.is_active} onCheckedChange={v => set("is_active", v)} />
              <Label className="text-xs">Conta ativa</Label>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
              {editingId ? "Salvar Alterações" : "Adicionar Conta"}
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={Landmark} title="Nenhuma conta bancária cadastrada" description="Cadastre contas correntes, poupança e contas de pagamento." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Banco</TableHead>
              <TableHead>Agência / Conta</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Saldo Inicial</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="text-sm">{item.bank_name || "—"}{item.bank_code ? ` (${item.bank_code})` : ""}</TableCell>
                <TableCell className="text-sm font-mono">{item.agency || "—"} / {item.account_number}{item.account_digit ? `-${item.account_digit}` : ""}</TableCell>
                <TableCell className="text-sm">{item.account_type}</TableCell>
                <TableCell className="text-right text-sm">R$ {(item.initial_balance || 0).toFixed(2)}</TableCell>
                <TableCell>
                  {item.is_active !== false ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-transparent">Ativa</Badge>
                  ) : (
                    <Badge variant="secondary">Inativa</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(item)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMut.mutate(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}