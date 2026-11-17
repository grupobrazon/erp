import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export default function MultiSelectFilter({ options, selected, onChange, placeholder, allLabel, icon: Icon, className }) {
  const [open, setOpen] = useState(false);

  const allSelected = selected.length === 0;
  const toggle = (value) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const selectAll = () => onChange([]);

  const triggerLabel = allSelected
    ? allLabel || placeholder
    : selected.length === 1
      ? options.find(o => o.value === selected[0])?.label || placeholder
      : `${selected.length} selecionados`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between font-normal", !allSelected && "border-primary/50 bg-primary/5", className)}
        >
          <span className="flex items-center gap-2 truncate">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
            <span className="truncate">{triggerLabel}</span>
          </span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <div className="max-h-[300px] overflow-auto p-1">
          <button
            type="button"
            onClick={selectAll}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-left",
              allSelected && "bg-accent/50 font-medium"
            )}
          >
            <div className="flex h-4 w-4 items-center justify-center">
              {allSelected && <Check className="h-3.5 w-3.5" />}
            </div>
            <span>{allLabel || "Todos"}</span>
          </button>
          {options.map(opt => {
            const isSelected = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-left"
                )}
              >
                <Checkbox checked={isSelected} className="pointer-events-none" />
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
        {selected.length > 0 && (
          <div className="border-t p-2 flex flex-wrap gap-1">
            {selected.map(v => {
              const opt = options.find(o => o.value === v);
              return (
                <Badge key={v} variant="secondary" className="text-[10px]">
                  {opt?.label || v}
                </Badge>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}