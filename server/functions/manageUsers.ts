// Gerado de base44/functions/manageUsers/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const allRoles = [user.role, ...(user.additional_roles || [])].filter(Boolean);
    const isAdmin = allRoles.includes('admin');
    const isSupervisor = allRoles.includes('supervisor');

    if (!isAdmin && !isSupervisor) {
      return Response.json({ error: 'Acesso restrito a administradores e supervisores' }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body;
    const supervisorAllowedRoles = ['vendedor', 'logistica', 'pos_vendas', 'tecnico'];

    if (action === 'list') {
      const users = await base44.asServiceRole.entities.User.list('-created_date', 200);
      return Response.json({ users });
    }

    if (action === 'invite') {
      const { email, full_name, role, seller_id, photo_url, technician_id } = body;

      if (!isAdmin && !supervisorAllowedRoles.includes(role)) {
        return Response.json({ error: 'Perfil não permitido para supervisor' }, { status: 403 });
      }

      const platformRole = isAdmin && role === 'admin' ? 'admin' : 'user';

      // Tenta enviar o convite da plataforma; se falhar (ex: já convidado), continua
      try {
        await base44.users.inviteUser(email, platformRole);
      } catch (_inviteErr) {
        // Convite da plataforma pode já existir — prossegue para criar/atualizar o registro interno
      }

      // Se já existe um convite pendente para este email, atualiza em vez de duplicar
      const existing = await base44.asServiceRole.entities.Invitation.filter({
        email: { $regex: email, $options: 'i' },
        status: 'Pendente',
      });
      if (existing.length > 0) {
        await base44.asServiceRole.entities.Invitation.update(existing[0].id, {
          full_name: full_name || undefined,
          role,
          seller_id: seller_id || undefined,
          technician_id: technician_id || undefined,
          photo_url: photo_url || undefined,
          sent_date: new Date().toISOString(),
        });
      } else {
        await base44.asServiceRole.entities.Invitation.create({
          email,
          full_name: full_name || undefined,
          role,
          seller_id: seller_id || undefined,
          technician_id: technician_id || undefined,
          photo_url: photo_url || undefined,
          status: 'Pendente',
          sent_date: new Date().toISOString(),
        });
      }

      // Tenta aplicar role/foto/vendedor imediatamente se o usuário já existir
      try {
        const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 200);
        const invitedUser = allUsers.find(u => u.email === email);
        if (invitedUser) {
          const updateData = { role };
          if (seller_id) updateData.seller_id = seller_id;
          if (technician_id) updateData.technician_id = technician_id;
          if (photo_url) {
            updateData.photo_url = photo_url;
          } else if (seller_id) {
            const sellers = await base44.asServiceRole.entities.Seller.list('-created_date', 200);
            const seller = sellers.find(s => s.id === seller_id);
            if (seller?.photo_url) updateData.photo_url = seller.photo_url;
          }
          await base44.asServiceRole.entities.User.update(invitedUser.id, updateData);
        }
      } catch (_e) {
        // Sincronização deferida para syncInvitedUser
      }

      return Response.json({ ok: true });
    }

    if (action === 'update') {
      const { user_id, full_name, role, additional_roles, seller_id, technician_id, extra_permissions } = body;

      if (!isAdmin && !supervisorAllowedRoles.includes(role)) {
        return Response.json({ error: 'Perfil não permitido para supervisor' }, { status: 403 });
      }

      if (!isAdmin && Array.isArray(additional_roles)) {
        for (const r of additional_roles) {
          if (!supervisorAllowedRoles.includes(r)) {
            return Response.json({ error: 'Perfil adicional não permitido para supervisor' }, { status: 403 });
          }
        }
      }

      const updateData = {
        role,
        additional_roles: additional_roles || [],
        seller_id: seller_id || '',
        technician_id: technician_id || '',
      };
      if (full_name !== undefined) updateData.display_name = full_name;
      if (extra_permissions !== undefined) updateData.extra_permissions = extra_permissions;

      await base44.asServiceRole.entities.User.update(user_id, updateData);
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});