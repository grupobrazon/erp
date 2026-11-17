import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wrench } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function CreateRemessaOsDialog({ remessa, open, onOpenChange, onCreated }) {
  const { toast } = useToast();
  const [osType, setOsType] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!osType) {
      toast({ title: "Selecione o tipo da OS", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await base44.functions.invoke("generateRemessaOs", {
        remessa_id: remessa.id,
        os_type: osType,
      });
      toast({ title: "OS criada", description: `OS ${res.data.service_order.code} gerada para a remessa ${remessa.code}` });
      setOsType("");
      onCreated?.(res.data.service_order);
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro ao criar OS", description: err?.response?.data?.error || err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!remessa) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" /> Criar Ordem de Serviço
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Remessa <span className="font-mono font-medium">{remessa.code}</span> — {remessa.client_name}
          </div>

          <div>
            <Label className="text-xs mb-2">Tipo da Ordem de Serviço</Label>
            <Select value={osType} onValueChange={setOsType}>
              <SelectTrigger><SelectValue placeholder="Selecione o tipo..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Expedição">Expedição (envio por transportadora)</SelectItem>
                <SelectItem value="Entrega">Entrega (entrega própria)</SelectItem>
                <SelectItem value="Entrega + Instalação">Entrega + Instalação</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              A OS será criada na etapa "Produção/Expedição" e aparecerá junto com as demais ordens de serviço.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />} Criar OS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}