// Gerado de base44/functions/applyInvitationProfile/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const email = (user.email || "").trim().toLowerCase();
    if (!email) {
      return Response.json({ error: 'Usuário sem e-mail' }, { status: 400 });
    }

    const invitations = await base44.asServiceRole.entities.Invitation.filter({
      email: { $regex: email, $options: "i" },
      status: "Pendente",
    });

    if (invitations.length === 0) {
      return Response.json({ ok: true, skipped: true, reason: "no_pending_invitation" });
    }

    const inv = invitations[0];

    const updateData = { role: inv.role };
    if (inv.full_name) updateData.full_name = inv.full_name;
    if (inv.photo_url) updateData.photo_url = inv.photo_url;
    if (inv.technician_id) updateData.technician_id = inv.technician_id;

    if (inv.seller_id && !inv.photo_url) {
      const sellers = await base44.asServiceRole.entities.Seller.filter({ id: inv.seller_id });
      if (sellers.length > 0) {
        updateData.seller_id = inv.seller_id;
        if (sellers[0].photo_url) {
          updateData.photo_url = sellers[0].photo_url;
        }
      }
    }

    try {
      await base44.asServiceRole.entities.User.update(user.id, updateData);
    } catch (e) {
      await base44.asServiceRole.entities.User.update(user.id, { role: inv.role });
    }

    await base44.asServiceRole.entities.Invitation.update(inv.id, { status: "Aceito" });

    return Response.json({ ok: true, applied: true, role: inv.role, full_name: inv.full_name || null });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});