import React, { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Layers, Package, AlertTriangle, RefreshCw, Loader2, Clock, ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

// Diálogo de recotação de frete com alteração de empacotamento.
// Permite re-cotar o frete de uma venda já faturada/em OS alterando o modo de
// empacotamento (ex: unify_all → per_item para separar 2 volumes) sem precisar
// editar a venda. Usa o backend requoteShipping com overrides de packing.
export default function RequoteShippingDialog({ open, onOpenChange, sale }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [packingMode, setPackingMode] = useState(sale?.packing_mode || "per_item");
  const [itemPacking, setItemPacking] = useState(sale?.item_packing || {});
  const [saving, setSaving] = useState(false);
  const [quotes, setQuotes] = useState(null); // null = ainda não recotou; [] = recotou sem resultados; [...] = lista de cotações
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [applying, setApplying] = useState(false);

  // Dimensões customizadas da embalagem única (unify_all)
  const existingUnifyVol = (sale?.shipping_volumes || []).find(v => v.label_tag === "Vol. 1 — Pedido Completo") || {};
  const [unifyDims, setUnifyDims] = useState({
    height: existingUnifyVol.height || 10,
    width: existingUnifyVol.width || 10,
    length: existingUnifyVol.length || 10,
    weight: existingUnifyVol.weight || 0.3,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["productGroups"],
    queryFn: () => base44.entities.ProductGroup.list("-created_date", 200),
  });
  const { data: subgroups = [] } = useQuery({
    queryKey: ["productSubgroups"],
    queryFn: () => base44.entities.ProductSubgroup.list("-created_date", 500),
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => base44.entities.Product.list("-created_date", 500),
  });

  useEffect(() => {
    setPackingMode(sale?.packing_mode || "per_item");
    setItemPacking(sale?.item_packing || {});
    setQuotes(null);
    setSelectedQuote(null);
    const exVol = (sale?.shipping_volumes || []).find(v => v.label_tag === "Vol. 1 — Pedido Completo") || {};
    setUnifyDims({
      height: exVol.height || 10,
      width: exVol.width || 10,
      length: exVol.length || 10,
      weight: exVol.weight || 0.3,
    });
  }, [sale?.id]);

  const items = sale?.items || [];

  const getProductDims = (prod) => {
    const grp = groups.find(g => g.id === prod?.group_id) || {};
    const sub = subgroups.find(s => s.id === prod?.subgroup_id) || {};
    return {
      weight: Number(prod?.weight) || Number(sub.weight) || Number(grp.weight) || 0,
      width: Number(prod?.width) || Number(sub.width) || Number(grp.width) || 0,
      height: Number(prod?.depth) || Number(sub.height) || Number(grp.height) || 0,
      length: Number(prod?.length) || Number(sub.length) || Number(grp.length) || 0,
    };
  };

  // Gera preview dos volumes a partir dos itens + config de empacotamento (espelha frontend/backend)
  const volumes = useMemo(() => {
    if (!items || items.length === 0) return [];
    const vols = [];
    let idx = 1;
    if (packingMode === "unify_all") {
      const totalQty = items.reduce((s, i) => s + (i.quantity || 1), 0);
      vols.push({
        index: 1, product_id: null, product_name: "Volume Único (todos os itens)",
        quantity: totalQty, label_tag: "Vol. 1 — Pedido Completo",
        height: Number(unifyDims.height) || 10,
        width: Number(unifyDims.width) || 10,
        length: Number(unifyDims.length) || 10,
        weight: Number(unifyDims.weight) || 0.3,
      });
      return vols;
    }
    items.forEach((item, i) => {
      const prod = products.find(p => p.id === item.product_id) || {};
      const dims = getProductDims(prod);
      const qty = item.quantity || 1;
      const mode = itemPacking[String(i)] || (qty === 1 ? "individual" : "grouped");
      const prodName = item.product_name || prod.name || `Item ${i + 1}`;
      if (mode === "grouped") {
        vols.push({
          index: idx, product_id: item.product_id, product_name: prodName, quantity: qty,
          height: dims.height || 10, width: dims.width || 10, length: dims.length || 10,
          weight: Number((dims.weight * qty).toFixed(2)) || 0.3,
          label_tag: `Vol. ${idx} — ${prodName} (x${qty})`,
        });
        idx++;
      } else {
        for (let u = 0; u < qty; u++) {
          vols.push({
            index: idx, product_id: item.product_id, product_name: prodName, quantity: 1,
            height: dims.height || 10, width: dims.width || 10, length: dims.length || 10,
            weight: dims.weight || 0.3,
            label_tag: `Vol. ${idx} — ${prodName}`,
          });
          idx++;
        }
      }
    });
    return vols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, packingMode, itemPacking, products, groups, subgroups, unifyDims]);

  const handleRequote = async () => {
    setSaving(true);
    try {
      const res = await base44.functions.invoke("requoteShipping", {
        sale_id: sale.id,
        packing_mode: packingMode,
        item_packing: itemPacking,
        unify_dims: packingMode === "unify_all" ? {
          height: Number(unifyDims.height) || 10,
          width: Number(unifyDims.width) || 10,
          length: Number(unifyDims.length) || 10,
          weight: Number(unifyDims.weight) || 0.3,
        } : null,
      });
      const data = res.data || res;
      if (data.error) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      queryClient.invalidateQueries({ queryKey: ["sale"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      // Exibe todas as transportadoras para o usuário escolher
      const allQuotes = data.all_quotes || [];
      setQuotes(allQuotes);
      const def = allQuotes.find(q => q.selected) || allQuotes[0] || null;
      setSelectedQuote(def);
      toast({
        title: "Recotação concluída",
        description: `${data.volumes_count} volumes • ${allQuotes.length} transportadoras disponíveis. Selecione uma abaixo.`,
      });
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "Falha ao re-cotar";
      toast({ title: "Erro ao re-cotar frete", description: typeof msg === "string" ? msg : JSON.stringify(msg), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleApplyCarrier = async () => {
    if (!selectedQuote) return;
    setApplying(true);
    try {
      const res = await base44.functions.invoke("applyRequoteCarrier", {
        sale_id: sale.id,
        carrier: selectedQuote.company_name,
        service: selectedQuote.service_name,
        price: selectedQuote.price,
      });
      const data = res.data || res;
      if (data.error) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      queryClient.invalidateQueries({ queryKey: ["sale"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["serviceOrders"] });
      if (data.freight_diff) {
        toast({
          title: "Transportadora selecionada — aguardando aprovação",
          description: `Diferença de R$ ${data.freight_diff.diff_amount.toFixed(2)} (R$ ${data.freight_diff.original_freight.toFixed(2)} → R$ ${data.freight_diff.new_freight.toFixed(2)}). Aguardando supervisor/adm no Dashboard de Fretes.`,
        });
      } else {
        toast({
          title: "Transportadora aplicada",
          description: `${selectedQuote.company_name} — ${selectedQuote.service_name} (R$ ${selectedQuote.price.toFixed(2)}) aplicada ao pedido.`,
        });
      }
      onOpenChange(false);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "Falha ao aplicar transportadora";
      toast({ title: "Erro ao aplicar transportadora", description: typeof msg === "string" ? msg : JSON.stringify(msg), variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const currentVolumes = sale?.shipping_volumes || [];
  const willChange = volumes.length !== currentVolumes.length || packingMode !== (sale?.packing_mode || "per_item");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4 text-primary" /> Recotar Frete — Alterar Volumes
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status de aprovação pendente */}
          {sale?.requote_diff_status === "Pendente Aprovação" && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-amber-800">
                <ShieldAlert className="h-4 w-4" /> Recotação Aguardando Aprovação
              </div>
              <div className="text-xs text-amber-700 space-y-0.5">
                <div>Frete original: <span className="font-medium">R$ {(sale.requote_original_freight || 0).toFixed(2)}</span> ({sale.requote_original_volumes_count} volumes)</div>
                <div>Novo frete: <span className="font-medium">R$ {(sale.requote_new_freight || 0).toFixed(2)}</span> ({sale.requote_new_volumes_count} volumes)</div>
                <div className="font-medium">Diferença: +R$ {(sale.requote_diff_amount || 0).toFixed(2)} (adicional por erro de cotação)</div>
                <div className="flex items-center gap-1 pt-0.5">
                  <Clock className="h-3 w-3" /> Solicitado por {sale.requote_requested_by} em {sale.requote_requested_date ? new Date(sale.requote_requested_date).toLocaleString("pt-BR") : "—"}
                </div>
                <div className="text-amber-600">Aguardando aprovação do supervisor/adm no Dashboard de Fretes.</div>
              </div>
            </div>
          )}
          {sale?.requote_diff_status === "Aprovado" && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm space-y-1">
              <div className="flex items-center gap-2 font-semibold text-emerald-800">
                <RefreshCw className="h-4 w-4" /> Recotação Aprovada
              </div>
              <div className="text-xs text-emerald-700">
                Diferença de R$ {(sale.requote_diff_amount || 0).toFixed(2)} aplicada (adicional por erro de cotação). Aprovado por {sale.requote_approved_by}.
              </div>
            </div>
          )}
          {sale?.requote_diff_status === "Rejeitado" && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm space-y-1">
              <div className="flex items-center gap-2 font-semibold text-red-800">
                <ShieldAlert className="h-4 w-4" /> Recotação Rejeitada
              </div>
              <div className="text-xs text-red-700">
                Rejeitado por {sale.requote_rejected_by}. {sale.requote_reject_reason ? `Motivo: ${sale.requote_reject_reason}` : ""}
              </div>
            </div>
          )}

          {/* Resumo atual */}
          <div className="rounded-md border border-blue-200 bg-blue-50/40 p-3 text-sm space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Pedido:</span>
              <span className="font-mono font-medium">{sale?.order_number}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Volumes atuais:</span>
              <Badge variant="outline">{currentVolumes.length} volume(s)</Badge>
              <span className="text-muted-foreground text-xs">({sale?.packing_mode === "unify_all" ? "tudo em 1 volume" : "por item"})</span>
            </div>
            {sale?.selected_carrier && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Transportadora atual:</span>
                <span className="font-medium">{sale.selected_carrier} — {sale.selected_service}</span>
              </div>
            )}
          </div>

          {/* Modo de empacotamento */}
          <div>
            <Label className="text-xs flex items-center gap-1 mb-1.5">
              <Layers className="h-3.5 w-3.5" /> Modo de Empacotamento
            </Label>
            <Select value={packingMode} onValueChange={setPackingMode}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="per_item">Por item (cada item decide: agrupado ou individual)</SelectItem>
                <SelectItem value="unify_all">Unificar tudo em 1 volume (embalagem especial)</SelectItem>
              </SelectContent>
            </Select>
            {packingMode === "unify_all" && (
              <>
                <p className="text-xs text-amber-600 mt-1 flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  Produtos diferentes em um único volume — informe as dimensões reais da embalagem especial.
                </p>
                <div className="mt-2 rounded-md border border-violet-200 bg-violet-50/40 p-3 space-y-2">
                  <Label className="text-xs font-medium text-violet-800 flex items-center gap-1">
                    <Package className="h-3.5 w-3.5" /> Dimensões da Embalagem Única
                  </Label>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Altura (cm)</Label>
                      <Input type="number" step="0.1" min="1" value={unifyDims.height}
                        onChange={e => setUnifyDims(p => ({ ...p, height: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Largura (cm)</Label>
                      <Input type="number" step="0.1" min="1" value={unifyDims.width}
                        onChange={e => setUnifyDims(p => ({ ...p, width: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Compr. (cm)</Label>
                      <Input type="number" step="0.1" min="1" value={unifyDims.length}
                        onChange={e => setUnifyDims(p => ({ ...p, length: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Peso (kg)</Label>
                      <Input type="number" step="0.01" min="0.1" value={unifyDims.weight}
                        onChange={e => setUnifyDims(p => ({ ...p, weight: e.target.value }))} className="h-8 text-sm" />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Configuração por item (apenas per_item) */}
          {packingMode === "per_item" && items.length > 0 && (
            <div>
              <Label className="text-xs mb-1.5 block">Itens do Pedido</Label>
              <div className="space-y-1.5">
                {items.map((item, i) => {
                  const qty = item.quantity || 1;
                  const mode = itemPacking[String(i)] || (qty === 1 ? "individual" : "grouped");
                  return (
                    <div key={i} className="flex items-center justify-between gap-2 text-xs bg-muted/30 rounded px-2 py-1.5">
                      <div className="min-w-0 flex-1">
                        <span className="font-medium truncate block">{item.product_name || "Produto"}</span>
                        <span className="text-muted-foreground">Qtd: {qty}</span>
                      </div>
                      <Select
                        value={mode}
                        onValueChange={(v) => {
                          if (v === "unify_all") { setPackingMode("unify_all"); return; }
                          setItemPacking(p => ({ ...p, [String(i)]: v }));
                        }}
                      >
                        <SelectTrigger className="h-7 w-52 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="individual">Individual (1 vol. por unidade)</SelectItem>
                          <SelectItem value="grouped" disabled={qty === 1}>
                            Agrupar (1 vol. p/ todas as {qty} un.)
                          </SelectItem>
                          <SelectItem value="unify_all">Agrupamento Total (todo o pedido)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Preview dos novos volumes */}
          {volumes.length > 0 && !quotes && (
            <div>
              <Label className="text-xs mb-1.5 flex items-center gap-1">
                <Package className="h-3 w-3" /> Preview dos Novos Volumes ({volumes.length})
              </Label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {volumes.map(vol => (
                  <div key={vol.index} className="border rounded-md p-2 bg-card text-xs">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant="outline" className="text-[10px] font-mono">Vol. {vol.index}</Badge>
                      <span className="font-medium truncate flex-1">{vol.label_tag}</span>
                    </div>
                    <div className="text-muted-foreground">
                      {vol.height}×{vol.width}×{vol.length} cm • {vol.weight} kg • {vol.quantity} un.
                    </div>
                  </div>
                ))}
              </div>
              {willChange && (
                <p className="text-xs text-emerald-700 mt-1.5 flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  A nova configuração gerará {volumes.length} volume(s) — diferente dos {currentVolumes.length} atual(is). A cotação será refeita.
                </p>
              )}
            </div>
          )}

          {/* Lista de transportadoras disponíveis (após recotação) */}
          {quotes && quotes.length > 0 && (
            <div>
              <Label className="text-xs mb-1.5 flex items-center gap-1">
                <Truck className="h-3 w-3" /> Transportadoras Disponíveis ({quotes.length})
              </Label>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {quotes.map((q, i) => {
                  const isSelected = selectedQuote?.service_id === q.service_id;
                  const prevCarrier = sale?.selected_carrier === q.company_name && sale?.selected_service === q.service_name;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedQuote(q)}
                      className={`w-full text-left border rounded-md p-2.5 transition-colors flex items-center justify-between gap-2 ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-primary/40 hover:bg-muted/30"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm truncate">{q.company_name}</span>
                          {q.selected && <Badge variant="secondary" className="text-[10px] px-1 py-0">anterior</Badge>}
                          {prevCarrier && !q.selected && <Badge variant="outline" className="text-[10px] px-1 py-0">atual</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{q.service_name}</div>
                        {q.delivery_time && (
                          <div className="text-[11px] text-muted-foreground">Prazo: {q.delivery_time} dias úteis</div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-semibold text-sm">R$ {q.price.toFixed(2)}</div>
                        {isSelected && <div className="text-[10px] text-primary font-medium">selecionada</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
              {selectedQuote && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Frete original: <span className="font-medium">R$ {(sale?.freight || 0).toFixed(2)}</span>
                  {selectedQuote.price > (sale?.freight || 0) + 0.01 && (
                    <span className="text-amber-600 font-medium">
                      {" "}→ diferença de +R$ {(selectedQuote.price - (sale?.freight || 0)).toFixed(2)} (requer aprovação)
                    </span>
                  )}
                  {selectedQuote.price <= (sale?.freight || 0) + 0.01 && (
                    <span className="text-emerald-600 font-medium">
                      {" "}→ sem custo adicional
                    </span>
                  )}
                </p>
              )}
            </div>
          )}
          {quotes && quotes.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">
              Nenhuma transportadora disponível para os CEPs/volumes informados.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || applying}>
            Cancelar
          </Button>
          {!quotes ? (
            <Button onClick={handleRequote} disabled={saving || volumes.length === 0} className="gap-2">
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Recalculando...</>
              ) : (
                <><RefreshCw className="h-4 w-4" /> Recalcular Volumes e Cotar Frete</>
              )}
            </Button>
          ) : (
            <Button onClick={handleApplyCarrier} disabled={applying || !selectedQuote} className="gap-2">
              {applying ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Aplicando...</>
              ) : (
                <><Truck className="h-4 w-4" /> Aplicar Transportadora Selecionada</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}