import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import ChartOfAccountCombobox from "@/components/financeiro/ChartOfAccountCombobox";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const CATEGORIES = ["Fornecedor", "Imposto", "Salário", "Aluguel", "Energia", "Telefone/Internet", "Material", "Manutenção", "Logística", "Comissão", "Outro"];

export default function AccountPayableDialog({ open, onOpenChange, editingItem }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    description: "", category: "Fornecedor",
    chart_of_account_id: "", chart_of_account_code: "", chart_of_account_name: "",
    supplier_name: "", supplier_document: "",
    amount: "", due_date: "", invoice_number: "", notes: "",
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bankAccounts"],
    queryFn: () => base44.entities.BankAccount.list("-created_date", 100),
  });

  useEffect(() => {
    if (editingItem) {
      setForm({
        description: editingItem.description || "",
        category: editingItem.category || "Fornecedor",
        chart_of_account_id: editingItem.chart_of_account_id || "",
        chart_of_account_code: editingItem.chart_of_account_code || "",
        chart_of_account_name: editingItem.chart_of_account_name || "",
        supplier_name: editingItem.supplier_name || "",
        supplier_document: editingItem.supplier_document || "",
        amount: editingItem.amount || "",
        due_date: editingItem.due_date || "",
        invoice_number: editingItem.invoice_number || "",
        notes: editingItem.notes || "",
      });
    } else {
      setForm({ description: "", category: "Fornecedor", chart_of_account_id: "", chart_of_account_code: "", chart_of_account_name: "", supplier_name: "", supplier_document: "", amount: "", due_date: "", invoice_number: "", notes: "" });
    }
  }, [editingItem, open]);

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.AccountPayable.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["accountsPayable"] }); onOpenChange(false); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.AccountPayable.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["accountsPayable"] }); onOpenChange(false); },
  });

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...form, amount: parseFloat(form.amount) || 0 };
    if (editingItem) updateMut.mutate({ id: editingItem.id, data });
    else createMut.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingItem ? "Editar Conta a Pagar" : "Nova Conta a Pagar"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-xs">Descrição *</Label>
            <Input required value={form.description} onChange={e => set("description", e.target.value)} placeholder="Ex: Compra de cápsulas - Lote Julho" />
          </div>
          <div>
            <Label className="text-xs">Conta do Plano de Contas</Label>
            <ChartOfAccountCombobox
              value={form.chart_of_account_id}
              onChange={(acc) => {
                set("chart_of_account_id", acc?.id || "");
                set("chart_of_account_code", acc?.code || "");
                set("chart_of_account_name", acc?.name || "");
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select value={form.category} onValueChange={v => set("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Valor (R$) *</Label>
              <Input required type="number" step="0.01" min="0" value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Fornecedor</Label>
              <Input value={form.supplier_name} onChange={e => set("supplier_name", e.target.value)} placeholder="Nome do fornecedor" />
            </div>
            <div>
              <Label className="text-xs">CNPJ/CPF</Label>
              <Input value={form.supplier_document} onChange={e => set("supplier_document", e.target.value)} placeholder="Documento" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Vencimento *</Label>
              <Input required type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Nº Nota Fiscal</Label>
              <Input value={form.invoice_number} onChange={e => set("invoice_number", e.target.value)} placeholder="NF do fornecedor" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Observações adicionais" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
              {editingItem ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}