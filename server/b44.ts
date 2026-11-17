// Equivalente a createClientFromRequest da Base44, para as funções de backend.
// - base44.entities / functions / integrations: agem como o usuário que chamou
//   (as regras de acesso do banco valem).
// - base44.asServiceRole: acesso total, só para o que a função precisa fazer além
//   do usuário. Cada uso deve vir depois de conferir o perfil (requireRole).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  B44Error,
  createEntities,
  createFunctions,
  createIntegrations,
  toB44User,
} from "../src/api/b44compat.js";

const URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SELF = `http://127.0.0.1:${Deno.env.get("PORT") ?? "8000"}/functions`;

function bundle(sb: SupabaseClient, anonKey: string) {
  const functions = createFunctions({ sb, url: URL, anonKey, functionsUrl: SELF });
  return {
    entities: createEntities(sb),
    functions,
    integrations: createIntegrations({ sb, functions }),
  };
}

let serviceClient: SupabaseClient | null = null;
function service(): SupabaseClient {
  if (!SERVICE) throw new B44Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor", 500);
  serviceClient ??= createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  return serviceClient;
}

export function createClientFromRequest(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const sb = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });

  const auth = {
    async me() {
      if (!token) throw new B44Error("Autenticação necessária", 401);
      const { data: { user }, error } = await sb.auth.getUser(token);
      if (error || !user) throw new B44Error("Sessão inválida ou expirada", 401);
      const { data: row } = await service().from("User").select("*").eq("auth_id", user.id).maybeSingle();
      if (!row || row.disabled || !row.role) throw new B44Error("Usuário não liberado para o ERP", 403);
      return toB44User(row, user);
    },
  };

  return {
    ...bundle(sb, ANON),
    auth,
    get asServiceRole() {
      return bundle(service(), SERVICE);
    },
  };
}

// Confere se o usuário logado tem algum dos perfis (principal ou adicional).
export async function requireRole(base44: ReturnType<typeof createClientFromRequest>, roles: string[]) {
  const user = await base44.auth.me();
  const all = [user.role, ...((user.additional_roles as string[]) ?? [])];
  if (!roles.some((r) => all.includes(r))) {
    throw new B44Error("Seu perfil não tem permissão para esta ação", 403);
  }
  return user;
}

export { B44Error };
