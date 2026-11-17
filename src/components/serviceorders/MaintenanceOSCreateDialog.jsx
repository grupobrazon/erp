import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Trash2, Wrench, ShieldCheck, Stethoscope, Package, Loader2, X, MessageSquare, CheckCircle2, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

const SUBTYPES = [
  { value: "Análise", label: "Análise", icon: Stethoscope, color: "text-amber-700 bg-amber-50 border-amber-200", desc: "Ainda não se sabe se é garantia ou cobrada. Pode gerar OS filhas (expedição/visita) com custo zerado. Depois converte para Garantia ou Assistência." },
  { value: "Garantia", label: "Garantia", icon: ShieldCheck, color: "text-emerald-700 bg-emerald-50 border-emerald-200", desc: "Serviço sem custo ao cliente. Coberto pela garantia do equipamento." },
  { value: "Assistência Técnica", label: "Assistência Técnica", icon: Wrench, color: "text-blue-700 bg-blue-50 border-blue-200", desc: "Serviço cobrado do cliente (fora da garantia)." },
];

export default function MaintenanceOSCreateDialog({ open, onOpenChange, preselectedClientId, preselectedEquipmentId }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [clientId, setClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientDropdown, setClientDropdown] = useState(false);
  const [equipmentId, setEquipmentId] = useState("");
  const [subtype, setSubtype] = useState("Análise");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [productDropdown, setProductDropdown] = useState(false);
  const [serviceDetailTypes, setServiceDetailTypes] = useState([]);
  const [serviceDetailNotes, setServiceDetailNotes] = useState("");
  const [selectedServiceOption, setSelectedServiceOption] = useState("");
  const [customServiceName, setCustomServiceName] = useState("");
  const [showCustomService, setShowCustomService] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientResults, setClientResults] = useState([]);
  const [clientLoading, setClientLoading] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (open) {
      setClientId(preselectedClientId || "");
      setEquipmentId(preselectedEquipmentId || "");
      setSubtype("Análise");
      setDescription("");
      setItems([]);
      setClientSearch("");
      setProductSearch("");
      setClientResults([]);
      setServiceDetailTypes([]);
      setServiceDetailNotes("");
      setSelectedServiceOption("");
      setCustomServiceName("");
      setShowCustomService(false);
    }
  }, [open, preselectedClientId, preselectedEquipmentId]);

  // Busca server-side com debounce (a base tem milhares de clientes)
  const doClientSearch = useCallback((term) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!term || term.trim().length < 2) {
      setClientResults([]);
      setClientLoading(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setClientLoading(true);
      try {
        const q = term.trim();
        const found = await base44.entities.Client.filter({
          $or: [
            { name: { $regex: q, $options: "i" } },
            { document: { $regex: q, $options: "i" } },
            { new_code: { $regex: q, $options: "i" } },
            { old_code: { $regex: q, $options: "i" } },
          ],
        }, "-created_date", 30);
        setClientResults(found);
      } catch {
        setClientResults([]);
      } finally {
        setClientLoading(false);
      }
    }, 300);
  }, []);

  // Carrega o cliente selecionado quando há preselectedClientId
  const [selectedClient, setSelectedClient] = useState(null);
  useEffect(() => {
    if (clientId && (!selectedClient || selectedClient.id !== clientId)) {
      base44.entities.Client.get(clientId).then(setSelectedClient).catch(() => setSelectedClient(null));
    } else if (!clientId) {
      setSelectedClient(null);
    }
  }, [clientId]);

  const { data: equipment = [] } = useQuery({
    queryKey: ["equipmentForClient", clientId],
    queryFn: () => base44.entities.Equipment.filter({ client_id: clientId }, "-created_date", 200),
    enabled: open && !!clientId,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["productsForMaintenanceOS"],
    queryFn: () => base44.entities.Product.list("-created_date", 500),
    enabled: open,
  });

  const { data: serviceTypes = [] } = useQuery({
    queryKey: ["serviceTypes"],
    queryFn: () => base44.entities.ServiceType.list("order", 500),
    enabled: open,
  });
  const activeServiceTypes = serviceTypes.filter(s => s.is_active !== false);

  const isServiceTypeSelected = (id, name) => serviceDetailTypes.some(t => (t.service_type_id && t.service_type_id === id) || (!id && t.service_type_name === name));

  const addServiceType = () => {
    if (!selectedServiceOption) return;
    if (selectedServiceOption === "custom") { setShowCustomService(true); return; }
    const st = activeServiceTypes.find(s => s.id === selectedServiceOption);
    if (!st || isServiceTypeSelected(st.id, st.name)) return;
    setServiceDetailTypes(prev => [...prev, { service_type_id: st.id, service_type_name: st.name }]);
    setSelectedServiceOption("");
  };

  const confirmCustomService = () => {
    const name = customServiceName.trim();
    if (!name || isServiceTypeSelected(null, name)) { setCustomServiceName(""); setShowCustomService(false); setSelectedServiceOption(""); return; }
    setServiceDetailTypes(prev => [...prev, { service_type_id: null, service_type_name: name }]);
    setCustomServiceName(""); setShowCustomService(false); setSelectedServiceOption("");
  };

  const removeServiceType = (idx) => setServiceDetailTypes(prev => prev.filter((_, i) => i !== idx));

  const filteredProducts = useMemo(() => {
    if (!productSearch) return products.slice(0, 20);
    const q = productSearch.toLowerCase();
    return products.filter(p => (p.name || "").toLowerCase().includes(q) || (p.code || "").toLowerCase().includes(q)).slice(0, 20);
  }, [products, productSearch]);

  const addItem = (product) => {
    setItems(prev => [...prev, { product_id: product.id, product_name: product.name, product_code: product.code || "", quantity: 1 }]);
    setProductSearch("");
    setProductDropdown(false);
  };

  const updateItemQty = (idx, qty) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Math.max(1, qty) } : it));
  };

  const removeItem = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!clientId) { toast({ title: "Selecione um cliente", variant: "destructive" }); return; }
    if (!subtype) { toast({ title: "Selecione um subtipo", variant: "destructive" }); return; }
    if (serviceDetailTypes.length === 0 || !serviceDetailNotes.trim()) {
      toast({ title: "Detalhamento do serviço obrigatório", description: "Selecione pelo menos um tipo de serviço e preencha a observação para o técnico.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const response = await base44.functions.invoke("generateMaintenanceOS", {
        client_id: clientId,
        equipment_id: equipmentId || undefined,
        subtype,
        description,
        items: subtype === "Análise" ? items : [],
        service_detail_types: serviceDetailTypes,
        service_detail_notes: serviceDetailNotes,
        delivery_address: selectedClient ? {
          zip_code: selectedClient.zip_code || "",
          street: selectedClient.street || "",
          number: selectedClient.number || "",
          neighborhood: selectedClient.neighborhood || "",
          city: selectedClient.city || "",
          state: selectedClient.state || "",
        } : undefined,
      });
      const res = response?.data || response;
      if (res?.error) {
        toast({ title: "Erro ao criar OS", description: res.error, variant: "destructive" });
        return;
      }
      if (!res?.service_order) {
        toast({ title: "Erro ao criar OS", description: "Resposta inesperada do servidor", variant: "destructive" });
        return;
      }
      toast({ title: "OS criada", description: `${res.service_order.code} — ${subtype}` });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      onOpenChange(false);
    } catch (err) {
      const errMsg = err?.response?.data?.error || err?.message || "Falha";
      toast({ title: "Erro ao criar OS", description: errMsg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            Nova OS — Manutenção/Garantia
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cliente */}
          <div className="space-y-1.5">
            <Label>Cliente *</Label>
            {clientId ? (
              <div className="flex items-center justify-between p-2 border rounded-md bg-muted/30">
                <div>
                  <span className="font-medium text-sm">{selectedClient?.name}</span>
                  {selectedClient?.new_code && <span className="text-xs text-muted-foreground ml-2">{selectedClient.new_code}</span>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setClientId(""); setEquipmentId(""); }}>Trocar</Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={clientSearch}
                  onChange={e => { setClientSearch(e.target.value); setClientDropdown(true); doClientSearch(e.target.value); }}
                  onFocus={() => setClientDropdown(true)}
                  onBlur={() => setTimeout(() => setClientDropdown(false), 200)}
                  placeholder="Buscar cliente por nome, CPF/CNPJ ou código (mín. 2 caracteres)..."
                  className="pl-9"
                />
                {clientLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {clientDropdown && (clientSearch.length >= 2) && (
                  <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto border rounded-md bg-popover shadow-lg">
                    {clientLoading ? (
                      <div className="px-3 py-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Buscando clientes...
                      </div>
                    ) : clientResults.length > 0 ? (
                      clientResults.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setClientId(c.id); setClientSearch(""); setClientDropdown(false); setClientResults([]); }}
                          className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-0"
                        >
                          <span className="font-medium">{c.name}</span>
                          {c.new_code && <span className="text-xs text-muted-foreground ml-2">{c.new_code}</span>}
                          {c.city && <span className="text-xs text-muted-foreground"> · {c.city}/{c.state}</span>}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                        Nenhum cliente encontrado para "{clientSearch}"
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Equipamento */}
          {clientId && equipment.length > 0 && (
            <div className="space-y-1.5">
              <Label>Equipamento (opcional)</Label>
              <select
                value={equipmentId}
                onChange={e => setEquipmentId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Sem equipamento vinculado</option>
                {equipment.map(eq => (
                  <option key={eq.id} value={eq.id}>
                    {eq.patrimony_code || eq.code} — {eq.product_name || "Sem modelo"} {eq.brand ? `· ${eq.brand}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Subtipo */}
          <div className="space-y-2">
            <Label>Tipo de OS *</Label>
            <div className="grid grid-cols-1 gap-2">
              {SUBTYPES.map(st => {
                const Icon = st.icon;
                const selected = subtype === st.value;
                return (
                  <button
                    key={st.value}
                    onClick={() => setSubtype(st.value)}
                    className={`text-left p-3 border rounded-lg transition-all ${selected ? "border-primary ring-1 ring-primary" : "border-input hover:border-primary/50"}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`p-1.5 rounded-md border ${st.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{st.label}</span>
                          {selected && <Badge variant="default" className="text-[10px]">Selecionado</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{st.desc}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label>Descrição do problema / motivo</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Descreva o problema reportado pelo cliente, motivo da análise/garantia/assistência..."
              rows={3}
            />
          </div>

          {/* Itens de análise (apenas para Análise) */}
          {subtype === "Análise" && (
            <div className="space-y-2 border rounded-lg p-3 bg-amber-50/30">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-amber-600" />
                <Label className="text-amber-800">Itens para análise (valor zerado)</Label>
              </div>
              <p className="text-xs text-muted-foreground">Peças enviadas para diagnóstico sem custo durante o período de análise.</p>

              {items.length > 0 && (
                <div className="space-y-1">
                  {items.map((it, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="flex-1 text-sm">{it.product_name}</span>
                      <Input
                        type="number"
                        min="1"
                        value={it.quantity}
                        onChange={e => updateItemQty(i, parseInt(e.target.value) || 1)}
                        className="w-16 h-8 text-sm"
                      />
                      <Button variant="ghost" size="icon" onClick={() => removeItem(i)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={e => { setProductSearch(e.target.value); setProductDropdown(true); }}
                  onFocus={() => setProductDropdown(true)}
                  onBlur={() => setTimeout(() => setProductDropdown(false), 200)}
                  placeholder="Adicionar produto..."
                  className="pl-9 h-8 text-sm"
                />
                {productDropdown && filteredProducts.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto border rounded-md bg-popover shadow-lg">
                    {filteredProducts.map(p => (
                      <button
                        key={p.id}
                        onClick={() => addItem(p)}
                        className="w-full text-left px-3 py-1.5 hover:bg-muted text-sm border-b last:border-0"
                      >
                        {p.code && <span className="font-mono text-xs text-muted-foreground">{p.code} </span>}
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Detalhamento do Serviço — obrigatório para agendar na agenda de rotas */}
          <div className="space-y-2 border rounded-lg p-3 bg-violet-50/30">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-violet-600" />
              <Label className="text-violet-800">Detalhamento do Serviço *</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Selecione os tipos de serviço que serão feitos na casa do cliente e preencha a observação para o técnico. Obrigatório para agendar o atendimento.
            </p>

            {serviceDetailTypes.length > 0 && serviceDetailNotes.trim() && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-emerald-800">Detalhamento preenchido — a OS poderá ser agendada.</span>
              </div>
            )}

            <div>
              <div className="flex gap-2">
                <Select value={selectedServiceOption} onValueChange={setSelectedServiceOption}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione um tipo de serviço..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeServiceTypes.map(st => (
                      <SelectItem key={st.id} value={st.id} disabled={isServiceTypeSelected(st.id, st.name)}>
                        {st.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">+ Serviço Personalizado</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" variant="default" size="icon" onClick={addServiceType} disabled={!selectedServiceOption} title="Adicionar">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {showCustomService && (
                <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={customServiceName}
                      onChange={e => setCustomServiceName(e.target.value)}
                      placeholder="Ex: Higienização completa do bebedouro"
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); confirmCustomService(); } }}
                      autoFocus
                    />
                    <Button type="button" size="sm" onClick={confirmCustomService} disabled={!customServiceName.trim()}>
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setShowCustomService(false); setCustomServiceName(""); setSelectedServiceOption(""); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {serviceDetailTypes.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Serviços Selecionados ({serviceDetailTypes.length})</Label>
                <div className="flex flex-wrap gap-2">
                  {serviceDetailTypes.map((t, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-sm">
                      <Wrench className="h-3 w-3 text-primary" />
                      <span className="font-medium">{t.service_type_name}</span>
                      {!t.service_type_id && <span className="text-xs text-muted-foreground">(personalizado)</span>}
                      <button type="button" onClick={() => removeServiceType(idx)} className="ml-1 rounded-full hover:bg-primary/20 p-0.5" title="Remover">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> Observação para o Técnico *
              </Label>
              <Textarea
                rows={2}
                value={serviceDetailNotes}
                onChange={e => setServiceDetailNotes(e.target.value)}
                placeholder="Descreva o que o técnico precisa saber sobre o atendimento (ex: cliente tem 2 purificadores no 2º andar, acesso pelo portão lateral...)"
              />
            </div>

            {(serviceDetailTypes.length === 0 || !serviceDetailNotes.trim()) && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-sm flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-amber-800 text-xs">
                  <strong>Detalhamento obrigatório.</strong> Selecione pelo menos um tipo de serviço e preencha a observação para o técnico para liberar o agendamento.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Criando..." : "Criar OS"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}