// Motor de execução de automações node-based (estilo n8n)
// Importado por executarAutomacao e webhookAutomacao.
// Sem dependências externas além de xlsx e jspdf (importados dinamicamente).

// ============================================================
// TIPOS
// ============================================================

/**
 * @typedef {Object} Ctx
 * @property {any} base44 - client SDK (asServiceRole para operações privilegiadas)
 * @property {Map<string,string>} secrets - secrets do app
 * @property {Record<string, any>} credenciais - credenciais por nome
 */

// ============================================================
// RESOLUÇÃO DE TEMPLATES (Mustache-style)
// ============================================================

const TEMPLATE_RE = /\{\{([^}]+)\}\}/g;

/**
 * Resolve um template Mustache-style.
 * - {{$input.campo}} → valor do campo na entrada do nó atual
 * - {{$trigger.campo}} → saída do nó de gatilho
 * - {{nodeId.campo.sub}} → saída de qualquer nó já executado
 * Template único {{x}} preserva tipo; template misto vira string.
 */
export function resolveTemplate(value, context) {
  if (typeof value !== "string") return value;
  if (!value.includes("{{")) return value;

  const matches = [];
  let m;
  const re = new RegExp(TEMPLATE_RE.source, "g");
  while ((m = re.exec(value)) !== null) {
    matches.push(m[1].trim());
  }
  if (matches.length === 0) return value;

  // Template único e ocupando a string inteira → preserva tipo
  const singleFull = matches.length === 1 && value.trim() === `{{${matches[0]}}}`;
  const resolved = matches.map((path) => resolvePath(path, context));

  if (singleFull) {
    return resolved[0];
  }
  // Template misto → substitui por string
  let result = value;
  let idx = 0;
  result = result.replace(TEMPLATE_RE, () => {
    const v = resolved[idx++];
    return v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  });
  return result;
}

function resolvePath(path, context) {
  const parts = path.split(".");
  const root = parts[0];
  let current;
  if (root === "$input") {
    current = context.$input;
  } else if (root === "$trigger") {
    current = context.$trigger;
  } else {
    current = context.nodes[root];
  }
  for (let i = 1; i < parts.length; i++) {
    if (current == null) return undefined;
    current = current[parts[i]];
  }
  return current;
}

/** Resolve templates recursivamente em objetos/arrays. */
export function resolveDeep(obj, context) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return resolveTemplate(obj, context);
  if (Array.isArray(obj)) return obj.map((v) => resolveDeep(v, context));
  if (typeof obj === "object") {
    const out = {};
    for (const k of Object.keys(obj)) {
      out[k] = resolveDeep(obj[k], context);
    }
    return out;
  }
  return obj;
}

// ============================================================
// CREDENCIAIS HTTP
// ============================================================

/**
 * Injeta credencial (bearer/basic/api_key/header) nos headers.
 */
export function applyCredential(headers, credentialName, ctx) {
  if (!credentialName) return headers;
  const cred = ctx.credenciais[credentialName];
  if (!cred) {
    throw new Error(`Credencial não encontrada: ${credentialName}`);
  }
  const finalHeaders = { ...(headers || {}) };
  const tokenValue = ctx.secrets.get(cred.secret_name);

  if (cred.tipo === "bearer") {
    finalHeaders["Authorization"] = `Bearer ${tokenValue}`;
  } else if (cred.tipo === "basic") {
    const username = ctx.secrets.get(cred.username_ref) || "";
    finalHeaders["Authorization"] = "Basic " + btoa(`${username}:${tokenValue}`);
  } else if (cred.tipo === "api_key") {
    const hName = cred.header_name || "X-API-Key";
    finalHeaders[hName] = tokenValue;
  } else if (cred.tipo === "header") {
    const hName = cred.header_name || "Authorization";
    finalHeaders[hName] = tokenValue;
  }
  return finalHeaders;
}

// ============================================================
// MERGE DEEP
// ============================================================

