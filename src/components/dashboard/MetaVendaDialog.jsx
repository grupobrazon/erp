import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";

const TIPOS = ["Prospecção", "Ticket Médio", "Produto", "Faturamento", "Outros"];
const UNIT_BY_TIPO = {
  "Prospecção": "clientes",
  "Ticket Médio": "R$",
  "Produto": "unidades",
  "Faturamento": "R$",
  "Outros": "",
};

export default function MetaVendaDialog({ open, onClose, onSaved, editing, sellers }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    tipo: "Prospecção",
    seller_id: "",
    goal_value: "",
    current_value: "",
    unit: "clientes",
    goal_date: "",
    notes: "",
  });

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          name: editing.name || "",
          tipo: editing.tipo || "Prospecção",
          seller_id: editing.seller_id || "",
          goal_value: String(editing.goal_value ?? ""),
          current_value: String(editing.current_value ?? ""),
          unit: editing.unit || UNIT_BY_TIPO[editing.tipo] || "",
          goal_date: editing.goal_date || "",
          notes: editing.notes || "",
        });
      } else {
        setForm({
          name: "",
          tipo: "Prospecção",
          seller_id: "",
          goal_value: "",
          current_value: "",
          unit: "clientes",
          goal_date: "",
          notes: "",
        });
      }
    }
  }, [open, editing]);

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const onTipoChange = (tipo) => {
    setForm((p) => ({ ...p, tipo, unit: UNIT_BY_TIPO[tipo] || p.unit }));
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.goal_date || !form.goal_value) {
      toast({ title: "Preencha nome, valor e prazo", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const seller = sellers?.find((s) => s.id === form.seller_id);
      const payload = {
        name: form.name.trim(),
        tipo: form.tipo,
        seller_id: form.seller_id || null,
        seller_name: seller?.name || "",
        goal_value: Number(form.goal_value) || 0,
        current_value: Number(form.current_value) || 0,
        unit: form.unit || "",
        goal_date: form.goal_date,
        notes: form.notes || "",
        status: editing?.status || "Ativa",
      };
      if (editing) {
        await base44.entities.MetaVenda.update(editing.id, payload);
      } else {
        await base44.entities.MetaVenda.create(payload);
      }
      onSaved?.();
      onClose();
      toast({ title: editing ? "Meta atualizada" : "Meta criada" });
    } catch (e) {
      toast({ title: "Erro ao salvar", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Meta" : "Nova Meta"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome da meta *</Label>
            <Input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Ex: Prospecção de 50 clientes novos" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={onTipoChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vendedora</Label>
              <Select value={form.seller_id || "all"} onValueChange={(v) => setField("seller_id", v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas (geral)</SelectItem>
                  {(sellers || []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Alvo *</Label>
              <Input type="number" value={form.goal_value} onChange={(e) => setField("goal_value", e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Atual</Label>
              <Input type="number" value={form.current_value} onChange={(e) => setField("current_value", e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Unidade</Label>
              <Input value={form.unit} onChange={(e) => setField("unit", e.target.value)} placeholder="R$, clientes, %" />
            </div>
          </div>
          <div>
            <Label>Prazo *</Label>
            <Input type="date" value={form.goal_date} onChange={(e) => setField("goal_date", e.target.value)} />
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {editing ? "Salvar" : "Criar meta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}