// Catálogo de nós de automação, categorias, ícones, portas e createNode()

import {
  Webhook, Clock, Database, Globe, FileText, FileSpreadsheet,
  Repeat, GitBranch, Spline, Workflow, Plug,
} from "lucide-react";

// Portas: { type, label } — type vira sourceHandle/targetHandle no React Flow
export const NODE_CATALOG = [
  {
    category: "Gatilho",
    color: "amber",
    nodes: [
      { type: "trigger_webhook", label: "Webhook", icon: Webhook, description: "Disparado por HTTP POST público", inputs: [], outputs: [{ id: "out", label: "Saída" }] },
      { type: "trigger_cron", label: "Agendado (Cron)", icon: Clock, description: "Disparado por schedule", inputs: [], outputs: [{ id: "out", label: "Saída" }] },
      { type: "trigger_entidade", label: "Evento de Entidade", icon: Database, description: "Disparado por create/update/delete", inputs: [], outputs: [{ id: "out", label: "Saída" }] },
    ],
  },
  {
    category: "Ação",
    color: "blue",
    nodes: [
      { type: "http_request", label: "HTTP Request", icon: Globe, description: "fetch com headers, body, credencial, retry", inputs: [{ id: "in", label: "Entrada" }], outputs: [{ id: "out", label: "Resposta" }] },
      { type: "entity_read", label: "Ler Entidade", icon: Database, description: "get/list/filter em entidade", inputs: [{ id: "in", label: "Entrada" }], outputs: [{ id: "out", label: "Registro(s)" }] },
      { type: "entity_write", label: "Escrever Entidade", icon: Database, description: "create/update/delete em entidade", inputs: [{ id: "in", label: "Entrada" }], outputs: [{ id: "out", label: "Resultado" }] },
      { type: "integration_call", label: "Integração Existente", icon: Plug, description: "Invoca function backend ou Core", inputs: [{ id: "in", label: "Entrada" }], outputs: [{ id: "out", label: "Resultado" }] },
      { type: "transform_writesheet", label: "Gerar Planilha (XLSX)", icon: FileSpreadsheet, description: "Gera .xlsx via xlsx + UploadFile", inputs: [{ id: "in", label: "Entrada" }], outputs: [{ id: "out", label: "file_url" }] },
      { type: "pdf_generate", label: "Gerar PDF", icon: FileText, description: "Gera PDF via jspdf + UploadFile", inputs: [{ id: "in", label: "Entrada" }], outputs: [{ id: "out", label: "file_url" }] },
    ],
  },
  {
    category: "Transformação",
    color: "violet",
    nodes: [
      { type: "transform_depara", label: "Mapeamento De-Para", icon: Spline, description: "Remapeia campos + transforma valores", inputs: [{ id: "in", label: "Entrada" }], outputs: [{ id: "out", label: "Saída" }] },
      { type: "transform_readsheet", label: "Ler Planilha", icon: FileSpreadsheet, description: "Extrai dados de XLSX/CSV", inputs: [{ id: "in", label: "Entrada" }], outputs: [{ id: "out", label: "Linhas" }] },
      { type: "pdf_extract", label: "Extrair Dados de PDF", icon: FileText, description: "Extrai dados de PDF", inputs: [{ id: "in", label: "Entrada" }], outputs: [{ id: "out", label: "Dados" }] },
    ],
  },
  {
    category: "Lógica",
    color: "emerald",
    nodes: [
      { type: "loop_foreach", label: "Para Cada (Loop)", icon: Repeat, description: "Itera array; por item chama function/entity/http", inputs: [{ id: "in", label: "Entrada" }], outputs: [{ id: "out", label: "Resultados" }] },
      { type: "if_condition", label: "Condição (If)", icon: GitBranch, description: "Compara campo vs valor → branch true/false", inputs: [{ id: "in", label: "Entrada" }], outputs: [{ id: "true", label: "Verdadeiro" }, { id: "false", label: "Falso" }] },
      { type: "switch_branch", label: "Switch", icon: Workflow, description: "Múltiplos casos → branch por handle", inputs: [{ id: "in", label: "Entrada" }], outputs: [{ id: "default", label: "Padrão" }] },
    ],
  },
];

