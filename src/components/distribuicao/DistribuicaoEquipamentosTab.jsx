import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Wrench, Droplets, Layers, Tag } from "lucide-react";
import { exportClientDistributionEquipment } from "@/lib/excelExport";

const fmtDate = (d) => {
  if (!d) return "—";
  try {
    return new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("pt-BR");
  } catch {
    return String(d);
  }
};

function BarList({ items, max, emptyText }) {
  if (items.length === 0) {
    return <div className="text-sm text-muted-foreground text-center py-6">{emptyText}</div>;
  }
  return (
    <div className="space-y-2">
      {items.slice(0, 14).map(([name, count]) => (
        <div key={name} className="flex items-center gap-2">
          <div className="w-44 truncate text-xs" title={name}>{name}</div>
          <div className="flex-1 bg-muted rounded h-5 relative overflow-hidden">
            <div className="bg-primary h-5 rounded" style={{ width: `${(count / max) * 100}%` }} />
            <span className="absolute right-2 top-0 text-xs leading-5 font-medium">{count}</span>
          </div>
        </div>
      ))}
      {items.length > 14 && (
        <p className="text-xs text-muted-foreground pt-1">+ {items.length - 14} outro(s)</p>
      )}
    </div>
  );
}

export default function DistribuicaoEquipamentosTab({ scope, equipment, clientCodeMap, productMap }) {
  const [view, setView] = useState("equipamentos");

  const scopeIds = useMemo(() => new Set(scope.map((c) => c.id)), [scope]);

  const scopeEquip = useMemo(
    () =>
      equipment
        .filter(
          (e) =>
            (e.record_type || "equipamento") === "equipamento" &&
            e.status === "Ativo" &&
            !e.pending_link &&
            e.client_id &&
            scopeIds.has(e.client_id)
        )
        .map((e) => {
          const product = productMap?.get(e.product_id);
          return {
            ...e,
            group_name: product?.group_name || "",
            subgroup_name: product?.subgroup_name || "",
          };
        }),
    [equipment, scopeIds, productMap]
  );

  const byModel = useMemo(() => {
    const m = new Map();
    for (const e of scopeEquip) {
      const key = e.product_name || "Sem modelo";
      m.set(key, (m.get(key) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [scopeEquip]);

  const byGroup = useMemo(() => {
    const m = new Map();
    for (const e of scopeEquip) {
      const key = e.group_name || "Sem grupo";
      m.set(key, (m.get(key) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [scopeEquip]);

  const bySubgroup = useMemo(() => {
    const m = new Map();
    for (const e of scopeEquip) {
      const key = e.subgroup_name || "Sem subgrupo";
      m.set(key, (m.get(key) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [scopeEquip]);

  const byBrand = useMemo(() => {
    const normalizeBrand = (raw) => {
      const b = (raw || "").trim();
      if (!b) return "Sem marca";
      const up = b.toUpperCase();
      if (up === "ICE" || up === "ICEZON" || up.includes("ICEZON")) return "ICE/ICEZON";
      return b;
    };
    const m = new Map();
    for (const e of scopeEquip) {
      const key = normalizeBrand(e.brand);
      m.set(key, (m.get(key) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [scopeEquip]);

  const byRefill = useMemo(() => {
    const m = new Map();
    for (const e of scopeEquip) {
      const key = e.last_maintenance_part_name || "Sem refil cadastrado";
      m.set(key, (m.get(key) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [scopeEquip]);

  const clientsWithEquip = useMemo(() => new Set(scopeEquip.map((e) => e.client_id)), [scopeEquip]);

  const maxModel = Math.max(1, ...byModel.map((x) => x[1]));
  const maxRefill = Math.max(1, ...byRefill.map((x) => x[1]));
  const maxGroup = Math.max(1, ...byGroup.map((x) => x[1]));
  const maxSubgroup = Math.max(1, ...bySubgroup.map((x) => x[1]));
  const maxBrand = Math.max(1, ...byBrand.map((x) => x[1]));

  const handleExport = () => exportClientDistributionEquipment(scopeEquip, clientCodeMap);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Clientes no escopo</div>
            <div className="text-2xl font-bold">{scope.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Equipamentos ativos</div>
            <div className="text-2xl font-bold">{scopeEquip.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Clientes c/ equipamento</div>
            <div className="text-2xl font-bold">{clientsWithEquip.size}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Modelos distintos</div>
            <div className="text-2xl font-bold">{byModel.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setView("equipamentos")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border ${
              view === "equipamentos" ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-accent"
            }`}
          >
            <Wrench className="h-3.5 w-3.5" /> Por equipamento
          </button>
          <button
            onClick={() => setView("grupos")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border ${
              view === "grupos" ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-accent"
            }`}
          >
            <Layers className="h-3.5 w-3.5" /> Por grupo/subgrupo
          </button>
          <button
            onClick={() => setView("marcas")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border ${
              view === "marcas" ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-accent"
            }`}
          >
            <Tag className="h-3.5 w-3.5" /> Por marca
          </button>
          <button
            onClick={() => setView("refis")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border ${
              view === "refis" ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-accent"
            }`}
          >
            <Droplets className="h-3.5 w-3.5" /> Por refil
          </button>
        </div>
        <Button onClick={handleExport} disabled={scopeEquip.length === 0} className="gap-1">
          <Download className="h-4 w-4" /> Exportar Excel
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {view === "grupos" ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Layers className="h-4 w-4" /> Equipamentos por grupo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BarList items={byGroup} max={maxGroup} emptyText="Nenhum grupo cadastrado no escopo." />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Layers className="h-4 w-4" /> Equipamentos por subgrupo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BarList items={bySubgroup} max={maxSubgroup} emptyText="Nenhum subgrupo cadastrado no escopo." />
              </CardContent>
            </Card>
          </>
        ) : view === "marcas" ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Tag className="h-4 w-4" /> Equipamentos por marca
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BarList items={byBrand} max={maxBrand} emptyText="Nenhuma marca cadastrada no escopo." />
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Wrench className="h-4 w-4" /> Equipamentos por modelo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BarList items={byModel} max={maxModel} emptyText="Nenhum equipamento ativo no escopo." />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Droplets className="h-4 w-4" /> Refis necessários (previsão de produção)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BarList items={byRefill} max={maxRefill} emptyText="Nenhum refil cadastrado no escopo." />
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {scopeEquip.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Nenhum equipamento ativo entre os clientes do escopo.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Patrimônio</TableHead>
                  <TableHead>Equipamento</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Subgrupo</TableHead>
                  <TableHead>Refil</TableHead>
                  <TableHead>Última maint.</TableHead>
                  <TableHead>Próxima maint.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scopeEquip.slice(0, 200).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium text-sm">{e.client_name || "—"}</TableCell>
                    <TableCell className="font-mono text-sm">{clientCodeMap.get(e.client_id) || "—"}</TableCell>
                    <TableCell className="font-mono text-sm">{e.patrimony_code || e.code || "—"}</TableCell>
                    <TableCell className="text-sm">{e.product_name || "—"}</TableCell>
                    <TableCell className="text-sm">{e.model || "—"}</TableCell>
                    <TableCell className="text-sm">{e.group_name || "—"}</TableCell>
                    <TableCell className="text-sm">{e.subgroup_name || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {e.last_maintenance_part_name ? (
                        <Badge variant="secondary">{e.last_maintenance_part_name}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Sem refil</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{fmtDate(e.last_maintenance_date)}</TableCell>
                    <TableCell className="text-sm">{fmtDate(e.next_maintenance_date)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {scopeEquip.length > 200 && (
            <div className="p-3 text-xs text-muted-foreground text-center border-t">
              Mostrando 200 de {scopeEquip.length} equipamentos. Exporte o Excel para a lista completa.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}