// Gerado de base44/functions/alerts/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

export default async function handler(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const action = String(body.action || '');

    if (action === 'list') {
      const alerts = await base44.asServiceRole.entities.Alert.filter(
        { user_id: user.id },
        '-created_date',
        200
      );
      return Response.json({ alerts });
    }

    if (action === 'acknowledge') {
      const alert_id = String(body.alert_id || '');
      if (!alert_id) return Response.json({ error: 'alert_id obrigatório' }, { status: 400 });
      const alert = await base44.asServiceRole.entities.Alert.get(alert_id);
      if (!alert) return Response.json({ error: 'Alerta não encontrado' }, { status: 404 });
      if (alert.user_id !== user.id) return Response.json({ error: 'Sem permissão' }, { status: 403 });
      const updated = await base44.asServiceRole.entities.Alert.update(alert_id, {
        read: true,
        read_date: new Date().toISOString(),
      });
      return Response.json({ success: true, alert: updated });
    }

    if (action === 'acknowledge_all') {
      const alerts = await base44.asServiceRole.entities.Alert.filter({ user_id: user.id, read: false });
      for (const a of alerts) {
        await base44.asServiceRole.entities.Alert.update(a.id, {
          read: true,
          read_date: new Date().toISOString(),
        });
      }
      return Response.json({ success: true, count: alerts.length });
    }

    if (action === 'create') {
      const role = user.role || '';
      const additionalRoles = Array.isArray(user.additional_roles) ? user.additional_roles : [];
      const allRoles = [role, ...additionalRoles].filter(Boolean);
      const canCreate = allRoles.length === 0 ||
        allRoles.includes('admin') || allRoles.includes('supervisor') ||
        allRoles.includes('financeiro') || allRoles.includes('contas_receber');
      if (!canCreate) return Response.json({ error: 'Sem permissão para criar alerta' }, { status: 403 });

      const { user_id, seller_id, user_name, type, title, message, related_sale_id, related_order_number } = body;
      let targetUserId = user_id ? String(user_id) : '';
      let targetUserName = user_name ? String(user_name) : '';
      if (!targetUserId && seller_id) {
        const users = await base44.asServiceRole.entities.User.filter({ seller_id: String(seller_id) });
        if (users.length > 0) {
          targetUserId = users[0].id;
          targetUserName = targetUserName || users[0].full_name || users[0].email || '';
        }
      }
      // target_role: cria um alerta para cada usuário com aquele papel (ex: pos_vendas)
      if (!targetUserId && body.target_role) {
        const roleUsers = await base44.asServiceRole.entities.User.filter({ role: String(body.target_role) });
        const additional = await base44.asServiceRole.entities.User.filter({});
        const all = [...roleUsers];
        for (const u of additional) {
          if (all.some((x) => x.id === u.id)) continue;
          const extra = Array.isArray(u.additional_roles) ? u.additional_roles : [];
          if (extra.includes(String(body.target_role))) all.push(u);
        }
        if (all.length === 0) return Response.json({ error: 'Nenhum usuário encontrado para o papel informado' }, { status: 400 });
        const created = [];
        for (const u of all) {
          const alert = await base44.asServiceRole.entities.Alert.create({
            user_id: u.id,
            user_name: u.full_name || u.email || '',
            type: String(type || 'Outro'),
            title: String(title),
            message: String(message),
            related_sale_id: related_sale_id ? String(related_sale_id) : '',
            related_order_number: related_order_number ? String(related_order_number) : '',
            read: false,
            created_by_name: user.full_name || user.email || '',
          });
          created.push(alert);
        }
        return Response.json({ success: true, alerts: created });
      }
      if (!targetUserId) return Response.json({ error: 'Não foi possível identificar o destinatário do alerta' }, { status: 400 });
      if (!title || !message) return Response.json({ error: 'title e message são obrigatórios' }, { status: 400 });

      const alert = await base44.asServiceRole.entities.Alert.create({
        user_id: targetUserId,
        user_name: targetUserName,
        type: String(type || 'Outro'),
        title: String(title),
        message: String(message),
        related_sale_id: related_sale_id ? String(related_sale_id) : '',
        related_order_number: related_order_number ? String(related_order_number) : '',
        read: false,
        created_by_name: user.full_name || user.email || '',
      });
      return Response.json({ success: true, alert });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
