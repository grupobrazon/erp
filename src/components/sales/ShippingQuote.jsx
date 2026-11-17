import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Truck, Check, AlertTriangle, History, Package, Layers } from "lucide-react";

const fmt = (v) => Number(v || 0).toFixed(2).replace(".", ",");

export default function ShippingQuote({
  originZip,
  destinationZip,
  items,
  products,
  onApplyFreight,
  quoteHistory = [],
  onQuoteCompleted,
  initialPackingMode,
  initialItemPacking,
  initialShippingVolumes,
}) {
  const { data: groups = [] } = useQuery({
    queryKey: ["productGroups"],
    queryFn: () => base44.entities.ProductGroup.list("-created_date", 200),
  });
  const { data: subgroups = [] } = useQuery({
    queryKey: ["productSubgroups"],
    queryFn: () => base44.entities.ProductSubgroup.list("-created_date", 500),
  });

  const [packingMode, setPackingMode] = useState(initialPackingMode || "per_item");
  const [itemPacking, setItemPacking] = useState(initialItemPacking || {});
  const [volumes, setVolumes] = useState(initialShippingVolumes || []);
  const [volumeQuotes, setVolumeQuotes] = useState({}); // { [volumeIndex]: quotes[] }
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [environment, setEnvironment] = useState("production");
  const [destZip, setDestZip] = useState(destinationZip || "");

  useEffect(() => { setDestZip(destinationZip || ""); }, [destinationZip]);

  // Auto-corrigir: itens com qtd=1 não podem ser "grouped" (é redundante)
  useEffect(() => {
    if (packingMode !== "per_item") return;
    setItemPacking(prev => {
      let changed = false;
      const next = { ...prev };
      items.forEach((item, i) => {
        if ((item.quantity || 1) === 1 && prev[String(i)] === "grouped") {
          next[String(i)] = "individual";
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [items, packingMode]);

  const getProductDims = (prod) => {
    const grp = groups.find(g => g.id === prod.group_id) || {};
    const sub = subgroups.find(s => s.id === prod.subgroup_id) || {};
    return {
      weight: Number(prod.weight) || Number(sub.weight) || Number(grp.weight) || 0,
      width: Number(prod.width) || Number(sub.width) || Number(grp.width) || 0,
      height: Number(prod.depth) || Number(sub.height) || Number(grp.height) || 0,
      length: Number(prod.length) || Number(sub.length) || Number(grp.length) || 0,
    };
  };

  // Generate volumes from items + packing config, preserving manual dimension edits
  const generateVolumes = () => {
    const prevByTag = {};
    volumes.forEach(v => { if (v.label_tag) prevByTag[v.label_tag] = v; });
    const vols = [];
    let idx = 1;
    if (packingMode === "unify_all") {
      const totalQty = items.reduce((s, i) => s + (i.quantity || 1), 0);
      const insurance = items.reduce((s, i) => s + ((i.unit_price || 0) * (i.quantity || 1)), 0);
      const tag = "Vol. 1 — Pedido Completo";
      const prev = prevByTag[tag] || {};
      vols.push({
        index: 1,
        product_id: null,
        product_name: "Volume Único (todos os itens)",
        quantity: totalQty,
        height: prev.height || 10,
        width: prev.width || 10,
        length: prev.length || 10,
        weight: prev.weight || 0.3,
        insurance_value: insurance,
        label_tag: tag,
        custom_dimensions: prev.custom_dimensions ?? true,
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
        const tag = `Vol. ${idx} — ${prodName} (x${qty})`;
        const prev = prevByTag[tag] || {};
        vols.push({
          index: idx,
          product_id: item.product_id,
          product_name: prodName,
          quantity: qty,
          height: prev.custom_dimensions ? prev.height : (dims.height || 10),
          width: prev.custom_dimensions ? prev.width : (dims.width || 10),
          length: prev.custom_dimensions ? prev.length : (dims.length || 10),
          weight: prev.custom_dimensions ? prev.weight : Number((dims.weight * qty).toFixed(2)) || 0.3,
          insurance_value: (item.unit_price || 0) * qty,
          label_tag: tag,
          custom_dimensions: prev.custom_dimensions || false,
        });
        idx++;
      } else {
        for (let u = 0; u < qty; u++) {
          const tag = `Vol. ${idx} — ${prodName}`;
          const prev = prevByTag[tag] || {};
          vols.push({
            index: idx,
            product_id: item.product_id,
            product_name: prodName,
            quantity: 1,
            height: prev.custom_dimensions ? prev.height : (dims.height || 10),
            width: prev.custom_dimensions ? prev.width : (dims.width || 10),
            length: prev.custom_dimensions ? prev.length : (dims.length || 10),
            weight: prev.custom_dimensions ? prev.weight : (dims.weight || 0.3),
            insurance_value: item.unit_price || 0,
            label_tag: tag,
            custom_dimensions: prev.custom_dimensions || false,
          });
          idx++;
        }
      }
    });
    return vols;
  };

  // Regenerate volumes when items / packing config / product data change
  useEffect(() => {
    if (items.length === 0) { setVolumes([]); return; }
    setVolumes(generateVolumes());
    setVolumeQuotes({});
    setSelectedServiceId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, packingMode, itemPacking, products, groups, subgroups]);

  const cleanZip = (z) => (z || "").replace(/\D/g, "");
  const canQuote = cleanZip(originZip).length >= 8 && cleanZip(destZip).length >= 8 && items.length > 0 && volumes.length > 0;

  const updateVolume = (idx, field, value) => {
    setVolumes(prev => prev.map(v => v.index === idx ? { ...v, [field]: value, custom_dimensions: true } : v));
  };

  const runQuote = async () => {
    setLoading(true);
    setError("");
    setVolumeQuotes({});
    setSelectedServiceId("");
    try {
      const results = await Promise.all(volumes.map(async (vol) => {
        try {
          const res = await base44.functions.invoke("melhorEnvioQuote", {
            from_postal_code: originZip,
            to_postal_code: destZip,
            products: [{
              id: String(vol.index),
              width: Number(vol.width) || 10,
              height: Number(vol.height) || 10,
              length: Number(vol.length) || 10,
              weight: Number(vol.weight) || 0.3,
              insurance_value: Number(vol.insurance_value) || 0,
              quantity: 1,
            }],
            environment,
          });
          const data = res.data || res;
          if (data.error) return { volumeIndex: vol.index, quotes: [], error: data.error };
          const valid = (data.quotes || []).filter(q => q.custom_price && !q.error);
          return { volumeIndex: vol.index, quotes: valid };
        } catch (e) {
          // Extrai a mensagem real do backend (que inclui a resposta do Melhor Envio)
          const be = e?.response?.data;
          const realError = be?.error || (be?.details && JSON.stringify(be.details).slice(0, 200)) || e.message;
          return { volumeIndex: vol.index, quotes: [], error: realError };
        }
      }));
      const map = {};
      results.forEach(r => { map[r.volumeIndex] = r.quotes; });
      setVolumeQuotes(map);
      // Se QUALQUER volume falhar (erro da API ou nenhuma transportadora disponível), o frete
      // não pode ser recalculado para o pedido — mostra o motivo de cada volume, em vez de falhar em silêncio.
      const failed = results.filter(r => (r.quotes || []).length === 0);
      if (failed.length > 0) {
        const details = failed.map(r =>
          `Vol. ${r.volumeIndex}: ${r.error || "nenhuma transportadora retornou cotação para este volume (verifique CEP, dimensões e peso)"}`
        ).join(" | ");
        setError(`O frete não pôde ser recalculado. ${details}`);
      }
    } catch (e) {
      setError(e.message || "Falha ao cotar frete.");
    } finally {
      setLoading(false);
    }
  };

  // Services available across ALL volumes (intersection) so one service applies to all
  const commonServices = useMemo(() => {
    const indices = Object.keys(volumeQuotes).map(Number).filter(i => (volumeQuotes[i] || []).length > 0);
    if (indices.length === 0 || indices.length < volumes.length) return [];
    const first = volumeQuotes[indices[0]] || [];
    return first.filter(q => indices.every(vi => (volumeQuotes[vi] || []).some(qq => qq.service_id === q.service_id)));
  }, [volumeQuotes, volumes]);

  const selectService = (q) => {
    setSelectedServiceId(q.service_id);
    let total = 0;
    let sample = q;
    volumes.forEach(vol => {
      const qq = (volumeQuotes[vol.index] || []).find(x => x.service_id === q.service_id);
      if (qq) total += Number(qq.custom_price) || 0;
    });
    onApplyFreight(
      total,
      {
        service_name: q.service_name,
        service_id: q.service_id,
        company_name: q.company_name,
        custom_price: total,
        custom_delivery_time: q.custom_delivery_time,
        delivery_time: q.delivery_time,
      },
      {
        packing_mode: packingMode,
        item_packing: itemPacking,
        shipping_volumes: volumes,
      }
    );
    if (onQuoteCompleted) onQuoteCompleted();
  };

  const totalPerVolume = (serviceId) => {
    let total = 0;
    volumes.forEach(vol => {
      const q = (volumeQuotes[vol.index] || []).find(x => x.service_id === serviceId);
      if (q) total += Number(q.custom_price) || 0;
    });
    return total;
  };

  return (
    <div className="border rounded-lg p-4 bg-muted/20">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-medium">Cotação de Frete — Melhor Envio (por volume)</h4>
        </div>
        <div className="flex items-center gap-2">
          <Select value={environment} onValueChange={setEnvironment}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sandbox">Sandbox</SelectItem>
              <SelectItem value="production">Produção</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" size="sm" variant="outline" onClick={runQuote} disabled={loading || !canQuote} className="gap-1">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
            {loading ? "Cotando..." : `Cotar ${volumes.length} Volume${volumes.length !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
        <div>
          <Label className="text-xs">CEP Origem</Label>
          <Input value={originZip || ""} disabled className="h-8 bg-muted" />
        </div>
        <div>
          <Label className="text-xs">CEP Destino</Label>
          <Input value={destZip} onChange={(e) => setDestZip(e.target.value)} placeholder="00000-000" className="h-8" />
        </div>
      </div>

      {/* Packing mode selector */}
      <div className="border-t pt-3 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
          <h5 className="text-xs font-medium text-muted-foreground uppercase">Modo de Empacotamento</h5>
        </div>
        <Select value={packingMode} onValueChange={setPackingMode}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="per_item">Por item (cada item decide: agrupado ou individual)</SelectItem>
            <SelectItem value="unify_all">Unificar tudo em 1 volume (embalagem especial)</SelectItem>
          </SelectContent>
        </Select>
        {packingMode === "unify_all" && (
          <p className="text-xs text-amber-600 mt-1 flex items-start gap-1">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            Produtos diferentes em um único volume — informe as dimensões da embalagem especial no volume abaixo antes de cotar.
          </p>
        )}
      </div>

      {/* Per-item packing config (only per_item mode) */}
      {packingMode === "per_item" && items.length > 0 && (
        <div className="border-t pt-3 mb-3">
          <h5 className="text-xs font-medium text-muted-foreground uppercase mb-2">Itens do Pedido</h5>
          <div className="space-y-1.5">
            {items.map((item, i) => {
              const qty = item.quantity || 1;
              const mode = itemPacking[String(i)] || (qty === 1 ? "individual" : "grouped");
              const handleItemPacking = (v) => {
                if (v === "unify_all") { setPackingMode("unify_all"); return; }
                setItemPacking(p => ({ ...p, [String(i)]: v }));
              };
              return (
                <div key={i} className="flex items-center justify-between gap-2 text-xs bg-muted/30 rounded px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium truncate block">{item.product_name || "Produto"}</span>
                    <span className="text-muted-foreground">Qtd: {qty}{qty === 1 && <span className="text-amber-600"> • agrupar indisponível</span>}</span>
                  </div>
                  <Select value={mode} onValueChange={handleItemPacking}>
                    <SelectTrigger className="h-7 w-52 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">Individual (1 vol. por unidade)</SelectItem>
                      <SelectItem value="grouped" disabled={qty === 1}>
                        Agrupar todos os produtos do item{qty === 1 ? " — indisponível" : ""}
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

      {/* Volumes list with editable dimensions */}
      {volumes.length > 0 && (
        <div className="border-t pt-3">
          <h5 className="text-xs font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1">
            <Package className="h-3 w-3" /> Volumes ({volumes.length})
          </h5>
          <div className="space-y-2">
            {volumes.map(vol => (
              <div key={vol.index} className="border rounded-md p-2 bg-card">
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge variant="outline" className="text-[10px] font-mono">Vol. {vol.index}</Badge>
                  <span className="text-xs font-medium truncate flex-1">{vol.label_tag}</span>
                  {vol.custom_dimensions && <Badge variant="secondary" className="text-[10px]">editado</Badge>}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <div>
                    <Label className="text-[10px]">Alt (cm)</Label>
                    <Input type="number" value={vol.height} onChange={e => updateVolume(vol.index, "height", parseFloat(e.target.value) || 0)} className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Larg (cm)</Label>
                    <Input type="number" value={vol.width} onChange={e => updateVolume(vol.index, "width", parseFloat(e.target.value) || 0)} className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Comp (cm)</Label>
                    <Input type="number" value={vol.length} onChange={e => updateVolume(vol.index, "length", parseFloat(e.target.value) || 0)} className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Peso (kg)</Label>
                    <Input type="number" step="0.01" value={vol.weight} onChange={e => updateVolume(vol.index, "weight", parseFloat(e.target.value) || 0)} className="h-7 text-xs" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">Dimensões preenchidas automaticamente. Edite se a embalagem diferir.</p>
        </div>
      )}

      {!canQuote && (
        <p className="text-xs text-muted-foreground mt-2">
          Selecione o local de faturamento (origem), preencha o CEP de destino e adicione produtos para cotar.
        </p>
      )}

      {error && (
        <p className="text-xs text-destructive flex items-start gap-1 mt-2">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {/* Common services (apply to all volumes) */}
      {commonServices.length > 0 && (
        <div className="space-y-1.5 mt-3">
          <p className="text-xs font-medium text-muted-foreground">Serviços disponíveis para todos os volumes — frete total = soma por volume:</p>
          {commonServices.map(q => (
            <button
              key={q.service_id}
              type="button"
              onClick={() => selectService(q)}
              className={`w-full flex items-center justify-between gap-3 p-2.5 border rounded-lg text-left transition-colors ${selectedServiceId === q.service_id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {q.company_picture ? (
                  <img src={q.company_picture} alt="" className="h-6 w-6 object-contain shrink-0" />
                ) : (
                  <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{q.company_name} — {q.service_name}</p>
                  <p className="text-xs text-muted-foreground">Prazo: {q.custom_delivery_time || q.delivery_time || "—"} dias úteis • {volumes.length} volume{volumes.length !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold">R$ {fmt(totalPerVolume(q.service_id))}</span>
                {selectedServiceId === q.service_id && <Check className="h-4 w-4 text-primary" />}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Per-volume quote detail (when quoted) */}
      {Object.keys(volumeQuotes).length > 0 && volumes.length > 0 && (
        <div className="mt-3 border-t pt-2">
          <p className="text-xs text-muted-foreground mb-1">Detalhe por volume:</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {volumes.map(vol => {
              const qs = volumeQuotes[vol.index] || [];
              return (
                <div key={vol.index} className="flex items-center justify-between gap-2 text-xs bg-muted/20 rounded px-2 py-1">
                  <span className="truncate flex-1">{vol.label_tag}</span>
                  <span className="text-muted-foreground shrink-0">
                    {qs.length} cotaç{qs.length === 1 ? "ão" : "ões"}
                    {selectedServiceId && (() => {
                      const q = qs.find(x => x.service_id === selectedServiceId);
                      return q ? ` • R$ ${fmt(q.custom_price)}` : " • s/ serviço";
                    })()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {quoteHistory.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <div className="flex items-center gap-2 mb-2">
            <History className="h-3.5 w-3.5 text-muted-foreground" />
            <h5 className="text-xs font-medium text-muted-foreground">Histórico de Cotações ({quoteHistory.length})</h5>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {[...quoteHistory].reverse().map((h, i) => (
              <div key={i} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs ${h.selected ? "bg-primary/5 border border-primary/20" : "bg-muted/30"}`}>
                <div className="min-w-0">
                  <span className="font-medium truncate">{h.company_name} — {h.service_name}</span>
                  {h.selected && <span className="text-primary ml-1">• Selecionado</span>}
                  {h.volumes_count && <span className="text-muted-foreground ml-1">({h.volumes_count} vol.)</span>}
                  <span className="text-muted-foreground block">{h.date ? new Date(h.date).toLocaleDateString("pt-BR") : "—"} • Prazo: {h.delivery_time || "—"}</span>
                </div>
                <span className="font-bold shrink-0">R$ {fmt(h.price)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}