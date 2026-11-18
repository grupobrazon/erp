// Login com a senha da Base44 (migração transparente de senha).
//
// As senhas não saem da Base44. Quando alguém tenta entrar no sistema novo e a senha
// ainda não existe aqui, o site chama esta função: ela confere e-mail e senha no login
// da própria Base44 e, se estiverem certos, grava a mesma senha no login do Supabase.
// Daí em diante a pessoa entra direto, com o mesmo e-mail e a mesma senha de sempre.
//
// Só vale para quem já é usuário do ERP (registro em "User", copiado da Base44).
// Variáveis: BASE44_APP_ID, BASE44_APP_URL (padrão https://brazon-comercial.base44.app),
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ID = Deno.env.get("BASE44_APP_ID") ?? "";
const APP_URL = (Deno.env.get("BASE44_APP_URL") ?? "https://brazon-comercial.base44.app").replace(/\/$/, "");
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Limite simples de tentativas por e-mail (5 a cada 10 minutos), além do da própria Base44.
const attempts = new Map<string, number[]>();
function tooMany(email: string) {
  const now = Date.now();
  const list = (attempts.get(email) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  attempts.set(email, list);
  return list.length > 5;
}

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status });

export default async function legacyLogin(req: Request): Promise<Response> {
  if (!APP_ID || !SB_URL || !SB_KEY) return fail(503, "Login da Base44 ainda não configurado no servidor");
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) return fail(400, "Informe e-mail e senha");
  if (tooMany(email)) return fail(429, "Muitas tentativas. Aguarde alguns minutos.");

  const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: profile } = await sb.from("User").select("id, disabled, role").ilike("email", email).maybeSingle();
  if (!profile || profile.disabled || !profile.role) return fail(401, "E-mail ou senha inválidos");

  const check = await fetch(`${APP_URL}/api/apps/${APP_ID}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const result = await check.json().catch(() => ({}));
  if (!check.ok || !result?.access_token) {
    if (result?.mfa_session_token) return fail(409, "Sua conta usa verificação em duas etapas; peça ao admin um link de nova senha.");
    return fail(401, "E-mail ou senha inválidos");
  }

  const { data: authId } = await sb.rpc("b44_auth_user_id", { p_email: email });
  if (authId) {
    const { error } = await sb.auth.admin.updateUserById(authId as string, { password, email_confirm: true });
    if (error) return fail(500, `Não foi possível atualizar a senha: ${error.message}`);
  } else {
    const { error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) return fail(500, `Não foi possível criar o acesso: ${error.message}`);
  }
  return Response.json({ ok: true });
}
