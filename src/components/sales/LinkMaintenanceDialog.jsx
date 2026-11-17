import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Wrench, AlertTriangle, CalendarClock } from "lucide-react";

const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—");

export default function LinkMaintenanceDialog({ open, onOpenChange, equipment, clientName, onLink }) {
  const [selected, setSelected] = useState("");

  const sorted = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return [...(equipment || [])]
      .filter((e) => e.record_type !== "peca")
      .sort((a, b) => {
        const da = a.next_maintenance_date ? new Date(a.next_maintenance_date + "T00:00:00").getTime() : Infinity;
        const db = b.next_maintenance_date ? new Date(b.next_maintenance_date + "T00:00:00").getTime() : Infinity;
        return da - db;
      });
  }, [equipment]);

  const statusOf = (equip) => {
    if (!equip.next_maintenance_date) return { label: "Sem data", variant: "secondary" };
    const next = new Date(equip.next_maintenance_date + "T00:00:00");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((next - today) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { label: `Atrasada (${Math.abs(diff)}d)`, variant: "destructive" };
    if (diff <= 30) return { label: `Próxima (${diff}d)`, variant: "default" };
    return { label: "Em dia", variant: "secondary" };
  };

  const handleConfirm = () => {
    const equip = sorted.find((e) => e.id === selected);
    if (equip) onLink(equip);
    setSelected("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setSelected(""); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-accent" /> Vincular troca de refil
          </DialogTitle>
          <DialogDescription>
            <strong className="text-foreground">{clientName || "Este cliente"}</strong> possui equipamento(s)
            com manutenção vencida ou próxima. Vincule esta venda a um equipamento para atualizar a próxima
            troca automaticamente ao confirmar — ou lance pelo Painel de Manutenção.
          </DialogDescription>
        </DialogHeader>

        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum equipamento ativo encontrado para este cliente.</p>
        ) : (
          <RadioGroup value={selected} onValueChange={setSelected} className="space-y-2 max-h-72 overflow-y-auto">
            {sorted.map((e) => {
              const st = statusOf(e);
              return (
                <label
                  key={e.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/5 ${selected === e.id ? "border-accent bg-accent/5" : ""}`}
                >
                  <RadioGroupItem value={e.id} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">{e.patrimony_code || e.code}</span>
                      <span className="text-sm truncate">{e.product_name || "Equipamento"}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                      <CalendarClock className="h-3 w-3" /> Próx. troca: {fmtDate(e.next_maintenance_date)}
                    </div>
                  </div>
                  <Badge variant={st.variant} className="gap-1 whitespace-nowrap">
                    {st.variant === "destructive" && <AlertTriangle className="h-3 w-3" />}
                    {st.label}
                  </Badge>
                </label>
              );
            })}
          </RadioGroup>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => { setSelected(""); onOpenChange(false); }}>Pular</Button>
          <Button disabled={!selected} onClick={handleConfirm} className="gap-1">
            <Wrench className="h-4 w-4" /> Vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}