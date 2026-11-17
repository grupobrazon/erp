import React, { useState, useMemo } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, Users } from "lucide-react";

export default function MaintenanceSellerFilter({ sellers, selectedSellerIds, onChange, assignmentFilter, setAssignmentFilter }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filteredSellers = useMemo(
    () => sellers.filter((s) => (s.name || "").toLowerCase().includes(query.toLowerCase())),
    [sellers, query]
  );
  const toggle = (id) => {
    if (selectedSellerIds.includes(id)) onChange(selectedSellerIds.filter((x) => x !== id));
    else onChange([...selectedSellerIds, id]);
  };
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted-foreground">Vendedora</span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="justify-between min-w-[220px] gap-2">
              <Users className="h-4 w-4 opacity-50" />
              <span className="truncate flex-1 text-left">
                {selectedSellerIds.length === 0 ? "Todas as vendedoras" : `${selectedSellerIds.length} selecionada(s)`}
              </span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <div className="p-2 border-b">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar vendedora..." className="h-8" />
            </div>
            <div className="max-h-60 overflow-auto p-1">
              {filteredSellers.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4">Nenhuma vendedora</div>
              ) : (
                filteredSellers.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
                    <Checkbox checked={selectedSellerIds.includes(s.id)} onCheckedChange={() => toggle(s.id)} />
                    <span className="truncate">{s.name}</span>
                  </label>
                ))
              )}
            </div>
            {selectedSellerIds.length > 0 && (
              <div className="p-2 border-t flex justify-between items-center">
                <span className="text-xs text-muted-foreground">{selectedSellerIds.length} selecionada(s)</span>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange([])}>Limpar</Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted-foreground">Atribuição</span>
        <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
          <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="assigned">Atribuídos</SelectItem>
            <SelectItem value="unassigned">Sem atribuição</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}