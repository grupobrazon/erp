// Ponte Base44 -> Supabase: copia continuamente os registros das 65 entidades e os
// usuários do app na Base44 para o banco novo, mantendo ids, datas e autores.
//
// Variáveis: BASE44_APP_ID, BASE44_TOKEN (token de acesso pessoal de um usuário com
// acesso de editor ao app), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Opcionais: SYNC_INTERVAL_SECONDS (padrão 120), BASE44_API (padrão https://app.base44.com).
//
// A cada rodada, cada entidade busca só o que mudou desde a última (updated_date).
// A cada 10 rodadas, confere a lixeira da Base44 e apaga aqui o que foi apagado lá.
// A cada 30 rodadas (cerca de 1 hora), recopia tudo, como rede de segurança caso algum
// registro tenha escapado do filtro por data.
// O ritmo fica abaixo do limite da Base44 (70 consultas por minuto na listagem).
import { createClient } from "npm:@supabase/supabase-js@2";
import { ENTITY_COLUMNS } from "../src/api/entityColumns.js";

const API = (Deno.env.get("BASE44_API") ?? "https://app.base44.com").replace(/\/$/, "");
const APP_ID = Deno.env.get("BASE44_APP_ID") ?? "";
const TOKEN = Deno.env.get("BASE44_TOKEN") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INTERVAL = Math.max(30, Number(Deno.env.get("SYNC_INTERVAL_SECONDS") ?? "120")) * 1000;
const GAP_MS = Number(Deno.env.get("SYNC_GAP_MS") ?? "1100"); // ~54 consultas por minuto
const CHUNK = 500;

const ENTITIES = Object.keys(ENTITY_COLUMNS).filter((e) => e !== "User");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

type Row = Record<string, unknown> & { id?: string; updated_date?: string };

async function base44(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${API}/api/apps/${APP_ID}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (res.status === 429 && attempt <= 5) {
      const wait = Number(res.headers.get("retry-after") ?? "30") * 1000;
      log(`Base44 pediu pausa (429); aguardando ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Base44 ${res.status} em ${path}: ${body.slice(0, 300)}`);
    }
    await sleep(GAP_MS);
    return res.json();
  }
}

async function main() {
  const missing = Object.entries({ BASE44_APP_ID: APP_ID, BASE44_TOKEN: TOKEN, SUPABASE_URL: SB_URL, SUPABASE_SERVICE_ROLE_KEY: SB_KEY })
    .filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    log(`Sincronização parada: faltam as variáveis ${missing.join(", ")}. Preencha no painel e reinicie.`);
    // Fica de pé para não reiniciar em loop; confere de novo a cada 10 minutos.
    await sleep(10 * 60 * 1000);
    Deno.exit(0);
  }

  const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  async function upsert(entity: string, rows: Row[]) {
    let n = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { data, error } = await sb.rpc("b44_sync_upsert", { p_entity: entity, p_rows: rows.slice(i, i + CHUNK) });
      if (error) throw new Error(`Supabase ao gravar ${entity}: ${error.message}`);
      n += data ?? 0;
    }
    return n;
  }

  async function state(entity: string) {
    const { data } = await sb.from("b44_sync_state").select("*").eq("entity", entity).maybeSingle();
    return data as { last_updated: string | null; rows_total: number } | null;
  }

  async function saveState(entity: string, patch: Record<string, unknown>) {
    const { error } = await sb.from("b44_sync_state").upsert({ entity, ...patch, last_run: new Date().toISOString() });
    if (error) log(`Aviso: não gravei o estado de ${entity}: ${error.message}`);
  }

  async function syncEntity(entity: string, full = false) {
    const st = await state(entity);
    const since = full ? null : st?.last_updated ?? null;
    let last = st?.last_updated ?? null;
    let total = 0;
    let cursor: string | undefined;
    do {
      const params: Record<string, string> = { limit: "5000", sort: "updated_date" };
      if (since) params.q = JSON.stringify({ updated_date: { $gt: since } });
      if (cursor) params.cursor = cursor;
      const page = await base44(`/entities/${entity}/v2/list`, params) as { items: Row[]; next_cursor?: string; has_more?: boolean };
      const items = page.items ?? [];
      if (items.length) {
        total += await upsert(entity, items);
        const maxU = items.map((r) => String(r.updated_date ?? "")).sort().at(-1);
        if (maxU && (!last || maxU > last)) last = maxU;
      }
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);
    await saveState(entity, { last_updated: last, rows_total: (st?.rows_total ?? 0) + total, last_error: null });
    if (total) log(`${entity}: ${total} registro(s) copiados`);
  }

  async function syncUsers() {
    const users = await base44("/entities/User") as Row[];
    const n = await upsert("User", users ?? []);
    await saveState("User", { rows_total: users?.length ?? 0, last_error: null });
    log(`Usuários: ${n} sincronizado(s)`);
  }

  async function syncTrash(entity: string) {
    const deleted = await base44(`/entities/${entity}/trash`) as Row[];
    const ids = (deleted ?? []).map((r) => r.id).filter(Boolean) as string[];
    if (!ids.length) return;
    const { data, error } = await sb.rpc("b44_sync_delete", { p_entity: entity, p_ids: ids });
    if (error) throw new Error(`Supabase ao apagar ${entity}: ${error.message}`);
    if (data) log(`${entity}: ${data} registro(s) apagados (estavam na lixeira da Base44)`);
  }

  log(`Ponte Base44 -> Supabase iniciada: app ${APP_ID}, ${ENTITIES.length} entidades + usuários, a cada ${INTERVAL / 1000}s`);
  let round = 0;
  let trashAllowed = true;
  while (true) {
    const started = Date.now();
    round++;
    try {
      await syncUsers();
    } catch (e) {
      log(`Usuários: ${(e as Error).message}`);
      await saveState("User", { last_error: (e as Error).message });
    }
    for (const entity of ENTITIES) {
      try {
        await syncEntity(entity, round % 30 === 0);
        if (trashAllowed && round % 10 === 1) await syncTrash(entity);
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("/trash") && / 40[13] /.test(msg)) {
          trashAllowed = false;
          log("Lixeira indisponível com este token (precisa de acesso de editor); exclusões não serão copiadas.");
        } else {
          log(`${entity}: ${msg}`);
          await saveState(entity, { last_error: msg });
        }
      }
    }
    log(`Rodada ${round} concluída em ${Math.round((Date.now() - started) / 1000)}s`);
    await sleep(Math.max(5000, INTERVAL - (Date.now() - started)));
  }
}

main();
