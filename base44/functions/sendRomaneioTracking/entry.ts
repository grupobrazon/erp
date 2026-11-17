// Aviso automático de rastreio no WhatsApp para o cliente quando a OS entra em "Em Transporte".
//
// Modos:
//  - sweep   : chamado pelo workflow a cada 5 minutos. Descobre as OS que entraram em
//              "Em Transporte" e toca o ciclo do aviso: espera o código de rastreio sair,
//              envia o código quando a janela do WhatsApp está aberta e, quando está fechada,
//              pergunta ao cliente se ele pode falar agora (modelo aprovado), repetindo a
//              pergunta a cada 24 horas até ele responder.
//  - dispatch: força uma nova tentativa agora para as OS informadas (botão do detalhe da OS).
//  - list    : devolve os acompanhamentos (da tela de configuração ou de uma OS específica).
//
// Regra do Meta: mensagem comum só chega se o cliente falou nas últimas 24 horas; fora dessa
// janela apenas um modelo aprovado inicia a conversa — é ele que abre a janela para o código.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from 'base44:runtime';
import {
  buildShippingNotificationMessage,
  sendGhlWhatsAppMessage,
  sendGhlWhatsAppTemplate,
  findContactConversation,
  resolveGhlContactId,
  searchGhlContacts,
  normalizeEmail,
  upsertGhlContact,
} from '../../shared/ghlClient.ts';
import { fetchMeTrackingBatch } from '../../shared/melhorEnvio.js';

const STATUS_TRANSPORTE = 'Em Transporte';
// A mercadoria despachada no romaneio sai do estoque antes de entrar em transporte: o aviso
// começa na saída do romaneio e o código é enviado assim que a transportadora libera.
const STATUSES_ENTRADA = ['Saída do Estoque', 'Em Transporte'];
const STATUS_PENDENTES = ['Aguardando Rastreio', 'Aguardando Resposta'];
const DIAS_ESPERA = 7;              // prazo total do acompanhamento
const HORAS_ENTRE_PERGUNTAS = 24;   // repete a pergunta enquanto o cliente não responde
// Janela do Meta: mensagem comum (a do código) só passa quando o cliente escreveu nas
// últimas 24 horas; fora disso só o modelo aprovado inicia a conversa.
const JANELA_MS = 24 * 60 * 60 * 1000;
const TAMANHO_LOTE = 5;
const OS_POR_CICLO = 200;           // OS em transporte avaliadas por execução (a busca traz as mais recentes; o teto precisa cobrir o volume do dia para nenhuma despachada ficar de fora)
// Piso combinado com a operação: entram os romaneios de 20/10/2026 em diante (as OS saídas
// antes disso não recebem aviso). As novas entram sozinhas conforme entram em transporte.
const DATA_MINIMA = '2026-10-20';
// Modelo aprovado que abre a conversa fora da janela de 24h do Meta — o mesmo
// "conversar_agora (pt_BR)" usado pelas campanhas no CRM. Pode ser trocado pelo ID do
// modelo em Configurações → Aviso de rastreio.
const MODELO_PERGUNTA = 'conversar_agora';
const MODELO_PERGUNTA_IDIOMA = 'pt_BR';
// Texto de apoio da pergunta: o CRM exige um texto no envio, mesmo com modelo aprovado.
// Pode ser trocado em Configurações → Aviso de rastreio.
const TEXTO_PERGUNTA_PADRAO = 'Olá! Sua mercadoria já foi despachada. Você pode falar agora para eu enviar o código de rastreio?';

const agoraIso = () => new Date().toISOString();

const paraLinks = (codigos) =>
  (codigos || []).map((c) => `https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(c)}`);

const resumoErro = (res) => `(${res.status || 0}) ${JSON.stringify(res.data || {}).slice(0, 300)}`;

const semErro = (registro) => registro.last_error || 'em acompanhamento automático';

