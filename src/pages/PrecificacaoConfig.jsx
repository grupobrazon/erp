import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Save, Percent, MapPin, MapPinned } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/use-toast";
import { fmtPct, salesTaxForScenario, SCENARIOS } from "@/lib/pricingCalc";

const DEFAULT_CONFIG = {
  name: "default",
  icms_mg_percent: 6.0,
  icms_fora_mg_percent: 1.3,
  pis_percent: 0.65,
  cofins_percent: 3.0,
  irpj_percent: 1.2,
  csll_percent: 1.08,
  commission_percent: 0,
  marketing_percent: 0,
  admin_fee_percent: 0,
  target_margin_percent: 0,
  financial_fee_table: [{ installments: 1, fee_percent: 0 }, { installments: 12, fee_percent: 0 }],
};

const TAX_FIELDS = [
  { key: "pis_percent", label: "PIS", hint: "Programa de Integração Social" },
  { key: "cofins_percent", label: "COFINS", hint: "Contribuição para o Financiamento da Seguridade Social" },
  { key: "irpj_percent", label: "IRPJ efetivo", hint: "Imposto de Renda Pessoa Jurídica (efetivo)" },
  { key: "csll_percent", label: "CSLL efetiva", hint: "Contribuição Social sobre o Lucro Líquido (efetiva)" },
];

const COST_FIELDS = [
  { key: "commission_percent", label: "Comissão", hint: "Comissão de vendas sobre o preço final" },
  { key: "marketing_percent", label: "Marketing", hint: "Custo de marketing/aquisição sobre o preço final" },
  { key: "admin_fee_percent", label: "Taxa Adm.", hint: "Taxa administrativa sobre o preço final" },
  { key: "target_margin_percent", label: "Margem de Lucro Alvo", hint: "Margem desejada sobre o preço final" },
];

