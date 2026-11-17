import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PageHeader from "@/components/ui/PageHeader";
import { ArrowLeft } from "lucide-react";
import { createProductWithCode } from "@/lib/codeGeneration";

const defaultForm = {
  code: "", name: "", short_description: "", brand: "",
  group_id: "", group_name: "", subgroup_id: "", subgroup_name: "",
  unit: "", supply_source: "", product_type: "", ncm: "", weight: "", width: "", length: "", depth: "", volume: "", packaging: "",
  origin: "Nacional", cost: 0, sale_price: 0, current_stock: 0, min_stock: 0,
  maintenance_role: "Nenhum", generates_maintenance: false, is_maintenance_part: false,
  maintenance_type: "Tempo", maintenance_interval_months: 6, maintenance_interval_liters: 0,
};

const MAINTENANCE_KEYWORDS = ["filtro", "purificador", "cápsula", "capsula", "bebedouro"];

export default function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditing = !!id;
  const [form, setForm] = useState(defaultForm);
  const [saveError, setSaveError] = useState("");

  const { data: product } = useQuery({
    queryKey: ["product", id],
    queryFn: () => base44.entities.Product.filter({ id }),
    enabled: isEditing,
    select: (data) => data[0],
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["productGroups"],
    queryFn: () => base44.entities.ProductGroup.list("-created_date", 200),
  });

  const { data: subgroups = [] } = useQuery({
    queryKey: ["productSubgroups"],
    queryFn: () => base44.entities.ProductSubgroup.list("-created_date", 500),
  });

  const { data: stockUnits = [] } = useQuery({
    queryKey: ["stockUnits"],
    queryFn: () => base44.entities.StockUnit.list("-created_date", 200),
  });

  const { data: supplySources = [] } = useQuery({
    queryKey: ["supplySources"],
    queryFn: () => base44.entities.SupplySource.list("-created_date", 200),
  });

  const { data: productTypeOptions = [] } = useQuery({
    queryKey: ["productTypeOptions"],
    queryFn: () => base44.entities.ProductTypeOption.list("-created_date", 200),
  });

  useEffect(() => {
    if (product) setForm({
      ...defaultForm,
      ...product,
      generates_maintenance: product.maintenance_role === "Gera Patrimônio",
      is_maintenance_part: product.maintenance_role === "Peça de Manutenção",
    });
  }, [product]);

  const update = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const requiresMaintenance = MAINTENANCE_KEYWORDS.some(k => (form.group_name || "").toLowerCase().includes(k));

  const filteredSubgroups = subgroups.filter(s => s.group_id === form.group_id);
  const displaySubgroups = form.subgroup_id && !filteredSubgroups.find(s => s.id === form.subgroup_id)
    ? [...filteredSubgroups, subgroups.find(s => s.id === form.subgroup_id)].filter(Boolean)
    : filteredSubgroups;

  const handleGroupChange = (groupId) => {
    setForm(prev => {
      if (prev.group_id === groupId) return prev;
      const group = groups.find(g => g.id === groupId);
      return {
        ...prev,
        group_id: groupId,
        group_name: group?.name || "",
        subgroup_id: "",
        subgroup_name: "",
        code: isEditing ? prev.code : "",
        weight: prev.weight || group?.weight || "",
        width: prev.width || group?.width || "",
        length: prev.length || group?.length || "",
        depth: prev.depth || group?.height || "",
      };
    });
  };

  const handleSubgroupChange = (subgroupId) => {
    const subgroup = subgroups.find(s => s.id === subgroupId);
    setForm(prev => ({ ...prev, subgroup_id: subgroupId, subgroup_name: subgroup?.name || "" }));
  };

  const mutation = useMutation({
    mutationFn: async (rawData) => {
      const data = { ...rawData };
      // Campos numéricos opcionais (dimensões) não podem ir como string vazia — falha na validação do backend
      ["weight", "width", "length", "depth", "volume"].forEach(f => {
        if (data[f] === "" || data[f] === null || data[f] === undefined) delete data[f];
      });
      if (isEditing) return base44.entities.Product.update(id, data);
      const group = groups.find(g => g.id === data.group_id);
      return (await createProductWithCode(data, group)).record;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      navigate("/produtos");
    },
    onError: (err) => {
      setSaveError(err?.message || "Erro ao salvar o produto. Tente novamente.");
    },
  });

  return (
    <div>
      <PageHeader
        title={isEditing ? "Editar Produto" : "Novo Produto"}
        description={isEditing ? "Atualize os dados do produto" : "Preencha os dados para cadastrar um novo produto"}
      >
        <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </PageHeader>

      <form onSubmit={e => {
        e.preventDefault();
        if (!form.group_id) { setSaveError("Selecione o grupo do produto — o código é gerado automaticamente a partir do prefixo do grupo."); return; }
        if (requiresMaintenance) {
          if (form.maintenance_role === "Nenhum") { setSaveError("Este grupo exige definir o papel de manutenção (Gera Patrimônio ou Peça de Manutenção)."); return; }
          const interval = form.maintenance_type === "Tempo" ? form.maintenance_interval_months : form.maintenance_interval_liters;
          if (!interval || interval <= 0) { setSaveError("Informe o prazo/intervalo de manutenção do equipamento."); return; }
        }
        setSaveError("");
        mutation.mutate(form);
      }} className="space-y-6 max-w-4xl">

        {saveError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{saveError}</div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Identificação</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label>Grupo <span className="text-destructive">*</span></Label>
              <Select value={form.group_id} onValueChange={handleGroupChange}>
                <SelectTrigger>
                  <span className={(!form.group_id ? "text-muted-foreground" : "")}>
                    {form.group_id ? (form.group_name || groups.find(g => g.id === form.group_id)?.name || "Selecione o grupo...") : "Selecione o grupo..."}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subgrupo</Label>
              <select
                value={form.subgroup_id || ""}
                onChange={e => handleSubgroupChange(e.target.value)}
                disabled={!form.group_id}
                className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Selecione o subgrupo...</option>
                {displaySubgroups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Código</Label>
              <Input value={form.code || "Gerado automaticamente"} disabled={!isEditing} className="font-mono bg-muted" />
            </div>
            <div className="col-span-2">
              <Label>Descrição *</Label>
              <Input value={form.name} onChange={e => update("name", e.target.value)} required />
            </div>
            <div>
              <Label>Descrição Curta</Label>
              <Input value={form.short_description} onChange={e => update("short_description", e.target.value)} placeholder="Abreviação" />
            </div>
            <div>
              <Label>Unidade de Estoque</Label>
              <Select value={form.unit} onValueChange={v => update("unit", v)}>
                <SelectTrigger>
                  <span className={(!form.unit ? "text-muted-foreground" : "")}>
                    {form.unit || "Selecione..."}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {stockUnits.map(u => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Marca</Label>
              <Input value={form.brand} onChange={e => update("brand", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Fornecimento e Tipo</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label>Fonte de Fornecimento</Label>
              <Select value={form.supply_source} onValueChange={v => update("supply_source", v)}>
                <SelectTrigger>
                  <span className={(!form.supply_source ? "text-muted-foreground" : "")}>
                    {form.supply_source || "Selecione..."}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {supplySources.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de Produto</Label>
              <Select value={form.product_type} onValueChange={v => update("product_type", v)}>
                <SelectTrigger>
                  <span className={(!form.product_type ? "text-muted-foreground" : "")}>
                    {form.product_type || "Selecione..."}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {productTypeOptions.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Origem</Label>
              <Select value={form.origin} onValueChange={v => update("origin", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Nacional">Nacional</SelectItem>
                  <SelectItem value="Importado">Importado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Parâmetros Fiscais e Transporte</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label>NCM</Label>
                <Input value={form.ncm} onChange={e => update("ncm", e.target.value)} placeholder="Classificação Fiscal" />
              </div>
              <div>
                <Label>Embalagem</Label>
                <Input value={form.packaging} onChange={e => update("packaging", e.target.value)} />
              </div>
            </div>
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase">Dimensões para Frete (Melhor Envio)</h4>
                {form.group_id && (() => {
                  const g = groups.find(x => x.id === form.group_id);
                  if (!g || (!g.height && !g.width && !g.length && !g.weight)) return null;
                  return <span className="text-xs text-muted-foreground">Padrão do grupo: {g.height || "—"}×{g.width || "—"}×{g.length || "—"}cm, {g.weight || "—"}kg</span>;
                })()}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label>Altura (cm)</Label>
                  <Input type="number" step="0.01" value={form.depth} onChange={e => update("depth", parseFloat(e.target.value) || "")} placeholder={form.group_id ? (groups.find(g => g.id === form.group_id)?.height || "0") : "0"} />
                </div>
                <div>
                  <Label>Largura (cm)</Label>
                  <Input type="number" step="0.01" value={form.width} onChange={e => update("width", parseFloat(e.target.value) || "")} placeholder={form.group_id ? (groups.find(g => g.id === form.group_id)?.width || "0") : "0"} />
                </div>
                <div>
                  <Label>Comprimento (cm)</Label>
                  <Input type="number" step="0.01" value={form.length} onChange={e => update("length", parseFloat(e.target.value) || "")} placeholder={form.group_id ? (groups.find(g => g.id === form.group_id)?.length || "0") : "0"} />
                </div>
                <div>
                  <Label>Peso (kg)</Label>
                  <Input type="number" step="0.01" value={form.weight} onChange={e => update("weight", parseFloat(e.target.value) || "")} placeholder={form.group_id ? (groups.find(g => g.id === form.group_id)?.weight || "0") : "0"} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Preenchido automaticamente pelo grupo. Edite apenas se este produto tiver dimensões diferentes.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Custo e Estoque</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><Label>Custo (R$)</Label><Input type="number" step="0.01" value={form.cost} onChange={e => update("cost", parseFloat(e.target.value) || 0)} /></div>
            <div><Label>Preço Venda (R$)</Label><Input type="number" step="0.01" value={form.sale_price} onChange={e => update("sale_price", parseFloat(e.target.value) || 0)} /></div>
            <div><Label>Estoque Atual</Label><Input type="number" value={form.current_stock} onChange={e => update("current_stock", parseInt(e.target.value) || 0)} /></div>
            <div><Label>Estoque Mínimo</Label><Input type="number" value={form.min_stock} onChange={e => update("min_stock", parseInt(e.target.value) || 0)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Gestão de Manutenção</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {requiresMaintenance && (
              <div className="rounded-md border border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                Este grupo (equipamento) exige manutenção — é obrigatório definir o papel de manutenção e o prazo/intervalo.
              </div>
            )}
            <div>
              <Label>Papel na Manutenção {requiresMaintenance && <span className="text-destructive">*</span>}</Label>
              <Select
                value={form.maintenance_role}
                onValueChange={v => setForm(prev => ({
                  ...prev,
                  maintenance_role: v,
                  generates_maintenance: v === "Gera Patrimônio",
                  is_maintenance_part: v === "Peça de Manutenção",
                }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Nenhum">Nenhum</SelectItem>
                  <SelectItem value="Gera Patrimônio">Gera Patrimônio (ex: equipamentos vendidos)</SelectItem>
                  <SelectItem value="Peça de Manutenção">Peça de Manutenção (item trocado periodicamente)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.maintenance_role !== "Nenhum" && (
              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.maintenance_type} onValueChange={v => update("maintenance_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Tempo">Por Tempo</SelectItem>
                      <SelectItem value="Litros">Por Litros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.maintenance_type === "Tempo" ? (
                  <div><Label>Intervalo (meses)</Label><Input type="number" value={form.maintenance_interval_months} onChange={e => update("maintenance_interval_months", parseInt(e.target.value) || 0)} /></div>
                ) : (
                  <div><Label>Intervalo (litros)</Label><Input type="number" value={form.maintenance_interval_liters} onChange={e => update("maintenance_interval_liters", parseInt(e.target.value) || 0)} /></div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pb-8">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancelar</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Salvando..." : "Salvar"}</Button>
        </div>
      </form>
    </div>
  );
}