import React, { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Download, Copy, Target, Search, MessageCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import * as XLSX from "xlsx";

const PHONE_FIELDS = [
  "phone1", "phone2", "phone3", "phone4", "phone5",
  "zoox_phone1", "zoox_phone2", "zoox_phone3", "zoox_phone4", "zoox_phone5", "zoox_phone6", "zoox_phone7",
];

function collectPhones(client) {
  const phones = new Set();
  for (const f of PHONE_FIELDS) {
    const v = client[f];
    if (v && String(v).trim()) phones.add(String(v).trim());
  }
  return [...phones];
}

export default function AtendimentosPanel({ filtered, sellers, batches, user, isAdmin, selectedSellerId, setSelectedSellerId }) {
  const { toast } = useToast();
  const [phoneSearch, setPhoneSearch] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [metaEdits, setMetaEdits] = useState({});
  const [selBatchId, setSelBatchId] = useState("all");
  const [selRegional, setSelRegional] = useState("all");
  const [selCity, setSelCity] = useState("all");
  const [selNeighborhood, setSelNeighborhood] = useState("all");

  // Vendedora logada = Seller cujo nome bate com o nome do usuário
  const mySeller = useMemo(() => {
    if (isAdmin || !user?.full_name) return null;
    return sellers.find((s) => (s.name || "").toLowerCase() === (user.full_name || "").toLowerCase()) || null;
  }, [sellers, user, isAdmin]);

  const isSellerView = !isAdmin && !!mySeller;

  const distributed = useMemo(() => filtered.filter((c) => c.seller_id), [filtered]);

  const sellerStats = useMemo(() => {
    const map = {};
    for (const c of distributed) {
      const sid = c.seller_id;
      if (!map[sid]) map[sid] = { seller_id: sid, seller_name: c.seller_name || "—", count: 0 };
      map[sid].count++;
    }
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [distributed]);

  const sellerFilter = isSellerView ? mySeller.id : selectedSellerId;

  // Lotes que possuem pelo menos um cliente distribuído visível
  const batchOptions = useMemo(() => {
    const usedIds = new Set(distributed.map((c) => c.distribution_batch_id).filter(Boolean));
    return (batches || []).filter((b) => usedIds.has(b.id) && !b.reversed);
  }, [batches, distributed]);

  const regionalOptions = useMemo(
    () => [...new Set(distributed.map((c) => c.regional).filter(Boolean))].sort(),
    [distributed]
  );
  const cityOptions = useMemo(() => {
    let base = distributed;
    if (selRegional !== "all") base = base.filter((c) => c.regional === selRegional);
    return [...new Set(base.map((c) => c.city).filter(Boolean))].sort();
  }, [distributed, selRegional]);
  const neighborhoodOptions = useMemo(() => {
    let base = distributed;
    if (selRegional !== "all") base = base.filter((c) => c.regional === selRegional);
    if (selCity !== "all") base = base.filter((c) => c.city === selCity);
    return [...new Set(base.map((c) => c.neighborhood).filter(Boolean))].sort();
  }, [distributed, selRegional, selCity]);

  // Limpa seleções órfãs quando o filtro upstream muda
  useEffect(() => {
    if (selCity !== "all" && !cityOptions.includes(selCity)) setSelCity("all");
  }, [cityOptions, selCity]);
  useEffect(() => {
    if (selNeighborhood !== "all" && !neighborhoodOptions.includes(selNeighborhood)) setSelNeighborhood("all");
  }, [neighborhoodOptions, selNeighborhood]);

  const visible = useMemo(() => {
    let list = distributed;
    if (sellerFilter && sellerFilter !== "all") list = list.filter((c) => c.seller_id === sellerFilter);
    if (selBatchId !== "all") list = list.filter((c) => c.distribution_batch_id === selBatchId);
    if (selRegional !== "all") list = list.filter((c) => c.regional === selRegional);
    if (selCity !== "all") list = list.filter((c) => c.city === selCity);
    if (selNeighborhood !== "all") list = list.filter((c) => c.neighborhood === selNeighborhood);
    if (nameSearch.trim()) {
      const q = nameSearch.toLowerCase();
      list = list.filter((c) => (c.name || "").toLowerCase().includes(q));
    }
    if (phoneSearch.trim()) {
      const q = phoneSearch.replace(/\D/g, "");
      if (q) list = list.filter((c) => collectPhones(c).some((p) => p.replace(/\D/g, "").includes(q)));
    }
    return list;
  }, [distributed, sellerFilter, selBatchId, selRegional, selCity, selNeighborhood, nameSearch, phoneSearch]);

  const getMeta = (sid) => {
    if (sid in metaEdits) return metaEdits[sid];
    const s = sellers.find((x) => x.id === sid);
    return s?.meta_clientes || 0;
  };

  const updateMeta = async (sid, value) => {
    const num = Number(value) || 0;
    setMetaEdits((m) => ({ ...m, [sid]: num }));
    try {
      await base44.entities.Seller.update(sid, { meta_clientes: num });
      toast({ title: "Meta atualizada", description: `Meta definida para ${num} clientes.` });
    } catch (e) {
      toast({ title: "Erro ao salvar meta", variant: "destructive" });
    }
  };

  const exportPhones = () => {
    const clientsWithPhones = visible.map((c) => ({ c, phones: collectPhones(c) })).filter((x) => x.phones.length > 0);
    if (clientsWithPhones.length === 0) {
      toast({ title: "Sem telefones", description: "Nenhum telefone encontrado no filtro atual." });
      return;
    }
    const maxPhones = Math.max(1, ...clientsWithPhones.map((x) => x.phones.length));
    const header = ["Código", "Nome", "Cidade", "Bairro", "Vendedora"];
    for (let i = 1; i <= maxPhones; i++) header.push(`Telefone ${i}`);
    const rows = [
      header,
      ...clientsWithPhones.map(({ c, phones }) => {
        const row = [
          c.new_code || c.old_code || "",
          c.name || "",
          c.city || "",
          c.neighborhood || "",
          c.seller_name || "",
        ];
        for (const p of phones) row.push(p);
        return row;
      }),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Atendimentos");
    XLSX.writeFile(wb, `atendimentos_distribuidos_${new Date().toISOString().slice(0, 10)}.xlsx`);
    const totalPhones = clientsWithPhones.reduce((s, x) => s + x.phones.length, 0);
    toast({ title: "Exportado", description: `${clientsWithPhones.length} clientes · ${totalPhones} telefones exportados em Excel.` });
  };

  const copyPhones = async () => {
    const phones = new Set();
    for (const c of visible) for (const p of collectPhones(c)) phones.add(p);
    if (phones.size === 0) {
      toast({ title: "Sem telefones", description: "Nenhum telefone encontrado no filtro atual." });
      return;
    }
    try {
      await navigator.clipboard.writeText([...phones].join("\n"));
      toast({ title: "Copiado", description: `${phones.size} telefones copiados para a área de transferência.` });
    } catch (e) {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  const totalPhones = useMemo(() => {
    const set = new Set();
    for (const c of visible) for (const p of collectPhones(c)) set.add(p);
    return set.size;
  }, [visible]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4" /> Atendimentos Distribuídos
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {isSellerView
            ? `Seus atendimentos distribuídos (${visible.length} clientes${totalPhones ? ` · ${totalPhones} telefones` : ""})`
            : `${distributed.length} clientes distribuídos no filtro · ${visible.length} exibidos · ${totalPhones} telefones`}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cards de meta por vendedora */}
        {!isSellerView && sellerStats.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sellerStats.map((s) => {
              const meta = getMeta(s.seller_id);
              const pct = meta > 0 ? Math.min(100, Math.round((s.count / meta) * 100)) : 0;
              const active = selectedSellerId === s.seller_id;
              return (
                <div
                  key={s.seller_id}
                  className={`rounded-lg border p-3 cursor-pointer transition ${active ? "border-primary bg-primary/5" : "hover:bg-accent"}`}
                  onClick={() => setSelectedSellerId(active ? "all" : s.seller_id)}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-medium text-sm truncate">{s.seller_name}</span>
                    <span className={`text-xs font-bold ${pct >= 100 ? "text-emerald-600" : "text-muted-foreground"}`}>{pct}%</span>
                  </div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-2xl font-bold">{s.count}</span>
                    <span className="text-xs text-muted-foreground">/ {meta || "—"} meta</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full mt-2 overflow-hidden">
                    <div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                    <span className="text-xs text-muted-foreground">Meta:</span>
                    <Input
                      type="number"
                      value={meta}
                      onChange={(e) => setMetaEdits((m) => ({ ...m, [s.seller_id]: Number(e.target.value) || 0 }))}
                      onBlur={(e) => updateMeta(s.seller_id, e.target.value)}
                      className="h-7 w-24 text-xs"
                      placeholder="0"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Barra de filtros */}
        <div className="flex flex-wrap items-center gap-2">
          {!isSellerView && (
            <Select value={selectedSellerId || "all"} onValueChange={setSelectedSellerId}>
              <SelectTrigger className="w-48 h-9">
                <SelectValue placeholder="Todas as vendedoras" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as vendedoras</SelectItem>
                {sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={selBatchId} onValueChange={setSelBatchId}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="Todos os lotes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os lotes</SelectItem>
              {batchOptions.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.protocol || b.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selRegional} onValueChange={setSelRegional}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue placeholder="Todas as regionais" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as regionais</SelectItem>
              {regionalOptions.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selCity} onValueChange={setSelCity}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue placeholder="Todas as cidades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as cidades</SelectItem>
              {cityOptions.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selNeighborhood} onValueChange={setSelNeighborhood}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue placeholder="Todos os bairros" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os bairros</SelectItem>
              {neighborhoodOptions.map((n) => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome..."
              value={nameSearch}
              onChange={(e) => setNameSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <div className="relative flex-1 min-w-[180px]">
            <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por telefone..."
              value={phoneSearch}
              onChange={(e) => setPhoneSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={copyPhones} className="gap-1.5">
            <Copy className="h-4 w-4" /> Copiar telefones
          </Button>
          <Button variant="outline" size="sm" onClick={exportPhones} className="gap-1.5">
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        </div>

        {/* Lista de clientes */}
        <div className="border rounded-lg overflow-hidden">
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Telefones</th>
                  <th className="px-3 py-2 font-medium hidden md:table-cell">Cidade / Bairro</th>
                  {!isSellerView && <th className="px-3 py-2 font-medium">Vendedora</th>}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={isSellerView ? 4 : 5} className="px-3 py-8 text-center text-muted-foreground">
                      Nenhum atendimento distribuído no filtro atual.
                    </td>
                  </tr>
                ) : (
                  visible.map((c) => {
                    const phones = collectPhones(c);
                    return (
                      <tr key={c.id} className="border-t hover:bg-accent/40 align-top">
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-muted-foreground">
                          {c.new_code || c.old_code || "—"}
                        </td>
                        <td className="px-3 py-2 font-medium truncate max-w-[220px]">{c.name}</td>
                        <td className="px-3 py-2">
                          {phones.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <ul className="flex flex-col gap-0.5">
                              {phones.map((p, i) => (
                                <li key={i} className="flex items-center gap-1.5 whitespace-nowrap text-xs">
                                  {i === 0 && c.phone1_whatsapp && <MessageCircle className="h-3 w-3 text-emerald-500" />}
                                  {p}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="px-3 py-2 hidden md:table-cell text-muted-foreground truncate max-w-[200px]">
                          {[c.city, c.neighborhood].filter(Boolean).join(" / ") || "—"}
                        </td>
                        {!isSellerView && <td className="px-3 py-2 truncate max-w-[160px]">{c.seller_name || "—"}</td>}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        {visible.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Mostrando {visible.length} cliente(s) · {totalPhones} telefone(s) disponível(is) para disparo.
          </p>
        )}
      </CardContent>
    </Card>
  );
}