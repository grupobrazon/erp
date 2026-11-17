import React, { useMemo, useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { normalizeBrand } from "@/lib/brandNormalize";
import { Save, Loader2 } from "lucide-react";

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ACTIVE_STATUSES = ["Ativo", "Em manutenção"];
const SEM_EQUIP = "Sem equipamento";

export default function MetaDistribuicaoDialog({
  open, onClose, onSaved, editing, batches, clients, equipment, sellers, products,
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [selectedBatchIds, setSelectedBatchIds] = useState([]);
  const [goalDate, setGoalDate] = useState("");
  const [brandTickets, setBrandTickets] = useState({});
  const [sellerTargets, setSellerTargets] = useState({});
  const [gatilhos, setGatilhos] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name || "");
      setSelectedBatchIds(editing.batch_ids || []);
      setGoalDate(editing.goal_date || "");
      setBrandTickets(editing.brand_tickets || {});
      setGatilhos((editing.gatilhos || []).map((g) => ({ threshold: g.threshold ?? "", commission_percent: g.commission_percent ?? "" })));
      const st = {};
      (editing.sellers || []).forEach((s) => { st[s.seller_id] = s.target_percent ?? 100; });
      setSellerTargets(st);
    } else {
      setName("");
      setSelectedBatchIds([]);
      setGoalDate("");
      setBrandTickets({});
      setGatilhos([]);
      setSellerTargets({});
    }
  }, [open, editing]);

  const availableBatches = useMemo(
    () => (batches || []).filter((b) => !b.reversed).sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [batches]
  );

  const clientIdsInBatches = useMemo(() => {
    const set = new Set();
    (batches || []).forEach((b) => {
      if (selectedBatchIds.includes(b.id)) (b.client_ids || []).forEach((id) => set.add(id));
    });
    return set;
  }, [batches, selectedBatchIds]);

  const clientsInScope = useMemo(
    () => (clients || []).filter((c) => clientIdsInBatches.has(c.id)),
    [clients, clientIdsInBatches]
  );

  const equipByClient = useMemo(() => {
    const map = new Map();
    (equipment || []).forEach((e) => {
      if (!clientIdsInBatches.has(e.client_id)) return;
      if (!ACTIVE_STATUSES.includes(e.status)) return;
      if (!map.has(e.client_id)) map.set(e.client_id, []);
      map.get(e.client_id).push(e);
    });
    return map;
  }, [equipment, clientIdsInBatches]);

  // Distinct brands in scope + counts
  const brandsInScope = useMemo(() => {
    const map = new Map(); // brand -> { clients: Set, equip: number }
    clientsInScope.forEach((c) => {
      const eqs = equipByClient.get(c.id) || [];
      if (eqs.length === 0) {
        if (!map.has(SEM_EQUIP)) map.set(SEM_EQUIP, { clients: new Set(), equip: 0 });
        map.get(SEM_EQUIP).clients.add(c.id);
        return;
      }
      const seenBrands = new Set();
      eqs.forEach((e) => {
        const b = normalizeBrand(e.brand);
        if (!map.has(b)) map.set(b, { clients: new Set(), equip: 0 });
        const entry = map.get(b);
        entry.equip += 1;
        seenBrands.add(b);
      });
      seenBrands.forEach((b) => map.get(b).clients.add(c.id));
    });
    return [...map.entries()]
      .map(([brand, v]) => ({ brand, clients: v.clients.size, equip: v.equip }))
      .sort((a, b) => b.clients - a.clients);
  }, [clientsInScope, equipByClient]);

  // Suggested ticket per brand from product price table (avg sale_price of products with that brand)
  const suggestedTicketByBrand = useMemo(() => {
    const map = new Map();
    (products || []).forEach((p) => {
      if (!p.sale_price) return;
      const b = normalizeBrand(p.brand);
      if (!map.has(b)) map.set(b, { sum: 0, count: 0 });
      const e = map.get(b);
      e.sum += p.sale_price;
      e.count += 1;
    });
    const out = {};
    for (const [b, e] of map) out[b] = e.count ? e.sum / e.count : 0;
    return out;
  }, [products]);

  // Sellers present in scope
  const sellersInScope = useMemo(() => {
    const map = new Map(); // seller_id -> { name, clients: Set }
    clientsInScope.forEach((c) => {
      if (!c.seller_id) return;
      if (!map.has(c.seller_id)) {
        const s = (sellers || []).find((x) => x.id === c.seller_id);
        map.set(c.seller_id, { name: c.seller_name || s?.name || "—", clients: new Set() });
      }
      map.get(c.seller_id).clients.add(c.id);
    });
    return [...map.entries()].map(([id, v]) => ({ seller_id: id, seller_name: v.name, client_count: v.clients.size }));
  }, [clientsInScope, sellers]);

  // Forecast per seller
  const forecastBySeller = useMemo(() => {
    const map = new Map();
    clientsInScope.forEach((c) => {
      const eqs = equipByClient.get(c.id) || [];
      let clientForecast;
      if (eqs.length === 0) {
        clientForecast = brandTickets[SEM_EQUIP] || 0;
      } else {
        const distinctBrands = new Set(eqs.map((e) => normalizeBrand(e.brand)));
        clientForecast = [...distinctBrands].reduce((acc, b) => acc + (brandTickets[b] || 0), 0);
      }
      const sid = c.seller_id || "__sem_vendedora__";
      if (!map.has(sid)) map.set(sid, 0);
      map.set(sid, map.get(sid) + clientForecast);
    });
    return map;
  }, [clientsInScope, equipByClient, brandTickets]);

  const forecastTotal = useMemo(
    () => [...forecastBySeller.values()].reduce((a, b) => a + b, 0),
    [forecastBySeller]
  );

  const toggleBatch = (id) => {
    setSelectedBatchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const setTicket = (brand, value) => {
    setBrandTickets((prev) => ({ ...prev, [brand]: Number(value) || 0 }));
  };

  const updateGatilho = (i, field, value) => {
    setGatilhos((prev) => {
      const next = [...prev];
      while (next.length <= i) next.push({ threshold: "", commission_percent: "" });
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  const applySuggestion = (brand) => {
    const sug = suggestedTicketByBrand[brand] || 0;
    setTicket(brand, sug);
  };

  const applyAllSuggestions = () => {
    const next = { ...brandTickets };
    brandsInScope.forEach((b) => {
      const sug = suggestedTicketByBrand[b.brand] || 0;
      if (sug > 0) next[b.brand] = sug;
    });
    setBrandTickets(next);
  };

  const handleSave = async () => {
    if (!name.trim()) return toast({ title: "Informe o nome da meta", variant: "destructive" });
    if (selectedBatchIds.length === 0) return toast({ title: "Selecione ao menos um lote", variant: "destructive" });
    if (!goalDate) return toast({ title: "Informe a data limite da meta", variant: "destructive" });

    const sellersPayload = sellersInScope.map((s) => ({
      seller_id: s.seller_id,
      seller_name: s.seller_name,
    }));

    const batchProtocols = (batches || [])
      .filter((b) => selectedBatchIds.includes(b.id))
      .map((b) => b.protocol);

    const payload = {
      name: name.trim(),
      batch_ids: selectedBatchIds,
      batch_protocols: batchProtocols,
      goal_date: goalDate,
      brand_tickets: brandTickets,
      gatilhos: gatilhos
        .filter((g) => g.threshold || g.commission_percent)
        .map((g) => ({ threshold: Number(g.threshold) || 0, commission_percent: Number(g.commission_percent) || 0 }))
        .sort((a, b) => a.threshold - b.threshold),
      sellers: sellersPayload,
      forecast_total: forecastTotal,
      status: editing?.status || "Ativa",
      notes: editing?.notes || "",
    };

    setSaving(true);
    try {
      if (editing) {
        await base44.entities.MetaDistribuicao.update(editing.id, payload);
        toast({ title: "Meta atualizada" });
      } else {
        await base44.entities.MetaDistribuicao.create(payload);
        toast({ title: "Meta criada" });
      }
      onSaved?.();
      onClose?.();
    } catch (e) {
      toast({ title: "Erro ao salvar meta", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden !flex flex-col">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar meta de distribuição" : "Nova meta de distribuição"}</DialogTitle>
          <DialogDescription>
            Selecione os lotes, configure o ticket médio por marca e o percentual de meta por vendedora.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-2">
          <div className="space-y-5 px-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nome da meta</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Meta Refil Agosto" />
              </div>
              <div className="space-y-1.5">
                <Label>Data limite</Label>
                <Input type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Lotes de distribuição ({selectedBatchIds.length} selecionados)</Label>
              </div>
              <div className="border rounded-md max-h-56 overflow-y-auto">
                {availableBatches.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground">Nenhum lote ativo disponível.</div>
                )}
                {availableBatches.map((b) => (
                  <label
                    key={b.id}
                    className="flex items-center gap-3 px-3 py-2 border-b last:border-0 hover:bg-muted/40 cursor-pointer"
                  >
                    <Checkbox checked={selectedBatchIds.includes(b.id)} onCheckedChange={() => toggleBatch(b.id)} />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{b.protocol}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.date ? new Date(b.date).toLocaleDateString("pt-BR") : "—"} · {b.client_count || 0} clientes · {(b.seller_names || []).join(", ")}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Ticket médio por marca</Label>
                <Button type="button" variant="outline" size="sm" onClick={applyAllSuggestions}>
                  Sugerir a partir da tabela de preços
                </Button>
              </div>
              {brandsInScope.length === 0 ? (
                <div className="text-sm text-muted-foreground border rounded-md p-3">
                  Selecione lotes para listar as marcas dos equipamentos.
                </div>
              ) : (
                <div className="border rounded-md">
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b text-xs font-medium text-muted-foreground">
                    <div className="col-span-4">Marca</div>
                    <div className="col-span-2 text-center">Clientes</div>
                    <div className="col-span-2 text-center">Equipamentos</div>
                    <div className="col-span-3">Ticket médio (R$)</div>
                    <div className="col-span-1"></div>
                  </div>
                  {brandsInScope.map((b) => (
                    <div key={b.brand} className="grid grid-cols-12 gap-2 px-3 py-2 border-b last:border-0 items-center">
                      <div className="col-span-4 text-sm font-medium">{b.brand}</div>
                      <div className="col-span-2 text-center text-sm">{b.clients}</div>
                      <div className="col-span-2 text-center text-sm">{b.equip}</div>
                      <div className="col-span-3">
                        <Input
                          type="number"
                          value={brandTickets[b.brand] ?? ""}
                          onChange={(e) => setTicket(b.brand, e.target.value)}
                          placeholder={suggestedTicketByBrand[b.brand] ? `Sug: ${fmtBRL(suggestedTicketByBrand[b.brand])}` : "0,00"}
                        />
                      </div>
                      <div className="col-span-1 text-right">
                        <Button type="button" variant="ghost" size="sm" onClick={() => applySuggestion(b.brand)} title="Usar sugestão">
                          ↻
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Gatilhos de comissão</Label>
              <p className="text-xs text-muted-foreground">
                A vendedora recebe o % do gatilho mais alto que atingir, aplicado sobre o faturamento realizado. O potencial (100% da carteira) é apenas referência.
              </p>
              <div className="border rounded-md">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b text-xs font-medium text-muted-foreground">
                  <div className="col-span-1">#</div>
                  <div className="col-span-6">Faturamento para atingir (R$)</div>
                  <div className="col-span-5">Comissão (%)</div>
                </div>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 border-b last:border-0 items-center">
                    <div className="col-span-1 text-sm font-medium">{i + 1}º</div>
                    <div className="col-span-6">
                      <Input
                        type="number"
                        value={gatilhos[i]?.threshold ?? ""}
                        onChange={(e) => updateGatilho(i, "threshold", e.target.value)}
                        placeholder="Ex: 70000"
                      />
                    </div>
                    <div className="col-span-5">
                      <Input
                        type="number"
                        value={gatilhos[i]?.commission_percent ?? ""}
                        onChange={(e) => updateGatilho(i, "commission_percent", e.target.value)}
                        placeholder="Ex: 3"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Vendedoras no escopo (potencial)</Label>
              {sellersInScope.length === 0 ? (
                <div className="text-sm text-muted-foreground border rounded-md p-3">
                  Nenhuma vendedora atribuída nos clientes dos lotes selecionados.
                </div>
              ) : (
                <div className="border rounded-md">
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b text-xs font-medium text-muted-foreground">
                    <div className="col-span-6">Vendedora</div>
                    <div className="col-span-2 text-center">Clientes</div>
                    <div className="col-span-4 text-right">Potencial (100%)</div>
                  </div>
                  {sellersInScope.map((s) => {
                    const forecast = forecastBySeller.get(s.seller_id) || 0;
                    return (
                      <div key={s.seller_id} className="grid grid-cols-12 gap-2 px-3 py-2 border-b last:border-0 items-center">
                        <div className="col-span-6 text-sm font-medium">{s.seller_name}</div>
                        <div className="col-span-2 text-center text-sm">{s.client_count}</div>
                        <div className="col-span-4 text-right text-sm">{fmtBRL(forecast)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-md bg-primary/5 border border-primary/20 p-3 flex items-center justify-between">
              <span className="text-sm font-medium">Potencial total (100% da carteira)</span>
              <span className="text-lg font-bold text-primary">{fmtBRL(forecastTotal)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {editing ? "Salvar" : "Criar meta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}