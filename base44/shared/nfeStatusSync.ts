import { secrets } from "base44:runtime";
import { cascadeSaleStageFromOs } from "./saleStageCascade.ts";

/**
 * Consulta o status de uma NF-e na Focus NFe e atualiza a OS/Remessa correspondente.
 * Usado pela tela (consultNFe) e pela rotina automática (syncPendingNFe).
 */

const FOCUS_BASE = 'https://api.focusnfe.com.br/v2';

const strMsg = (v) => {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((e) => e?.mensagem || e?.campo || JSON.stringify(e)).join('; ');
  if (typeof v === 'object') return v.mensagem || JSON.stringify(v);
  return String(v);
};

export async function syncNFeStatus(db, { osId, remessaId }) {
  const isRemessa = !!remessaId;
  const entityId = remessaId || osId;
  const entity = isRemessa
    ? await db.entities.Remessa.get(entityId).catch((e) => (e.status === 404 ? null : Promise.reject(e)))
    : await db.entities.ServiceOrder.get(entityId).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
  if (!entity) throw new Error('Registro não encontrado');
  if (!entity.nfe_ref) throw new Error('Sem referência NF-e para consultar');

  const token = secrets.get('FOCUSNFE_TOKEN');
  if (!token) throw new Error('FOCUSNFE_TOKEN não configurado');
  const auth = btoa(`${token}:`);

  const resp = await fetch(`${FOCUS_BASE}/nfe/${entity.nfe_ref}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  const data = await resp.json();

  const applyUpdate = async (update) => {
    if (isRemessa) await db.entities.Remessa.update(entityId, update);
    else await db.entities.ServiceOrder.update(entityId, update);
  };

  if (data.status === 'autorizado' || (resp.status === 200 && data.numero)) {
    // CFOP efetivo da emissão — extraído do retorno da consulta (items), sem nova chamada externa
    const cfopsFromItems = [...new Set((data.items || []).map((i) => String(i.cfop || '')).filter(Boolean))];
    const update = {
      nfe_transmitted: true,
      nfe_status: 'autorizado',
      ...(cfopsFromItems.length ? { nfe_cfop: cfopsFromItems.join(' / ') } : {}),
      invoice_type: 'Nota Fiscal',
      invoice_number: data.numero,
      invoice_date: data.data_emissao ? String(data.data_emissao).slice(0, 10) : (entity.invoice_date || new Date().toISOString().slice(0, 10)),
      nfe_chave: data.chave_nfe,
      nfe_danfe_url: data.caminho_danfe,
      nfe_xml_url: data.caminho_xml_nota_fiscal || '',
      nfe_serie: data.serie,
      nfe_mensagem_sefaz: strMsg(data.mensagem_sefaz),
    };
    if (isRemessa) {
      update.status = 'Faturada';
    } else {
      // Marca a OS como faturada
      update.invoiced = true;
      // Se a OS estava aguardando faturamento final (pós-rota), conclui a OS e a venda
      if (entity.status === 'Aguardando Faturamento Final') {
        update.status = 'Concluída';
      }
    }
    await applyUpdate(update);
    // Cascata: se a OS foi concluída pelo faturamento pós-rota, finaliza a venda
    if (!isRemessa && update.status === 'Concluída') {
      try {
        const updatedOs = await db.entities.ServiceOrder.get(entityId);
        await cascadeSaleStageFromOs(db, updatedOs);
      } catch { /* não bloqueia */ }
    }
    return {
      status: 'autorizado',
      invoice_number: update.invoice_number,
      invoice_date: update.invoice_date,
      nfe_serie: update.nfe_serie,
      nfe_chave: update.nfe_chave,
      os_status: update.status,
    };
  }

  if (data.status === 'erro' || (data.status_sefaz && !String(data.status_sefaz).startsWith('1') && data.status !== 'processando')) {
    const update = { nfe_status: data.status || 'erro', nfe_mensagem_sefaz: strMsg(data.mensagem_sefaz) };
    await applyUpdate(update);
    return { status: data.status || 'erro', ...update, data };
  }

  return { status: 'processando', data };
}