export function mergeDeep(...objs) {
  const out = {};
  for (const obj of objs) {
    if (!obj || typeof obj !== "object") continue;
    for (const k of Object.keys(obj)) {
      const val = obj[k];
      if (out[k] && typeof out[k] === "object" && !Array.isArray(out[k]) && val && typeof val === "object" && !Array.isArray(val)) {
        out[k] = mergeDeep(out[k], val);
      } else {
        out[k] = val;
      }
    }
  }
  return out;
}

// ============================================================
// TRANSFORMAÇÕES DE-PARA
// ============================================================

const TRANSFORMS = {
  none: (v) => v,
  to_upper: (v) => (v == null ? v : String(v).toUpperCase()),
  to_lower: (v) => (v == null ? v : String(v).toLowerCase()),
  to_string: (v) => (v == null ? v : String(v)),
  to_number: (v) => (v == null ? v : Number(v)),
  date_format: (v, opts) => formatDate(v, opts?.format || "dd/MM/yyyy"),
  datetime_format: (v, opts) => formatDate(v, opts?.format || "dd/MM/yyyy HH:mm"),
  number_format: (v, opts) => formatNumber(v, opts?.decimals ?? 2),
  string_template: (v, opts) => {
    if (!opts?.template) return v;
    return resolveTemplate(opts.template, { $input: { value: v } });
  },
  concat: (v, opts) => {
    if (!Array.isArray(v)) return v;
    return v.join(opts?.separator || "");
  },
  lookup_table: (v, opts) => {
    const table = opts?.table || {};
    return table[String(v)] ?? opts?.default ?? v;
  },
  static: (_v, opts) => opts?.value,
};

function formatDate(v, format) {
  if (!v) return v;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return v;
  const pad = (n) => String(n).padStart(2, "0");
  return format
    .replace("yyyy", d.getFullYear())
    .replace("MM", pad(d.getMonth() + 1))
    .replace("dd", pad(d.getDate()))
    .replace("HH", pad(d.getHours()))
    .replace("mm", pad(d.getMinutes()))
    .replace("ss", pad(d.getSeconds()));
}

function formatNumber(v, decimals) {
  if (v == null || isNaN(Number(v))) return v;
  return Number(Number(v).toFixed(decimals));
}

// ============================================================
// EXECUTORES DE NÓ
// ============================================================

async function execTriggerWebhook(node, input, ctx) {
  return { output: input || {} };
}
async function execTriggerCron(node, input, ctx) {
  return { output: input || {} };
}
async function execTriggerEntidade(node, input, ctx) {
  return { output: input || {} };
}

async function execHttpRequest(node, input, ctx) {
  const cfg = node.data?.config || {};
  const method = (cfg.method || "GET").toUpperCase();
  const url = resolveTemplate(cfg.url, { $input: input, $trigger: ctx.$trigger, nodes: ctx.nodesOutputs });
  const headers = resolveDeep(cfg.headers || {}, { $input: input, $trigger: ctx.$trigger, nodes: ctx.nodesOutputs });
  let body = cfg.body;
  if (body) body = resolveDeep(body, { $input: input, $trigger: ctx.$trigger, nodes: ctx.nodesOutputs });

  const finalHeaders = cfg.credential
    ? applyCredential(headers, cfg.credential, ctx)
    : headers;

  const fetchOpts = {
    method,
    headers: finalHeaders,
    signal: undefined,
  };
  if (body && method !== "GET") {
    fetchOpts.body = typeof body === "string" ? body : JSON.stringify(body);
    if (!finalHeaders["Content-Type"] && typeof body === "object") {
      fetchOpts.headers = { ...finalHeaders, "Content-Type": "application/json" };
    }
  }

  const maxRetries = cfg.retry || 0;
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), (cfg.timeout || 30) * 1000);
      fetchOpts.signal = controller.signal;
      const res = await fetch(url, fetchOpts);
      clearTimeout(timeout);
      const contentType = res.headers.get("content-type") || "";
      let data;
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        data = await res.text();
      }
      if (!res.ok && attempt === maxRetries) {
        throw new Error(`HTTP ${res.status}: ${typeof data === "string" ? data.slice(0, 500) : JSON.stringify(data).slice(0, 500)}`);
      }
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      return { output: { status: res.status, data, headers: Object.fromEntries(res.headers.entries()) } };
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  throw lastErr || new Error("Falha na requisição HTTP");
}