// O CRM guarda o telefone com código do país (+55...). Testamos as variações porque o
// cadastro do ERP pode estar sem o DDI.
function variantesTelefone(tel) {
  const digitos = String(tel || '').replace(/\D/g, '');
  if (!digitos) return [];
  const comPais = digitos.length <= 11 ? `55${digitos}` : digitos;
  return [`+${comPais}`, `+${digitos}`, digitos, String(tel)].filter((v, i, a) => v && a.indexOf(v) === i);
}

// Contato do CRM do cliente: usa o vínculo salvo no cadastro e, quando ainda não existe,
// procura pelo telefone (mesma regra usada pelas campanhas).
async function contatoDoCliente(cliente, locationId, svc) {
  if (!cliente) return '';
  if (cliente.ghl_contact_id) return cliente.ghl_contact_id;
  for (const telefone of [cliente.phone1, cliente.phone2].filter(Boolean)) {
    for (const variante of variantesTelefone(telefone)) {
      const contato = await resolveGhlContactId({ client: cliente, phone: variante, locationId, secrets }).catch(() => '');
      if (contato) return contato;
    }
  }
  // Telefones secundários e os do Zoox: a busca do CRM é aproximada, então aqui o número
  // encontrado é conferido antes de avisar (evita mandar o aviso para outra pessoa).
  const outros = [
    cliente.phone3, cliente.phone4, cliente.phone5,
    cliente.zoox_phone1, cliente.zoox_phone2, cliente.zoox_phone3, cliente.zoox_phone4,
    cliente.zoox_phone5, cliente.zoox_phone6, cliente.zoox_phone7,
  ].filter(Boolean);
  for (const telefone of outros) {
    const contato = await buscarContatoPeloNumero(locationId, telefone);
    if (contato) return contato;
  }
  // Sem telefone útil no cadastro: procura pelo e-mail exato do cliente.
  if (cliente.email) {
    const alvo = normalizeEmail(cliente.email);
    const achados = await searchGhlContacts({ locationId, query: cliente.email, secrets }).catch(() => []);
    const certo = (achados || []).find((c) => c && normalizeEmail(c.email) === alvo);
    if (certo && certo.id) return certo.id;
  }
  // O cliente ainda não está no CRM: abre o contato com o WhatsApp do cadastro (o CRM devolve
  // o contato existente quando o número já está lá). Só entra telefone marcado como WhatsApp.
  const zap = [1, 2, 3, 4, 5]
    .map((i) => ({ tel: cliente[`phone${i}`], zap: cliente[`phone${i}_whatsapp`] }))
    .find((t) => t.tel && t.zap === true);
  if (!zap) return '';
  const criado = await upsertGhlContact({
    locationId,
    body: {
      name: cliente.name || 'Cliente Brazon',
      phone: variantesTelefone(zap.tel)[0],
      ...(cliente.email ? { email: cliente.email } : {}),
    },
    secrets,
  }).catch(() => null);
  const novo = (criado && criado.id) || '';
  if (novo && svc) await svc.entities.Client.update(cliente.id, { ghl_contact_id: novo }).catch(() => {});
  return novo;
}

// Busca pelo número conferindo os 9 últimos dígitos.
async function buscarContatoPeloNumero(locationId, telefone) {
  const digitos = String(telefone).replace(/\D/g, '');
  if (digitos.length < 8) return '';
  const fim = digitos.slice(-9);
  const achados = await searchGhlContacts({ locationId, query: telefone, secrets }).catch(() => []);
  const certo = (achados || []).find((c) => {
    const doCrm = String((c && (c.phone || c.phoneNumber)) || '').replace(/\D/g, '');
    return doCrm && doCrm.slice(-9) === fim;
  });
  return (certo && certo.id) || '';
}

// O código de rastreio por volume nem sempre vem na geração da etiqueta: chega depois,
// com a liberação/checkout no Melhor Envio.
function codigosDaOs(os) {
  const dosVolumes = (os.melhor_envio_labels || []).map((l) => l && l.tracking_code).filter(Boolean);
  if (dosVolumes.length) return dosVolumes;
  return os.tracking_code ? [os.tracking_code] : [];
}