export const NODE_MAP = {};
for (const cat of NODE_CATALOG) {
  for (const n of cat.nodes) {
    NODE_MAP[n.type] = { ...n, category: cat.category, color: cat.color };
  }
}

let nodeCounter = 0;
export function createNode(type, position) {
  const def = NODE_MAP[type];
  if (!def) throw new Error(`Tipo de nó desconhecido: ${type}`);
  const id = `${type}_${Date.now()}_${nodeCounter++}`;
  return {
    id,
    type,
    position,
    data: {
      nodeType: type,
      label: def.label,
      config: defaultConfig(type),
    },
  };
}

function defaultConfig(type) {
  switch (type) {
    case "trigger_webhook": return {};
    case "trigger_cron": return { cron_expressao: "" };
    case "trigger_entidade": return { entidade_alvo: "", evento_entidade: "create" };
    case "http_request": return { method: "GET", url: "", headers: {}, body: "", credential: "", timeout: 30, retry: 0 };
    case "entity_read": return { entity: "", operation: "list", params: {} };
    case "entity_write": return { entity: "", operation: "create", params: {} };
    case "integration_call": return { kind: "function", functionName: "", endpoint: "", params: {} };
    case "transform_depara": return { mappings: [] };
    case "transform_readsheet": return { file_url: "", json_schema: { type: "object", properties: {} } };
    case "transform_writesheet": return { rows: [], sheet_name: "Sheet1", filename: "planilha" };
    case "loop_foreach": return { array: "{{$input}}", acao_tipo: "function", functionName: "", entity: "", method: "POST", url: "", headers: {}, body: {}, data: {}, id: "", payload: {}, credential: "" };
    case "pdf_extract": return { file_url: "", json_schema: { type: "object", properties: {} } };
    case "pdf_generate": return { filename: "documento", content: { title: "", lines: [] } };
    case "if_condition": return { field: "", operator: "eq", value: "" };
    case "switch_branch": return { field: "", cases: [], default_handle: "default" };
    default: return {};
  }
}

export const IF_OPERATORS = [
  { value: "eq", label: "Igual a (=)" },
  { value: "ne", label: "Diferente (!=)" },
  { value: "gt", label: "Maior que (>)" },
  { value: "lt", label: "Menor que (<)" },
  { value: "gte", label: "Maior ou igual (>=)" },
  { value: "lte", label: "Menor ou igual (<=)" },
  { value: "contains", label: "Contém" },
  { value: "not_contains", label: "Não contém" },
  { value: "starts_with", label: "Começa com" },
  { value: "ends_with", label: "Termina com" },
  { value: "exists", label: "Existe (não nulo)" },
  { value: "not_exists", label: "Não existe (nulo)" },
];

export const LOOP_ACTIONS = [
  { value: "function", label: "Invocar Function" },
  { value: "entity_create", label: "Criar Entidade" },
  { value: "entity_update", label: "Atualizar Entidade" },
  { value: "http", label: "HTTP Request" },
];

export const TRANSFORM_TYPES = [
  { value: "none", label: "Nenhuma" },
  { value: "to_upper", label: "Para Maiúsculas" },
  { value: "to_lower", label: "Para Minúsculas" },
  { value: "to_string", label: "Para String" },
  { value: "to_number", label: "Para Número" },
  { value: "date_format", label: "Formatar Data" },
  { value: "datetime_format", label: "Formatar Data/Hora" },
  { value: "number_format", label: "Formatar Número" },
  { value: "string_template", label: "Template de String" },
  { value: "concat", label: "Concatenar Array" },
  { value: "lookup_table", label: "Tabela de Lookup" },
  { value: "static", label: "Valor Estático" },
];