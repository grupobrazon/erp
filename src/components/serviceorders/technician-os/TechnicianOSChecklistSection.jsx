import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ClipboardCheck } from "lucide-react";

export default function TechnicianOSChecklistSection({ checklistItems, results, onChange, readOnly }) {
  const updateResult = (itemId, itemName, field, value) => {
    const existing = results.find(r => r.item_id === itemId);
    let updated;
    if (existing) {
      updated = results.map(r => r.item_id === itemId ? { ...r, [field]: value } : r);
    } else {
      updated = [...results, { item_id: itemId, item_name: itemName, [field]: value }];
    }
    onChange(updated);
  };

  const getResult = (itemId) => results.find(r => r.item_id === itemId) || {};

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 text-sm font-semibold">
        <ClipboardCheck className="h-4 w-4 text-primary" /> Checklist do Atendimento
      </div>
      {checklistItems.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          Nenhum item de checklist parametrizado. Cadastre itens em Cadastros do Sistema → Checklists do Técnico.
        </p>
      ) : (
        <div className="space-y-3">
          {checklistItems.map(item => {
            const result = getResult(item.id);
    return (
              <div key={item.id} className="rounded-md border p-2 space-y-2">
                <div className="text-sm font-medium">{item.name}</div>
                {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Seleção</Label>
                    <Select value={result.selected_option || "none"} onValueChange={v => updateResult(item.id, item.name, "selected_option", v === "none" ? "" : v)} disabled={readOnly}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {item.options?.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Observação</Label>
                    <Input className="h-8" value={result.notes || ""} onChange={e => updateResult(item.id, item.name, "notes", e.target.value)} placeholder="Anotação..." disabled={readOnly} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}