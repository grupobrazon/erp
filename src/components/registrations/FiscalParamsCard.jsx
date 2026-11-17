import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlidersHorizontal, Loader2, Save } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function FiscalParamsCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    natureza_operacao: "Venda de mercadoria",
    csosn_default: "102",
    pis_cst: "08",
    cofins_cst: "08",
    ncm_padrao: "84212100",
    presenca_comprador: 2,
  });
  const [saving, setSaving] = useState(false);
  const [settingId, setSettingId] = useState(null);

  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSetting.list("-created_date", 1),
  });

  useEffect(() => {
    if (settings[0]) {
      const s = settings[0];
      setSettingId(s.id);
      setForm({
        natureza_operacao: s.natureza_operacao || "Venda de mercadoria",
        csosn_default: s.csosn_default || "102",
        pis_cst: s.pis_cst || "08",
        cofins_cst: s.cofins_cst || "08",
        ncm_padrao: s.ncm_padrao || "84212100",
        presenca_comprador: s.presenca_comprador ?? 2,
      });
    }
  }, [settings]);

  const save = async () => {
    setSaving(true);
    try {
      if (settingId) {
        await base44.entities.SystemSetting.update(settingId, form);
      } else {
        const created = await base44.entities.SystemSetting.create({ name: "Configuração NF-e", ...form });
        setSettingId(created.id);
      }
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      toast({ title: "Parâmetros fiscais salvos" });
    } catch (err) {
      toast({ title: "Erro ao salvar", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-primary" /> Parâmetros Fiscais da NF-e
        </CardTitle>
        <CardDescription>
          CFOPs, CSOSN, CSTs de PIS/COFINS e NCM padrão usados na emissão de NF-e via Focus NFe.
          Confirme os valores com a contabilidade.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <Label className="text-xs">Natureza da Operação</Label>
          <Input
            value={form.natureza_operacao}
            onChange={(e) => set("natureza_operacao", e.target.value)}
            placeholder="Ex: Venda de mercadoria"
          />
        </div>

        <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
          Os CFOPs são cadastrados na lista acima. Na emissão da NF-e, o sistema seleciona
          automaticamente a versão interna (5xxx) ou interestadual (6xxx) conforme o estado do destinatário.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs">CSOSN (ICMS — Simples Nacional)</Label>
            <Input
              value={form.csosn_default}
              onChange={(e) => set("csosn_default", e.target.value)}
              placeholder="102"
            />
          </div>
          <div>
            <Label className="text-xs">CST PIS</Label>
            <Input
              value={form.pis_cst}
              onChange={(e) => set("pis_cst", e.target.value)}
              placeholder="08"
            />
          </div>
          <div>
            <Label className="text-xs">CST COFINS</Label>
            <Input
              value={form.cofins_cst}
              onChange={(e) => set("cofins_cst", e.target.value)}
              placeholder="08"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">NCM Padrão (fallback)</Label>
            <Input
              value={form.ncm_padrao}
              onChange={(e) => set("ncm_padrao", e.target.value)}
              placeholder="84212100"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Usado quando o produto não tem NCM cadastrado.
            </p>
          </div>
          <div>
            <Label className="text-xs">Presença do Comprador</Label>
            <Select
              value={String(form.presenca_comprador)}
              onValueChange={(v) => set("presenca_comprador", Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 — Presencial</SelectItem>
                <SelectItem value="2">2 — Internet</SelectItem>
                <SelectItem value="9">9 — Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar Parâmetros
        </Button>
      </CardContent>
    </Card>
  );
}