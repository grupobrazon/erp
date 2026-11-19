// Gerado de base44/functions/sync3CUsers/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { call3C } from "../shared/threeCPlus.ts";

/**
 * Gerencia usuários (agentes) do 3C Plus.
 *
 * Query params:
 *   action=list   (padrão) → lista todos os usuários ativos do 3C Plus
 *   action=create → cria um novo usuário (agente) no 3C Plus
 *     Body: { name, extension_number, email, password, timezone }
 *
 * A configuração (api_token, base_url) é lida da entidade SystemSetting.
 */
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Carregar config do 3C Plus
    const settings = await base44.entities.SystemSetting.list("-created_date", 1);
    const setting = settings[0] || {};
    const config = {
      apiToken: setting.threec_api_token || "",
      baseUrl: setting.threec_base_url || "",
    };
    if (!config.apiToken) {
      return Response.json({
        error: "Token da API do 3C Plus não configurado. Defina threec_api_token em Configurações > Sistema.",
      }, { status: 400 });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "list";

    if (action === "list") {
      // Listar usuários ativos do 3C Plus
      const result = await call3C("GET", "/users", config, { params: { active: 1 } });
      if (!result.ok) {
        return Response.json({
          error: "Falha ao listar usuários do 3C Plus",
          details: result.data,
        }, { status: 502 });
      }
      const users = (result.data?.data || []).map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email || "",
        extension_number: u.extension_number || "",
        role: u.role || "",
        active: u.active,
      }));
      return Response.json({ users });
    }

    if (action === "create") {
      // Criar um novo usuário (agente) no 3C Plus
      const body = await req.json();
      const { name, extension_number, email, password } = body;
      const timezone = body.timezone || "America/Sao_Paulo";

      if (!name || !extension_number || !password) {
        return Response.json({
          error: "name, extension_number e password são obrigatórios",
        }, { status: 400 });
      }

      const result = await call3C("POST", "/users", config, {
        form: {
          name,
          extension_number: Number(extension_number),
          email: email || "",
          password,
          role: "agent",
          timezone,
          date_format: "d/m/Y",
          hour_format: "H:i:s",
        },
      });

      if (!result.ok) {
        return Response.json({
          error: "Falha ao criar usuário no 3C Plus",
          details: result.data,
        }, { status: 502 });
      }

      return Response.json({
        ok: true,
        user: result.data?.data,
      });
    }

    return Response.json({ error: `Ação não reconhecida: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}