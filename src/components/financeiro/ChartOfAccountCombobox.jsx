import React, { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

const NATURES = ["Receita", "Dedução", "Custo", "Despesa", "Ativo", "Imposto s/ Lucro", "Antecipação"];

export default function ChartOfAccountCombobox({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const { data: accounts = [] } = useQuery({
    queryKey: ["chartOfAccounts"],
    queryFn: () => base44.entities.ChartOfAccount.list("-code", 500),
  });
  const selected = accounts.find(a => a.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal h-9">
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? `${selected.code} — ${selected.name}` : "Buscar conta do plano..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start" style={{ width: "var(--radix-popover-trigger-width)" }}>
        <Command>
          <CommandInput placeholder="Buscar por código ou nome..." />
          <CommandList>
            <CommandEmpty>Nenhuma conta encontrada.</CommandEmpty>
            {NATURES.map(nature => {
              const items = accounts.filter(a => a.nature === nature && a.is_active !== false);
              if (items.length === 0) return null;
              return (
                <CommandGroup key={nature} heading={nature}>
                  {items.map(a => (
                    <CommandItem key={a.id} value={`${a.code} ${a.name}`} onSelect={() => { onChange(a); setOpen(false); }}>
                      <Check className={cn("mr-2 h-4 w-4", value === a.id ? "opacity-100" : "opacity-0")} />
                      <span className="font-mono text-xs shrink-0">{a.code}</span>
                      <span className="truncate">{a.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}