// Data em que a OS foi despachada (saída do estoque do romaneio ou entrada em transporte): o
// registro no histórico de status é a fonte principal; quando ele não existe, valem as datas
// de saída do estoque e do romaneio. Devolve '' quando não é possível saber — nesse caso a OS
// não entra no aviso.
function desdeODespacho(os) {
  const marcos = (os.status_history || [])
    .filter((h) => h && STATUSES_ENTRADA.includes(h.new_status) && h.date)
    .map((h) => String(h.date).slice(0, 10));
  if (os.exit_date) marcos.push(String(os.exit_date).slice(0, 10));
  if (os.romaneio_date) marcos.push(String(os.romaneio_date).slice(0, 10));
  if (!marcos.length) return '';
  return marcos.sort().pop(); // AAAA-MM-DD ordena como texto
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode || 'sweep');

    // A varredura automática é do sistema; o disparo manual de uma OS é liberado para
    // qualquer usuário logado (é o botão "Tentar agora" do detalhe da OS).
    if (mode === 'sweep' && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const svc = base44.asServiceRole;
    const settingsPage = await svc.entities.SystemSetting.list('-created_date', 1);
    const settings = (settingsPage && settingsPage[0]) || {};

    if (mode === 'list') {
      const osId = String(body.os_id || '').trim();
      if (osId) {
        const doOs = await svc.entities.RomaneioTracking.filter({ os_id: osId }, '-created_date', 1).catch(() => []);
        return Response.json({ registros: doOs || [] });
      }
      if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
      const registros = await svc.entities.RomaneioTracking.list('-dispatched_at', 25).catch(() => []);
      return Response.json({ registros });
    }

    // Lista os clientes despachados no período do aviso com a situação de cada um:
    // código enviado, pergunta enviada, aguardando o código da transportadora,
    // fora da regra do aviso ou ainda sem análise.
    if (mode === 'liberados') {
      if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
      return Response.json({ liberados: await listarLiberados(svc) });
    }

    // Teste: monta a mensagem real do aviso e manda só para o número informado.
    // Funciona com a automação desligada — não mexe em OS, cliente nem acompanhamento.
    if (mode === 'test') {
      if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
      const digitos = String(body.phone || '').replace(/\D/g, '');
      if (digitos.length < 10) return Response.json({ ok: false, motivo: 'informe um WhatsApp com DDD' });
      const localDoTeste = secrets.get('ghl_location_id') || settings.ghl_location_id || '';
      if (!localDoTeste) return Response.json({ ok: false, motivo: 'ghl_location_id não configurado' });
      return Response.json(await testeDeAviso(svc, settings, localDoTeste, digitos, String(body.tipo || 'codigo')));
    }

    if (settings.romaneio_tracking_enabled !== true) {
      return Response.json({ ok: true, ignorado: 'aviso de rastreio desligado' });
    }

    const locationId = secrets.get('ghl_location_id') || settings.ghl_location_id || '';
    if (!locationId) return Response.json({ ok: false, motivo: 'ghl_location_id não configurado' });

    if (mode === 'dispatch') {
      const osIds = Array.isArray(body.os_ids) ? body.os_ids.filter(Boolean) : [];
      if (!osIds.length) return Response.json({ ok: true, enviadas: 0, motivo: 'nenhuma OS recebida' });
      return Response.json(await tentarNovamente(svc, settings, locationId, osIds));
    }

    return Response.json(await varrer(svc, settings, locationId));
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// --- Tentativa manual (botão do detalhe da OS) ---
async function tentarNovamente(svc, settings, locationId, osIds) {
  const [ordens, existentes] = await Promise.all([
    svc.entities.ServiceOrder.filter({ id: { $in: osIds } }).catch(() => []),
    svc.entities.RomaneioTracking.filter({ os_id: { $in: osIds } }).catch(() => []),
  ]);
  const porOs = new Map((existentes || []).map((r) => [r.os_id, r]));
  const resultado = { enviadas: 0, aguardando: 0, sem_envio: 0, detalhes: [] };

  for (const os of ordens || []) {
    const registro = await acompanharOs(svc, settings, locationId, os, porOs.get(os.id) || null);
    contar(resultado, registro);
    resultado.detalhes.push({ os: os.code, status: registro.status, erro: registro.last_error || null });
  }
  return resultado;
}

// --- Ciclo de 5 minutos ---
async function varrer(svc, settings, locationId) {
  const agora = Date.now();
  const resultado = { novas: 0, verificadas: 0, enviadas: 0, expiradas: 0, aguardando: 0, sem_envio: 0, detalhes: [] };

  // 1) OS despachadas (saída do estoque do romaneio ou já em transporte) que ainda não têm
  // acompanhamento começam agora. O despacho atualiza a OS, então a busca parte das OS
  // tocadas desde o piso e a data real do despacho é confirmada OS por OS logo abaixo.
  const emTransporte = await svc.entities.ServiceOrder
    .filter({ status: { $in: STATUSES_ENTRADA }, updated_date: { $gte: DATA_MINIMA } }, '-updated_date', OS_POR_CICLO)
    .catch(() => []);
  const ids = (emTransporte || []).map((o) => o.id);
  const existentes = ids.length
    ? await svc.entities.RomaneioTracking.filter({ os_id: { $in: ids } }).catch(() => [])
    : [];
  const conhecidas = new Set((existentes || []).map((r) => r.os_id));
  const novas = (emTransporte || []).filter((os) => {
    if (conhecidas.has(os.id)) return false;
    const desde = desdeODespacho(os);
    // Comparação de texto funciona porque a data está no formato AAAA-MM-DD.
    return !!desde && desde >= DATA_MINIMA;
  });

  for (let i = 0; i < novas.length; i += TAMANHO_LOTE) {
    await Promise.allSettled(novas.slice(i, i + TAMANHO_LOTE).map(async (os) => {
      const registro = await acompanharOs(svc, settings, locationId, os, null);
      resultado.novas++;
      contar(resultado, registro);
      resultado.detalhes.push({ os: os.code, status: registro.status });
    }));
  }

  // 2) Acompanhamentos em aberto: código de rastreio e resposta do cliente.
  const pendentes = await svc.entities.RomaneioTracking
    .filter({ status: { $in: STATUS_PENDENTES } }, '-dispatched_at', 50)
    .catch(() => []);
  resultado.verificadas = pendentes.length;
  const limite = DIAS_ESPERA * 24 * 60 * 60 * 1000;

  // A transportadora pode já ter liberado o código sem que ele tenha chegado à OS.
  const osPendentes = await Promise.all(pendentes.map((r) => svc.entities.ServiceOrder.get(r.os_id).catch(() => null)));
  await buscarCodigosNoMelhorEnvio(svc, osPendentes);
  const osPorId = new Map(osPendentes.filter(Boolean).map((os) => [os.id, os]));

  for (let i = 0; i < pendentes.length; i += TAMANHO_LOTE) {
    await Promise.allSettled(pendentes.slice(i, i + TAMANHO_LOTE).map(async (registro) => {
      const hora = agoraIso();
      const inicio = Date.parse(registro.dispatched_at || registro.created_date || hora);

      if (agora - inicio > limite) {
        await svc.entities.RomaneioTracking.update(registro.id, {
          status: 'Expirado',
          last_checked_at: hora,
          last_error: 'sem código de rastreio ou sem resposta do cliente no prazo',
        }).catch(() => {});
        resultado.expiradas++;
        return;
      }

      const os = osPorId.get(registro.os_id) || null;
      const codigos = os ? codigosDaOs(os) : (registro.tracking_codes || []);

      // 2.1) Etiqueta ainda não liberada: espera o código aparecer.
      if (registro.status === 'Aguardando Rastreio') {
        if (!codigos.length) {
          await svc.entities.RomaneioTracking.update(registro.id, {
            last_checked_at: hora,
            attempts: (registro.attempts || 0) + 1,
          }).catch(() => {});
          resultado.aguardando++;
          return;
        }
        const tentativa = await tentarEnviar(settings, locationId, {
          contato: registro.contact_id,
          nome: registro.client_name || (os && os.client_name) || 'cliente',
          codigos,
          registro,
        });
        await svc.entities.RomaneioTracking.update(registro.id, {
          ...tentativa.patch,
          tracking_codes: codigos,
          last_checked_at: hora,
          attempts: (registro.attempts || 0) + 1,
        }).catch(() => {});
        if (tentativa.status === 'Enviado') { resultado.enviadas++; resultado.detalhes.push({ os: registro.os_code, status: 'Enviado' }); }
        else resultado.aguardando++;
        return;
      }

      // 2.2) Aguardando o cliente responder. A mensagem comum com o código só passa com a
      // janela aberta — ou seja, a partir do momento em que o cliente escreve e por 24 horas.
      const janela = await janelaDoCliente(registro.contact_id, locationId);

      if (!janela.aberta) {
        // Sem resposta: repete a pergunta a cada 24 horas.
        const ultimaPergunta = Date.parse(registro.last_ask_at || registro.window_requested_at || registro.dispatched_at || hora);
        if (agora - ultimaPergunta >= HORAS_ENTRE_PERGUNTAS * 60 * 60 * 1000) {
          const pergunta = await enviarPergunta(settings, locationId, registro.contact_id, registro.client_name);
          await svc.entities.RomaneioTracking.update(registro.id, {
            last_ask_at: hora,
            last_checked_at: hora,
            attempts: (registro.attempts || 0) + 1,
            last_error: pergunta.ok
              ? `código de rastreio não enviado — aguardando resposta do cliente`
              : `pergunta ${resumoErro(pergunta)}`,
          }).catch(() => {});
          resultado.detalhes.push({ os: registro.os_code, status: pergunta.ok ? 'Pergunta reenviada' : 'Falha ao perguntar' });
        } else {
          await svc.entities.RomaneioTracking.update(registro.id, {
            last_checked_at: hora,
            attempts: (registro.attempts || 0) + 1,
          }).catch(() => {});
        }
        resultado.aguardando++;
        return;
      }

      // Cliente respondeu: só falta o código de rastreio.
      if (!codigos.length) {
        await svc.entities.RomaneioTracking.update(registro.id, {
          last_checked_at: hora,
          attempts: (registro.attempts || 0) + 1,
          last_error: 'cliente respondeu — aguardando o código de rastreio da transportadora',
        }).catch(() => {});
        resultado.aguardando++;
        return;
      }

      const envio = await sendGhlWhatsAppMessage(
        registro.contact_id,
        buildShippingNotificationMessage(registro.client_name || (os && os.client_name) || 'cliente', paraLinks(codigos)),
        locationId,
        secrets,
      );
      if (envio.ok) {
        await svc.entities.RomaneioTracking.update(registro.id, {
          status: 'Enviado',
          tracking_codes: codigos,
          tracking_message_sent_at: hora,
          last_checked_at: hora,
          last_error: null,
        }).catch(() => {});
        resultado.enviadas++;
        resultado.detalhes.push({ os: registro.os_code, status: 'Enviado' });
      } else {
        await svc.entities.RomaneioTracking.update(registro.id, {
          last_checked_at: hora,
          attempts: (registro.attempts || 0) + 1,
          last_error: `código de rastreio não enviado ${resumoErro(envio)}`,
        }).catch(() => {});
        resultado.aguardando++;
      }
    }));
  }

  return resultado;
}

// O código de rastreio nem sempre é gravado na OS quando a transportadora o libera: consulta
// o Melhor Envio em lote e guarda o código encontrado de volta na etiqueta da OS.
async function buscarCodigosNoMelhorEnvio(svc, ordens) {
  const semCodigo = (ordens || []).filter((os) => os && !codigosDaOs(os).length);
  const ids = [];
  for (const os of semCodigo) {
    for (const l of os.melhor_envio_labels || []) if (l && l.shipment_id) ids.push(l.shipment_id);
  }
  if (!ids.length) return;

  const token = secrets.get('MELHOR_ENVIO_TOKEN');
  if (!token) return;
  const userAgent = secrets.get('MELHOR_ENVIO_USER_AGENT') || 'ERP Brazon (contato@brazon.com.br)';
  const rastreios = await fetchMeTrackingBatch(ids, token, userAgent, false).catch(() => ({}));

  for (const os of semCodigo) {
    const etiquetas = (os.melhor_envio_labels || []).map((l) => {
      const codigo = l && l.shipment_id ? rastreios[l.shipment_id]?.tracking : null;
      return codigo && !l.tracking_code ? { ...l, tracking_code: codigo } : l;
    });
    const codigos = etiquetas.map((l) => l && l.tracking_code).filter(Boolean);
    if (!codigos.length) continue;
    os.melhor_envio_labels = etiquetas;
    os.tracking_code = codigos[0];
    await svc.entities.ServiceOrder.update(os.id, { melhor_envio_labels: etiquetas, tracking_code: codigos[0] }).catch(() => {});
  }
}

// Clientes despachados no período do aviso, com a situação de cada um.
async function listarLiberados(svc) {
  const ordens = await svc.entities.ServiceOrder
    .filter({ status: { $in: STATUSES_ENTRADA }, updated_date: { $gte: DATA_MINIMA } }, '-updated_date', 150)
    .catch(() => []);
  const ids = (ordens || []).map((o) => o.id);
  const registros = ids.length
    ? await svc.entities.RomaneioTracking.filter({ os_id: { $in: ids } }).catch(() => [])
    : [];
  const porOs = new Map((registros || []).map((r) => [r.os_id, r]));

  return (ordens || []).map((os) => {
    const registro = porOs.get(os.id) || null;
    const codigos = codigosDaOs(os);
    const desde = desdeODespacho(os);
    return {
      os_id: os.id,
      os_code: os.code || '',
      sale_order_number: os.sale_order_number || '',
      client_name: os.client_name || '',
      romaneio_date: os.romaneio_date || null,
      codigos,
      situacao: situacaoDoAviso(registro, desde),
      atualizado_em: (registro && (registro.tracking_message_sent_at || registro.last_ask_at || registro.last_checked_at))
        || os.updated_date
        || null,
    };
  });
}

// Situação do aviso: o que já foi registrado no acompanhamento; sem registro, a OS está
// fora da regra (romaneio anterior ao período do aviso) ou entra na próxima varredura.
function situacaoDoAviso(registro, desde) {
  if (registro) return registro.status;
  if (!desde || desde < DATA_MINIMA) return 'Fora do Aviso';
  return 'Na Fila';
}

// Registra (ou atualiza) o acompanhamento de uma OS em transporte.
async function acompanharOs(svc, settings, locationId, os, existente) {
  const codigos = codigosDaOs(os);
  const base = {
    os_id: os.id,
    os_code: os.code || '',
    sale_order_number: os.sale_order_number || '',
    client_id: os.client_id || '',
    client_name: os.client_name || '',
    romaneio_date: os.romaneio_date || null,
    tracking_codes: codigos,
  };

  const cliente = os.client_id ? await svc.entities.Client.get(os.client_id).catch(() => null) : null;
  const contato = existente && existente.contact_id
    ? existente.contact_id
    : await contatoDoCliente(cliente, locationId, svc);

  if (!contato) {
    return await gravar(svc, existente, {
      ...base,
      status: 'Sem Envio',
      attempts: (existente?.attempts || 0) + 1,
      last_checked_at: agoraIso(),
      last_error: 'cliente não encontrado no CRM (sem WhatsApp para avisar)',
    });
  }

  if (!codigos.length) {
    return await gravar(svc, existente, {
      ...base,
      contact_id: contato,
      status: 'Aguardando Rastreio',
      attempts: (existente?.attempts || 0) + 1,
      last_checked_at: agoraIso(),
      last_error: 'código de rastreio ainda não disponível',
    });
  }

  const tentativa = await tentarEnviar(settings, locationId, {
    contato,
    nome: (cliente && cliente.name) || os.client_name || 'cliente',
    codigos,
    registro: existente,
  });
  return await gravar(svc, existente, {
    ...base,
    contact_id: contato,
    attempts: (existente?.attempts || 0) + 1,
    last_checked_at: agoraIso(),
    ...tentativa.patch,
  });
}

async function gravar(svc, existente, dados) {
  if (existente) {
    const atualizado = await svc.entities.RomaneioTracking.update(existente.id, dados).catch(() => null);
    return atualizado || { ...existente, ...dados };
  }
  return await svc.entities.RomaneioTracking.create({
    ...dados,
    dispatched_at: agoraIso(),
    attempts: dados.attempts || 1,
  });
}

// Janela do WhatsApp do cliente: aberta quando ele escreveu nas últimas 24 horas. É ela
// que decide se o código pode ir como mensagem comum ou se só o modelo aprovado passa.
async function janelaDoCliente(contato, locationId) {
  const conversa = await findContactConversation(contato, locationId, secrets);
  const bruto = conversa && conversa.lastInboundWhatsappMessageDate;
  const quando = typeof bruto === 'string' ? Date.parse(bruto) : Number(bruto || 0);
  const ultima = Number.isFinite(quando) && quando > 0 ? quando : 0;
  return { aberta: !!ultima && Date.now() - ultima < JANELA_MS, ultima };
}

// Tenta enviar o código de rastreio. A mensagem comum só sai com a janela aberta; fechada,
// manda a pergunta (modelo aprovado) e registra que estamos aguardando a resposta do cliente.
async function tentarEnviar(settings, locationId, { contato, nome, codigos, registro }) {
  const janela = await janelaDoCliente(contato, locationId);
  const envio = janela.aberta
    ? await sendGhlWhatsAppMessage(
      contato,
      buildShippingNotificationMessage(nome || 'cliente', paraLinks(codigos)),
      locationId,
      secrets,
    )
    : { ok: false, status: 0, data: { error: 'janela do WhatsApp fechada (cliente não escreve há mais de 24 horas)' } };
  if (envio.ok) {
    return {
      status: 'Enviado',
      patch: { status: 'Enviado', tracking_message_sent_at: agoraIso(), last_error: null },
    };
  }

  const pergunta = await enviarPergunta(settings, locationId, contato, nome);
  const hora = agoraIso();
  return {
    status: 'Aguardando Resposta',
    patch: {
      status: 'Aguardando Resposta',
      // O marco da resposta é sempre a PRIMEIRA pergunta: qualquer mensagem do cliente
      // depois dela abre a janela, inclusive se ele responder a um reenvio.
      window_requested_at: (registro && registro.window_requested_at) || hora,
      last_ask_at: hora,
      window_request_template_id: nomeDoModelo(settings),
      last_error: [
        `código de rastreio não enviado ${resumoErro(envio)}`,
        pergunta.ok ? 'pergunta enviada ao cliente' : `pergunta ${resumoErro(pergunta)}`,
      ].filter(Boolean).join(' | '),
    },
  };
}

// Pergunta ao cliente se ele pode falar agora: modelo aprovado quando configurado,
// senão a mensagem reserva. A mensagem comum só passa se a janela estiver aberta.
async function enviarPergunta(settings, locationId, contato, nomeCliente = '') {
  const texto = textoDaPergunta(settings);
  const modelo = montarModeloPergunta(settings);
  if (modelo) return await sendGhlWhatsAppTemplate(contato, { ...modelo, message: texto }, locationId, secrets);
  if (!texto) return { ok: false, status: 0, data: { error: 'pergunta não configurada' } };
  return await sendGhlWhatsAppMessage(contato, texto, locationId, secrets);
}

// Texto de apoio da pergunta (o modelo aprovado conversar_agora não tem variáveis).
function textoDaPergunta(settings) {
  return String(settings.romaneio_window_message || '').trim() || TEXTO_PERGUNTA_PADRAO;
}

// Modelo aprovado da pergunta: usa o ID quando informado e, sem ele, o modelo padrão
// conversar_agora (pt_BR).
function montarModeloPergunta(settings) {
  const id = String(settings.romaneio_window_template_id || '').trim();
  const nome = String(settings.romaneio_window_template_name || MODELO_PERGUNTA).trim();
  const idioma = String(settings.romaneio_window_template_language || MODELO_PERGUNTA_IDIOMA).trim();
  if (!id && !nome) return null;
  return { id, name: nome, language: idioma };
}

// Nome do modelo usado (para cachê no acompanhamento).
const nomeDoModelo = (settings) => String(settings.romaneio_window_template_id || MODELO_PERGUNTA).trim();

// Envio de teste: usa como exemplo a OS em transporte mais recente que já tem código de
// rastreio e manda a mesma mensagem do aviso para o número informado. O contato do teste é
// reutilizado quando já existe no CRM; senão é criado para o WhatsApp poder ser enviado.
async function testeDeAviso(svc, settings, locationId, digitos, tipo) {
  const querPergunta = tipo === 'pergunta';
  const recentes = await svc.entities.ServiceOrder
    .filter({ status: { $in: STATUSES_ENTRADA } }, '-updated_date', OS_POR_CICLO)
    .catch(() => []);
  const exemplo = (recentes || []).find((os) => codigosDaOs(os).length);
  if (!exemplo && !querPergunta) {
    return { ok: false, motivo: 'nenhuma OS em transporte com código de rastreio para montar o teste' };
  }

  const telefone = digitos.length >= 12 ? `+${digitos}` : `+55${digitos}`;
  let contato = await resolveGhlContactId({ phone: telefone, locationId, secrets }).catch(() => '');
  if (!contato) {
    const criado = await upsertGhlContact({
      locationId,
      body: { name: 'Teste - Aviso de rastreio', phone: telefone },
      secrets,
    }).catch(() => null);
    contato = (criado && criado.id) || '';
  }
  if (!contato) return { ok: false, motivo: 'não consegui abrir o contato deste número no CRM' };

  // Teste da pergunta: é o modelo aprovado que reabre a conversa fora da janela do Meta.
  if (querPergunta) {
    const pergunta = await enviarPergunta(settings, locationId, contato, 'Cliente Teste');
    return {
      ok: pergunta.ok,
      tipo: 'pergunta',
      modelo: nomeDoModelo(settings),
      erro: pergunta.ok ? null : resumoErro(pergunta),
    };
  }

  const codigos = codigosDaOs(exemplo);
  const mensagem = buildShippingNotificationMessage(exemplo.client_name || 'cliente', paraLinks(codigos));
  const envio = await sendGhlWhatsAppMessage(contato, mensagem, locationId, secrets);
  return {
    ok: envio.ok,
    os: exemplo.code || '',
    codigos,
    mensagem,
    erro: envio.ok ? null : resumoErro(envio),
  };
}

function contar(resultado, registro) {
  if (registro.status === 'Enviado') resultado.enviadas++;
  else if (registro.status === 'Sem Envio') resultado.sem_envio++;
  else resultado.aguardando++;
}