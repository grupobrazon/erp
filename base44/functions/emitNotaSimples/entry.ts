import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { cascadeSaleStageFromOs } from "../../shared/saleStageCascade.ts";

/**
 * Gera automaticamente o número da Nota Simples (série + sequencial) e fatura a OS.
 * A série vem da entidade SystemSetting (campo nfe_serie).
 * Numeração: `${série}-${sequencial de 6 dígitos}` (ex: 001-000001).
 *
 * Parâmetros (body JSON):
 *  - os_id:       ID da ServiceOrder a faturar
 *  - invoice_date: data do faturamento (opcional, default hoje)
 *
 * Retorna: { record, nota_simples_number }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { os_id, invoice_date } = await req.json();
    if (!os_id) {
      return Response.json({ error: 'os_id é obrigatório' }, { status: 400 });
    }

    // Série configurada nas configurações do sistema
    const settings = await base44.asServiceRole.entities.SystemSetting.list('-created_date', 1);
    const serie = settings[0]?.nfe_serie || '001';
    const prefix = `${serie}-`;

    // Calcula o próximo sequencial da nota simples para esta série
    const existing = await base44.entities.ServiceOrder.filter({}, '-created_date', 5000);
    const maxNum = existing.reduce((max, rec) => {
      const num = rec.nota_simples_number;
      if (!num || !String(num).startsWith(prefix)) return max;
      const n = parseInt(String(num).slice(prefix.length), 10) || 0;
      return n > max ? n : max;
    }, 0);
    const nextNumber = `${prefix}${String(maxNum + 1).padStart(6, '0')}`;

    const date = invoice_date || new Date().toISOString().slice(0, 10);

    // Busca a OS para verificar se estava aguardando faturamento final (pós-rota)
    const os = await base44.entities.ServiceOrder.get(os_id);
    const updateFields = {
      nota_simples_number: nextNumber,
      nota_simples_date: date,
      invoiced: true,
      invoice_type: 'Nota Simples',
      invoice_date: date,
    };
    // Se a OS estava aguardando faturamento final, conclui a OS (a cascata finaliza a venda)
    if (os && os.status === 'Aguardando Faturamento Final') {
      updateFields.status = 'Concluída';
    }

    const updated = await base44.entities.ServiceOrder.update(os_id, updateFields);

    // Cascata: se a OS foi concluída pelo faturamento pós-rota, finaliza a venda
    if (updateFields.status === 'Concluída') {
      try {
        await cascadeSaleStageFromOs(base44, updated);
      } catch { /* não bloqueia */ }
    }

    return Response.json({ record: updated, nota_simples_number: nextNumber });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});