async function execEntityRead(node, input, ctx) {
  const cfg = node.data?.config || {};
  const entityName = cfg.entity;
  if (!entityName) throw new Error("entity_read: entidade não definida");
  const entity = ctx.base44.asServiceRole.entities[entityName];
  if (!entity) throw new Error(`Entidade não encontrada: ${entityName}`);

  const op = cfg.operation || "list";
  const resolved = resolveDeep(cfg.params || {}, { $input: input, $trigger: ctx.$trigger, nodes: ctx.nodesOutputs });

  let result;
  if (op === "get") {
    result = await entity.get(resolved.id);
  } else if (op === "list") {
    result = await entity.list(resolved.sort, resolved.limit);
  } else if (op === "filter") {
    const { filter, sort, limit } = resolved;
    result = await entity.filter(filter || {}, sort, limit);
  } else {
    throw new Error(`Operação inválida: ${op}`);
  }
  return { output: { result } };
}

async function execEntityWrite(node, input, ctx) {
  const cfg = node.data?.config || {};
  const entityName = cfg.entity;
  if (!entityName) throw new Error("entity_write: entidade não definida");
  const entity = ctx.base44.asServiceRole.entities[entityName];
  if (!entity) throw new Error(`Entidade não encontrada: ${entityName}`);

  const op = cfg.operation || "create";
  const resolved = resolveDeep(cfg.params || {}, { $input: input, $trigger: ctx.$trigger, nodes: ctx.nodesOutputs });

  let result;
  if (op === "create") {
    result = await entity.create(resolved.data || {});
  } else if (op === "update") {
    result = await entity.update(resolved.id, resolved.data || {});
  } else if (op === "delete") {
    await entity.delete(resolved.id);
    result = { deleted: true, id: resolved.id };
  } else if (op === "bulkCreate") {
    result = await entity.bulkCreate(resolved.data || []);
  } else {
    throw new Error(`Operação inválida: ${op}`);
  }
  return { output: { result } };
}

async function execIntegrationCall(node, input, ctx) {
  const cfg = node.data?.config || {};
  const kind = cfg.kind || "function";
  const resolved = resolveDeep(cfg.params || {}, { $input: input, $trigger: ctx.$trigger, nodes: ctx.nodesOutputs });

  let result;
  if (kind === "function") {
    if (!cfg.functionName) throw new Error("integration_call: functionName não definido");
    result = await ctx.base44.asServiceRole.functions.invoke(cfg.functionName, resolved);
  } else if (kind === "core") {
    if (!cfg.endpoint) throw new Error("integration_call: endpoint não definido");
    result = await ctx.base44.asServiceRole.integrations.Core[cfg.endpoint](resolved);
  } else {
    throw new Error(`Tipo de integração inválido: ${kind}`);
  }
  return { output: { result } };
}

async function execTransformDepara(node, input, ctx) {
  const cfg = node.data?.config || {};
  const mappings = cfg.mappings || [];
  const out = {};
  for (const mp of mappings) {
    const sourceVal = resolveTemplate(mp.source, { $input: input, $trigger: ctx.$trigger, nodes: ctx.nodesOutputs });
    let val = sourceVal;
    const transform = mp.transform || "none";
    const fn = TRANSFORMS[transform];
    if (fn) {
      val = fn(val, mp.transformOptions);
    }
    out[mp.target] = val;
  }
  return { output: out };
}

async function execTransformReadsheet(node, input, ctx) {
  const cfg = node.data?.config || {};
  const fileUrl = resolveTemplate(cfg.file_url, { $input: input, $trigger: ctx.$trigger, nodes: ctx.nodesOutputs });
  const jsonSchema = cfg.json_schema || { type: "object", properties: {} };
  const result = await ctx.base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
    file_url: fileUrl,
    json_schema: jsonSchema,
  });
  return { output: { result } };
}

