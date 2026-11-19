// Gerado de base44/functions/convertAnalysisOS/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { os_id, convert_to, service_fee, displacement_fee, charge_reason } = await req.json();
    if (!os_id) return Response.json({ error: 'os_id é obrigatório' }, { status: 400 });
    if (!convert_to) return Response.json({ error: 'convert_to é obrigatório (Garantia ou Assistência Técnica)' }, { status: 400 });

    if (!['Garantia', 'Assistência Técnica'].includes(convert_to)) {
      return Response.json({ error: 'convert_to deve ser "Garantia" ou "Assistência Técnica"' }, { status: 400 });
    }

    const os = await base44.entities.ServiceOrder.get(os_id);
    if (!os) return Response.json({ error: 'OS não encontrada' }, { status: 404 });

    if (os.maintenance_subtype !== 'Análise') {
      return Response.json({ error: 'Apenas OS de Análise podem ser convertidas' }, { status: 400 });
    }

    const updates = {
      maintenance_subtype: convert_to,
      analysis_status: 'Convertida',
      analysis_converted_to: convert_to,
      analysis_converted_date: new Date().toISOString(),
      service_fee_charged: convert_to === 'Assistência Técnica' ? (service_fee || 0) : 0,
      displacement_fee_charged: convert_to === 'Assistência Técnica' ? (displacement_fee || 0) : 0,
      charge_reason: convert_to === 'Assistência Técnica' ? (charge_reason || '') : '',
      status_history: [
        ...(os.status_history || []),
        {
          date: new Date().toISOString(),
          actor: user.full_name || user.email || 'Sistema',
          source: 'Ordens de Serviço — Conversão de Análise',
          previous_status: os.status,
          new_status: os.status,
          notes: `Análise convertida para ${convert_to}`,
        },
      ],
    };

    const updated = await base44.entities.ServiceOrder.update(os_id, updates);
    return Response.json({ success: true, service_order: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});