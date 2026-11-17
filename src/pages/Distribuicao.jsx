import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import DistribuicaoFilters from "@/components/distribuicao/DistribuicaoFilters";
import DistribuicaoDashboard from "@/components/distribuicao/DistribuicaoDashboard";
import DistribuicaoAction from "@/components/distribuicao/DistribuicaoAction";
import AtendimentosPanel from "@/components/distribuicao/AtendimentosPanel";
import DistribuicaoBatches from "@/components/distribuicao/DistribuicaoBatches";
import ImportDistributionCard from "@/components/distribuicao/ImportDistributionCard";
import { getClientMaintenanceLabel } from "@/lib/maintenanceCheck";
import { usePermissions } from "@/lib/permissions";
import { distributeClients } from "@/lib/distributionEngine";

export default function Distribuicao() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selBases, setSelBases] = useState([]);
  const [selStatuses, setSelStatuses] = useState([]);
  const [selStates, setSelStates] = useState([]);
  const [selCities, setSelCities] = useState([]);
  const [selRegionals, setSelRegionals] = useState([]);
  const [selNeighborhoods, setSelNeighborhoods] = useState([]);
  const [selFilterNeighborhoods, setSelFilterNeighborhoods] = useState([]);
  const [selMaintStatus, setSelMaintStatus] = useState([]);
  const [selAtendSellerId, setSelAtendSellerId] = useState("all");
  const [hideOpenSales, setHideOpenSales] = useState(true);
  const [reversing, setReversing] = useState(false);

  const { user, isAdmin } = usePermissions();

  const clientsQ = useQuery({
    queryKey: ["distribuicaoClients"],
    queryFn: async () => {
      const map = new Map();
      for (const r of await base44.entities.Client.list("-created_date", 5000)) map.set(r.id, r);
      for (const r of await base44.entities.Client.list("created_date", 5000)) map.set(r.id, r);
      return [...map.values()];
    },
  });
  const sellersQ = useQuery({
    queryKey: ["distribuicaoSellers"],
    queryFn: () => base44.entities.Seller.list("-created_date", 500),
  });
  const equipQ = useQuery({
    queryKey: ["distribuicaoEquipment"],
    queryFn: async () => {
      const map = new Map();
      for (const r of await base44.entities.Equipment.list("-created_date", 5000)) map.set(r.id, r);
      for (const r of await base44.entities.Equipment.list("created_date", 5000)) map.set(r.id, r);
      return [...map.values()];
    },
  });
  const batchesQ = useQuery({
    queryKey: ["distributionBatches"],
    queryFn: () => base44.entities.DistributionBatch.list("-date", 500),
  });
  const salesQ = useQuery({
    queryKey: ["distribuicaoSales"],
    queryFn: async () => {
      const map = new Map();
      for (const r of await base44.entities.Sale.list("-date", 5000)) map.set(r.id, r);
      for (const r of await base44.entities.Sale.list("created_date", 5000)) map.set(r.id, r);
      return [...map.values()];
    },
  });

  const clients = clientsQ.data || [];
  const sellers = sellersQ.data || [];
  const equipment = equipQ.data || [];
  const batches = batchesQ.data || [];
  const sales = salesQ.data || [];

  // Venda em andamento = lançada mas não faturada/finalizada (sem Orçamento e Cancelada)
  const OPEN_SALE_STAGES = ["Confirmada", "Pagamento Aprovado", "Em OS"];
  const clientsWithOpenSale = useMemo(() => {
    const set = new Set();
    for (const s of sales) {
      if (!OPEN_SALE_STAGES.includes(s.stage)) continue;
      if (s.client_id) set.add(s.client_id);
    }
    return set;
  }, [sales]);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  // client_id -> status de manutenção consolidado (equipamentos ativos)
  const clientMaintLabel = useMemo(() => {
    const byClient = new Map();
    for (const e of equipment) {
      if ((e.record_type || "equipamento") !== "equipamento") continue;
      if (e.status !== "Ativo" || e.pending_link) continue;
      if (!e.client_id) continue;
      if (!byClient.has(e.client_id)) byClient.set(e.client_id, []);
      byClient.get(e.client_id).push(e);
    }
    const labels = new Map();
    for (const [cid, eqs] of byClient) labels.set(cid, getClientMaintenanceLabel(eqs, today));
    return labels;
  }, [equipment, today]);

  const stateOptions = useMemo(() => [...new Set(clients.map((c) => c.state).filter(Boolean))].sort(), [clients]);
  const regionalOptions = useMemo(() => [...new Set(clients.map((c) => c.regional).filter(Boolean))].sort(), [clients]);
  const cityOptions = useMemo(() => {
    let base = clients;
    if (selStates.length) base = base.filter((c) => selStates.includes(c.state));
    if (selRegionals.length) base = base.filter((c) => selRegionals.includes(c.regional));
    return [...new Set(base.map((c) => c.city).filter(Boolean))].sort();
  }, [clients, selStates, selRegionals]);

  const neighborhoodOptions = useMemo(() => {
    let base = clients;
    if (selStates.length) base = base.filter((c) => selStates.includes(c.state));
    if (selRegionals.length) base = base.filter((c) => selRegionals.includes(c.regional));
    if (selCities.length) base = base.filter((c) => selCities.includes(c.city));
    return [...new Set(base.map((c) => c.neighborhood).filter(Boolean))].sort();
  }, [clients, selStates, selRegionals, selCities]);

  // Limpa seleções órfãs quando o filtro upstream muda (evita resultado vazio)
  useEffect(() => {
    setSelCities((prev) => prev.filter((c) => cityOptions.includes(c)));
  }, [cityOptions]);
  useEffect(() => {
    setSelFilterNeighborhoods((prev) => prev.filter((n) => neighborhoodOptions.includes(n)));
  }, [neighborhoodOptions]);

  const filtered = useMemo(
    () =>
      clients.filter((c) => {
        if (selBases.length && !selBases.includes(c.base_type)) return false;
        if (selStatuses.length && !selStatuses.includes(c.status)) return false;
        if (selStates.length && !selStates.includes(c.state)) return false;
        if (selRegionals.length && !selRegionals.includes(c.regional)) return false;
        if (selCities.length && !selCities.includes(c.city)) return false;
        if (selFilterNeighborhoods.length && !selFilterNeighborhoods.includes(c.neighborhood)) return false;
        if (selMaintStatus.length) {
          const label = clientMaintLabel.get(c.id) || "Sem Equipamento";
          if (!selMaintStatus.includes(label)) return false;
        }
        if (hideOpenSales && clientsWithOpenSale.has(c.id)) return false;
        return true;
      }),
    [clients, selBases, selStatuses, selStates, selRegionals, selCities, selFilterNeighborhoods, selMaintStatus, clientMaintLabel, hideOpenSales, clientsWithOpenSale]
  );

  const selectedClients = useMemo(() => {
    if (selNeighborhoods.length === 0) return filtered;
    return filtered.filter((c) => selNeighborhoods.includes(c.neighborhood || "(Sem bairro)"));
  }, [filtered, selNeighborhoods]);

  const clearFilters = () => {
    setSelBases([]);
    setSelStatuses([]);
    setSelStates([]);
    setSelCities([]);
    setSelRegionals([]);
    setSelNeighborhoods([]);
    setSelFilterNeighborhoods([]);
    setSelMaintStatus([]);
  };

  const handleDistribute = async ({ targetSellerIds, mode }) => {
    const targets = sellers.filter((s) => targetSellerIds.includes(s.id));
    const nums = batches
      .map((b) => parseInt((b.protocol || "").replace(/\D/g, ""), 10))
      .filter((n) => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    const protocol = `DIST-${String(next).padStart(6, "0")}`;
    const clientIds = selectedClients.map((c) => c.id);
    const batch = await base44.entities.DistributionBatch.create({
      protocol,
      date: new Date().toISOString(),
      mode,
      seller_ids: targets.map((s) => s.id),
      seller_names: targets.map((s) => s.name),
      client_count: clientIds.length,
      client_ids: clientIds,
      reversed: false,
    });
    let updates;
    if (mode === "single") {
      updates = selectedClients.map((c) => ({
        id: c.id,
        seller_id: targets[0].id,
        seller_name: targets[0].name,
        distribution_batch_id: batch.id,
      }));
    } else {
      const assignments = distributeClients(selectedClients, targets, clients);
      const byClient = new Map(assignments.map((a) => [a.clientId, a.sellerIndex]));
      updates = selectedClients.map((c) => {
        const idx = byClient.get(c.id) ?? 0;
        const seller = targets[idx] || targets[0];
        return { id: c.id, seller_id: seller.id, seller_name: seller.name, distribution_batch_id: batch.id };
      });
    }
    for (let i = 0; i < updates.length; i += 500) {
      await base44.entities.Client.bulkUpdate(updates.slice(i, i + 500));
    }
    toast({
      title: "Distribuição concluída",
      description: `${updates.length} clientes distribuídos — Protocolo ${protocol}.`,
    });
    queryClient.invalidateQueries({ queryKey: ["distribuicaoClients"] });
    queryClient.invalidateQueries({ queryKey: ["distributionBatches"] });
    setSelNeighborhoods([]);
  };

  const handleReverseBatch = async (batch) => {
    setReversing(true);
    try {
      const ids = batch.client_ids || [];
      if (ids.length > 0) {
        await base44.entities.Client.updateMany(
          { id: { $in: ids } },
          { $unset: { seller_id: "", seller_name: "", distribution_batch_id: "" } }
        );
      }
      await base44.entities.DistributionBatch.update(batch.id, {
        reversed: true,
        reversed_date: new Date().toISOString(),
        reversed_by: user?.full_name || "—",
      });
      toast({
        title: "Lote estornado",
        description: `${ids.length} clientes removidos da vendedora (${batch.protocol}).`,
      });
      queryClient.invalidateQueries({ queryKey: ["distribuicaoClients"] });
      queryClient.invalidateQueries({ queryKey: ["distributionBatches"] });
    } finally {
      setReversing(false);
    }
  };

  const handleReverseAll = async () => {
    setReversing(true);
    try {
      const activeBatches = batches.filter((b) => !b.reversed);
      const allIds = activeBatches.flatMap((b) => b.client_ids || []);
      if (allIds.length > 0) {
        await base44.entities.Client.updateMany(
          { id: { $in: allIds } },
          { $unset: { seller_id: "", seller_name: "", distribution_batch_id: "" } }
        );
      }
      for (const b of activeBatches) {
        await base44.entities.DistributionBatch.update(b.id, {
          reversed: true,
          reversed_date: new Date().toISOString(),
          reversed_by: user?.full_name || "—",
        });
      }
      toast({
        title: "Estorno geral concluído",
        description: `${allIds.length} clientes removidos das vendedoras.`,
      });
      queryClient.invalidateQueries({ queryKey: ["distribuicaoClients"] });
      queryClient.invalidateQueries({ queryKey: ["distributionBatches"] });
    } finally {
      setReversing(false);
    }
  };

  return (
    <div>
      <PageHeader title="Painel de Distribuição" description="Distribuição de clientes entre vendedoras com raio-x por região">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {hideOpenSales ? `Ocultando ${clientsWithOpenSale.size} cliente(s) c/ venda em andamento` : "Mostrando clientes c/ venda em andamento"}
          </span>
          <Button
            variant={hideOpenSales ? "default" : "outline"}
            size="sm"
            onClick={() => setHideOpenSales((v) => !v)}
            className="gap-1"
            title="Ocultar/mostrar clientes com venda em andamento (não faturada)"
          >
            {hideOpenSales ? "Ocultando vendas em andamento" : "Mostrando vendas em andamento"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["distribuicaoClients"] })}
            className="gap-1"
          >
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
        </div>
      </PageHeader>

      <div className="mb-4">
        <ImportDistributionCard
          onImported={() => {
            queryClient.invalidateQueries({ queryKey: ["distribuicaoClients"] });
            queryClient.invalidateQueries({ queryKey: ["distributionBatches"] });
          }}
        />
      </div>

      <DistribuicaoFilters
        selBases={selBases}
        setSelBases={setSelBases}
        selStatuses={selStatuses}
        setSelStatuses={setSelStatuses}
        selStates={selStates}
        setSelStates={setSelStates}
        selCities={selCities}
        setSelCities={setSelCities}
        selRegionals={selRegionals}
        setSelRegionals={setSelRegionals}
        selFilterNeighborhoods={selFilterNeighborhoods}
        setSelFilterNeighborhoods={setSelFilterNeighborhoods}
        selMaintStatus={selMaintStatus}
        setSelMaintStatus={setSelMaintStatus}
        stateOptions={stateOptions}
        regionalOptions={regionalOptions}
        cityOptions={cityOptions}
        neighborhoodOptions={neighborhoodOptions}
        onClear={clearFilters}
        totalFiltered={filtered.length}
        totalClients={clients.length}
      />

      {clientsQ.isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <DistribuicaoDashboard
              filtered={filtered}
              selNeighborhoods={selNeighborhoods}
              setSelNeighborhoods={setSelNeighborhoods}
              sellers={sellers}
              selectedSellerId={selAtendSellerId}
              setSelectedSellerId={setSelAtendSellerId}
            />
          </div>
          <div>
            <DistribuicaoAction
              selectedClients={selectedClients}
              sellers={sellers}
              onDistribute={handleDistribute}
              allClients={clients}
            />
          </div>
        </div>
      )}

      <div className="mt-4">
        <DistribuicaoBatches
          batches={batches}
          clients={clients}
          sellers={sellers}
          onReverse={handleReverseBatch}
          onReverseAll={handleReverseAll}
          loading={clientsQ.isFetching}
          reversing={reversing}
        />
      </div>

      <div className="mt-4">
        <AtendimentosPanel
          filtered={filtered}
          sellers={sellers}
          batches={batches}
          user={user}
          isAdmin={isAdmin}
          selectedSellerId={selAtendSellerId}
          setSelectedSellerId={setSelAtendSellerId}
        />
      </div>
    </div>
  );
}