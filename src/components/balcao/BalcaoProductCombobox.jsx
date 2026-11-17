import React, { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

export default function BalcaoProductCombobox({ value, onChange }) {
  const [open, setOpen] = useState(false);
  // Mesma consulta da tela de Vendas (SaleForm.jsx): mesma queryKey e queryFn => mesmo cache/dados.
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => base44.entities.Product.list("-created_date", 500),
  });
  const selected = products.find((p) => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal h-9">
          <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
            {selected ? `${selected.code ? selected.code + " — " : ""}${selected.name}` : "Selecionar produto..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start" style={{ width: "var(--radix-popover-trigger-width)" }}>
        <Command filter={(itemValue, search) => {
          const norm = search.trim().toLowerCase();
          if (!norm) return 1;
          return itemValue.toLowerCase().includes(norm) ? 1 : 0;
        }}>
          <CommandInput placeholder="Buscar por nome ou código..." />
          <CommandList>
            <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
            <CommandGroup>
              {products.map((p) => (
                <CommandItem key={p.id} value={`${p.code || ""} ${p.name}`} onSelect={() => { onChange(p); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === p.id ? "opacity-100" : "opacity-0")} />
                  <span className="font-mono text-xs shrink-0 text-muted-foreground">{p.code || "—"}</span>
                  <span className="truncate flex-1">{p.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}