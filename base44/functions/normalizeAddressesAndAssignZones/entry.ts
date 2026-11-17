import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

/**
 * Normaliza endereços de clientes sem zona atribuída via consulta de CEP (ViaCEP),
 * atualizando o nome oficial da rua/bairro, e então reatribui as zonas de rota.
 *
 * Motivo: quando o nome da rua está escrito de forma não-padronizada, a geocodificação
 * (Nominatim/Google) falha e o cliente fica sem zona. Normalizar pelo CEP resolve isso.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Apenas administradores' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body?.dry_run;
    const limit = Math.min(Number(body?.limit) || 100, 300);
    const reassign = body?.reassign !== false;

    // Encontra clientes sem zona atribuída (route_zone_id vazio)
    const unassigned = [];
    let lastDate = null;
    while (unassigned.length < limit) {
      const query = lastDate
        ? { $and: [{ route_zone_id: "" }, { created_date: { $lt: lastDate } }] }
        : { route_zone_id: "" };
      const batch = await base44.asServiceRole.entities.Client.filter(query, "-created_date", 200);
      if (!batch || batch.length === 0) break;
      unassigned.push(...batch);
      lastDate = batch[batch.length - 1].created_date;
      if (batch.length < 200) break;
    }
    const toProcess = unassigned.slice(0, limit);

    const normalized = [];
    const skipped = [];

    for (const client of toProcess) {
      if (!client.zip_code) {
        skipped.push({ id: client.id, name: client.name, reason: "sem CEP" });
        continue;
      }
      const cleanCep = String(client.zip_code).replace(/\D/g, "");
      if (cleanCep.length !== 8) {
        skipped.push({ id: client.id, name: client.name, reason: "CEP inválido" });
        continue;
      }

      let cepData = null;
      try {
        const r = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        if (r.ok) {
          const data = await r.json();
          if (!data.erro) cepData = data;
        }
      } catch (e) {}

      if (!cepData) {
        skipped.push({ id: client.id, name: client.name, reason: "CEP não encontrado" });
        continue;
      }

      const updates = {};
      if (cepData.logradouro && cepData.logradouro !== client.street) updates.street = cepData.logradouro;
      if (cepData.bairro && cepData.bairro !== client.neighborhood) updates.neighborhood = cepData.bairro;
      if (!client.city && cepData.localidade) updates.city = cepData.localidade;
      if (!client.state && cepData.uf) updates.state = cepData.uf;

      if (Object.keys(updates).length === 0) {
        skipped.push({ id: client.id, name: client.name, reason: "endereço já normalizado" });
        continue;
      }

      normalized.push({
        id: client.id,
        name: client.name,
        old_street: client.street || "",
        new_street: updates.street || client.street || "",
        old_neighborhood: client.neighborhood || "",
        new_neighborhood: updates.neighborhood || client.neighborhood || "",
      });

      if (!dryRun) {
        await base44.asServiceRole.entities.Client.update(client.id, updates);
      }
    }

    // Reatribui as zonas dos clientes sem zona (agora com endereços normalizados)
    let reassignResult = null;
    if (reassign && normalized.length > 0 && !dryRun) {
      try {
        const rr = await base44.functions.invoke("assignClientsToZones", { only_unassigned: true });
        reassignResult = rr?.data || rr;
      } catch (e) {
        reassignResult = { error: e.message };
      }
    }

    return Response.json({
      dryRun,
      scanned: toProcess.length,
      normalized: normalized.length,
      skipped: skipped.length,
      normalizedClients: normalized,
      skippedClients: skipped,
      reassign: reassignResult,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}