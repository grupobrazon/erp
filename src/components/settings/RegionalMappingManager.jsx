import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Loader2, MapPin, Upload } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// Mapeamento padrão Grande SP (município → regional)
const DEFAULT_SP_MAPPINGS = [
  ["Guarulhos", "MET – Guarulhos"],
  ["Caieiras", "MET – Norte"],
  ["Cajamar", "MET – Norte"],
  ["Francisco Morato", "MET – Norte"],
  ["Franco da Rocha", "MET – Norte"],
  ["Mairiporã", "MET – Norte"],
  ["Osasco", "MET – Osasco"],
  ["Carapicuíba", "MET – Osasco"],
  ["Barueri", "MET – Barueri"],
  ["Santana de Parnaíba", "MET – Barueri"],
  ["Jandira", "MET – Barueri"],
  ["Itapevi", "MET – Barueri"],
  ["Pirapora do Bom Jesus", "MET – Barueri"],
  ["Cotia", "MET – Cotia/Taboão"],
  ["Taboão da Serra", "MET – Cotia/Taboão"],
  ["Embu das Artes", "MET – Cotia/Taboão"],
  ["Vargem Grande Paulista", "MET – Cotia/Taboão"],
  ["Itapecerica da Serra", "MET – Sudoeste"],
  ["Embu-Guaçu", "MET – Sudoeste"],
  ["Juquitiba", "MET – Sudoeste"],
  ["São Lourenço da Serra", "MET – Sudoeste"],
  ["Santo André", "MET – ABC"],
  ["São Bernardo do Campo", "MET – ABC"],
  ["São Caetano do Sul", "MET – ABC"],
  ["Diadema", "MET – ABC"],
  ["Mauá", "MET – Mauá/Ribeirão Pires"],
  ["Ribeirão Pires", "MET – Mauá/Ribeirão Pires"],
  ["Rio Grande da Serra", "MET – Mauá/Ribeirão Pires"],
  ["Arujá", "MET – Alto Tietê 1"],
  ["Itaquaquecetuba", "MET – Alto Tietê 1"],
  ["Poá", "MET – Alto Tietê 1"],
  ["Ferraz de Vasconcelos", "MET – Alto Tietê 1"],
  ["Suzano", "MET – Alto Tietê 1"],
  ["Mogi das Cruzes", "MET – Alto Tietê 2"],
  ["Guararema", "MET – Alto Tietê 2"],
  ["Biritiba-Mirim", "MET – Alto Tietê 2"],
  ["Salesópolis", "MET – Alto Tietê 2"],
  ["Santa Isabel", "MET – Alto Tietê 2"],
];

const REGIONAL_OPTIONS = [
  "SP – Centro", "SP – Oeste", "SP – Norte 1", "SP – Norte 2",
  "SP – Sul 1", "SP – Sul 2", "SP – Leste 1", "SP – Leste 2",
  "MET – Guarulhos", "MET – Norte", "MET – Osasco", "MET – Barueri",
  "MET – Cotia/Taboão", "MET – Sudoeste", "MET – ABC",
  "MET – Mauá/Ribeirão Pires", "MET – Alto Tietê 1", "MET – Alto Tietê 2",
];

export default function RegionalMappingManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [municipality, setMunicipality] = useState("");
  const [state, setState] = useState("SP");
  const [regional, setRegional] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(false);

  const { data: mappings = [], isLoading } = useQuery({
    queryKey: ["regionalMappings"],
    queryFn: () => base44.entities.RegionalMapping.list("-created_date", 500),
  });

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!municipality.trim() || !regional) {
      toast({ title: "Preencha município e regional", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await base44.entities.RegionalMapping.create({
        municipality: municipality.trim(),
        state: state.trim() || "SP",
        regional,
      });
      setMunicipality("");
      setRegional("");
      queryClient.invalidateQueries({ queryKey: ["regionalMappings"] });
      toast({ title: "Mapeamento adicionado" });
    } catch (err) {
      toast({ title: "Erro ao adicionar", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await base44.entities.RegionalMapping.delete(id);
      queryClient.invalidateQueries({ queryKey: ["regionalMappings"] });
      toast({ title: "Mapeamento removido" });
    } catch (err) {
      toast({ title: "Erro ao remover", description: err?.message, variant: "destructive" });
    }
  };

  const handleLoadDefaults = async () => {
    setLoadingDefaults(true);
    try {
      const existing = new Set(mappings.map((m) => m.municipality.toLowerCase().trim()));
      const toCreate = DEFAULT_SP_MAPPINGS
        .filter(([mun]) => !existing.has(mun.toLowerCase().trim()))
        .map(([mun, reg]) => ({ municipality: mun, state: "SP", regional: reg }));
      if (toCreate.length === 0) {
        toast({ title: "Mapeamento padrão já carregado", description: "Nenhum município novo para adicionar." });
      } else {
        await base44.entities.RegionalMapping.bulkCreate(toCreate);
        queryClient.invalidateQueries({ queryKey: ["regionalMappings"] });
        toast({ title: "Mapeamento padrão carregado", description: `${toCreate.length} município(s) adicionado(s).` });
      }
    } catch (err) {
      toast({ title: "Erro ao carregar padrão", description: err?.message, variant: "destructive" });
    } finally {
      setLoadingDefaults(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Parametrização de Regionais — Grande SP
          </CardTitle>
          <Button variant="outline" size="sm" onClick={handleLoadDefaults} disabled={loadingDefaults} className="gap-1.5">
            {loadingDefaults ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Carregar padrão Grande SP
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-[1fr_80px_1fr_auto] gap-2 items-end">
          <div>
            <Label>Município</Label>
            <Input value={municipality} onChange={(e) => setMunicipality(e.target.value)} placeholder="Ex: Guarulhos" />
          </div>
          <div>
            <Label>UF</Label>
            <Input value={state} onChange={(e) => setState(e.target.value)} maxLength={2} />
          </div>
          <div>
            <Label>Regional</Label>
            <Select value={regional} onValueChange={setRegional}>
              <SelectTrigger><span className={!regional ? "text-muted-foreground" : ""}>{regional || "Selecione..."}</span></SelectTrigger>
              <SelectContent>
                {REGIONAL_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adicionar
          </Button>
        </form>

        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : mappings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum mapeamento cadastrado. Clique em "Carregar padrão Grande SP" para preencher os 38 municípios da especificação.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Município</TableHead>
                <TableHead>UF</TableHead>
                <TableHead>Regional</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.municipality}</TableCell>
                  <TableCell>{m.state}</TableCell>
                  <TableCell>{m.regional}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(m.id)} className="h-8 w-8 text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground">
          Municípios da Grande SP são categorizados diretamente por esta tabela. Para o município de São Paulo (capital), a Regional é identificada pelo bairro (8 regionais da capital). Endereços fora das áreas cobertas recebem "NÃO PARAMETRIZADA".
        </p>
      </CardContent>
    </Card>
  );
}