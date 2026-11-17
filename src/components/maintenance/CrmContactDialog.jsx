import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Phone, MessageCircle, Package, History, User, RefreshCw, MapPin, Check, Ban } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { format } from "date-fns";

function fmtDate(d) {
  if (!d) return "—";
  try { return new Date(d + "T00:00:00").toLocaleDateString("pt-BR"); } catch { return d; }
}

function fmtDateTime(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return d; }
}

export default function CrmContactDialog({ open, onOpenChange, equipment, campaignContext }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [status, setStatus] = useState("Aguardando Contato");
  const [lastContact, setLastContact] = useState(format(new Date(), "yyyy-MM-dd"));
  const [nextContact, setNextContact] = useState("");
  const [notes, setNotes] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [productMode, setProductMode] = useState("stock");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [customProductName, setCustomProductName] = useState("");
  const [customBrand, setCustomBrand] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [showInactiveForm, setShowInactiveForm] = useState(false);
  const [inactiveReason, setInactiveReason] = useState("");

  useEffect(() => {
    if (equipment) {
      setProductSearch("");
      setShowInactiveForm(false);
      setInactiveReason("");
      setStatus(equipment.crm_status || "Aguardando Contato");
      setLastContact(equipment.crm_last_contact_date || format(new Date(), "yyyy-MM-dd"));
      setNextContact(equipment.crm_next_contact_date || "");
      setNotes(equipment.crm_notes || "");
      setContactPhone("");

      if (equipment.custom_product) {
        setProductMode("market");
        setCustomProductName(equipment.product_name || "");
        setCustomBrand(equipment.brand || "");
        setCustomModel(equipment.model || "");
        setSelectedProductId("");
      } else {
        setProductMode("stock");
        setSelectedProductId(equipment.product_id || "");
        setCustomProductName("");
        setCustomBrand("");
        setCustomModel("");
      }
    }
  }, [equipment]);

  const clientId = equipment?.client_id;

  const { data: client } = useQuery({
    queryKey: ["crmClient", clientId],
    queryFn: () => base44.entities.Client.get(clientId),
    enabled: !!clientId && open,
    staleTime: 60000,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["crmContacts", clientId],
    queryFn: () => base44.entities.Contact.filter({ client_id: clientId }),
    enabled: !!clientId && open,
    staleTime: 60000,
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ["crmAddresses", clientId],
    queryFn: () => base44.entities.Address.filter({ client_id: clientId }),
    enabled: !!clientId && open,
    staleTime: 60000,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["productsForCrm"],
    queryFn: () => base44.entities.Product.list("-created_date", 500),
    enabled: open,
    staleTime: 60000,
  });

  const { data: currentUser } = useQuery({
    queryKey: ["authMe"],
    queryFn: () => base44.auth.me(),
    enabled: open,
    staleTime: 300000,
  });

  const clientPhones = useMemo(() => {
    if (!client) return [];
    const out = [];
    for (let i = 1; i <= 5; i++) {
      const num = client[`phone${i}`];
      if (num) out.push({ label: client[`phone${i}_name`] || `Telefone ${i}`, number: num, whatsapp: client[`phone${i}_whatsapp`] });
    }
    for (let i = 1; i <= 7; i++) {
      const num = client[`zoox_phone${i}`];
      if (num) out.push({ label: `Zoox ${i}`, number: num, whatsapp: false });
    }
    if (client.email) out.push({ label: "E-mail", number: client.email, isEmail: true });
    return out;
  }, [client]);

  const selectedProduct = products.find(p => p.id === selectedProductId);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const q = productSearch.toLowerCase().trim();
    return products.filter(p =>
      (p.name || "").toLowerCase().includes(q) ||
      (p.code || "").toLowerCase().includes(q) ||
      (p.brand || "").toLowerCase().includes(q)
    );
  }, [products, productSearch]);

  const productChanged = useMemo(() => {
    if (!equipment) return false;
    if (productMode === "stock") {
      if (equipment.custom_product) return true;
      return selectedProductId !== (equipment.product_id || "");
    } else {
      if (!equipment.custom_product) return true;
      return customProductName !== (equipment.product_name || "") ||
             customBrand !== (equipment.brand || "") ||
             customModel !== (equipment.model || "");
    }
  }, [equipment, productMode, selectedProductId, customProductName, customBrand, customModel]);

  const handleSave = async () => {
    try {
      const attendant = currentUser?.full_name || currentUser?.email || "Sistema";

      const contactLogEntry = {
        date: lastContact,
        attendant,
        phone: contactPhone,
        status,
        notes,
        follow_up_date: nextContact || null,
      };

      const updateOps = {
        $set: {
          crm_status: status,
          crm_last_contact_date: lastContact,
          crm_next_contact_date: nextContact || null,
          crm_notes: notes,
        },
        $push: {
          crm_contact_log: contactLogEntry,
        },
      };

      if (productChanged) {
        let newName, newBrand, newModel, newProductId, isCustom;
        if (productMode === "stock") {
          newName = selectedProduct?.name || "";
          newBrand = selectedProduct?.brand || "";
          newModel = "";
          newProductId = selectedProductId || null;
          isCustom = false;
        } else {
          newName = customProductName;
          newBrand = customBrand;
          newModel = customModel;
          newProductId = null;
          isCustom = true;
        }

        updateOps.$set.product_name = newName;
        updateOps.$set.brand = newBrand;
        updateOps.$set.model = newModel;
        updateOps.$set.product_id = newProductId;
        updateOps.$set.custom_product = isCustom;
        updateOps.$push.product_history = {
          date: new Date().toISOString(),
          old_product_name: equipment.product_name || "",
          old_brand: equipment.brand || "",
          old_model: equipment.model || "",
          new_product_name: newName,
          new_brand: newBrand,
          new_model: newModel,
          changed_by: attendant,
        };
      }

      await base44.entities.Equipment.updateMany({ id: equipment.id }, updateOps);

      // Se veio de uma campanha 3C Plus, criar registro Chamada3C vinculado à campanha
      if (campaignContext?.campaign_id_3c) {
        try {
          const campanhas = await base44.entities.Campanha3C.filter({ campaign_id_3c: String(campaignContext.campaign_id_3c) });
          const campanha = campanhas[0];
          if (campanha) {
            await base44.entities.Chamada3C.create({
              campanha_3c_id: campanha.id,
              campanha_name: campanha.name || campaignContext.campaign_name || "",
              client_id: equipment.client_id || "",
              client_name: equipment.client_name || "",
              phone: contactPhone || "",
              call_status: "Atendida",
              call_status_raw: status,
              call_date: new Date().toISOString(),
              agent_name: attendant,
              notes: notes || "",
              qualified: status === "Contato Realizado" || status === "Agendado",
              qualification_label: nextContact ? `Follow-up: ${nextContact}` : status,
            });
            // Atualizar métricas da campanha
            const metrics = campanha.metrics || { total_calls: 0, atendidas: 0, nao_atendidas: 0, ocupado: 0, caixa_postal: 0, invalido: 0 };
            metrics.total_calls = (metrics.total_calls || 0) + 1;
            metrics.atendidas = (metrics.atendidas || 0) + 1;
            await base44.entities.Campanha3C.update(campanha.id, {
              metrics,
              last_result_date: new Date().toISOString(),
              status: "Em Discagem",
            });
          }
        } catch (e) {
          // não bloqueia o salvamento se falhar a vinculação à campanha
          console.error("Erro ao vincular chamada à campanha:", e);
        }
      }

      // Incrementar contador de registros na sessão ativa da campanha
      if (campaignContext?.campaign_id_3c) {
        try {
          const sessions = await base44.entities.SessaoCampanha3C.filter(
            { campaign_id_3c: String(campaignContext.campaign_id_3c), status: "Ativa" },
            "-login_at", 1
          );
          if (sessions.length > 0) {
            const sess = sessions[0];
            await base44.entities.SessaoCampanha3C.update(sess.id, {
              records_made: (sess.records_made || 0) + 1,
            });
          }
        } catch {}
      }

      queryClient.invalidateQueries({ queryKey: ["maintenanceEquipment"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["crmContacts"] });
      queryClient.invalidateQueries({ queryKey: ["campaignCalls"] });
      toast({ title: "Contato salvo", description: campaignContext?.campaign_id_3c ? "Contato registrado e vinculado à campanha." : "Listas de CRM e contatos atualizadas." });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    }
  };

  const handleInactivate = async () => {
    if (!inactiveReason.trim()) {
      toast({ title: "Informe o motivo da inativação", variant: "destructive" });
      return;
    }
    try {
      await base44.entities.Equipment.update(equipment.id, {
        status: "Inativo",
        inactive_reason: inactiveReason,
        inactive_date: format(new Date(), "yyyy-MM-dd"),
      });
      queryClient.invalidateQueries({ queryKey: ["maintenanceEquipment"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Equipamento inativado", description: "Motivo: " + inactiveReason });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro ao inativar", description: err.message, variant: "destructive" });
    }
  };

  const handleRefreshLists = () => {
    queryClient.invalidateQueries({ queryKey: ["maintenanceEquipment"] });
    queryClient.invalidateQueries({ queryKey: ["clients"] });
    queryClient.invalidateQueries({ queryKey: ["crmContacts"] });
    queryClient.invalidateQueries({ queryKey: ["crmClient"] });
    toast({ title: "Listas atualizadas", description: "CRM e contatos refreshizados." });
  };

  if (!equipment) return null;

  const contactLog = equipment.crm_contact_log || [];
  const productHistory = equipment.product_history || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" /> CRM — {equipment.patrimony_code || equipment.code}
            {equipment.imported && <Badge variant="outline" className="text-[10px] gap-0.5"><History className="h-2.5 w-2.5" />Importado</Badge>}
          </DialogTitle>
          <DialogDescription>{equipment.client_name}</DialogDescription>
        </DialogHeader>

        {/* ── Dados do Cliente ── */}
        {client && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wide">Dados do Cliente</p>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div className="col-span-2"><span className="text-muted-foreground text-xs">Nome:</span> <strong>{client.name}</strong></div>
              <div><span className="text-muted-foreground text-xs">Documento:</span> {client.document || "—"}</div>
              <div><span className="text-muted-foreground text-xs">Tipo:</span> {client.person_type || "—"}</div>
              {client.email && <div className="col-span-2"><span className="text-muted-foreground text-xs">E-mail:</span> {client.email}</div>}
            </div>
            <div className="flex items-start gap-2 text-sm border-t pt-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-0.5">Endereço de cadastro</p>
                <p>{[client.street, client.number].filter(Boolean).join(", ") || "—"}{client.complement ? ` - ${client.complement}` : ""}</p>
                <p className="text-muted-foreground text-xs">{[client.neighborhood, client.city, client.state].filter(Boolean).join(" · ")}{client.zip_code ? ` · CEP ${client.zip_code}` : ""}</p>
              </div>
            </div>
            {addresses.length > 0 && (
              <div className="border-t pt-2 space-y-1">
                {addresses.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <MapPin className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium">{a.label || "Endereço"}</span>: {[a.street, a.number].filter(Boolean).join(", ")}
                      {a.complement ? ` - ${a.complement}` : ""} · {[a.neighborhood, a.city, a.state].filter(Boolean).join(" · ")}{a.zip_code ? ` · CEP ${a.zip_code}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Modelo do Equipamento (editável) ── */}
        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wide">Modelo do Equipamento</p>
          </div>

          <div className="flex gap-2">
            <Button size="sm" variant={productMode === "stock" ? "default" : "outline"} onClick={() => setProductMode("stock")}>
              Produto do Estoque
            </Button>
            <Button size="sm" variant={productMode === "market" ? "default" : "outline"} onClick={() => setProductMode("market")}>
              Produto de Mercado
            </Button>
          </div>

          {productMode === "stock" ? (
            <div>
              <Label className="text-xs">Buscar produto cadastrado (nome ou código)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {selectedProduct ? (
                      <span className="truncate">{selectedProduct.name} {selectedProduct.brand ? `· ${selectedProduct.brand}` : ""} {selectedProduct.code ? `(${selectedProduct.code})` : ""}</span>
                    ) : (
                      <span className="text-muted-foreground">Buscar produto...</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[500px]" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput placeholder="Digite nome ou código..." value={productSearch} onValueChange={setProductSearch} />
                    <CommandList>
                      <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem onSelect={() => { setSelectedProductId(""); setProductSearch(""); }} className="text-muted-foreground">— Nenhum —</CommandItem>
                        {filteredProducts.slice(0, 50).map(p => (
                          <CommandItem key={p.id} value={p.id} onSelect={() => { setSelectedProductId(p.id); setProductSearch(""); }}>
                            <Check className={`h-3 w-3 ${selectedProductId === p.id ? "opacity-100" : "opacity-0"}`} />
                            <span className="flex-1 truncate">{p.name} {p.brand ? `· ${p.brand}` : ""}</span>
                            {p.code && <span className="text-xs text-muted-foreground font-mono ml-2">{p.code}</span>}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedProduct && (
                <p className="text-xs text-muted-foreground mt-1">
                  Marca: {selectedProduct.brand || "—"} {selectedProduct.code ? `· Código: ${selectedProduct.code}` : ""}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Nome do produto</Label>
                <Input value={customProductName} onChange={e => setCustomProductName(e.target.value)} placeholder="Ex: Purificador XYZ" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Marca</Label>
                  <Input value={customBrand} onChange={e => setCustomBrand(e.target.value)} placeholder="Ex: Brazon" />
                </div>
                <div>
                  <Label className="text-xs">Modelo</Label>
                  <Input value={customModel} onChange={e => setCustomModel(e.target.value)} placeholder="Ex: iPure" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Use para produtos de mercado que não são vendidos pela Brazon mas que prestamos manutenção.</p>
            </div>
          )}

          {productChanged && (
            <p className="text-xs text-amber-600">⚠ O modelo será atualizado. O valor anterior será preservado no histórico.</p>
          )}
        </div>

        {/* ── Contatos do Cliente ── */}
        {(clientPhones.length > 0 || contacts.length > 0) && (
          <div className="rounded-md border bg-muted/40 p-3 space-y-2 max-h-40 overflow-y-auto">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contatos do Cliente</p>
            {clientPhones.map((p, i) => (
              <div key={`c${i}`} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{p.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium font-mono text-xs">{p.number}</span>
                  {!p.isEmail && p.whatsapp && <MessageCircle className="h-3 w-3 text-green-600" />}
                </div>
              </div>
            ))}
            {contacts.map((c, i) => (
              <div key={`k${i}`} className="flex items-center justify-between text-sm border-t pt-1.5">
                <div className="flex flex-col">
                  <span className="text-muted-foreground">{c.name}{c.role ? ` — ${c.role}` : ""}</span>
                  {c.email && <span className="text-xs text-muted-foreground">{c.email}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {c.phone && <span className="font-mono text-xs">{c.phone}</span>}
                  {c.whatsapp && <MessageCircle className="h-3 w-3 text-green-600" />}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Registro de Contato ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <User className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wide">Registro de Contato</p>
            {currentUser && <span className="text-xs text-muted-foreground">Atendente: <strong>{currentUser.full_name || currentUser.email}</strong></span>}
          </div>

          <div>
            <Label className="text-xs">Telefone utilizado no contato</Label>
            <Select value={contactPhone || "none"} onValueChange={(v) => setContactPhone(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Selecione o telefone..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Não informado —</SelectItem>
                {clientPhones.filter(p => !p.isEmail).map((p, i) => (
                  <SelectItem key={i} value={p.number}>{p.label}: {p.number}</SelectItem>
                ))}
                {contacts.filter(c => c.phone).map((c, i) => (
                  <SelectItem key={`ct${i}`} value={c.phone}>{c.name}: {c.phone}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Status do Contato</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Aguardando Contato">Aguardando Contato</SelectItem>
                <SelectItem value="Contato Realizado">Contato Realizado</SelectItem>
                <SelectItem value="Agendado">Agendado</SelectItem>
                <SelectItem value="Sem Resposta">Sem Resposta</SelectItem>
                <SelectItem value="Não Interessado">Não Interessado</SelectItem>
                <SelectItem value="Lembrete Peça Extra">Lembrete Peça Extra</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Data do Contato</Label>
              <Input type="date" value={lastContact} onChange={e => setLastContact(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Retornar em (Follow-up)</Label>
              <Input type="date" value={nextContact} onChange={e => setNextContact(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Registro do contato, motivo de não interesse, etc." />
          </div>
        </div>

        {/* ── Histórico de Contatos (append-only) ── */}
        {contactLog.length > 0 && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wide">Histórico de Contatos ({contactLog.length})</p>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {[...contactLog].reverse().map((entry, i) => (
                <div key={i} className="text-xs border-l-2 border-primary/30 pl-2 py-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{fmtDate(entry.date)}</span>
                    {entry.status && <Badge variant="outline" className="text-[10px]">{entry.status}</Badge>}
                  </div>
                  {entry.attendant && <span className="text-muted-foreground">Atendente: {entry.attendant}</span>}
                  {entry.phone && <span className="text-muted-foreground block">Tel: {entry.phone}</span>}
                  {entry.notes && <p className="mt-1">{entry.notes}</p>}
                  {entry.follow_up_date && <span className="text-muted-foreground block">Follow-up: {fmtDate(entry.follow_up_date)}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Histórico de Modelo (append-only) ── */}
        {productHistory.length > 0 && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wide">Histórico de Modelo ({productHistory.length})</p>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {[...productHistory].reverse().map((h, i) => (
                <div key={i} className="text-xs border-l-2 border-amber-400/50 pl-2 py-1">
                  <span className="font-medium">{fmtDateTime(h.date)}</span>
                  {h.changed_by && <span className="text-muted-foreground"> · {h.changed_by}</span>}
                  <p className="mt-0.5">
                    <span className="line-through text-muted-foreground">{h.old_product_name || "—"}</span>
                    {" → "}
                    <span className="font-medium">{h.new_product_name || "—"}</span>
                  </p>
                  {(h.old_brand || h.new_brand) && (
                    <p className="text-muted-foreground">Marca: {h.old_brand || "—"} → {h.new_brand || "—"}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Inativar Equipamento ── */}
        {equipment.status !== "Inativo" ? (
          <div className="rounded-md border border-destructive/30 p-3 space-y-2">
            {!showInactiveForm ? (
              <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => setShowInactiveForm(true)}>
                <Ban className="h-4 w-4" /> Inativar Equipamento
              </Button>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs text-destructive">Motivo da inativação</Label>
                <Textarea rows={2} value={inactiveReason} onChange={e => setInactiveReason(e.target.value)} placeholder="Ex: Equipamento retirado, cliente cancelou, produto obsoleto, etc." />
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" onClick={handleInactivate}>Confirmar Inativação</Button>
                  <Button size="sm" variant="outline" onClick={() => setShowInactiveForm(false)}>Cancelar</Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <span className="font-medium text-destructive">Equipamento Inativo</span>
            {equipment.inactive_reason && <p className="text-muted-foreground text-xs mt-1">Motivo: {equipment.inactive_reason}</p>}
            {equipment.inactive_date && <p className="text-muted-foreground text-xs">Desde: {fmtDate(equipment.inactive_date)}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <div className="flex items-center gap-1">
            <Button onClick={handleSave}>Salvar Contato</Button>
            <Button size="icon" variant="outline" onClick={handleRefreshLists} title="Atualizar listas de CRM e contatos">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}