async function execTransformWritesheet(node, input, ctx) {
  const cfg = node.data?.config || {};
  const rows = resolveDeep(cfg.rows || [], { $input: input, $trigger: ctx.$trigger, nodes: ctx.nodesOutputs });
  const sheetName = cfg.sheet_name || "Sheet1";
  const XLSX = await import("npm:xlsx@0.18.5");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const file = new File([blob], `${cfg.filename || "planilha"}.xlsx`, { type: blob.type });
  const up = await ctx.base44.asServiceRole.integrations.Core.UploadFile({ file });
  return { output: { file_url: up.file_url, total_linhas: Array.isArray(rows) ? rows.length : 0 } };
}

async function execPdfExtract(node, input, ctx) {
  const cfg = node.data?.config || {};
  const fileUrl = resolveTemplate(cfg.file_url, { $input: input, $trigger: ctx.$trigger, nodes: ctx.nodesOutputs });
  const jsonSchema = cfg.json_schema || { type: "object", properties: {} };
  const result = await ctx.base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
    file_url: fileUrl,
    json_schema: jsonSchema,
  });
  return { output: { result } };
}

async function execPdfGenerate(node, input, ctx) {
  const cfg = node.data?.config || {};
  const content = resolveDeep(cfg.content || {}, { $input: input, $trigger: ctx.$trigger, nodes: ctx.nodesOutputs });
  const { jsPDF } = await import("npm:jspdf@4.0.0");
  const doc = new jsPDF();
  let y = 20;
  const title = content.title || "Documento";
  doc.setFontSize(16);
  doc.text(String(title), 14, y);
  y += 10;
  doc.setFontSize(10);
  const lines = content.lines || [];
  for (const line of lines) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.text(String(line), 14, y);
    y += 7;
  }
  const pdfBytes = doc.output("arraybuffer");
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const file = new File([blob], `${cfg.filename || "documento"}.pdf`, { type: "application/pdf" });
  const up = await ctx.base44.asServiceRole.integrations.Core.UploadFile({ file });
  return { output: { file_url: up.file_url } };
}

async function execIfCondition(node, input, ctx) {
  const cfg = node.data?.config || {};
  const left = resolveTemplate(cfg.field, { $input: input, $trigger: ctx.$trigger, nodes: ctx.nodesOutputs });
  const op = cfg.operator || "eq";
  const right = cfg.value;
  const result = compare(left, op, right);
  return { output: { condition: result }, branch: result ? "true" : "false" };
}

async function execSwitchBranch(node, input, ctx) {
  const cfg = node.data?.config || {};
  const val = resolveTemplate(cfg.field, { $input: input, $trigger: ctx.$trigger, nodes: ctx.nodesOutputs });
  const cases = cfg.cases || [];
  const found = cases.find((c) => String(c.value) === String(val));
  const branch = found ? found.handle : (cfg.default_handle || "default");
  return { output: { value: val, matched: !!found }, branch };
}

async function execLoopForeach(node, input, ctx) {
  const cfg = node.data?.config || {};
  const arr = resolveTemplate(cfg.array, { $input: input, $trigger: ctx.$trigger, nodes: ctx.nodesOutputs });
  if (!Array.isArray(arr)) throw new Error("loop_foreach: array não é um array");

  const acaoTipo = cfg.acao_tipo || "function";
  const resultados = [];
  let sucessos = 0;
  let erros = 0;

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    const itemCtx = { $input: item, $trigger: ctx.$trigger, nodes: ctx.nodesOutputs };
    try {
      let res;
      if (acaoTipo === "function") {
        const payload = resolveDeep(cfg.payload || {}, itemCtx);
        res = await ctx.base44.asServiceRole.functions.invoke(cfg.functionName, payload);
      } else if (acaoTipo === "entity_create") {
        const data = resolveDeep(cfg.data || {}, itemCtx);
        res = await ctx.base44.asServiceRole.entities[cfg.entity].create(data);
      } else if (acaoTipo === "entity_update") {
        const id = resolveTemplate(cfg.id, itemCtx);
        const data = resolveDeep(cfg.data || {}, itemCtx);
        res = await ctx.base44.asServiceRole.entities[cfg.entity].update(id, data);
      } else if (acaoTipo === "http") {
        const url = resolveTemplate(cfg.url, itemCtx);
        const headers = resolveDeep(cfg.headers || {}, itemCtx);
        const body = resolveDeep(cfg.body || {}, itemCtx);
        const finalHeaders = cfg.credential ? applyCredential(headers, cfg.credential, ctx) : headers;
        const r = await fetch(url, {
          method: (cfg.method || "POST").toUpperCase(),
          headers: { "Content-Type": "application/json", ...finalHeaders },
          body: body ? JSON.stringify(body) : undefined,
        });
        res = r.ok ? await r.json().catch(() => ({})) : { error: `HTTP ${r.status}` };
      } else {
        throw new Error(`acao_tipo inválido: ${acaoTipo}`);
      }
      resultados.push(res);
      sucessos++;
    } catch (e) {
      resultados.push({ error: e.message, item });
      erros++;
    }
  }
  return { output: { resultados, total: arr.length, sucessos, erros } };
}

