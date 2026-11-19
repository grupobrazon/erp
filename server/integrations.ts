// Integrações "Core" da Base44 no servidor novo:
//   InvokeLLM                    -> Claude (Anthropic). Chave: ANTHROPIC_API_KEY
//   ExtractDataFromUploadedFile  -> planilha (CSV/XLSX) lida direto; PDF/imagem via Claude
//   SendEmail                    -> SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM)
// Sem a chave/configuração, a função responde com uma mensagem clara (503), sem quebrar o resto.
import { B44Error } from "../src/api/b44compat.js";

const ANTHROPIC_KEY = () => Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL_MAIN = () => Deno.env.get("LLM_MODEL") || "claude-sonnet-5-5";
const MODEL_FAST = () => Deno.env.get("LLM_MODEL_FAST") || "claude-haiku-5-5";

type Json = Record<string, unknown>;
type Block = Record<string, unknown>;

function pickModel(requested?: unknown) {
  const r = String(requested ?? "").toLowerCase();
  return /mini|flash|haiku|nano|lite/.test(r) ? MODEL_FAST() : MODEL_MAIN();
}

function b64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function fetchFile(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new B44Error(`Não consegui baixar o arquivo (${res.status})`, 400);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  return { bytes, type, name: decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "") };
}

const isSheet = (type: string, name: string) =>
  /csv|spreadsheet|excel|sheet/.test(type) || /\.(csv|xlsx?|ods)$/i.test(name);

async function sheetRows(bytes: Uint8Array): Promise<Json[]> {
  const XLSX = await import("npm:xlsx@0.18.5");
  const wb = XLSX.read(bytes, { type: "array", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "", raw: false }) as Json[];
}

async function fileBlocks(urls: string[]): Promise<Block[]> {
  const blocks: Block[] = [];
  for (const url of urls ?? []) {
    const f = await fetchFile(url);
    if (f.type.startsWith("image/")) {
      blocks.push({ type: "image", source: { type: "base64", media_type: f.type, data: b64(f.bytes) } });
    } else if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(f.bytes) } });
    } else if (isSheet(f.type, f.name)) {
      const rows = await sheetRows(f.bytes);
      blocks.push({ type: "text", text: `Planilha ${f.name} (${rows.length} linhas, em JSON):\n${JSON.stringify(rows).slice(0, 400_000)}` });
    } else {
      blocks.push({ type: "text", text: `Arquivo ${f.name}:\n${new TextDecoder().decode(f.bytes).slice(0, 400_000)}` });
    }
  }
  return blocks;
}

async function anthropic(body: Json) {
  const key = ANTHROPIC_KEY();
  if (!key) throw new B44Error("IA não configurada: preencha ANTHROPIC_API_KEY no painel da Hostinger.", 503);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new B44Error(`IA: ${(data as any)?.error?.message ?? res.status}`, 502);
    return data as { content: Block[] };
  }
}

// InvokeLLM({ prompt, response_json_schema?, add_context_from_internet?, file_urls?, model? })
// Sem schema devolve texto; com schema devolve o objeto no formato pedido.
export async function invokeLLM(params: Json = {}) {
  const prompt = String(params.prompt ?? "");
  if (!prompt) throw new B44Error("prompt é obrigatório", 400);
  const schema = params.response_json_schema as Json | undefined;
  const content: Block[] = [...await fileBlocks((params.file_urls as string[]) ?? []), { type: "text", text: prompt }];
  const tools: Block[] = [];
  if (params.add_context_from_internet) tools.push({ type: "web_search_20250305", name: "web_search", max_uses: 5 });

  let wrapped = false;
  if (schema) {
    let input_schema = schema;
    if (schema.type !== "object") {
      input_schema = { type: "object", properties: { result: schema }, required: ["result"] };
      wrapped = true;
    }
    tools.push({ name: "responder", description: "Entrega a resposta final no formato pedido.", input_schema });
  }

  const body: Json = {
    model: pickModel(params.model),
    max_tokens: 16000,
    messages: [{ role: "user", content }],
  };
  if (tools.length) body.tools = tools;
  if (schema && !params.add_context_from_internet) body.tool_choice = { type: "tool", name: "responder" };
  if (schema && params.add_context_from_internet) {
    body.system = "Pesquise o que precisar e, ao final, chame a ferramenta responder com a resposta completa.";
  }

  const data = await anthropic(body);
  const blocks = data.content ?? [];
  if (schema) {
    const call = blocks.find((b) => b.type === "tool_use" && b.name === "responder") as any;
    if (call) return wrapped ? call.input?.result : call.input;
    const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (m) return JSON.parse(m[0]);
    throw new B44Error("A IA não devolveu a resposta no formato pedido", 502);
  }
  return blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "");

