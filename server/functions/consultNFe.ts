// Gerado de base44/functions/consultNFe/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { syncNFeStatus } from "../shared/nfeStatusSync.ts";

/**
 * Consulta o status de uma NF-e enviada à Focus NFe que voltou em processamento (202).
 * Body: { os_id? } ou { remessa_id? }
 */
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { os_id, remessa_id } = await req.json().catch(() => ({}));
    if (!os_id && !remessa_id) {
      return Response.json({ error: 'os_id ou remessa_id é obrigatório' }, { status: 400 });
    }

    try {
      const result = await syncNFeStatus(base44, { osId: os_id, remessaId: remessa_id });
      return Response.json(result);
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}