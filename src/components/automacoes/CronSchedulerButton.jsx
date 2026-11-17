import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, ChevronDown } from "lucide-react";
import { cronToText, nextCronRuns, formatDateTime } from "./cronUtils";
import { cn } from "@/lib/utils";

const PRESETS = [
  { label: "A cada minuto", value: "* * * * *" },
  { label: "A cada 5 minutos", value: "*/5 * * * *" },
  { label: "A cada 15 minutos", value: "*/15 * * * *" },
  { label: "A cada 30 minutos", value: "*/30 * * * *" },
  { label: "A cada hora", value: "0 * * * *" },
  { label: "Diariamente à meia-noite", value: "0 0 * * *" },
  { label: "Diariamente às 09:00", value: "0 9 * * *" },
  { label: "Dias úteis às 09:00", value: "0 9 * * 1-5" },
  { label: "Toda segunda às 09:00", value: "0 9 * * 1" },
  { label: "Dia 1 de cada mês", value: "0 0 1 * *" },
];

export default function CronSchedulerButton({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const text = useMemo(() => cronToText(value), [value]);
  const nextRuns = useMemo(() => (value ? nextCronRuns(value, 3) : []), [value]);

  return (
    <div className="relative">
      <Label className="text-xs text-muted-foreground">Expressão Cron</Label>
      <div className="flex gap-2 mt-1">
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="*/30 * * * *"
          className="font-mono text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setOpen((o) => !o)}
          title="Presets"
        >
          <Clock className="h-4 w-4" />
        </Button>
      </div>
      {value && (
        <p className="text-xs text-emerald-600 mt-1 font-medium">{text}</p>
      )}
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full max-w-sm bg-popover border border-border rounded-md shadow-lg p-3 space-y-3">
            <div>
              <div className="text-xs font-semibold mb-1.5 flex items-center justify-between">
                Presets rápidos
                <ChevronDown className="h-3 w-3" />
              </div>
              <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto">
                {PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => { onChange(p.value); setOpen(false); }}
                    className={cn(
                      "text-left px-2.5 py-1.5 rounded text-xs hover:bg-accent transition-colors",
                      value === p.value && "bg-primary/10 text-primary font-medium"
                    )}
                  >
                    <div className="font-medium">{p.label}</div>
                    <div className="font-mono text-muted-foreground">{p.value}</div>
                  </button>
                ))}
              </div>
            </div>
            {nextRuns.length > 0 && (
              <div className="border-t border-border pt-2">
                <div className="text-xs font-semibold mb-1">Próximas execuções</div>
                <div className="space-y-0.5">
                  {nextRuns.map((d, i) => (
                    <div key={i} className="text-xs text-muted-foreground font-mono">
                      {formatDateTime(d)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}