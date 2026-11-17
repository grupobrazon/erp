import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Users2, Shuffle, UserCheck, Loader2 } from "lucide-react";
import { distributeClients } from "@/lib/distributionEngine";

export default function DistribuicaoAction({ selectedClients, sellers, onDistribute, allClients }) {
  const [targetSellerIds, setTargetSellerIds] = useState([]);
  const [mode, setMode] = useState("equal");
  const [loading, setLoading] = useState(false);

  const toggleSeller = (id) =>
    setTargetSellerIds(targetSellerIds.includes(id) ? targetSellerIds.filter((x) => x !== id) : [...targetSellerIds, id]);

  const canApply =
    selectedClients.length > 0 &&
    (mode === "single" ? targetSellerIds.length === 1 : targetSellerIds.length >= 2);

  const preview = useMemo(() => {
    if (mode === "single" && targetSellerIds.length === 1) {
      const s = sellers.find((s) => s.id === targetSellerIds[0]);
      return [{ seller: s?.name, count: selectedClients.length }];
    }
    if (mode === "equal" && targetSellerIds.length >= 2) {
      const targets = sellers.filter((s) => targetSellerIds.includes(s.id));
      const assignments = distributeClients(selectedClients, targets, allClients);
      return targets.map((s, i) => ({
        seller: s.name,
        count: assignments.filter((a) => a.sellerIndex === i).length,
      }));
    }
    return [];
  }, [mode, targetSellerIds, selectedClients, sellers, allClients]);

  const handleApply = async () => {
    setLoading(true);
    try {
      await onDistribute({ targetSellerIds, mode });
      setTargetSellerIds([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="sticky top-4">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Users2 className="h-4 w-4" /> Distribuição</CardTitle>
        <p className="text-xs text-muted-foreground">
          {selectedClients.length} clientes selecionados para distribuir
          {selectedClients.length === 0 && " — selecione bairros no raio-x ou use o filtro completo"}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <span className="text-xs font-semibold text-muted-foreground">Modo de distribuição</span>
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => setMode("equal")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border ${
                mode === "equal" ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-accent"
              }`}
            >
              <Shuffle className="h-3.5 w-3.5" /> Dividido igual
            </button>
            <button
              onClick={() => setMode("single")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border ${
                mode === "single" ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-accent"
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" /> Uma vendedora
            </button>
          </div>
        </div>
        <div>
          <span className="text-xs font-semibold text-muted-foreground">
            {mode === "single" ? "Selecione 1 vendedora" : "Selecione as vendedoras"}
          </span>
          <div className="grid grid-cols-1 gap-1.5 mt-1 max-h-56 overflow-auto">
            {sellers.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-4">Nenhuma vendedora cadastrada.</div>
            ) : (
              sellers.map((s) => (
                <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer hover:bg-accent text-sm">
                  <Checkbox checked={targetSellerIds.includes(s.id)} onCheckedChange={() => toggleSeller(s.id)} />
                  <span className="truncate">{s.name}</span>
                </label>
              ))
            )}
          </div>
        </div>
        {preview.length > 0 && (
          <div className="bg-muted/50 rounded-md p-3">
            <span className="text-xs font-semibold text-muted-foreground">Pré-visualização</span>
            <div className="mt-1.5 space-y-1">
              {preview.map((p, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="truncate">{p.seller}</span>
                  <span className="font-medium">{p.count} clientes</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <Button onClick={handleApply} disabled={!canApply || loading} className="w-full gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users2 className="h-4 w-4" />}
          Distribuir {selectedClients.length} clientes
        </Button>
        {!canApply && (
          <p className="text-xs text-muted-foreground text-center">
            {mode === "single" ? "Selecione exatamente 1 vendedora" : "Selecione ao menos 2 vendedoras"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}