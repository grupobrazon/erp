// Gerado de base44/functions/fixGhlLinks/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { secrets } from "../runtime.ts";
import { fetchGhlContact } from '../shared/ghlClient.ts';
import { buildClientIndex, classifyLink, LINK_REASONS } from '../shared/ghlLinkAudit.ts';

// Desfaz os vínculos com o Atlas classificados como SUSPEITOS pela auditoria.
// Revalida cada cliente antes de agir (só desvincula o que ainda é suspeito hoje),
// limpa apenas os campos de vínculo do cadastro do ERP e registra tudo na auditoria.
// Nenhum contato, telefone ou oportunidade é alterado ou apagado no Atlas.

const MAX_IDS = 300;
const PARALLEL = 6;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const locationId = secrets.get('ghl_location_id');
    if (!locationId) return Response.json({ error: 'ghl_location_id não configurado.' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body.client_ids)
      ? [...new Set(body.client_ids.filter((id) => typeof id === 'string' && id.trim()))].slice(0, MAX_IDS)
      : [];
    if (ids.length === 0) return Response.json({ error: 'client_ids obrigatório.' }, { status: 400 });
    const dryRun = body.dry_run === true;
    if (!dryRun && body.confirm !== true) {
      return Response.json({ error: 'Confirmação obrigatória (confirm: true).' }, { status: 400 });
    }

    const svc = base44.asServiceRole.entities;
    const index = await buildClientIndex(svc);
    const results = [];

    for (let i = 0; i < ids.length; i += PARALLEL) {
      const slice = ids.slice(i, i + PARALLEL);
      const settled = await Promise.allSettled(slice.map(async (id) => {
        const client = index.byId.get(id);
        if (!client) return { client_id: id, action: 'ignorado', reason: 'cliente não encontrado' };
        if (!client.contact_id) return { client_id: id, action: 'ignorado', reason: 'sem vínculo com o Atlas' };
        const contact = await fetchGhlContact(client.contact_id, locationId, secrets).catch(() => null);
        const result = classifyLink(client, contact, index);
        return {
          ...result,
          action: result.status === 'suspeito' ? 'desvinculado' : 'mantido',
        };
      }));
      settled.forEach((item, pos) => {
        if (item.status === 'fulfilled') results.push(item.value);
        else results.push({ client_id: slice[pos], action: 'erro', reason: String(item.reason && item.reason.message ? item.reason.message : item.reason) });
      });
    }

    const toUnlink = results.filter((r) => r.action === 'desvinculado');
    const kept = results.filter((r) => r.action === 'mantido').length;
    const skipped = results.filter((r) => r.action === 'ignorado').length;
    const failed = results.filter((r) => r.action === 'erro').length;

    if (!dryRun && toUnlink.length > 0) {
      const now = new Date().toISOString();
      const patches = toUnlink.map((r) => ({
        id: r.client_id,
        ghl_contact_id: '',
        ghl_tags: [],
        ghl_deal_id: '',
        ghl_deal_title: '',
        ghl_deal_status: '',
        ghl_deal_value: 0,
        ghl_last_sync_date: now,
      }));
      for (let i = 0; i < patches.length; i += 100) {
        await svc.Client.bulkUpdate(patches.slice(i, i + 100));
      }

      const logs = toUnlink.map((r) => ({
        origem: 'vinculo',
        mensagem: `Vínculo desfeito: ${r.client_name || r.client_code || r.client_id} (${r.client_code || '—'}) estava ligado ao contato ${r.contact_name || r.contact_id} do Atlas — ${LINK_REASONS[r.reason] || r.reason}.`,
        status_http: 0,
        revisado: true,
        payload_resumido: {
          etapa: 'desvinculacao',
          client_id: r.client_id,
          client_name: r.client_name,
          client_code: r.client_code,
          contact_id: r.contact_id,
          contact_name: r.contact_name,
          motivo: r.reason,
          telefones_cliente: r.client_phones,
          telefones_contato: r.contact_phones,
          outros_clientes: r.outros || [],
        },
      }));
      for (let i = 0; i < logs.length; i += 100) {
        await svc.IntegracaoLog.bulkCreate(logs.slice(i, i + 100));
      }
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      analyzed: results.length,
      unlinked: toUnlink.length,
      kept,
      skipped,
      failed,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}