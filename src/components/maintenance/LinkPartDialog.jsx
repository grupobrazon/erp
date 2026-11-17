import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function LinkPartDialog({ open, onOpenChange, part }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isPlaceholder = part && part.record_type === "equipamento" && part.pending_link;
  const [mode, setMode] = useState("existing");
  const [equipId, setEquipId] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [intervalMonths, setIntervalMonths] = useState(6);
  const [loading, setLoading] = useState(false);

  const { data: clientEquipment = [] } = useQuery({
    queryKey: ["clientEquipmentForLink", part?.client_id],
    queryFn: () => part
      ? base44.entities.Equipment.filter({ client_id: part.client_id, record_type: "equipamento" }, "-created_date", 100)
      : [],
    enabled: !!part && !isPlaceholder,
  });

  useEffect(() => {
    if (open) {
      setEquipId("");
      setBrand(part?.brand || "");
      setModel(part?.model || "");
      setIntervalMonths(part?.maintenance_interval_months || 6);
      if (isPlaceholder) {
        setMode("placeholder");
      } else {
        setMode(clientEquipment.length > 0 ? "existing" : "new");
      }
    }
  }, [open, clientEquipment.length, isPlaceholder, part]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isPlaceholder) {
        // Placeholder: apenas preenche o modelo. A data da próxima troca é atualizada no faturamento.
        await base44.entities.Equipment.update(part.id, {
          pending_link: false,
          brand: brand,
          model: model,
          maintenance_interval_months: Number(intervalMonths) || 6,
        });
        toast({ title: "Modelo cadastrado", description: "A data da próxima troca será atualizada quando a venda for faturada." });
      } else if (mode === "existing" && equipId) {
        const equip = clientEquipment.find(e => e.id === equipId);
        await base44.entities.Equipment.update(part.id, {
          pending_link: false,
          linked_equipment_id: equipId,
          brand: equip?.brand || "",
          model: equip?.model || "",
          status: "Inativo",
        });
        toast({ title: "Peça vinculada ao equipamento " + (equip?.patrimony_code || "") });
      } else {
        await base44.entities.Equipment.update(part.id, {
          pending_link: false,
          record_type: "equipamento",
          brand: brand,
          model: model,
          status: "Ativo",
          maintenance_interval_months: Number(intervalMonths) || 6,
          next_maintenance_date: (() => {
            const d = new Date();
            d.setMonth(d.getMonth() + (Number(intervalMonths) || 6));
            return d.toISOString().split("T")[0];
          })(),
        });
        toast({ title: "Equipamento cadastrado a partir da peça" });
      }
      queryClient.invalidateQueries({ queryKey: ["maintenanceEquipment"] });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isPlaceholder ? "Cadastrar Modelo do Equipamento" : "Vincular Peça a Equipamento"}</DialogTitle>
        </DialogHeader>
        {part && (
          <div className="text-sm text-muted-foreground mb-2">
            Cliente: <span className="font-medium text-foreground">{part.client_name}</span> — Patrimônio: <span className="font-mono">{part.patrimony_code}</span> — Refil: {part.product_name}
          </div>
        )}

        {!isPlaceholder && clientEquipment.length > 0 && (
          <div className="flex gap-2 mb-2">
            <Button type="button" size="sm" variant={mode === "existing" ? "default" : "outline"} onClick={() => setMode("existing")}>Vincular existente</Button>
            <Button type="button" size="sm" variant={mode === "new" ? "default" : "outline"} onClick={() => setMode("new")}>Cadastrar novo</Button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isPlaceholder && mode === "existing" && clientEquipment.length > 0 ? (
            <div>
              <Label>Equipamento do cliente</Label>
              <Select value={equipId} onValueChange={setEquipId}>
                <SelectTrigger>
                  <span className={!equipId ? "text-muted-foreground" : ""}>
                    {equipId
                      ? (clientEquipment.find(e => e.id === equipId)
                        ? `${clientEquipment.find(e => e.id === equipId).patrimony_code} — ${clientEquipment.find(e => e.id === equipId).product_name}`
                        : "Selecione...")
                      : "Selecione o equipamento..."}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {clientEquipment.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.patrimony_code} — {e.product_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">A peça será vinculada como manutenção deste equipamento.</p>
            </div>
          ) : (
            <div className="space-y-3 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                {isPlaceholder
                  ? "Este refil foi vendido para um cliente sem purificador cadastrado. Informe o modelo do equipamento para concluir o cadastro. A data da próxima troca será atualizada quando a venda for faturada."
                  : "Equipamento não comprado na empresa. Preencha os dados manualmente para cadastrar."}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Marca *</Label>
                  <Input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Ex: Fornecedor Terceiro" required />
                </div>
                <div>
                  <Label>Modelo *</Label>
                  <Input value={model} onChange={e => setModel(e.target.value)} placeholder="Modelo do equipamento" required />
                </div>
              </div>
              <div>
                <Label>Intervalo de Manutenção (meses)</Label>
                <Input type="number" value={intervalMonths} onChange={e => setIntervalMonths(e.target.value)} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</> : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}