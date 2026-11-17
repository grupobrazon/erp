import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Play, Loader2, FileSpreadsheet, AlertTriangle, Download } from "lucide-react";

// Esperado: colunas "codigo" e "custo" (ou "Código" / "Custo"). Linhas com custo vazio são ignoradas.
export default function CostImportCard({ products = [] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [rows, setRows] = useState([]);

  const downloadTemplate = () => {
    const data = products.map(p => ({
      codigo: p.code || "",
      nome: p.name || "",
      grupo: p.group_name || "",
      subgrupo: p.subgroup_name || "",
      custo: "",
    }));
    const ws = XLSX.utils.json_to_sheet(data, { header: ["codigo", "nome", "grupo", "subgrupo", "custo"] });
    ws["!cols"] = [{ wch: 14 }, { wch: 40 }, { wch: 28 }, { wch: 28 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Custos");
    XLSX.writeFile(wb, "modelo_custos_produtos.xlsx");
    toast({ title: "Modelo baixado", description: `${data.length} produtos exportados. Preencha a coluna "custo" e reenvie.` });
  };

  const handleFile = async (file) => {
    setLoading(true);
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // Lê como matriz bruta (array de arrays) para localizar a linha de cabeçalho
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });
      const normKey = (k) => String(k || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const codigoAliases = ["codigo", "cod", "code", "codigo do produto", "cod produto"];
      const custoAliases = ["custo", "custo de aquisicao", "custo aquisicao", "preco de custo", "custo unitario", "valor custo", "valor"];
      // Encontra a linha que contém os cabeçalhos (código + custo)
      let headerIdx = -1, colCodigo = -1, colCusto = -1;
      for (let i = 0; i < matrix.length; i++) {
        const row = matrix[i];
        let cIdx = -1, cuIdx = -1;
        for (let c = 0; c < row.length; c++) {
          const k = normKey(row[c]);
          if (cIdx === -1 && codigoAliases.includes(k)) cIdx = c;
          if (cuIdx === -1 && custoAliases.includes(k)) cuIdx = c;
        }
        if (cIdx >= 0 && cuIdx >= 0) { headerIdx = i; colCodigo = cIdx; colCusto = cuIdx; break; }
      }
      let norm = [];
      if (headerIdx >= 0) {
        for (let i = headerIdx + 1; i < matrix.length; i++) {
          const row = matrix[i];
          const codigo = String(row[colCodigo] ?? "").trim();
          const custoRaw = String(row[colCusto] ?? "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
          const custo = Number(custoRaw) || 0;
          if (codigo && custo > 0) norm.push({ codigo, custo });
        }
      }
      setRows(norm);
      if (norm.length === 0) {
        const sample = matrix[0] ? matrix[0].map(c => String(c ?? "")).filter(Boolean).join(", ") || "(linha vazia)" : "(vazia)";
        toast({ title: "0 linhas válidas", description: `Cabeçalhos não encontrados. Primeira linha: ${sample}. Use o modelo baixado (codigo + custo).`, variant: "destructive" });
      } else {
        toast({ title: "Planilha lida", description: `${norm.length} linhas válidas prontas para importação.` });
      }
    } catch (e) {
      toast({ title: "Erro ao ler planilha", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const runImport = async () => {
    if (rows.length === 0) return;
    setLoading(true);
    setResult(null);
    try {
      const byCode = new Map(products.map(p => [String(p.code || "").trim(), p]));
      const matched = [];
      const notFound = [];
      for (const r of rows) {
        const p = byCode.get(r.codigo);
        if (p) matched.push({ id: p.id, code: r.codigo, name: p.name, oldCost: Number(p.cost) || 0, newCost: r.custo });
        else notFound.push(r.codigo);
      }
      if (!dryRun && matched.length > 0) {
        const updates = matched.map(m => ({ id: m.id, cost: m.newCost }));
        // bulkUpdate em lotes de 500
        for (let i = 0; i < updates.length; i += 500) {
          await base44.entities.Product.bulkUpdate(updates.slice(i, i + 500));
        }
        queryClient.invalidateQueries({ queryKey: ["products"] });
      }
      const summary = {
        total_rows: rows.length,
        matched: matched.length,
        not_found: notFound.length,
        updated: dryRun ? 0 : matched.length,
      };
      setResult({ summary, matched: matched.slice(0, 20), not_found: notFound.slice(0, 20) });
      toast({
        title: dryRun ? "Simulação concluída" : "Importação concluída",
        description: dryRun
          ? `${matched.length} produtos seriam atualizados.`
          : `${matched.length} produtos atualizados, ${notFound.length} não encontrados.`,
      });
    } catch (e) {
      toast({ title: "Erro na importação", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Atualização de Custos em Massa (Excel)
        </CardTitle>
        <CardDescription>
          Importe uma planilha (.xlsx/.csv) com as colunas <strong>codigo</strong> e <strong>custo</strong>.
          O custo é aplicado diretamente aos produtos correspondentes pelo código.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={e => e.target.files[0] && handleFile(e.target.files[0])}
            className="text-sm file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:cursor-pointer"
          />
          {rows.length > 0 && <Badge variant="secondary">{rows.length} linhas</Badge>}
          <Button type="button" variant="outline" size="sm" onClick={downloadTemplate} disabled={products.length === 0} className="gap-2 ml-auto">
            <Download className="h-4 w-4" /> Baixar Modelo
          </Button>
        </div>

        <div className="flex items-center gap-3 rounded-lg border p-3">
          <Switch id="dry-run-cost" checked={dryRun} onCheckedChange={setDryRun} />
          <Label htmlFor="dry-run-cost" className="flex-1 cursor-pointer">
            <span className="font-medium">Modo Simulação</span>
            <p className="text-xs text-muted-foreground">
              {dryRun ? "Apenas pré-visualiza — não altera os produtos." : "Aplica os custos de fato nos produtos."}
            </p>
          </Label>
          <Badge variant={dryRun ? "secondary" : "destructive"}>{dryRun ? "Simulação" : "Aplicar"}</Badge>
        </div>

        <Button onClick={runImport} disabled={loading || rows.length === 0} className="w-full">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</>
            : <><Play className="h-4 w-4" /> {dryRun ? "Simular Importação" : "Importar Custos"}</>}
        </Button>

        {result?.summary && (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-3">
              <Stat label="Linhas" value={result.summary.total_rows} />
              <Stat label="Encontrados" value={result.summary.matched} />
              <Stat label="Atualizados" value={result.summary.updated} highlight />
              <Stat label="Não encontrados" value={result.summary.not_found} />
            </div>
            {result.matched.length > 0 && (
              <div className="rounded-lg border p-3 max-h-48 overflow-y-auto">
                <p className="text-xs font-medium mb-2">Amostra de atualizações</p>
                <div className="space-y-1">
                  {result.matched.map((m, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="font-mono">{m.code}</span>
                      <span className="text-muted-foreground">{m.name?.slice(0, 30)}</span>
                      <span>R$ {(m.oldCost).toFixed(2)} → <strong>R$ {(m.newCost).toFixed(2)}</strong></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.not_found.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300/50 bg-amber-50 p-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <p className="font-medium text-amber-700">Códigos não encontrados:</p>
                  <p className="text-amber-600 mt-1 font-mono">{result.not_found.join(", ")}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "bg-primary/10 border-primary/30" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold mt-1">{value}</p>
    </div>
  );
}