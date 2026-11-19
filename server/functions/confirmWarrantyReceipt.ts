// Gerado de base44/functions/confirmWarrantyReceipt/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { appendStatusHistory } from '../shared/osStatusHistory.ts';

// Confirma o recebimento do produto de garantia na empresa.
// O produto pode chegar de duas formas:
//  - "Codigo Reverso": cliente enviou via Melhor Envio reverso (código de devolução)
//  - "Entrega Pessoal": cliente entregou o produto pessoalmente na empresa
export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { os_id, receipt_method } = await req.json();
    if (!os_id) return Response.json({ error: 'os_id é obrigatório' }, { status: 400 });
    if (!receipt_method || !['Codigo Reverso', 'Entrega Pessoal'].includes(receipt_method)) {
      return Response.json({ error: 'receipt_method deve ser "Codigo Reverso" ou "Entrega Pessoal"' }, { status: 400 });
    }

    const os = await base44.entities.ServiceOrder.get(os_id);
    if (!os) return Response.json({ error: 'OS não encontrada' }, { status: 404 });
    if (os.type !== 'Manutenção') {
      return Response.json({ error: 'Esta OS não é de Manutenção/Garantia' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const userName = user.full_name || user.email || 'Usuário';

    const updates: any = {
      warranty_flow_status: 'Recebido na Empresa',
      warranty_receipt_method: receipt_method,
      warranty_receipt_date: now,
      warranty_receipt_by: userName,
    };

    const history = appendStatusHistory(os, updates, {
      actor: userName,
      source: 'Garantia — confirmação de recebimento',
    });
    if (history) updates.status_history = history;

    await base44.entities.ServiceOrder.update(os_id, updates);

    return Response.json({
      success: true,
      os_id,
      warranty_flow_status: 'Recebido na Empresa',
      receipt_method,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});