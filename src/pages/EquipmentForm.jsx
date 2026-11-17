import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import PageHeader from "@/components/ui/PageHeader";
import { ArrowLeft } from "lucide-react";
import { format, addMonths } from "date-fns";
import { createWithCode } from "@/lib/codeGeneration";

const defaultForm = { serial_number: "", client_id: "", address_id: "", product_id: "", brand: "", model: "", category: "", sale_date: "", installation_date: "", warranty_date: "", status: "Ativo", refill_type: "", maintenance_interval_months: 6 };

export default function EquipmentForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditing = !!id;
  const [form, setForm] = useState(defaultForm);

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => base44.entities.Client.list("-created_date", 500) });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => base44.entities.Product.list("-created_date", 200) });
  const { data: addresses = [] } = useQuery({ queryKey: ["addresses-for-client", form.client_id], queryFn: () => base44.entities.Address.filter({ client_id: form.client_id }), enabled: !!form.client_id });
  const { data: equipment } = useQuery({
    queryKey: ["equipment-item", id],
    queryFn: () => base44.entities.Equipment.filter({ id }),
    enabled: isEditing,
    select: (data) => data[0],
  });

  useEffect(() => {
    if (equipment) {
      setForm({
        ...defaultForm,
        ...equipment,
        maintenance_interval_months: equipment.maintenance_interval_months ?? defaultForm.maintenance_interval_months,
      });
    }
  }, [equipment]);

  const isEditable = !isEditing || !equipment || equipment.imported || !equipment.sale_id;

  const mutation = useMutation({
    mutationFn: async (data) => {
      const client = clients.find(c => c.id === data.client_id);
      const product = products.find(p => p.id === data.product_id);
      const addr = addresses.find(a => a.id === data.address_id);
      const intervalMonths = data.maintenance_interval_months || product?.maintenance_interval_months || 0;
      const baseDate = data.installation_date || data.sale_date;
      const nextMaintenance = intervalMonths && baseDate
        ? format(addMonths(new Date(baseDate), intervalMonths), "yyyy-MM-dd")
        : data.next_maintenance_date || null;
      const enriched = {
        ...data,
        client_name: client?.name || "",
        product_name: product?.name || "",
        address_label: addr?.label || "",
        brand: data.brand || product?.brand || "",
        model: data.model || product?.model || "",
        category: data.category || product?.category || "",
        maintenance_interval_months: intervalMonths,
        next_maintenance_date: nextMaintenance,
      };
      if (isEditing) return base44.entities.Equipment.update(id, enriched);
      return (await createWithCode("equipment", enriched)).record;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      navigate("/equipamentos");
    },
  });

  const handleProductChange = (productId) => {
    const product = products.find(p => p.id === productId);
    setForm(prev => ({
      ...prev,
      product_id: productId,
      brand: product?.brand || prev.brand,
      model: product?.model || prev.model,
      category: product?.category || prev.category,
      maintenance_interval_months: product?.maintenance_interval_months || prev.maintenance_interval_months,
    }));
  };

  const update = (f, v) => setForm(p => ({ ...p, [f]: v }));

  return (
    <div>
      <PageHeader
        title={isEditing ? "Editar Equipamento" : "Novo Equipamento"}
        description={isEditing ? "Atualize os dados do equipamento" : "Preencha os dados para cadastrar um novo equipamento"}
      >
        <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </PageHeader>

      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          {!isEditable && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 mb-4">
              ⚠️ Este equipamento foi gerado por uma venda e não pode ser editado diretamente. Para alterar dados do equipamento, cancele a venda ou registre uma manutenção.
            </div>
          )}
          <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cliente *</Label>
                <Select value={form.client_id} onValueChange={v => update("client_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Endereço</Label>
                <Select value={form.address_id} onValueChange={v => update("address_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{addresses.map(a => <SelectItem key={a.id} value={a.id}>{a.label || a.street}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Produto</Label>
                <Select value={form.product_id} onValueChange={handleProductChange}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Nº Série</Label><Input value={form.serial_number} onChange={e => update("serial_number", e.target.value)} /></div>
              <div><Label>Marca</Label><Input value={form.brand} onChange={e => update("brand", e.target.value)} /></div>
              <div><Label>Modelo</Label><Input value={form.model} onChange={e => update("model", e.target.value)} /></div>
              <div><Label>Data Venda</Label><Input type="date" value={form.sale_date} onChange={e => update("sale_date", e.target.value)} /></div>
              <div><Label>Data Instalação</Label><Input type="date" value={form.installation_date} onChange={e => update("installation_date", e.target.value)} /></div>
              <div><Label>Garantia até</Label><Input type="date" value={form.warranty_date} onChange={e => update("warranty_date", e.target.value)} /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => update("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Ativo", "Inativo", "Retirado", "Em manutenção", "Substituído"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Tipo de Refil</Label><Input value={form.refill_type} onChange={e => update("refill_type", e.target.value)} /></div>
              <div><Label>Intervalo Manutenção (meses)</Label><Input type="number" value={form.maintenance_interval_months} onChange={e => update("maintenance_interval_months", parseInt(e.target.value) || 0)} /></div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancelar</Button>
              <Button type="submit" disabled={mutation.isPending || !isEditable}>{mutation.isPending ? "Salvando..." : (isEditable ? "Salvar" : "Não editável")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}