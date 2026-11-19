// Segredos das integrações guardados no banco (tabela b44_app_secrets, só o servidor lê).
// Viram variáveis de ambiente das funções, como os "secrets" da Base44.
// O que estiver preenchido no painel da Hostinger (.env) tem prioridade e não é trocado.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const fromPanel = new Set(Object.entries(Deno.env.toObject()).filter(([, v]) => v).map(([k]) => k));

function db() {
  return createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function loadSecrets(): Promise<string[]> {
  if (!URL || !SERVICE) return [];
  const { data, error } = await db().from("b44_app_secrets").select("name, value");
  if (error) {
    console.error("Segredos: não consegui ler do banco:", error.message);
    return [];
  }
  const loaded: string[] = [];
  for (const row of data ?? []) {
    if (fromPanel.has(row.name) || !row.value) continue;
    Deno.env.set(row.name, row.value);
    loaded.push(row.name);
  }
  return loaded;
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,99}$/;

// POST /functions/_importSecrets  { token, secrets: { NOME: valor } }
// A senha é de uso único: depois de uma importação certa, ela deixa de valer.
export async function importSecrets(req: Request): Promise<Response> {
  if (req.method !== "POST") return Response.json({ error: "use POST" }, { status: 405 });
  const body = await req.json().catch(() => null) as { token?: string; secrets?: Record<string, unknown> } | null;
  const token = String(body?.token ?? "");
  if (!token || !body?.secrets || typeof body.secrets !== "object") {
    return Response.json({ error: "pedido inválido" }, { status: 400 });
  }
  const client = db();
  const hash = await sha256(token);
  const { data: tok } = await client.from("b44_import_tokens").select("sha256")
    .eq("sha256", hash).eq("purpose", "secrets").gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!tok) return Response.json({ error: "senha inválida ou já usada" }, { status: 403 });

  const rows = Object.entries(body.secrets)
    .filter(([k, v]) => NAME_RE.test(k) && typeof v === "string" && v.length > 0 && v.length < 10_000)
    .map(([name, value]) => ({ name, value: value as string, source: "base44", updated_at: new Date().toISOString() }));
  if (!rows.length) return Response.json({ error: "nenhum segredo recebido" }, { status: 400 });

  const { error } = await client.from("b44_app_secrets").upsert(rows);
  if (error) return Response.json({ error: "não consegui gravar" }, { status: 500 });
  await client.from("b44_import_tokens").delete().eq("sha256", hash);
  for (const r of rows) if (!fromPanel.has(r.name)) Deno.env.set(r.name, r.value);
  const names = rows.map((r) => r.name);
  console.log(`Segredos importados da Base44: ${names.join(", ")}`);
  return Response.json({ ok: true, recebidos: names });
}
