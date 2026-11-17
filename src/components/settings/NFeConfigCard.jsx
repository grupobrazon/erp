import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Upload, Loader2, Save } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function NFeConfigCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    nfe_serie: "",
    nfe_certificate_url: "",
    nfe_certificate_password: "",
    nfe_environment: "Homologação",
    nfe_provider: "",
    nfe_provider_api_key: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
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
        nfe_serie: s.nfe_serie || "",
        nfe_certificate_url: s.nfe_certificate_url || "",
        nfe_certificate_password: s.nfe_certificate_password || "",
        nfe_environment: s.nfe_environment || "Homologação",
        nfe_provider: s.nfe_provider || "",
        nfe_provider_api_key: s.nfe_provider_api_key || "",
      });
    }
  }, [settings]);

  const uploadCert = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      setForm((f) => ({ ...f, nfe_certificate_url: res.file_url }));
      toast({ title: "Certificado enviado" });
    } catch (err) {
      toast({ title: "Erro no upload", description: err?.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      if (settingId) {
        await base44.entities.SystemSetting.update(settingId, form);
      } else {
        await base44.entities.SystemSetting.create({ name: "Configuração NF-e", ...form });
      }
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      toast({ title: "Configuração salva" });
    } catch (err) {
      toast({ title: "Erro ao salvar", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const certName = form.nfe_certificate_url
    ? form.nfe_certificate_url.split("/").pop()
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> Emissão de Nota Fiscal (NF-e)
        </CardTitle>
        <CardDescription>
          Certificado digital, série da nota e provedor para emissão de NF-e.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Série da Nota</Label>
            <Input
              value={form.nfe_serie}
              onChange={(e) => setForm((f) => ({ ...f, nfe_serie: e.target.value }))}
              placeholder="Ex: 001"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Nova série para iniciar a numeração ao trocar de sistema.
            </p>
          </div>
          <div>
            <Label className="text-xs">Ambiente</Label>
            <Select
              value={form.nfe_environment}
              onValueChange={(v) => setForm((f) => ({ ...f, nfe_environment: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Homologação">Homologação</SelectItem>
                <SelectItem value="Produção">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-xs">Certificado Digital (PFX/P12)</Label>
          <div className="flex items-center gap-3 mt-1.5">
            <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border border-input bg-transparent px-3 h-9 text-sm hover:bg-accent">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}{" "}
              Enviar certificado
              <input
                type="file"
                accept=".pfx,.p12"
                onChange={uploadCert}
                className="hidden"
              />
            </label>
            {certName && (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
                {certName}
              </Badge>
            )}
          </div>
        </div>

        <div>
          <Label className="text-xs">Senha do Certificado</Label>
          <Input
            type="password"
            value={form.nfe_certificate_password}
            onChange={(e) =>
              setForm((f) => ({ ...f, nfe_certificate_password: e.target.value }))
            }
            placeholder="Senha do arquivo PFX"
          />
        </div>

        <div className="border-t pt-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Provedor NF-e (para emissão real futura)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Provedor</Label>
              <Input
                value={form.nfe_provider}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nfe_provider: e.target.value }))
                }
                placeholder="Ex: NFe.io, Focus NFe"
              />
            </div>
            <div>
              <Label className="text-xs">API Key do Provedor</Label>
              <Input
                type="password"
                value={form.nfe_provider_api_key}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nfe_provider_api_key: e.target.value }))
                }
                placeholder="Chave de API"
              />
            </div>
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{" "}
          Salvar Configuração
        </Button>
      </CardContent>
    </Card>
  );
}