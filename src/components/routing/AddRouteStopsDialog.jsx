import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { Plus, AlertTriangle, Search } from "lucide-react";

// Adiciona novos atendimentos a uma rota existente (inclusive Em Andamento).
// Somente inclusão: não existe nenhuma ação de remoção nesta tela.
export default function AddRouteStopsDialog({ open, onOpenChange, route, availableOrders = [], saleMap = {}, onDone }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const toggle = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // Busca por código da OS ou nome do cliente
  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return availableOrders;
    return availableOrders.filter(o =>
      (o.code || "").toLowerCase().includes(term) ||
      (o.client_name || "").toLowerCase().includes(term)
    );
  }, [availableOrders, search]);

  const handleAdd = async () => {
    setSaving(true);
    try {
      const res = await base44.functions.invoke("addStopsToRoute", {
        route_id: route.id,
        os_ids: selected,
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast({
        title: "Atendimentos adicionados",
        description: `${res.data?.added || 0} atendimento(s) incluído(s) na rota ${route.code}.`,
      });
      setSelected([]);
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      toast({ title: "Erro ao adicionar", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setSelected([]); setSearch(""); } onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-emerald-600" /> Adicionar Atendimentos — {route?.code}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3">
            <p className="text-xs text-emerald-900">
              Apenas novos atendimentos serão incluídos no fim da rota ({route?.status}).
              Nenhuma parada existente é removida ou alterada.
            </p>
          </div>

          {availableOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum atendimento disponível para adicionar. Somente OS já enviadas para rota (Rota Enviada, Agendamento/Rota ou Aguardando Rota) e ainda sem rota aparecem aqui.
            </p>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por OS ou cliente..."
                  className="pl-8 h-9"
                />
              </div>

              {filteredOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhum atendimento encontrado para "{search}".
                </p>
              ) : (
                <div className="border rounded-lg max-h-72 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-8"></TableHead>
                        <TableHead className="w-20">OS</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Região</TableHead>
                        <TableHead>Tipo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map(o => (
                        <TableRow key={o.id} className={selected.includes(o.id) ? "bg-primary/5" : ""}>
                          <TableCell>
                            <Checkbox checked={selected.includes(o.id)} onCheckedChange={() => toggle(o.id)} />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{o.code}</TableCell>
                          <TableCell className="font-medium text-sm">{o.client_name}</TableCell>
                          <TableCell className="text-xs">{o.route_region_name || "—"}</TableCell>
                          <TableCell className="text-xs">{o.type}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}

          {route?.checkin_at && !route?.checkout_at && selected.length > 0 && (
            <p className="text-xs text-amber-700 flex items-start gap-1">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Esta rota já foi iniciada pelo técnico. Os novos atendimentos entram no fim da lista e o app do técnico
              mostra a atualização na próxima sincronização.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleAdd} disabled={saving || selected.length === 0}>
            {saving ? "Adicionando..." : `Adicionar ${selected.length} atendimento(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}