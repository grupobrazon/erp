import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Gera automaticamente o número da Nota Simples (série + sequencial) e fatura a remessa.
 * A série vem da entidade SystemSetting (campo nfe_serie).
 * Numeração: `${série}-${sequencial de 6 dígitos}` (ex: 001-000001).
 * Compartilha o mesmo sequencial das OS para manter consistência.
 *
 * Parâmetros (body JSON):
 *  - remessa_id:   ID da Remessa a faturar
 *  - invoice_date: data do faturamento (opcional, default hoje)
 *
 * Retorna: { record, nota_simples_number }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { remessa_id, invoice_date } = await req.json();
    if (!remessa_id) {
      return Response.json({ error: 'remessa_id é obrigatório' }, { status: 400 });
    }

    const remessa = await base44.entities.Remessa.get(remessa_id);
    if (!remessa) return Response.json({ error: 'Remessa não encontrada' }, { status: 404 });

    if (remessa.status !== 'Aprovada Financeiro') {
      return Response.json({ error: 'Remessa precisa estar aprovada pelo financeiro para faturar' }, { status: 400 });
    }

    // Série configurada nas configurações do sistema
    const settings = await base44.asServiceRole.entities.SystemSetting.list('-created_date', 1);
    const serie = settings[0]?.nfe_serie || '001';
    const prefix = `${serie}-`;

    // Calcula o próximo sequencial (mesmo contador das OS Nota Simples)
    const existingOs = await base44.entities.ServiceOrder.filter({}, '-created_date', 5000);
    const existingRemessas = await base44.entities.Remessa.filter({}, '-created_date', 5000);

    const maxFromOs = existingOs.reduce((max, rec) => {
      const num = rec.nota_simples_number;
      if (!num || !String(num).startsWith(prefix)) return max;
      const n = parseInt(String(num).slice(prefix.length), 10) || 0;
      return n > max ? n : max;
    }, 0);
    const maxFromRemessas = existingRemessas.reduce((max, rec) => {
      const num = rec.nota_simples_number;
      if (!num || !String(num).startsWith(prefix)) return max;
      const n = parseInt(String(num).slice(prefix.length), 10) || 0;
      return n > max ? n : max;
    }, 0);
    const maxNum = Math.max(maxFromOs, maxFromRemessas);

    const nextNumber = `${prefix}${String(maxNum + 1).padStart(6, '0')}`;
    const date = invoice_date || new Date().toISOString().slice(0, 10);

    const updated = await base44.entities.Remessa.update(remessa_id, {
      nota_simples_number: nextNumber,
      nota_simples_date: date,
      invoice_type: 'Nota Simples',
      invoice_date: date,
      status: 'Faturada',
    });

    return Response.json({ record: updated, nota_simples_number: nextNumber });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});