// ExtractDataFromUploadedFile({ file_url, json_schema }) -> { status, details, output }
// Planilhas: cada linha vira um registro no formato do schema (colunas ligadas por nome;
// se os nomes não baterem, a IA só indica qual coluna é qual campo).
export async function extractDataFromUploadedFile(params: Json = {}) {
  const url = String(params.file_url ?? "");
  const schema = (params.json_schema ?? {}) as Json;
  if (!url) throw new B44Error("file_url é obrigatório", 400);
  try {
    const f = await fetchFile(url);
    const itemSchema = (schema.type === "array" ? schema.items : schema) as Json;
    const props = (itemSchema?.properties ?? {}) as Record<string, Json>;

    if (isSheet(f.type, f.name) && Object.keys(props).length) {
      const rows = await sheetRows(f.bytes);
      if (!rows.length) return { status: "success", details: null, output: [] };
      const headers = Object.keys(rows[0]);
      const mapping: Record<string, string> = {};
      for (const p of Object.keys(props)) {
        const h = headers.find((x) => norm(x) === norm(p) || norm(x) === norm(props[p]?.description));
        if (h) mapping[p] = h;
      }
      const missing = Object.keys(props).filter((p) => !mapping[p]);
      if (missing.length && ANTHROPIC_KEY()) {
        const guess = await invokeLLM({
          model: "fast",
          prompt: `Colunas da planilha: ${JSON.stringify(headers)}\nExemplo de linhas: ${JSON.stringify(rows.slice(0, 3))}\n` +
            `Para cada campo abaixo, diga qual coluna corresponde (ou vazio se nenhuma):\n` +
            JSON.stringify(Object.fromEntries(missing.map((p) => [p, props[p]?.description ?? p]))),
          response_json_schema: {
            type: "object",
            properties: Object.fromEntries(missing.map((p) => [p, { type: "string" }])),
          },
        }) as Record<string, string>;
        for (const p of missing) if (guess?.[p] && headers.includes(guess[p])) mapping[p] = guess[p];
      }
      const output = rows.map((r) => {
        const o: Json = {};
        for (const [p, h] of Object.entries(mapping)) {
          const v = r[h];
          const t = props[p]?.type;
          o[p] = v === "" ? null : t === "number" || t === "integer" ? Number(String(v).replace(/\./g, "").replace(",", ".")) || null
            : t === "boolean" ? /^(sim|s|true|1|x)$/i.test(String(v)) : v;
        }
        return o;
      }).filter((o) => Object.values(o).some((v) => v !== null && v !== ""));
      return { status: "success", details: null, output: schema.type === "array" || output.length !== 1 ? output : output[0] };
    }

    const output = await invokeLLM({
      prompt: "Extraia os dados deste arquivo exatamente no formato pedido. Se houver várias linhas/registros, devolva todos.",
      file_urls: [url],
      response_json_schema: schema.type === "object" ? { type: "array", items: schema } : schema,
    });
    return { status: "success", details: null, output };
  } catch (e) {
    if (e instanceof B44Error && e.status === 503) throw e;
    return { status: "error", details: (e as Error).message, output: null };
  }
}

// SendEmail({ to, subject, body, from_name? })
let transporter: any = null;
export async function sendEmail(params: Json = {}) {
  const host = Deno.env.get("SMTP_HOST");
  if (!host) throw new B44Error("E-mail não configurado: preencha SMTP_HOST, SMTP_USER, SMTP_PASS e SMTP_FROM no painel da Hostinger.", 503);
  const to = String(params.to ?? "");
  if (!to) throw new B44Error("Destinatário (to) é obrigatório", 400);
  if (!transporter) {
    const nodemailer = (await import("npm:nodemailer@6.9.16")).default;
    const port = Number(Deno.env.get("SMTP_PORT") ?? "465");
    transporter = nodemailer.createTransport({
      host, port, secure: port === 465,
      auth: { user: Deno.env.get("SMTP_USER"), pass: Deno.env.get("SMTP_PASS") },
    });
  }
  const fromAddr = Deno.env.get("SMTP_FROM") || Deno.env.get("SMTP_USER");
  const from = params.from_name ? `"${String(params.from_name).replace(/"/g, "")}" <${fromAddr}>` : fromAddr;
  const body = String(params.body ?? "");
  const info = await transporter.sendMail({
    from, to, subject: String(params.subject ?? ""),
    html: /<[a-z][\s\S]*>/i.test(body) ? body : undefined,
    text: /<[a-z][\s\S]*>/i.test(body) ? undefined : body,
  });
  return { success: true, message_id: info?.messageId ?? null };
}