export default function PrecificacaoConfig() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState(DEFAULT_CONFIG);

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["pricingConfig"],
    queryFn: () => base44.entities.PricingConfig.list("-created_date", 10),
  });

  const existing = configs.find(c => c.name === "default") || configs[0] || null;

  useEffect(() => {
    if (existing) {
      setForm({
        ...DEFAULT_CONFIG,
        ...existing,
        financial_fee_table: Array.isArray(existing.financial_fee_table) && existing.financial_fee_table.length > 0
          ? existing.financial_fee_table
          : DEFAULT_CONFIG.financial_fee_table,
      });
    }
  }, [existing]);

  const mutation = useMutation({
    mutationFn: (data) => existing
      ? base44.entities.PricingConfig.update(existing.id, data)
      : base44.entities.PricingConfig.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricingConfig"] });
      toast({ title: "Configuração salva", description: "Os parâmetros de precificação foram atualizados." });
    },
  });

  const update = (k, v) => setForm(p => ({ ...p, [k]: v === "" ? 0 : Number(v) }));

  const updateFee = (i, field, v) => {
    setForm(p => {
      const table = [...(p.financial_fee_table || [])];
      table[i] = { ...table[i], [field]: v === "" ? 0 : Number(v) };
      return { ...p, financial_fee_table: table };
    });
  };
  const addFeeRow = () => setForm(p => ({ ...p, financial_fee_table: [...(p.financial_fee_table || []), { installments: 1, fee_percent: 0 }] }));
  const removeFeeRow = (i) => setForm(p => ({ ...p, financial_fee_table: (p.financial_fee_table || []).filter((_, idx) => idx !== i) }));

  const handleSubmit = (e) => { e.preventDefault(); mutation.mutate(form); };

  if (isLoading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  const taxMG = salesTaxForScenario(form, "mg");
  const taxFora = salesTaxForScenario(form, "fora_mg");

  return (
    <div>
      <PageHeader title="Precificação" description="Configure os impostos e custos de venda que incidem sobre o preço final dos produtos. Os impostos variam por cenário: Dentro de MG e Fora de MG (TTS)." />
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Percent className="h-5 w-5 text-primary" /> Impostos por Cenário</CardTitle>
            <CardDescription>
              Alíquotas parametrizadas conforme regime. Dentro de MG: ICMS 6% · Fora de MG (TTS): ICMS 1,30%. PIS/COFINS/IRPJ/CSLL iguais para ambos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Dentro de MG */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
                <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                  <MapPin className="h-4 w-4" /> Dentro de MG
                </div>
                <div>
                  <Label>ICMS efetivo (%)</Label>
                  <Input type="number" step="0.01" min="0" value={form.icms_mg_percent} onChange={e => update("icms_mg_percent", e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-1">Vendas dentro de Minas Gerais</p>
                </div>
                <div className="rounded-md bg-white border p-3 space-y-1 text-sm">
                  {TAX_FIELDS.map(f => (
                    <div key={f.key} className="flex justify-between items-center">
                      <Label className="text-xs font-normal">{f.label}</Label>
                      <Input type="number" step="0.01" min="0" value={form[f.key]} onChange={e => update(f.key, e.target.value)} className="w-24 h-8 text-right" />
                    </div>
                  ))}
                  <div className="border-t pt-1 mt-1 flex justify-between font-semibold">
                    <span>Total impostos</span>
                    <span className="text-emerald-700">{fmtPct(taxMG)}</span>
                  </div>
                </div>
              </div>

              {/* Fora de MG */}
              <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-3">
                <div className="flex items-center gap-2 text-blue-700 font-semibold">
                  <MapPinned className="h-4 w-4" /> Fora de MG (TTS)
                </div>
                <div>
                  <Label>ICMS efetivo (%)</Label>
                  <Input type="number" step="0.01" min="0" value={form.icms_fora_mg_percent} onChange={e => update("icms_fora_mg_percent", e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-1">Vendas interestaduais com benefício do TTS</p>
                </div>
                <div className="rounded-md bg-white border p-3 space-y-1 text-sm">
                  {TAX_FIELDS.map(f => (
                    <div key={f.key} className="flex justify-between items-center">
                      <Label className="text-xs font-normal">{f.label}</Label>
                      <Input type="number" step="0.01" min="0" value={form[f.key]} onChange={e => update(f.key, e.target.value)} className="w-24 h-8 text-right" />
                    </div>
                  ))}
                  <div className="border-t pt-1 mt-1 flex justify-between font-semibold">
                    <span>Total impostos</span>
                    <span className="text-blue-700">{fmtPct(taxFora)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-lg border bg-amber-50/50 border-amber-200 p-3 text-xs text-amber-800">
              <strong>Diferencial de benefício Fora de MG:</strong> {fmtPct(taxMG - taxFora)} de economia tributária — usado como margem para desconto em vendas interestaduais.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Percent className="h-5 w-5 text-primary" /> Outros Custos de Venda</CardTitle>
            <CardDescription>Demais percentuais que incidem sobre o preço final (comuns a ambos os cenários).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {COST_FIELDS.map(f => (
              <div key={f.key}>
                <Label>{f.label} (%)</Label>
                <Input type="number" step="0.01" min="0" value={form[f.key]} onChange={e => update(f.key, e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">{f.hint}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Percent className="h-5 w-5 text-primary" /> Taxa Financeira por Parcela</CardTitle>
            <CardDescription>
              Tabela de taxas financeiras por número de parcelas. A parcela 1 (à vista) define a tabela à vista; a parcela 12 define o pior cenário.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(form.financial_fee_table || []).map((row, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Parcelas</Label>
                  <Input type="number" min="1" value={row.installments} onChange={e => updateFee(i, "installments", e.target.value)} />
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Taxa (%)</Label>
                  <Input type="number" step="0.01" min="0" value={row.fee_percent} onChange={e => updateFee(i, "fee_percent", e.target.value)} />
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeFeeRow(i)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addFeeRow} className="gap-2">
              <Plus className="h-4 w-4" /> Adicionar Parcela
            </Button>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
              <p><strong>Resumo dos percentuais sobre o preço final:</strong></p>
              <p>Comissão: {fmtPct(form.commission_percent)} · Marketing: {fmtPct(form.marketing_percent)} · Taxa Adm: {fmtPct(form.admin_fee_percent)} · Margem: {fmtPct(form.target_margin_percent)}</p>
              <p>Impostos MG: {fmtPct(taxMG)} · Impostos Fora MG: {fmtPct(taxFora)}</p>
              <p>Taxa à vista (1x): {fmtPct((form.financial_fee_table || []).find(f => Number(f.installments) === 1)?.fee_percent)} · Taxa 12x: {fmtPct((form.financial_fee_table || []).find(f => Number(f.installments) === 12)?.fee_percent)}</p>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 flex justify-end">
          <Button type="submit" disabled={mutation.isPending} className="gap-2">
            {mutation.isPending ? "Salvando..." : <><Save className="h-4 w-4" /> Salvar Configuração</>}
          </Button>
        </div>
      </form>
    </div>
  );
}