const NODE_EXECUTORS = {
  trigger_webhook: execTriggerWebhook,
  trigger_cron: execTriggerCron,
  trigger_entidade: execTriggerEntidade,
  http_request: execHttpRequest,
  entity_read: execEntityRead,
  entity_write: execEntityWrite,
  integration_call: execIntegrationCall,
  transform_depara: execTransformDepara,
  transform_readsheet: execTransformReadsheet,
  transform_writesheet: execTransformWritesheet,
  loop_foreach: execLoopForeach,
  pdf_extract: execPdfExtract,
  pdf_generate: execPdfGenerate,
  if_condition: execIfCondition,
  switch_branch: execSwitchBranch,
};

function compare(left, op, right) {
  switch (op) {
    case "eq": return left == right;
    case "ne": return left != right;
    case "gt": return Number(left) > Number(right);
    case "lt": return Number(left) < Number(right);
    case "gte": return Number(left) >= Number(right);
    case "lte": return Number(left) <= Number(right);
    case "contains": return String(left ?? "").includes(String(right ?? ""));
    case "not_contains": return !String(left ?? "").includes(String(right ?? ""));
    case "starts_with": return String(left ?? "").startsWith(String(right ?? ""));
    case "ends_with": return String(left ?? "").endsWith(String(right ?? ""));
    case "exists": return left !== undefined && left !== null;
    case "not_exists": return left === undefined || left === null;
    default: throw new Error(`Operador inválido: ${op}`);
  }
}

// ============================================================
// ORQUESTRADOR
// ============================================================

/**
 * Executa o grafo de automação.
 * @param {Object} grafo - { nodes: [], edges: [] }
 * @param {Object} triggerPayload - payload do gatilho
 * @param {Ctx} ctx - contexto de execução
 * @returns {Promise<{ status, nos_log, payload_saida, erro? }>}
 */
