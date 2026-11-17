import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { format, addMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/ui/PageHeader";
import LegacySalesImportCard from "@/components/settings/LegacySalesImportCard";

const CLIENT_FIELDS = [
  { key: "old_code", label: "Código Antigo", example: "8" },
  { key: "base_type", label: "Base (Lsoft/Ótimo/Novo)", example: "Lsoft" },
  { key: "person_type", label: "Tipo de Pessoa (Física/Jurídica)", example: "Física" },
  { key: "client_type", label: "Tipo de Cliente (Consumidor Final/Revenda)", example: "" },
  { key: "name", label: "Nome / Razão Social", example: "João da Silva" },
  { key: "fantasy_name", label: "Nome Fantasia", example: "" },
  { key: "document", label: "CPF/CNPJ", example: "000.000.000-00" },
  { key: "state_registration", label: "Inscrição Estadual", example: "" },
  { key: "email", label: "E-mail", example: "joao@email.com" },
  { key: "birth_date", label: "Data de Nascimento (AAAA-MM-DD)", example: "" },
  { key: "phone1", label: "Telefone 1", example: "(31) 99999-0001" },
  { key: "phone1_name", label: "Nome Contato Telefone 1", example: "" },
  { key: "phone1_whatsapp", label: "WhatsApp Telefone 1 (Sim/Não)", example: "Sim" },
  { key: "phone2", label: "Telefone 2", example: "" },
  { key: "phone2_name", label: "Nome Contato Telefone 2", example: "" },
  { key: "phone2_whatsapp", label: "WhatsApp Telefone 2 (Sim/Não)", example: "" },
  { key: "phone3", label: "Telefone 3", example: "" },
  { key: "phone3_name", label: "Nome Contato Telefone 3", example: "" },
  { key: "phone3_whatsapp", label: "WhatsApp Telefone 3 (Sim/Não)", example: "" },
  { key: "phone4", label: "Telefone 4", example: "" },
  { key: "phone4_name", label: "Nome Contato Telefone 4", example: "" },
  { key: "phone4_whatsapp", label: "WhatsApp Telefone 4 (Sim/Não)", example: "" },
  { key: "phone5", label: "Telefone 5", example: "" },
  { key: "phone5_name", label: "Nome Contato Telefone 5", example: "" },
  { key: "phone5_whatsapp", label: "WhatsApp Telefone 5 (Sim/Não)", example: "" },
  { key: "zoox_phone1", label: "Telefone Zoox 1", example: "" },
  { key: "zoox_phone2", label: "Telefone Zoox 2", example: "" },
  { key: "zoox_phone3", label: "Telefone Zoox 3", example: "" },
  { key: "zoox_phone4", label: "Telefone Zoox 4", example: "" },
  { key: "zoox_phone5", label: "Telefone Zoox 5", example: "" },
  { key: "zoox_phone6", label: "Telefone Zoox 6", example: "" },
  { key: "zoox_phone7", label: "Telefone Zoox 7", example: "" },
  { key: "zip_code", label: "CEP", example: "" },
  { key: "street", label: "Logradouro", example: "" },
  { key: "number", label: "Número", example: "" },
  { key: "complement", label: "Complemento", example: "" },
  { key: "neighborhood", label: "Bairro", example: "" },
  { key: "city", label: "Cidade", example: "" },
  { key: "state", label: "UF", example: "" },
  { key: "status", label: "Status/Lista (Ótimo/Lsoft/Novo)", example: "Ótimo" },
  { key: "last_purchase_date", label: "Data Última Compra (Ex: out/23)", example: "out/23" },
  { key: "last_product", label: "Último Produto", example: "" },
  { key: "notes", label: "Observações", example: "" },
];

const NUMERIC_PRODUCT_KEYS = ["weight", "width", "length", "depth", "volume", "cost", "sale_price", "current_stock", "min_stock", "maintenance_interval_months", "maintenance_interval_liters"];

const PRODUCT_FIELDS = [
  { key: "group_name", label: "Grupo", example: "Purificador de Água Gelada" },
  { key: "subgroup_name", label: "Subgrupo", example: "iPure" },
  { key: "name", label: "Descrição", example: "Purificador de Água Gelada iPure" },
  { key: "short_description", label: "Descrição Curta", example: "" },
  { key: "brand", label: "Marca", example: "" },
  { key: "unit", label: "Unidade de Estoque", example: "Unidade" },
  { key: "supply_source", label: "Fonte de Fornecimento", example: "" },
  { key: "product_type", label: "Tipo de Produto", example: "" },
  { key: "origin", label: "Origem (Nacional/Importado)", example: "Nacional" },
  { key: "ncm", label: "NCM", example: "" },
  { key: "weight", label: "Peso (kg)", example: "", isNumber: true },
  { key: "width", label: "Largura (cm)", example: "", isNumber: true },
  { key: "length", label: "Comprimento (cm)", example: "", isNumber: true },
  { key: "depth", label: "Profundidade (cm)", example: "", isNumber: true },
  { key: "volume", label: "Volume (m³)", example: "", isNumber: true },
  { key: "packaging", label: "Embalagem", example: "" },
  { key: "cost", label: "Custo (R$)", example: "", isNumber: true },
  { key: "sale_price", label: "Preço de Venda (R$)", example: "", isNumber: true },
  { key: "current_stock", label: "Estoque Atual", example: "", isNumber: true },
  { key: "min_stock", label: "Estoque Mínimo", example: "", isNumber: true },
  { key: "maintenance_role", label: "Papel na Manutenção (Nenhum/Gera Patrimônio/Peça de Manutenção)", example: "Nenhum" },
  { key: "maintenance_type", label: "Tipo de Manutenção (Tempo/Litros)", example: "" },
  { key: "maintenance_interval_months", label: "Intervalo de Manutenção (meses)", example: "", isNumber: true },
  { key: "maintenance_interval_liters", label: "Intervalo de Manutenção (litros)", example: "", isNumber: true },
];

const EQUIPMENT_FIELDS = [
  { key: "product_name", label: "Produto" },
  { key: "brand", label: "Marca" },
  { key: "model", label: "Modelo" },
  { key: "serial_number", label: "Número de Série" },
  { key: "client_name", label: "Cliente" },
  { key: "installation_date", label: "Data de Instalação" },
  { key: "last_maintenance_date", label: "Última Manutenção" },
];

const BATCH_SIZE = 1000;
const TEMPLATE_BLANK_ROWS = 300;

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Reads an uploaded .xlsx or .csv file locally (no AI) and maps columns to entity fields by header label.
async function parseSpreadsheetFile(file, fieldDefs) {
  const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
  let workbook;
  if (isCsv) {
    const text = await file.text();
    workbook = XLSX.read(text, { type: "string" });
  } else {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: "array" });
  }
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rows.length === 0) return [];

  const headerRow = rows[0].map(h => String(h).trim().toLowerCase());
  const keyForCol = headerRow.map(h => {
    if (!h) return null;
    // 1) exact (case-insensitive) match
    let match = fieldDefs.find(f => f.label.toLowerCase() === h || f.key.toLowerCase() === h);
    if (match) return match.key;
    // 2) header contains the field key or label (e.g. "Grupo Produto" → group_name)
    match = fieldDefs.find(f => {
      const k = f.key.toLowerCase();
      const l = f.label.toLowerCase();
      return (k.length >= 4 && h.includes(k)) || (l.length >= 4 && h.includes(l));
    });
    if (match) return match.key;
    // 3) match by text before first parenthesis (e.g. "Peso (kg+K:S)" → "peso" → weight)
    match = fieldDefs.find(f => {
      const prefix = f.label.toLowerCase().split("(")[0].trim();
      return prefix.length >= 4 && h.startsWith(prefix);
    });
    return match?.key || null;
  });
  const numberKeys = new Set(fieldDefs.filter(f => f.isNumber).map(f => f.key));

  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => c === "" || c === undefined || c === null)) continue;
    const record = {};
    keyForCol.forEach((key, idx) => {
      if (!key) return;
      let val = row[idx];
      if (val === undefined || val === null) val = "";
      if (numberKeys.has(key)) {
        if (val === "") return;
        const parsed = parseFloat(String(val).replace(",", "."));
        if (!Number.isNaN(parsed)) record[key] = parsed;
      } else {
        const strVal = String(val).trim();
        if (strVal !== "") record[key] = strVal;
      }
    });
    if (Object.keys(record).length > 0) records.push(record);
  }
  return records;
}

