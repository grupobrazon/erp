import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Emite uma Carta de Correção Eletrônica (CC-e) para uma NF-e via Focus NFe.
 * Body: { ref, correcao, source: 'os' | 'remessa', entity_id }
 * Focus endpoint: POST /nfe/{ref}/carta_correcao com body { correcao }
 */
const FOCUS_BASE = 'https://api.focusnfe.com.br/v2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { ref, correcao, source, entity_id } = await req.json();
    if (!ref) return Response.json({ error: 'ref da NF-e é obrigatório' }, { status: 400 });
    if (!correcao || correcao.length < 15) {
      return Response.json({ error: 'Texto da correção deve ter no mínimo 15 caracteres' }, { status: 400 });
    }
    if (correcao.length > 1000) {
      return Response.json({ error: 'Texto da correção deve ter no máximo 1000 caracteres' }, { status: 400 });
    }
    if (!source || !entity_id) {
      return Response.json({ error: 'source (os|remessa) e entity_id são obrigatórios' }, { status: 400 });
    }

    const token = Deno.env.get('FOCUSNFE_TOKEN');
    if (!token) return Response.json({ error: 'FOCUSNFE_TOKEN não configurado' }, { status: 500 });
    const auth = btoa(`${token}:`);

    const resp = await fetch(`${FOCUS_BASE}/nfe/${encodeURIComponent(ref)}/carta_correcao`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ correcao }),
    });
    const data = await resp.json();

    // 200 = processado, 201 = criado, 202 = em processamento
    if (resp.status === 200 || resp.status === 201 || resp.status === 202) {
      const now = new Date().toISOString();
      const cceEntry = {
        date: now,
        correction: correcao,
        protocol: data.protocolo || data.numero_protocolo || '',
      };

      const entity = source === 'os'
        ? await base44.entities.ServiceOrder.get(entity_id)
        : await base44.entities.Remessa.get(entity_id);

      const existing = entity.nfe_cce_history || [];
      existing.push(cceEntry);

      const update = {
        nfe_cce_history: existing,
        nfe_mensagem_sefaz: data.mensagem_sefaz || data.mensagem || entity.nfe_mensagem_sefaz || '',
      };

      if (source === 'os') {
        await base44.entities.ServiceOrder.update(entity_id, update);
      } else {
        await base44.entities.Remessa.update(entity_id, update);
      }

      return Response.json({
        status: data.status === 'processado' || data.status === 'autorizado' ? 'processado' : 'processando',
        cce: cceEntry,
      });
    }

    return Response.json({
      status: 'erro',
      error: data.erros || data.error || `HTTP ${resp.status}`,
      data,
    }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});