export async function executarGrafo(grafo, triggerPayload, ctx) {
  const nodes = grafo?.nodes || [];
  const edges = grafo?.edges || [];

  // Encontra o nó de gatilho
  const triggerNode = nodes.find((n) => String(n.type || "").startsWith("trigger_"));
  if (!triggerNode) {
    return { status: "erro", nos_log: [], payload_saida: {}, erro: "Nenhum nó de gatilho encontrado" };
  }

  const nodesOutputs = {};
  const nosLog = [];
  const executed = new Set();
  const startedAt = Date.now();

  // Executa o gatilho
  const triggerCtx = { ...ctx, $input: triggerPayload, $trigger: triggerPayload, nodesOutputs };
  const triggerRes = await runNode(triggerNode, triggerCtx, startedAt);
  nodesOutputs[triggerNode.id] = triggerRes.output;
  executed.add(triggerNode.id);
  nosLog.push(triggerRes.log);
  ctx.$trigger = triggerRes.output;

  // Loop iterativo
  let safety = 0;
  while (safety < 1000) {
    safety++;
    let progressed = false;

    for (const node of nodes) {
      if (executed.has(node.id)) continue;
      if (String(node.type || "").startsWith("trigger_")) continue;

      // Encontra arestas de entrada
      const inEdges = edges.filter((e) => e.target === node.id);
      if (inEdges.length === 0) continue;

      // Verifica se todos os predecessores foram executados
      const allPredExec = inEdges.every((e) => executed.has(e.source));
      if (!allPredExec) continue;

      // Filtra por branch (source_handle)
      const activeEdges = inEdges.filter((e) => {
        const predOutput = nodesOutputs[e.source];
        const predBranch = predOutput?.__branch;
        if (!e.sourceHandle) return true;
        if (!predBranch) return true;
        return e.sourceHandle === predBranch;
      });
      if (activeEdges.length === 0) continue;

      // Merge deep dos outputs dos predecessores forma o input
      const mergedInput = mergeDeep(
        ...activeEdges.map((e) => {
          const out = nodesOutputs[e.source];
          const { __branch, ...rest } = out || {};
          return rest;
        })
      );

      const nodeCtx = { ...ctx, $input: mergedInput, $trigger: ctx.$trigger, nodesOutputs };
      const res = await runNode(node, nodeCtx, startedAt);
      nodesOutputs[node.id] = res.output;
      if (res.branch) nodesOutputs[node.id].__branch = res.branch;
      executed.add(node.id);
      nosLog.push(res.log);
      progressed = true;
    }

    if (!progressed) break;
  }

  // payload_saida = merge dos outputs de nós sem aresta de saída (ou último executado)
  const terminalNodes = nodes.filter((n) => !edges.some((e) => e.source === n.id) && executed.has(n.id));
  const sourceForOutput = terminalNodes.length > 0 ? terminalNodes : nodes.filter((n) => executed.has(n.id) && !String(n.type).startsWith("trigger_"));
  const payload_saida = mergeDeep(
    ...sourceForOutput.map((n) => {
      const out = nodesOutputs[n.id] || {};
      const { __branch, ...rest } = out;
      return rest;
    })
  );

  const hasError = nosLog.some((l) => l.status === "erro");
  return {
    status: hasError ? "erro" : "sucesso",
    nos_log: nosLog,
    payload_saida,
    erro: hasError ? nosLog.find((l) => l.status === "erro")?.erro : undefined,
  };
}

async function runNode(node, ctx, globalStart) {
  const start = Date.now();
  const executor = NODE_EXECUTORS[node.type];
  const logEntry = {
    node_id: node.id,
    node_type: node.type,
    node_label: node.data?.label || node.type,
    status: "sucesso",
    started_at: new Date(start).toISOString(),
    finished_at: null,
    duracao_ms: 0,
    output: null,
    erro: null,
    branch: null,
  };
  if (!executor) {
    logEntry.status = "erro";
    logEntry.erro = `Tipo de nó desconhecido: ${node.type}`;
    logEntry.finished_at = new Date().toISOString();
    logEntry.duracao_ms = Date.now() - start;
    return { output: {}, log: logEntry };
  }
  try {
    const res = await executor(node, ctx.$input, ctx);
    logEntry.output = stripBranch(res.output);
    logEntry.branch = res.branch || null;
    logEntry.finished_at = new Date().toISOString();
    logEntry.duracao_ms = Date.now() - start;
    return res;
  } catch (e) {
    logEntry.status = "erro";
    logEntry.erro = e.message;
    logEntry.finished_at = new Date().toISOString();
    logEntry.duracao_ms = Date.now() - start;
    return { output: {}, log: logEntry };
  }
}

function stripBranch(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const { __branch, ...rest } = obj;
  return rest;
}

// ============================================================
// CARREGAR CREDENCIAIS
// ============================================================

export async function carregarCredenciais(base44) {
  const creds = await base44.asServiceRole.entities.AutomacaoCredencial.filter({ ativo: true });
  const map = {};
  for (const c of creds) {
    map[c.nome] = c;
  }
  return map;
}

/**
 * Constrói o contexto de execução a partir de um client base44 e secrets.
 */
export function buildCtx(base44, secretsMap, credenciais) {
  return {
    base44,
    secrets: secretsMap,
    credenciais,
    $trigger: {},
    nodesOutputs: {},
  };
}