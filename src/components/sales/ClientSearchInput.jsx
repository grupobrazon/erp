import React, { useState, useRef, useEffect, useCallback } from "react";
import { Search, Plus, User, Loader2, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import QuickClientDialog from "./QuickClientDialog";

export default function ClientSearchInput({ value, onChange, onClientSelect }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [vipOnly, setVipOnly] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const ref = useRef(null);
  const debounceRef = useRef(null);

  // Carrega o cliente selecionado quando há um value (ex: edição)
  useEffect(() => {
    if (value && (!selectedClient || selectedClient.id !== value)) {
      base44.entities.Client.get(value).then(setSelectedClient).catch(() => setSelectedClient(null));
    } else if (!value) {
      setSelectedClient(null);
    }
  }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setShowResults(false);
        if (!value) setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [value]);

  // Busca server-side com debounce
  const doSearch = useCallback((term) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!term || term.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const q = term.trim();
        const orConditions = [
          { name: { $regex: q, $options: "i" } },
          { document: { $regex: q, $options: "i" } },
          { new_code: { $regex: q, $options: "i" } },
          { old_code: { $regex: q, $options: "i" } },
        ];
        const clientQuery = vipOnly ? { $and: [{ $or: orConditions }, { vip_client: true }] } : { $or: orConditions };
        const found = await base44.entities.Client.filter(clientQuery, "-created_date", 30);
        setResults(found);
      } catch (e) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [vipOnly]);

  // Refaz a busca ao alternar o filtro de Cliente VIP
  useEffect(() => {
    if (search.trim().length >= 2) doSearch(search);
  }, [vipOnly, doSearch, search]);

  const handleSelect = (c) => {
    setSelectedClient(c);
    onChange(c.id);
    onClientSelect?.(c);
    setShowResults(false);
    setSearch("");
  };

  const displayValue = selectedClient
    ? `${selectedClient.new_code ? selectedClient.new_code + " · " : ""}${selectedClient.name}${selectedClient.document ? " · " + selectedClient.document : ""}`
    : search;

  return (
    <div ref={ref} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar pelo nome, CPF/CNPJ ou código..."
            value={displayValue}
            onChange={e => {
              setSearch(e.target.value);
              onChange("");
              onClientSelect?.(null);
              setShowResults(true);
              doSearch(e.target.value);
            }}
            onFocus={() => {
              if (selectedClient) {
                setSelectedClient(null);
                onChange("");
                onClientSelect?.(null);
                setSearch("");
              }
              setShowResults(true);
            }}
            className="pl-10"
          />
          {selectedClient && (
            <div className={`absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 ${selectedClient.vip_client ? "text-amber-600" : "text-green-600"}`}>
              {selectedClient.vip_client && <Star className="h-4 w-4 fill-amber-500 text-amber-500" />}
              <User className="h-4 w-4" />
              <span className="text-xs font-medium">{selectedClient.vip_client ? "Cliente VIP" : "Selecionado"}</span>
            </div>
          )}
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <Button
          type="button"
          variant={vipOnly ? "default" : "outline"}
          size="icon"
          onClick={() => setVipOnly(v => !v)}
          title={vipOnly ? "Mostrando somente clientes VIP" : "Buscar somente clientes VIP"}
        >
          <Star className={`h-4 w-4 ${vipOnly ? "" : "text-amber-500 fill-amber-500"}`} />
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={() => setQuickOpen(true)} title="Cadastrar novo cliente">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {showResults && search && (
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando clientes...
            </div>
          ) : results.length > 0 ? (
            results.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelect(c)}
                className="w-full text-left px-3 py-2.5 hover:bg-accent text-sm border-b last:border-0 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <span className="font-medium flex items-center gap-1.5">
                    {c.vip_client && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                    <span className="truncate">{c.name}</span>
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {c.document && <span>{c.document} · </span>}
                    {c.city && `${c.city}/${c.state || ""}`}
                  </span>
                </div>
                {c.new_code && (
                  <span className="text-xs text-muted-foreground font-mono shrink-0">{c.new_code}</span>
                )}
              </button>
            ))
          ) : (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Nenhum cliente encontrado</p>
              <p className="mt-1 text-xs">Verifique o nome ou cadastre um novo cliente usando o botão +</p>
            </div>
          )}
        </div>
      )}

      <QuickClientDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onCreated={(client) => { handleSelect(client); setQuickOpen(false); }}
      />
    </div>
  );
}