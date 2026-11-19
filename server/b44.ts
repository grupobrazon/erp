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
import { extractDataFromUploadedFile, invokeLLM, sendEmail } from "./integrations.ts";

const URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SELF = `http://127.0.0.1:${Deno.env.get("PORT") ?? "8000"}/functions`;
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://erp.brazon.online").replace(/\/$/, "");

// Usuário usado quando uma função é chamada pelo próprio sistema (asServiceRole.functions.invoke,
// automações). Equivale à "service role" da Base44.
const SYSTEM_USER = {
  id: "system", email: "sistema@erp.brazon.online", full_name: "Sistema ERP",
  role: "admin", additional_roles: [], disabled: false,
};

function bundle(sb: SupabaseClient, token: string) {
  const functions = createFunctions({ sb, url: URL, anonKey: ANON, functionsUrl: SELF, token });
  const integrations = createIntegrations({ sb, functions });
  // No servidor, IA, leitura de arquivo e e-mail rodam aqui mesmo (sem ida e volta HTTP).
  Object.assign(integrations.Core, {
    InvokeLLM: invokeLLM,
    ExtractDataFromUploadedFile: extractDataFromUploadedFile,
    SendEmail: sendEmail,
  });
  return {
    entities: createEntities(sb),
    functions,
    integrations,
    users: {
      // Convite: o Supabase manda o e-mail com o link para criar a senha.
      async inviteUser(email: string, _role?: string) {
        const { error } = await service().auth.admin.inviteUserByEmail(String(email).trim().toLowerCase(), {
          redirectTo: `${SITE_URL}/reset-password?token=recovery`,
        });
        if (error) throw new B44Error(error.message, error.status ?? 400);
        return { success: true };
      },
    },
    connectors: {
      // Conectores OAuth gerenciados pela Base44 (ex.: Google Agenda) ainda não existem aqui.
      getCurrentAppUserConnection(_id: string): never {
        throw new B44Error("Conector do Google Agenda ainda não configurado no sistema novo.", 501);
      },
      getAccessToken(_id: string): never {
        throw new B44Error("Conector do Google Agenda ainda não configurado no sistema novo.", 501);
      },
    },
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
  const sb = SERVICE && token === SERVICE ? service() : createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });

  const auth = {
    async me() {
      if (!token) throw new B44Error("Autenticação necessária", 401);
      if (SERVICE && token === SERVICE) return { ...SYSTEM_USER };
      const { data: { user }, error } = await sb.auth.getUser(token);
      if (error || !user) throw new B44Error("Sessão inválida ou expirada", 401);
      const { data: row } = await service().from("User").select("*").eq("auth_id", user.id).maybeSingle();
      if (!row || row.disabled || !row.role) throw new B44Error("Usuário não liberado para o ERP", 403);
      return toB44User(row, user);
    },
  };

  return {
    ...bundle(sb, token),
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
