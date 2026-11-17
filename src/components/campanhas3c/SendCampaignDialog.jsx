import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, Loader2, Plus, List } from "lucide-react";

export default function SendCampaignDialog({ open, onOpenChange, onSent }) {
  const { toast } = useToast();
  const [mode, setMode] = useState("create"); // "create" | "existing"
  const [name, setName] = useState("");
  const [campaignId3c, setCampaignId3c] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [threecCampaigns, setThreecCampaigns] = useState([]);
  const [campaignName3c, setCampaignName3c] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("21:00");

  const { data: batches = [] } = useQuery({
    queryKey: ["distributionBatches"],
    queryFn: async () => {
      const res = await base44.entities.DistributionBatch.list("-date", 100);
      return res.filter((b) => !b.reversed);
    },
  });

  const { data: sellers = [] } = useQuery({
    queryKey: ["sellers"],
    queryFn: async () => base44.entities.Seller.list("-created_date", 100),
  });

  const selectedBatch = batches.find((b) => b.id === batchId);
  const selectedSeller = sellers.find((s) => s.id === sellerId);

  const fetchCampaigns = async () => {
    setLoadingCampaigns(true);
    try {
      const res = await base44.functions.invoke("sync3CCampaign", { action: "listCampaigns" });
      if (res.data?.error) {
        toast({ variant: "destructive", title: "Erro ao buscar campanhas", description: res.data.error });
      } else {
        setThreecCampaigns(res.data?.campaigns || []);
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: e.message });
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const handleSend = async () => {
    if (!name) {
      toast({ variant: "destructive", title: "Informe o nome da campanha (interno)" });
      return;
    }
    if (!batchId && !sellerId) {
      toast({ variant: "destructive", title: "Selecione um lote e/ou vendedora" });
      return;
    }

    setSending(true);
    try {
      let finalCampaignId = campaignId3c;

      // Se modo "create", criar a campanha no 3C Plus primeiro
      if (mode === "create") {
        if (!campaignName3c) {
          toast({ variant: "destructive", title: "Informe o nome da campanha no 3C Plus" });
          setSending(false);
          return;
        }
        const createRes = await base44.functions.invoke("sync3CCampaign", {
          action: "createCampaign",
          name: campaignName3c,
          start_time: startTime,
          end_time: endTime,
          seller_id: sellerId || undefined,
        });
        if (createRes.data?.error) {
          toast({ variant: "destructive", title: "Erro ao criar campanha no 3C Plus", description: createRes.data.error });
          setSending(false);
          return;
        }
        finalCampaignId = String(createRes.data?.campaign?.id || "");
        if (!finalCampaignId) {
          toast({ variant: "destructive", title: "3C Plus não retornou o ID da campanha criada" });
          setSending(false);
          return;
        }
        const assignNote = createRes.data?.agent_assigned
          ? " e vendedora atribuída"
          : createRes.data?.assign_error
            ? ` (aviso: não foi possível atribuir a vendedora: ${createRes.data.assign_error})`
            : "";
        toast({ title: `Campanha "${campaignName3c}" criada no 3C Plus (ID: ${finalCampaignId})${assignNote}` });
      } else {
        // Modo "existing" — precisa de um campaign_id_3c selecionado
        if (!finalCampaignId) {
          toast({ variant: "destructive", title: "Selecione uma campanha do 3C Plus" });
          setSending(false);
          return;
        }
      }

      // Enviar os mailings para a campanha
      const res = await base44.functions.invoke("sync3CCampaign", {
        name,
        campaign_id_3c: finalCampaignId,
        seller_id: sellerId || undefined,
        distribution_batch_id: batchId || undefined,
      });
      if (res.data?.error) {
        toast({ variant: "destructive", title: "Erro", description: res.data.error });
      } else {
        onSent();
        // Reset
        setName(""); setCampaignId3c(""); setSellerId(""); setBatchId("");
        setCampaignName3c(""); setStartTime("08:00"); setEndTime("21:00");
        onOpenChange(false);
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao enviar", description: e.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova Campanha 3C Plus</DialogTitle>
          <DialogDescription>
            Crie uma campanha no 3C Plus ou selecione uma existente, depois envie os clientes do lote para discagem.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Modo: Criar ou Existente */}
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="w-full">
              <TabsTrigger value="create" className="flex-1"><Plus className="w-3.5 h-3.5 mr-1" /> Criar nova</TabsTrigger>
              <TabsTrigger value="existing" className="flex-1"><List className="w-3.5 h-3.5 mr-1" /> Existente</TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === "create" ? (
            <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
              <div className="space-y-1.5">
                <Label>Nome da campanha no 3C Plus *</Label>
                <Input value={campaignName3c} onChange={(e) => setCampaignName3c(e.target.value)} placeholder="Ex: Distribuição Agosto - Adriana" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Início</Label>
                  <Input value={startTime} onChange={(e) => setStartTime(e.target.value)} placeholder="08:00" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Fim</Label>
                  <Input value={endTime} onChange={(e) => setEndTime(e.target.value)} placeholder="21:00" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                A campanha será criada no 3C Plus com lista de qualificação padrão. Você poderá ajustar configurações no painel do 3C Plus depois.
              </p>
            </div>
          ) : (
            <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label>Campanha do 3C Plus *</Label>
                <Button variant="ghost" size="sm" onClick={fetchCampaigns} disabled={loadingCampaigns}>
                  {loadingCampaigns ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Carregar lista"}
                </Button>
              </div>
              {threecCampaigns.length > 0 ? (
                <Select value={campaignId3c} onValueChange={setCampaignId3c}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma campanha" /></SelectTrigger>
                  <SelectContent>
                    {threecCampaigns.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name} {c.paused ? "(pausada)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={campaignId3c} onChange={(e) => setCampaignId3c(e.target.value)} placeholder="ID da campanha ou clique em Carregar lista" />
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Nome interno (referência no sistema)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Distribuição Agosto - Vendedora A" />
          </div>

          <div className="space-y-1.5">
            <Label>Lote de distribuição</Label>
            <Select value={batchId} onValueChange={setBatchId}>
              <SelectTrigger><SelectValue placeholder="Selecione um lote" /></SelectTrigger>
              <SelectContent>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.protocol} · {b.client_count || 0} clientes
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Vendedora (filtra clientes do lote)</Label>
            <Select value={sellerId} onValueChange={setSellerId}>
              <SelectTrigger><SelectValue placeholder="Todas ou uma vendedora específica" /></SelectTrigger>
              <SelectContent>
                {sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBatch && !sellerId && (
              <p className="text-xs text-muted-foreground">Sem vendedora selecionada, todos os clientes do lote serão enviados.</p>
            )}
            {selectedSeller && (
              <div className="text-xs space-y-0.5">
                {selectedSeller.threec_user_id ? (
                  <span className="text-emerald-600 font-medium">
                    ✓ Agente 3C Plus vinculado {selectedSeller.threec_extension ? `(Ramal ${selectedSeller.threec_extension})` : ""}
                  </span>
                ) : (
                  <span className="text-amber-600">
                    ⚠ Vendedora sem agente 3C Plus vinculado. Vincule em Configurações → Agentes 3C Plus.
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancelar</Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {mode === "create" ? "Criar e Enviar" : "Enviar para 3C Plus"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}