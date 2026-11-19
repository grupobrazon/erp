// Gerado de base44/functions/generateRemessaOs/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { remessa_id, os_type } = await req.json();
    if (!remessa_id) return Response.json({ error: 'remessa_id é obrigatório' }, { status: 400 });
    if (!os_type) return Response.json({ error: 'os_type é obrigatório' }, { status: 400 });

    const validTypes = ['Expedição', 'Entrega', 'Entrega + Instalação'];
    if (!validTypes.includes(os_type)) {
      return Response.json({ error: 'os_type inválido. Use: Expedição, Entrega ou Entrega + Instalação' }, { status: 400 });
    }

    const remessa = await base44.entities.Remessa.get(remessa_id);
    if (!remessa) return Response.json({ error: 'Remessa não encontrada' }, { status: 404 });

    // Verifica se já existe OS para esta remessa
    const existing = await base44.entities.ServiceOrder.filter({ remessa_id });
    if (existing.length > 0) {
      return Response.json({
        error: 'Já existe uma ordem de serviço para esta remessa',
        service_order: existing[0],
      }, { status: 400 });
    }

    // Gera código da OS
    const allOS = await base44.entities.ServiceOrder.list('-created_date', 1000);
    const maxNum = allOS.reduce((max, o) => {
      const num = parseInt(o.code?.replace('OS', '')) || 0;
      return num > max ? num : max;
    }, 0);
    const code = `OS${String(maxNum + 1).padStart(6, '0')}`;

    const today = new Date().toISOString().split('T')[0];

    // Cria a OS com os mesmos campos de uma OS de venda
    const os = await base44.entities.ServiceOrder.create({
      code,
      client_id: remessa.client_id,
      client_name: remessa.client_name || '',
      remessa_id: remessa.id,
      remessa_code: remessa.code || '',
      type: os_type,
      delivery_modality: remessa.delivery_modality || '',
      delivery_address: remessa.delivery_address || {},
      date: today,
      status: 'Produção/Expedição',
      has_pending_payment: false,
      pending_payment_amount: 0,
      service_description: `OS de ${os_type} — Remessa ${remessa.code || ''} (${remessa.remessa_type})`,
    });

    // Vincula a OS de volta à remessa
    await base44.entities.Remessa.update(remessa.id, {
      os_id: os.id,
      os_code: os.code,
    });

    return Response.json({ success: true, service_order: os });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});