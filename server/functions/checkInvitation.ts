// Gerado de base44/functions/checkInvitation/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

export default (async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const email = (body.email || "").toString().trim().toLowerCase();
    if (!email) {
      return Response.json({ error: "E-mail não informado" }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const invitations = await base44.asServiceRole.entities.Invitation.filter({
      email: { $regex: email, $options: "i" },
    });

    const hasInvitation = invitations.length > 0;
    return Response.json({ has_invitation: hasInvitation });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});