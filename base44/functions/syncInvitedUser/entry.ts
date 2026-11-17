import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const invitations = await base44.asServiceRole.entities.Invitation.filter({ status: "Pendente" });
    if (invitations.length === 0) {
      return Response.json({ ok: true, skipped: true, reason: "no_pending" });
    }

    const users = await base44.asServiceRole.entities.User.list("-created_date", 200);
    const userByEmail = {};
    users.forEach(u => { if (u.email) userByEmail[u.email.toLowerCase()] = u; });

    // Pré-busca vendedores vinculados aos convites pendentes (para foto + nome)
    const sellerIds = [...new Set(invitations.map(i => i.seller_id).filter(Boolean))];
    const sellers = {};
    if (sellerIds.length > 0) {
      const allSellers = await base44.asServiceRole.entities.Seller.list("-created_date", 200);
      allSellers.forEach(s => { sellers[s.id] = s; });
    }

    let synced = 0;
    for (const inv of invitations) {
      const user = userByEmail[inv.email?.toLowerCase()];
      if (!user) continue;

      const updateData = { role: inv.role };
      if (inv.full_name) updateData.full_name = inv.full_name;
      if (inv.photo_url) updateData.photo_url = inv.photo_url;
      if (inv.technician_id) updateData.technician_id = inv.technician_id;

      // Vínculo de vendedor + foto (do cadastro do vendedor) — apenas se não há foto no convite
      if (inv.seller_id && sellers[inv.seller_id] && !inv.photo_url) {
        updateData.seller_id = inv.seller_id;
        if (sellers[inv.seller_id].photo_url) {
          updateData.photo_url = sellers[inv.seller_id].photo_url;
        }
      }

      try {
        await base44.asServiceRole.entities.User.update(user.id, updateData);
      } catch (e) {
        await base44.asServiceRole.entities.User.update(user.id, { role: inv.role });
      }

      await base44.asServiceRole.entities.Invitation.update(inv.id, { status: "Aceito" });
      synced++;
    }

    return Response.json({ ok: true, synced, total_pending: invitations.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});