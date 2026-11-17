import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from "@/components/ui/table";
import EmptyState from "@/components/ui/EmptyState";

const VISTA_MODALITIES = ["Dinheiro em Espécie", "PIX", "Cartão de Débito Link", "Cartão de Débito Maquininha", "Boleto à Vista"];
const PARCELADO_MODALITIES = ["Faturado", "Cartão de Crédito Maquininha", "Cartão de Crédito Link"];
const BONIFICACAO_MODALITIES = ["Permuta", "Bonificação", "Brinde"];

function buildName(type, modality, installments) {
  if (type === "À Vista" || type === "Bonificação") return modality;
  return `${modality} ${installments}x`;
}

export default function PaymentConditionManager() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    direction: "Recebimento",
    payment_type: "À Vista",
    modality: "Dinheiro em Espécie",
    installments: 1,
    financial_fee: 0,
    bank_account_id: "",
  });
  const [dirFilter, setDirFilter] = useState("all");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["paymentConditions"],
    queryFn: () => base44.entities.PaymentCondition.list("-created_date", 200),
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bankAccounts"],
    queryFn: () => base44.entities.BankAccount.list("-created_date", 100),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.PaymentCondition.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["paymentConditions"] }); resetForm(); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PaymentCondition.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["paymentConditions"] }); resetForm(); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PaymentCondition.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["paymentConditions"] }),
  });

  const resetForm = () => {
    setForm({ direction: "Recebimento", payment_type: "À Vista", modality: "Dinheiro em Espécie", installments: 1, financial_fee: 0, bank_account_id: "" });
    setEditingId(null);
    setShowForm(false);
  };

  const handleTypeChange = (type) => {
    const modality = type === "À Vista" ? VISTA_MODALITIES[0]
      : type === "Bonificação" ? BONIFICACAO_MODALITIES[0]
      : PARCELADO_MODALITIES[0];
    setForm(prev => ({ ...prev, payment_type: type, modality, installments: type === "À Vista" || type === "Bonificação" ? 1 : prev.installments }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const name = buildName(form.payment_type, form.modality, form.installments);
    const bankAccount = bankAccounts.find(b => b.id === form.bank_account_id);
    const data = {
      ...form,
      name,
      bank_account_name: bankAccount?.name || "",
      bank_account_id: form.bank_account_id || null,
    };
    if (editingId) updateMutation.mutate({ id: editingId, data });
    else createMutation.mutate(data);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      direction: item.direction || "Recebimento",
      payment_type: item.payment_type || "À Vista",
      modality: item.modality || "",
      installments: item.installments || 1,
      financial_fee: item.financial_fee || 0,
      bank_account_id: item.bank_account_id || "",
    });
    setShowForm(true);
  };

  const modalities = form.payment_type === "À Vista" ? VISTA_MODALITIES
    : form.payment_type === "Bonificação" ? BONIFICACAO_MODALITIES
    : PARCELADO_MODALITIES;
  const filteredItems = items.filter(i => dirFilter === "all" || (i.direction || "Recebimento") === dirFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="w-56">
          <Select value={dirFilter} onValueChange={setDirFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Recebimento + Pagamento</SelectItem>
              <SelectItem value="Recebimento">Recebimento (Vendas)</SelectItem>
              <SelectItem value="Pagamento">Pagamento (Compras)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {!showForm ? (
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Condição
          </Button>
        ) : (
          <Button variant="outline" onClick={resetForm} className="gap-2">
            <X className="h-4 w-4" /> Cancelar
          </Button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <div className="md:w-1/4">
            <Label className="text-xs">Direção *</Label>
            <Select value={form.direction} onValueChange={v => setForm(prev => ({ ...prev, direction: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Recebimento">Recebimento (Vendas)</SelectItem>
                <SelectItem value="Pagamento">Pagamento (Compras)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs">Tipo *</Label>
              <Select value={form.payment_type} onValueChange={handleTypeChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="À Vista">À Vista</SelectItem>
                  <SelectItem value="Parcelado">Parcelado</SelectItem>
                  <SelectItem value="Bonificação">Bonificação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Modalidade *</Label>
              <Select value={form.modality} onValueChange={v => setForm(prev => ({ ...prev, modality: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {modalities.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.payment_type === "Parcelado" && (
              <>
                <div>
                  <Label className="text-xs">Parcelas *</Label>
                  <Input type="number" min="1" value={form.installments} onChange={e => setForm(prev => ({ ...prev, installments: parseInt(e.target.value) || 1 }))} />
                </div>
                <div>
                  <Label className="text-xs">Taxa Financeira (%)</Label>
                  <Input type="number" step="0.01" min="0" value={form.financial_fee} onChange={e => setForm(prev => ({ ...prev, financial_fee: parseFloat(e.target.value) || 0 }))} />
                </div>
              </>
            )}
          </div>
          <div className="md:w-1/3">
            <Label className="text-xs">Conta Bancária Vinculada (opcional)</Label>
            <Select value={form.bank_account_id || "none"} onValueChange={v => setForm(prev => ({ ...prev, bank_account_id: v === "none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="Sem conta vinculada" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem conta vinculada</SelectItem>
                {bankAccounts.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Nome gerado: <span className="font-medium text-foreground">{buildName(form.payment_type, form.modality, form.installments)}</span>
            </p>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {editingId ? "Salvar Alterações" : "Adicionar Condição"}
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : filteredItems.length === 0 ? (
        <EmptyState title="Nenhuma condição encontrada" description="Ajuste o filtro ou cadastre uma nova condição." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Direção</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Modalidade</TableHead>
              <TableHead className="text-center">Parcelas</TableHead>
              <TableHead className="text-center">Taxa Financ.</TableHead>
              <TableHead>Conta Bancária</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.map(item => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>
                  <span className={`text-xs ${item.direction === "Pagamento" ? "text-rose-600" : "text-emerald-600"}`}>{item.direction || "Recebimento"}</span>
                </TableCell>
                <TableCell>
                  <span className={item.payment_type === "À Vista" ? "text-accent" : item.payment_type === "Bonificação" ? "text-amber-600" : "text-primary"}>{item.payment_type}</span>
                </TableCell>
                <TableCell>{item.modality}</TableCell>
                <TableCell className="text-center">{item.payment_type === "Parcelado" ? `${item.installments || 1}x` : "—"}</TableCell>
                <TableCell className="text-center">{item.payment_type === "Parcelado" ? `${(item.financial_fee || 0).toFixed(2)}%` : "—"}</TableCell>
                <TableCell className="text-sm">{item.bank_account_name || "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(item)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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