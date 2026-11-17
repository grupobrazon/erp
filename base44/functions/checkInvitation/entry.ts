import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
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