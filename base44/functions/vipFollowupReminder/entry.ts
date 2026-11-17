import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { secrets } from "base44:runtime";
import { resolveGhlContactId, sendGhlWhatsAppMessage } from "../../shared/ghlClient.ts";
import { isAutomationLink } from "../../shared/vipWelcome.ts";

// Lembrete de adesão VIP: 4 horas depois de a automação enviar o link de adesão, quem
// ainda não assinou o termo recebe este reforço no WhatsApp (o link continua sendo o da
// mensagem anterior, que o cliente tem na própria conversa).
// Entram apenas links gerados pela AUTOMAÇÃO da campanha, enviados entre 4 horas e 7
// dias atrás: links criados manualmente pelo vendedor são conduzidos pelo vendedor.
// Cada adesão é marcada na primeira tentativa (followup_sent_at) para não repetir o
// lembrete; quando o envio falha, o motivo fica no log de integração do CRM.

const HORAS_PARA_LEMBRETE = 4;
const JANELA_DIAS = 7;
const DELAY_MS = 800;

// Modelo padrão do lembrete. O texto em uso é editável na Gestão de Campanhas Atlas
// (Campo vip_reminder_message do sistema) — este aqui vale quando o campo está vazio.
const MENSAGEM_LEMBRETE = `💙 Olá! Ainda não identificamos sua adesão ao *Grupo VIP Brazon* pelo link enviado.

🥰 *Não deixe de aproveitar essa condição imperdível!*

✨ O refil que normalmente custa *R$ 295,00* sai por apenas *R$ 236,00*, com *20% de desconto imediato e vitalício* nas suas futuras trocas!

✅ *Pagamento facilitado:* via Pix ou em até 4x sem juros no cartão.

💙 *Para garantir seu benefício, basta acessar o link enviado acima e aceitar o Termo de Adesão ao VIP Brazon.*

Assim que concluir, nos avise por aqui para darmos andamento ao seu pedido! 🥰`;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Acesso restrito a administradores' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const limite = Math.min(Math.max(Number(body.limit) || 20, 1), 40);

  const agora = Date.now();
  const inicioJanela = new Date(agora - JANELA_DIAS * 86400000).toISOString();
  const fimJanela = new Date(agora - HORAS_PARA_LEMBRETE * 3600000).toISOString();

  const svc = base44.asServiceRole.entities;

  // Interruptor da Gestão de Campanhas Atlas (campo vazio = lembrete ligado).
  const settingsPage = await svc.SystemSetting.list('-created_date', 1);
  const settings = (settingsPage && settingsPage[0]) || {};
  if (settings.vip_reminder_enabled === false) {
    return Response.json({ ok: true, ignorado: 'lembrete de adesão desligado' });
  }
  // Texto em uso vem da Gestão de Campanhas Atlas (vazio = modelo padrão).
  const modeloLembrete = String(settings.vip_reminder_message || '').trim() || MENSAGEM_LEMBRETE;

  // A janela vai na própria consulta: com um acervo grande de links antigos, os
  // recentes ficariam fora do limite do lote se o corte fosse feito depois.
  const page = await svc.PromotionAdhesion.filter(
    {
      status: 'Link Gerado',
      followup_sent_at: { $exists: false },
      sent_at: { $gte: inicioJanela, $lte: fimJanela },
    },
    { sort: 'sent_at', limit: 200 },
  );
  const pendentes = (page.items || []).filter(isAutomationLink);
  const lote = pendentes.slice(0, limite);

  const clientIds = [...new Set(lote.map((a) => a.client_id).filter(Boolean))];
  const clientes = clientIds.length
    ? (await svc.Client.filter({ id: { $in: clientIds } }, { limit: 100 })).items || []
    : [];
  const porId = new Map(clientes.map((c) => [c.id, c]));

  const locationId = settings.ghl_location_id || secrets.get('ghl_location_id');

  const logar = async (mensagem, payload) => {
    await svc.IntegracaoLog.create({
      origem: 'webhook', mensagem, status_http: 0, payload_resumido: payload || {},
    }).catch(() => {});
  };

  const resultados = [];
  for (const adhesion of lote) {
    const client = porId.get(adhesion.client_id) || null;
    const phone = adhesion.client_phone || (client && client.phone1) || '';
    let enviada = false;
    let motivo = '';

    if (!locationId) {
      motivo = 'conta do CRM não configurada';
    } else if (client && client.vip_client) {
      motivo = 'cliente já é VIP';
    } else {
      try {
        const contactId = await resolveGhlContactId({ client, phone, locationId, secrets });
        if (!contactId) {
          motivo = 'cliente sem contato vinculado no CRM';
        } else {
          const primeiroNome = String(adhesion.client_name || (client && client.name) || '')
            .trim().split(/\s+/)[0] || 'cliente';
          const envio = await sendGhlWhatsAppMessage(
            contactId,
            modeloLembrete.replace(/\{cliente\}/g, primeiroNome),
            locationId,
            secrets,
          );
          enviada = !!envio.ok;
          if (!envio.ok) motivo = `falha no envio (${envio.status})`;
        }
      } catch (error) {
        motivo = error.message;
      }
    }

    if (!enviada) {
      await logar(`Lembrete de adesão VIP: ${motivo}`, {
        cliente: adhesion.client_name,
        telefone: phone,
        link_enviado_em: adhesion.sent_at || adhesion.generated_date || '',
      });
    }
    // Marca a tentativa: o lembrete não se repete para o mesmo cliente.
    await svc.PromotionAdhesion.update(adhesion.id, { followup_sent_at: new Date().toISOString() }).catch(() => {});
    resultados.push({ cliente: adhesion.client_name, telefone: phone, enviada, motivo });
    await esperar(DELAY_MS);
  }

  const enviadas = resultados.filter((r) => r.enviada).length;
  return Response.json({
    enviadas,
    falhas: resultados.length - enviadas,
    restantes: Math.max(pendentes.length - lote.length, 0),
    detalhes: resultados,
  });
});