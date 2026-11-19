// Gerado de base44/functions/syncPendingNFe/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { syncNFeStatus } from "../shared/nfeStatusSync.ts";

/**
 * Rotina automática: varre as NF-e que ficaram em processamento na SEFAZ e
 * consulta o status na Focus NFe, autorizando-as (ou registrando a rejeição)
 * sem depender do clique em "Consultar Status".
 *
 * Chamada pelo workflow agendado (a cada 5 minutos).
 */
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const db = base44.asServiceRole;

    const [osPage, remPage] = await Promise.all([
      db.entities.ServiceOrder.filter({ nfe_status: 'processando' }, { sort: 'created_date', limit: 200 }),
      db.entities.Remessa.filter({ nfe_status: 'processando' }, { sort: 'created_date', limit: 200 }),
    ]);

    const targets = [
      ...(osPage.items || []).filter((o) => o.nfe_ref).map((o) => ({ label: o.code, osId: o.id })),
      ...(remPage.items || []).filter((r) => r.nfe_ref).map((r) => ({ label: r.code, remessaId: r.id })),
    ];

    const results = [];
    for (let i = 0; i < targets.length; i += 6) {
      const batch = targets.slice(i, i + 6);
      const settled = await Promise.allSettled(batch.map((t) => syncNFeStatus(db, t)));
      settled.forEach((s, idx) => {
        results.push({
          registro: batch[idx].label,
          status: s.status === 'fulfilled' ? s.value.status : 'erro',
          erro: s.status === 'rejected' ? s.reason?.message : undefined,
        });
      });
    }

    const autorizadas = results.filter((r) => r.status === 'autorizado').length;
    return Response.json({ checked: targets.length, autorizadas, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}