export default function Import() {
  const [file, setFile] = useState(null);
  const [entityType, setEntityType] = useState("Client");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);

  const handleDownloadTemplate = () => {
    if (entityType === "Product") return handleDownloadProductTemplate();

    const headerRow = CLIENT_FIELDS.map(f => f.label).join(";");
    const exampleRow = CLIENT_FIELDS.map(f => f.example).join(";");
    const csvContent = "\uFEFF" + headerRow + "\n" + exampleRow;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "modelo_importacao_clientes.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadProductTemplate = async () => {
    const [groups, subgroups, stockUnits, supplySources, productTypeOptions] = await Promise.all([
      base44.entities.ProductGroup.list("-created_date", 200),
      base44.entities.ProductSubgroup.list("-created_date", 500),
      base44.entities.StockUnit.list("-created_date", 200),
      base44.entities.SupplySource.list("-created_date", 200),
      base44.entities.ProductTypeOption.list("-created_date", 200),
    ]);

    const header = PRODUCT_FIELDS.map(f => f.label);
    const blankRows = Array.from({ length: TEMPLATE_BLANK_ROWS }, () => PRODUCT_FIELDS.map(() => ""));
    const productsSheet = XLSX.utils.aoa_to_sheet([header, ...blankRows]);

    const clean = (s) => String(s || "").trim();
    const optionColumns = [
      { label: "Grupo", values: groups.map(g => clean(g.name)) },
      { label: "Subgrupo", values: subgroups.map(s => clean(s.name)) },
      { label: "Unidade de Estoque", values: stockUnits.map(u => clean(u.name)) },
      { label: "Fonte de Fornecimento", values: supplySources.map(s => clean(s.name)) },
      { label: "Tipo de Produto", values: productTypeOptions.map(t => clean(t.name)) },
      { label: "Origem", values: ["Nacional", "Importado"] },
      { label: "Papel na Manutenção", values: ["Nenhum", "Gera Patrimônio", "Peça de Manutenção"] },
      { label: "Tipo de Manutenção", values: ["Tempo", "Litros"] },
    ];
    const maxLen = Math.max(...optionColumns.map(c => c.values.length));
    const optionsAoa = [
      optionColumns.map(c => c.label),
      ...Array.from({ length: maxLen }, (_, i) => optionColumns.map(c => c.values[i] || "")),
    ];
    const optionsSheet = XLSX.utils.aoa_to_sheet(optionsAoa);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, productsSheet, "Produtos");
    XLSX.utils.book_append_sheet(wb, optionsSheet, "Opções Válidas");
    XLSX.writeFile(wb, "modelo_importacao_produtos.xlsx");
  };

  // Product and Equipment templates have known headers, so we parse them locally (fast, no AI, exact counts).
  const handleUploadProductOrEquipment = async () => {
    const fieldDefs = entityType === "Product" ? PRODUCT_FIELDS : EQUIPMENT_FIELDS;
    const records = await parseSpreadsheetFile(file, fieldDefs);

    if (records.length === 0) {
      setStatus({ success: false, count: 0, error: "Nenhum registro encontrado. Verifique se os cabeçalhos da planilha correspondem ao modelo." });
      setLoading(false);
      return;
    }

    let successCount = 0;
    let skippedCount = 0;
    let noGroupCount = 0;
    let unmatchedGroups = new Set();
    let errorMsg = null;

    if (entityType === "Product") {
      const [groups, subgroups] = await Promise.all([
        base44.entities.ProductGroup.list("-created_date", 200),
        base44.entities.ProductSubgroup.list("-created_date", 500),
      ]);
      const existingProducts = await base44.entities.Product.list("-created_date", 2000);
      const groupProductCounts = existingProducts.reduce((acc, p) => {
        if (p.group_id) acc[p.group_id] = (acc[p.group_id] || 0) + 1;
        return acc;
      }, {});

      const normalize = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
      const findGroup = (groupName) => {
        const target = normalize(groupName);
        if (!target) return null;
        let g = groups.find(g => normalize(g.name) === target);
        if (g) return g;
        g = groups.find(g => {
          const n = normalize(g.name);
          return n && (target.includes(n) || n.includes(target));
        });
        return g || null;
      };
      const findSubgroup = (subgroupName, groupId) => {
        const target = normalize(subgroupName);
        if (!target) return null;
        let s = subgroups.find(s => s.group_id === groupId && normalize(s.name) === target);
        if (s) return s;
        s = subgroups.find(s => s.group_id === groupId && normalize(s.name).includes(target));
        if (s) return s;
        s = subgroups.find(s => normalize(s.name) === target);
        return s || null;
      };

      const toCreate = [];
      for (const record of records) {
        if (!record.name) {
          skippedCount++;
          continue;
        }
        const group = findGroup(record.group_name);
        const subgroup = group ? findSubgroup(record.subgroup_name, group.id) : null;
        let code = "";
        if (group) {
          groupProductCounts[group.id] = (groupProductCounts[group.id] || 0) + 1;
          code = `${group.prefix}${String(groupProductCounts[group.id]).padStart(3, "0")}`;
        } else if (record.group_name) {
          unmatchedGroups.add(record.group_name);
        } else {
          noGroupCount++;
        }
        toCreate.push({
          ...record,
          group_id: group?.id || "",
          group_name: group?.name || record.group_name || "",
          subgroup_id: subgroup?.id || "",
          subgroup_name: subgroup?.name || record.subgroup_name || "",
          generates_maintenance: record.maintenance_role === "Gera Patrimônio",
          is_maintenance_part: record.maintenance_role === "Peça de Manutenção",
          code,
        });
      }

      const productBatches = chunkArray(toCreate, 50);
      for (let b = 0; b < productBatches.length; b++) {
        setProgress({ current: Math.min((b + 1) * 50, toCreate.length), total: toCreate.length });
        try {
          await base44.entities.Product.bulkCreate(productBatches[b]);
          successCount += productBatches[b].length;
          if (b < productBatches.length - 1) await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
          errorMsg = err.message || "Erro ao importar produto";
          break;
        }
      }
    } else {
      const allProducts = await base44.entities.Product.list("-created_date", 2000);
      const existingEq = await base44.entities.Equipment.list("-created_date", 2000);
      let maxCode = existingEq.reduce((max, e) => {
        const num = parseInt(e.code?.replace("EQ", "")) || 0;
        return num > max ? num : max;
      }, 0);

      const toCreate = records.map((record) => {
        maxCode++;
        const product = allProducts.find(p => p.name?.toLowerCase() === record.product_name?.toLowerCase());
        const intervalMonths = product?.maintenance_interval_months || 0;
        const baseDate = record.installation_date;
        const nextMaintenance = intervalMonths && baseDate
          ? format(addMonths(new Date(baseDate), intervalMonths), "yyyy-MM-dd")
          : null;
        return {
          ...record,
          product_id: product?.id || "",
          brand: record.brand || product?.brand || "",
          code: `EQ${String(maxCode).padStart(6, "0")}`,
          status: "Ativo",
          maintenance_interval_months: intervalMonths,
          next_maintenance_date: nextMaintenance,
        };
      });

      const eqBatches = chunkArray(toCreate, 50);
      for (let b = 0; b < eqBatches.length; b++) {
        setProgress({ current: Math.min((b + 1) * 50, toCreate.length), total: toCreate.length });
        try {
          await base44.entities.Equipment.bulkCreate(eqBatches[b]);
          successCount += eqBatches[b].length;
          if (b < eqBatches.length - 1) await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
          errorMsg = err.message || "Erro ao importar equipamento";
          break;
        }
      }
    }

    setProgress(null);
    if (errorMsg) {
      setStatus({ success: false, count: successCount, error: errorMsg });
    } else {
      setStatus({
        success: true,
        count: successCount,
        skipped: skippedCount,
        unmatched: Array.from(unmatchedGroups),
        noGroup: noGroupCount,
      });
    }
    setLoading(false);
  };

  const handleUploadClient = async () => {
    const schema = {
      type: "array",
      items: {
        type: "object",
        properties: Object.fromEntries(
          CLIENT_FIELDS.map(f => [
            f.key,
            { type: f.key.endsWith("_whatsapp") ? "boolean" : "string", description: f.label }
          ])
        )
      }
    };

    const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
    let fileChunks = [file];

    if (isCsv) {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.length > 0);
      const header = lines[0];
      const lineChunks = chunkArray(lines.slice(1), BATCH_SIZE);
      fileChunks = lineChunks.map((chunkLines, idx) =>
        new File([header + "\n" + chunkLines.join("\n")], `lote_${idx + 1}_${file.name}`, { type: "text/csv" })
      );
    }

    const existing = await base44.entities.Client.list("-created_date", 500);
    let maxCode = existing.reduce((max, c) => {
      const num = parseInt(c.new_code?.replace("B", "")) || 0;
      return num > max ? num : max;
    }, 0);

    let successCount = 0;
    let errorMsg = null;

    for (let i = 0; i < fileChunks.length; i++) {
      setProgress({ current: i + 1, total: fileChunks.length });

      const { file_url } = await base44.integrations.Core.UploadFile({ file: fileChunks[i] });
      const result = await base44.integrations.Core.ExtractDataFromUploadedFile({ file_url, json_schema: schema });

      if (result.status === "success" && result.output) {
        const records = Array.isArray(result.output) ? result.output : [result.output];
        for (const record of records) {
          maxCode++;
          await base44.entities.Client.create({
            ...record,
            new_code: `B${String(maxCode).padStart(6, "0")}`,
            status: record.status || "Ótimo",
          });
          successCount++;
        }
      } else {
        errorMsg = result.details || "Erro ao processar arquivo";
        break;
      }
    }

    setProgress(null);
    if (errorMsg) {
      setStatus({ success: false, count: successCount, error: errorMsg });
    } else {
      setStatus({ success: true, count: successCount });
    }
    setLoading(false);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setStatus(null);
    setProgress(null);

    if (entityType === "Product" || entityType === "Equipment") {
      await handleUploadProductOrEquipment();
    } else {
      await handleUploadClient();
    }
  };

  return (
    <div>
      <PageHeader title="Importação de Dados" description="Importe dados de planilhas Excel" />

      <div className="max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Importar Planilha
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label>Tipo de Dados</Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Client">Clientes</SelectItem>
                  <SelectItem value="Product">Produtos</SelectItem>
                  <SelectItem value="Equipment">Equipamentos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(entityType === "Client" || entityType === "Product") && (
              <Button type="button" variant="outline" onClick={handleDownloadTemplate} className="w-full gap-2">
                <Download className="h-4 w-4" />
                Baixar Modelo de Planilha ({entityType === "Client" ? "Clientes" : "Produtos"})
              </Button>
            )}

            <div>
              <Label>Arquivo (Excel, CSV ou JSON)</Label>
              <div className="mt-2 border-2 border-dashed rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.json"
                  onChange={e => setFile(e.target.files[0])}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <p className="text-sm font-medium">{file ? file.name : "Clique para selecionar o arquivo"}</p>
                  <p className="text-xs text-muted-foreground mt-1">Suporta .xlsx, .csv, .json</p>
                </label>
              </div>
            </div>

            <Button onClick={handleUpload} disabled={!file || loading} className="w-full gap-2">
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {progress ? `Importando ${progress.current} de ${progress.total}...` : "Importando..."}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Importar Dados
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground -mt-4">
              {entityType === "Client"
                ? `Arquivos CSV são importados automaticamente em lotes de ${BATCH_SIZE} registros.`
                : "Cada linha da planilha é importada individualmente e o progresso é exibido em tempo real."}
            </p>

            {status && (
              <div className={`flex items-center gap-2 p-4 rounded-lg ${status.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                {status.success ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                <p className="text-sm font-medium">
                  {status.success
                    ? `${status.count} registros importados com sucesso!${status.skipped ? ` (${status.skipped} linhas ignoradas por falta de descrição)` : ""}${status.noGroup ? ` — ${status.noGroup} sem coluna de grupo preenchida` : ""}${status.unmatched?.length ? ` — grupos sem cadastro: ${status.unmatched.join(", ")}` : ""}`
                    : `${status.error}${status.count ? ` (${status.count} registros importados antes do erro)` : ""}`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <LegacySalesImportCard />
      </div>
    </div>
  );
}