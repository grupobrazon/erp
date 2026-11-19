// Servidor das funções do ERP. Rotas: POST /functions/<nome>, GET /functions/_health.
import { registry } from "./functions/registry.ts";
import { B44Error } from "./b44.ts";
import { importSecrets, loadSecrets } from "./secretsStore.ts";

const PORT = Number(Deno.env.get("PORT") ?? "8000");

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

Deno.serve({ port: PORT, hostname: "0.0.0.0" }, async (req) => {
  const { pathname } = new URL(req.url);
  const m = pathname.match(/^\/functions\/([A-Za-z0-9_-]+)\/?$/);
  if (!m) return json({ error: "Rota não encontrada" }, 404);
  const name = m[1];

  if (name === "_importSecrets") {
    return await importSecrets(req).catch((e) => json({ error: (e as Error).message }, 500));
  }
  if (name === "_health") {
    return json({ ok: true, migradas: Object.keys(registry).length });
  }
  const load = registry[name];
  if (!load) {
    return json({ error: `A função "${name}" ainda não foi migrada para o novo servidor.` }, 501);
  }
  try {
    const mod = await load();
    return await mod.default(req);
  } catch (err) {
    const status = err instanceof B44Error ? err.status : 500;
    console.error(`[${name}]`, err);
    return json({ error: (err as Error).message || "Erro interno" }, status);
  }
});

console.log(`Funções do ERP ouvindo na porta ${PORT}`);

// Segredos guardados no banco (trazidos da Base44): carrega agora e confere a cada 5 minutos.
const refreshSecrets = () =>
  loadSecrets().then((n) => n.length && console.log(`Segredos carregados: ${n.join(", ")}`)).catch(() => {});
refreshSecrets();
setInterval(refreshSecrets, 5 * 60 * 1000);
