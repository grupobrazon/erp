import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Save, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Padrões fixos do 3C Plus (exibidos no fim da lista se ainda não vierem da API)
const SYSTEM_DEFAULTS = [
  { id: -2, name: "Não qualificada", color: "#9e9e9e" },
  { id: -3, name: "Caixa Postal", color: "#212121" },
  { id: -4, name: "Mudo", color: "#212121" },
];

export default function PostCallClassification({ qualifications, onQualify, saving, qualified }) {
  const [selected, setSelected] = useState(null);
  const apiList = Array.isArray(qualifications) ? qualifications : [];

  // Padrões do sistema só aparecem como fallback quando a API não retornar qualificações.
  // Eles têm IDs negativos fictícios e não existem no 3C Plus — enviá-los causa erro 502.
  const list = apiList.length > 0 ? apiList : SYSTEM_DEFAULTS;

  const disabled = !!qualified;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {list.map((q) => {
          const isSelected = selected === q.id;
          return (
            <button
              key={q.id}
              type="button"
              disabled={disabled}
              onClick={() => setSelected(q.id)}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2.5 rounded-md border text-sm text-left transition-colors",
                isSelected
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border bg-card hover:bg-muted/50",
                disabled && "opacity-60 cursor-default"
              )}
            >
              <span
                className={cn(
                  "h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0",
                  isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
                )}
              >
                {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
              </span>
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: q.color || "#9e9e9e" }}
              />
              <span className={cn("truncate", isSelected && "font-medium")}>{q.name}</span>
            </button>
          );
        })}
      </div>

      {qualified ? (
        <div className="flex items-center justify-center gap-2 text-sm text-emerald-600 py-1">
          <Check className="h-4 w-4" /> Classificação salva — voltando à fila em até 30s…
        </div>
      ) : (
        <>
          <Button size="sm" onClick={() => selected != null && onQualify(selected)} disabled={selected == null || saving} className="gap-1.5 w-full">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar Classificação
          </Button>
          {selected == null && <p className="text-xs text-muted-foreground text-center">Selecione uma classificação para habilitar o salvamento.</p>}
        </>
      )}
    </div>
  );
}