import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const defaultForm = {
  name: "",
  category: "Promoção de Desconto",
  campaign_label: "",
  description: "",
  benefits: "",
  discount_percent: 0,
  discount_scope: "",
  promotion_start_date: "",
  promotion_end_date: "",
  is_lifetime: false,
  adhesion_start_date: "",
  adhesion_end_date: "",
  target_type: "Todos os clientes",
  max_adhesions: "",
  alert_days_before: 30,
  terms_text: "",
  status: "Ativa",
};

export default function PromotionFormDialog({ open, onOpenChange, promotion }) {
  const [form, setForm] = useState(defaultForm);
  const queryClient = useQueryClient();
  const isEditing = !!promotion;

  useEffect(() => {
    if (!open) return;
    setForm(promotion ? { ...defaultForm, ...promotion } : defaultForm);
  }, [promotion, open]);

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        discount_percent: Number(data.discount_percent) || 0,
        alert_days_before: Number(data.alert_days_before) || 0,
        max_adhesions: data.max_adhesions === "" ? undefined : Number(data.max_adhesions),
        promotion_end_date: data.is_lifetime ? "" : data.promotion_end_date,
      };
      return isEditing
        ? base44.entities.Promotion.update(promotion.id, payload)
        : base44.entities.Promotion.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promotions"] });
      onOpenChange(false);
    },
  });

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar programa / promoção" : "Novo programa / promoção"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label>Nome do programa *</Label>
              <Input value={form.name} onChange={(e) => update("name", e.target.value)} required placeholder="Ex: Programa Cliente VIP Brazon" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.category} onValueChange={(v) => update("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Programa VIP">Programa VIP</SelectItem>
                  <SelectItem value="Promoção de Desconto">Promoção de Desconto</SelectItem>
                  <SelectItem value="Campanha Sazonal">Campanha Sazonal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Campanha de adesão</Label>
              <Input value={form.campaign_label} onChange={(e) => update("campaign_label", e.target.value)} placeholder="Ex: Campanha de Adesão: Outubro de 2026" />
            </div>
            <div className="md:col-span-2">
              <Label>Objetivo / descrição</Label>
              <Textarea value={form.description} onChange={(e) => update("description", e.target.value)} rows={2} />
            </div>
            <div className="md:col-span-2">
              <Label>Benefícios concedidos</Label>
              <Textarea value={form.benefits} onChange={(e) => update("benefits", e.target.value)} rows={3} placeholder="Ex: 20% de desconto vitalício no refil do equipamento" />
            </div>
            <div>
              <Label>Desconto (%)</Label>
              <Input type="number" min="0" max="100" step="0.01" value={form.discount_percent} onChange={(e) => update("discount_percent", e.target.value)} />
            </div>
            <div>
              <Label>O desconto incide sobre</Label>
              <Input value={form.discount_scope} onChange={(e) => update("discount_scope", e.target.value)} placeholder="Ex: elemento filtrante (refil) do equipamento" />
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <p className="text-sm font-semibold">Prazos</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Início da promoção</Label>
                <Input type="date" value={form.promotion_start_date} onChange={(e) => update("promotion_start_date", e.target.value)} />
              </div>
              <div>
                <Label>Fim da promoção</Label>
                <Input type="date" value={form.promotion_end_date} disabled={form.is_lifetime} onChange={(e) => update("promotion_end_date", e.target.value)} />
              </div>
              <div>
                <Label>Início para aderir</Label>
                <Input type="date" value={form.adhesion_start_date} onChange={(e) => update("adhesion_start_date", e.target.value)} />
              </div>
              <div>
                <Label>Fim para aderir</Label>
                <Input type="date" value={form.adhesion_end_date} onChange={(e) => update("adhesion_end_date", e.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.is_lifetime} onCheckedChange={(v) => update("is_lifetime", !!v)} />
              Promoção vitalícia (benefício sem data final, condicionado às manutenções)
            </label>
            <div>
              <Label>Alertar quantos dias antes do vencimento da manutenção</Label>
              <Input type="number" min="0" value={form.alert_days_before} onChange={(e) => update("alert_days_before", e.target.value)} className="max-w-[180px]" />
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <p className="text-sm font-semibold">Aplicação do termo</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Válido para</Label>
                <Select value={form.target_type} onValueChange={(v) => update("target_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos os clientes">Todos os clientes</SelectItem>
                    <SelectItem value="Clientes selecionados">Clientes selecionados (link gerado manualmente)</SelectItem>
                    <SelectItem value="Quantidade limitada">Quantidade limitada de clientes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.target_type === "Quantidade limitada" && (
                <div>
                  <Label>Quantidade máxima de adesões</Label>
                  <Input type="number" min="1" value={form.max_adhesions} onChange={(e) => update("max_adhesions", e.target.value)} className="max-w-[180px]" />
                </div>
              )}
            </div>
          </div>

          <div>
            <Label>Termo de adesão e condições *</Label>
            <Textarea
              value={form.terms_text}
              onChange={(e) => update("terms_text", e.target.value)}
              rows={12}
              className="font-mono text-xs"
              placeholder="Cole aqui o texto completo do termo de adesão e das condições do programa."
            />
            <p className="text-xs text-muted-foreground mt-1">
              Este é o texto que o cliente lê e assina digitalmente no link de adesão.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Situação</Label>
              <Select value={form.status} onValueChange={(v) => update("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ativa">Ativa (recebendo adesões)</SelectItem>
                  <SelectItem value="Inativa">Inativa</SelectItem>
                  <SelectItem value="Encerrada">Encerrada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvando..." : "Salvar programa"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}