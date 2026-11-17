import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Link2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—");

export default function UnlinkedMaintenanceSalesCard() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [linking, setLinking] = useState("");
  const [sales, setSales] = useState([]);
  const [scanned, setScanned] = useState(false);
  const [selectedEquip, setSelectedEquip] = useState({});

  const runScan = async () => {
    setRunning(true);
    setSales([]);
    setScanned(false);
    try {
      const res = await base44.functions.invoke("findUnlinkedMaintenanceSales", {});
      setSales(res.data.sales || []);
    } catch (e) {
      toast({ variant: "destructive", title: "Erro na vistoria", description: e.response?.data?.error || e.message });
    }
    setScanned(true);
    setRunning(false);
  };

  const linkOne = async (sale) => {
    const equipId = selectedEquip[sale.sale_id];
    if (!equipId) {
      toast({ variant: "destructive", title: "Selecione um equipamento" });
      return;
    }
    setLinking(sale.sale_id);
    try {
      await base44.functions.invoke("linkSaleToMaintenance", { sale_id: sale.sale_id, equipment_id: equipId });
      toast({ title: "Venda vinculada", description: `Pedido ${sale.order_number} vinculado e manutenção atualizada.` });
      setSales((prev) => prev.filter((s) => s.sale_id !== sale.sale_id));
      setSelectedEquip((prev) => { const n = { ...prev }; delete n[sale.sale_id]; return n; });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao vincular", description: e.response?.data?.error || e.message });
    }
    setLinking("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-amber-600" />
          Vistoria de Refis sem Vínculo de Manutenção
        </CardTitle>
        <CardDescription>
          Localiza vendas de cápsulas/elementos filtrantes lançadas diretamente no menu Vendas (sem vínculo
          ao Painel de Manutenção) para vincular cada uma ao equipamento do cliente e atualizar a próxima
          troca retroativamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={runScan} disabled={running} className="gap-2">
          <Search className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />
          {running ? "Vistoriando vendas..." : "Iniciar Vistoria"}
        </Button>

        {scanned && sales.length === 0 && !running && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Nenhuma venda de refil sem vínculo encontrada. Tudo em dia!
          </div>
        )}

        {sales.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {sales.length} venda(s) de refis sem vínculo. Selecione o equipamento de cada cliente e clique em Vincular.
            </p>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {sales.map((s) => (
                <div key={s.sale_id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{s.order_number || "—"}</span>
                      <span className="font-medium ml-2">{s.client_name}</span>
                      <Badge variant="outline" className="ml-2 text-xs">{s.stage}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Refil: <strong>{s.part_item?.product_name}</strong> ({s.part_item?.quantity}x) • {fmtDate(s.date)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-[240px]">
                      <label className="text-xs text-muted-foreground">Equipamento do cliente</label>
                      <Select
                        value={selectedEquip[s.sale_id] || ""}
                        onValueChange={(v) => setSelectedEquip((prev) => ({ ...prev, [s.sale_id]: v }))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder={s.equipamentos.length ? "Selecione o equipamento" : "Cliente sem equipamento ativo"} />
                        </SelectTrigger>
                        <SelectContent>
                          {s.equipamentos.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.patrimony_code} — {e.product_name || "Equipamento"} {e.next_maintenance_date && `(próx. ${fmtDate(e.next_maintenance_date)})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      disabled={!selectedEquip[s.sale_id] || linking === s.sale_id}
                      onClick={() => linkOne(s)}
                      className="gap-1"
                    >
                      <Link2 className="h-3 w-3" /> {linking === s.sale_id ? "Vinculando..." : "Vincular"}
                    </Button>
                  </div>
                  {s.equipamentos.length === 0 && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Este cliente não possui equipamento ativo cadastrado — cadastre o modelo na aba "Peças Pendentes" do Painel de Manutenção.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}