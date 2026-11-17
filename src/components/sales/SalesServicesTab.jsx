import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Trash2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function SalesServicesTab({ form, setForm }) {
  const [serviceQty, setServiceQty] = useState("1");
  const [serviceSearch, setServiceSearch] = useState("");
  const [showResults, setShowResults] = useState(false);

  const { data: serviceCatalog = [] } = useQuery({
    queryKey: ["serviceCatalog"],
    queryFn: () => base44.entities.Service.list("-created_date", 500),
  });

  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const tokens = serviceSearch ? norm(serviceSearch).split(/\s+/).filter(Boolean) : [];
  const filtered = tokens.length
    ? serviceCatalog.filter(s => {
        const hay = `${norm(s.name)} ${norm(s.code)}`;
        return tokens.every(t => hay.includes(t));
      })
    : [];

  const addService = (serviceId) => {
    const svc = serviceCatalog.find(s => s.id === serviceId);
    if (!svc) return;
    const qty = parseFloat(serviceQty.replace(",", ".")) || 1;
    setForm(prev => ({
      ...prev,
      services: [...(prev.services || []), {
        service_id: svc.id, service_name: svc.name, code: svc.code || "",
        quantity: qty, unit_price: 0, total: 0,
      }],
    }));
    setServiceSearch(""); setServiceQty("1"); setShowResults(false);
  };

  const updateService = (index, field, value) => {
    setForm(prev => {
      const services = [...(prev.services || [])];
      services[index] = { ...services[index], [field]: value };
      if (field === "quantity" || field === "unit_price") {
        services[index].total = (services[index].quantity || 0) * (services[index].unit_price || 0);
      }
      return { ...prev, services };
    });
  };

  const removeService = (index) => setForm(prev => ({ ...prev, services: (prev.services || []).filter((_, i) => i !== index) }));

  const services = form.services || [];
  const totalServices = services.reduce((sum, s) => sum + (s.total || 0), 0);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 mb-4 relative">
          <div className="md:col-span-2">
            <Label className="text-xs">Quantidade</Label>
            <Input value={serviceQty} onChange={e => setServiceQty(e.target.value)} />
          </div>
          <div className="md:col-span-10 relative">
            <Label className="text-xs">Serviço / Código (LC 116)</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Digite o nome ou código do serviço..."
                value={serviceSearch}
                onChange={e => { setServiceSearch(e.target.value); setShowResults(true); }}
                onFocus={() => setShowResults(true)}
                className="pl-10"
              />
            </div>
            {showResults && serviceSearch && filtered.length === 0 && (
              <div className="absolute z-50 mt-1 w-full bg-popover border rounded-lg shadow-lg px-3 py-3 text-sm text-muted-foreground">
                Nenhum serviço encontrado para "<span className="text-foreground font-medium">{serviceSearch}</span>".
              </div>
            )}
            {showResults && filtered.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {filtered.map(s => (
                  <button key={s.id} type="button" onClick={() => addService(s.id)} className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-0">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{s.code} • ISS {(s.aliquot_iss || 0).toFixed(2)}%</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {services.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-8">#</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead className="w-24">Código</TableHead>
                <TableHead className="w-24">Qtd</TableHead>
                <TableHead className="w-32">Preço Unit.</TableHead>
                <TableHead className="w-32 text-right">Total</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s, i) => (
                <TableRow key={i}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{s.service_name}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{s.code}</TableCell>
                  <TableCell><Input type="number" className="h-8" value={s.quantity} onChange={e => updateService(i, "quantity", parseFloat(e.target.value) || 0)} /></TableCell>
                  <TableCell><Input type="number" step="0.01" className="h-8" value={s.unit_price} onChange={e => updateService(i, "unit_price", parseFloat(e.target.value) || 0)} /></TableCell>
                  <TableCell className="text-right font-medium">R$ {(s.total || 0).toFixed(2)}</TableCell>
                  <TableCell><Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeService(i)}><Trash2 className="h-3 w-3 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum serviço adicionado. Busque acima para adicionar.</p>
        )}

        <div className="flex justify-end mt-6 border-t pt-4">
          <div className="text-right">
            <Label className="text-xs">Total de Serviços</Label>
            <Input value={`R$ ${totalServices.toFixed(2)}`} disabled className="bg-muted font-bold w-40" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}