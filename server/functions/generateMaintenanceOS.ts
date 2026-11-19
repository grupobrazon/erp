// Gerado de base44/functions/generateMaintenanceOS/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { client_id, equipment_id, subtype, description, items, delivery_address, service_detail_types, service_detail_notes } = await req.json();
    if (!client_id) return Response.json({ error: 'client_id é obrigatório' }, { status: 400 });
    if (!subtype) return Response.json({ error: 'subtype é obrigatório (Análise, Garantia, Assistência Técnica)' }, { status: 400 });

    const validSubtypes = ['Análise', 'Garantia', 'Assistência Técnica'];
    if (!validSubtypes.includes(subtype)) {
      return Response.json({ error: 'subtype inválido' }, { status: 400 });
    }

    // Busca o cliente
    const client = await base44.entities.Client.get(client_id);
    if (!client) return Response.json({ error: 'Cliente não encontrado' }, { status: 404 });

    // Busca o equipamento (opcional)
    let equipment = null;
    if (equipment_id) {
      equipment = await base44.entities.Equipment.get(equipment_id);
    }

    // Gera código da OS
    const allOS = await base44.entities.ServiceOrder.list('-created_date', 1000);
    const maxNum = allOS.reduce((max, o) => {
      const num = parseInt(o.code?.replace('OS', '')) || 0;
      return num > max ? num : max;
    }, 0);
    const code = `OS${String(maxNum + 1).padStart(6, '0')}`;

    const today = new Date().toISOString().split('T')[0];

    // Status inicial: OS mãe de manutenção nasce em "Aprovação Comercial"
    // (precisa passar pelo fluxo antes de ir para produção/expedição/rota)
    const status = 'Aprovação Comercial';

    // Analysis status: só Análise tem status "Em Análise"
    const analysisStatus = subtype === 'Análise' ? 'Em Análise' : 'Sem Análise';

    // Cria a OS mãe
    const os = await base44.entities.ServiceOrder.create({
      code,
      client_id: client.id,
      client_name: client.name || '',
      type: 'Manutenção',
      maintenance_subtype: subtype,
      is_mother_os: true,
      analysis_status: analysisStatus,
      equipment_id: equipment?.id || '',
      equipment_code: equipment?.patrimony_code || equipment?.code || '',
      date: today,
      status,
      service_description: description || `OS de ${subtype} — ${client.name || ''}`,
      service_detail_types: service_detail_types || [],
      service_detail_notes: service_detail_notes || '',
      analysis_items: (items || []).map((it, i) => ({
        product_id: it.product_id || '',
        product_name: it.product_name || '',
        product_code: it.product_code || '',
        quantity: it.quantity || 1,
        unit_price: 0, // itens de análise são sempre zerado
        total: 0,
      })),
      delivery_address: delivery_address || {
        zip_code: client.zip_code || '',
        street: client.street || '',
        number: client.number || '',
        neighborhood: client.neighborhood || '',
        city: client.city || '',
        state: client.state || '',
      },
      status_history: [{
        date: new Date().toISOString(),
        actor: user.full_name || user.email || 'Sistema',
        source: 'Ordens de Serviço — Manutenção/Garantia',
        previous_status: '',
        new_status: status,
      }],
    });

    return Response.json({ success: true, service_order: os });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});