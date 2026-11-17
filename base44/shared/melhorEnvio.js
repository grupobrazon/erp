// Helpers compartilhados para integração com o Melhor Envio (verificação de status e arquivamento de etiquetas canceladas).
// Usados por: generateMelhorEnvioLabel e checkMelhorEnvioLabelStatus.

// Normaliza o status retornado pelo Melhor Envio para um flag booleano de "cancelada".
export function isMeCanceled(status, canceledAt) {
  const s = String(status || '').toLowerCase().trim();
  const canceledValues = ['canceled', 'cancelled', 'cancelado', 'cancelada'];
  return canceledValues.includes(s) || Boolean(canceledAt);
}

// Busca o status de uma etiqueta (order) no Melhor Envio.
// Retorna { shipment_id, status, canceled, canceled_at, error, details }.
export async function fetchMeShipmentStatus(shipmentId, token, userAgent, useSandbox) {
  const baseUrl = useSandbox ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';
  const sid = String(shipmentId || '').trim();
  if (!sid) return { shipment_id: shipmentId, status: 'missing_id', canceled: false, error: true };
  try {
    const res = await fetch(`${baseUrl}/api/v2/me/orders/${encodeURIComponent(sid)}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': userAgent,
      },
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    // 404 = a etiqueta não existe mais no Melhor Envio (removida/cancelada) → tratamos como cancelada.
    if (res.status === 404) {
      return { shipment_id: sid, status: 'not_found', canceled: true, canceled_at: null, error: false };
    }
    if (!res.ok) {
      return { shipment_id: sid, status: 'error', canceled: false, error: true, details: data };
    }
    const canceled = isMeCanceled(data.status, data.canceled_at);
    return {
      shipment_id: sid,
      status: String(data.status || '').toLowerCase(),
      canceled,
      canceled_at: data.canceled_at || null,
      error: false,
    };
  } catch (e) {
    return { shipment_id: sid, status: 'fetch_error', canceled: false, error: true, message: String(e?.message || e) };
  }
}

// Verifica todas as etiquetas de uma OS, arquiva as canceladas no histórico e limpa os campos se todas forem canceladas.
// Retorna { checked, anyCanceled, allCanceled, cleared, remaining }.
export async function syncMeLabelsStatus(base44, order, token, userAgent, useSandbox) {
  const labels = Array.isArray(order.melhor_envio_labels) ? order.melhor_envio_labels : [];
  if (labels.length === 0) {
    return { checked: [], anyCanceled: false, allCanceled: false, cleared: false, remaining: [] };
  }

  const checked = [];
  for (const lbl of labels) {
    if (!lbl.shipment_id) {
      checked.push({ shipment_id: null, status: 'missing_id', canceled: false, error: true, label: lbl });
      continue;
    }
    const r = await fetchMeShipmentStatus(lbl.shipment_id, token, userAgent, useSandbox);
    checked.push({ ...r, label: lbl });
  }

  const canceledResults = checked.filter(r => r.canceled);
  const anyCanceled = canceledResults.length > 0;
  const allCanceled = checked.length > 0 && checked.every(r => r.canceled);
  const remaining = labels.filter(lbl => !checked.find(r => r.shipment_id === lbl.shipment_id && r.canceled));

  let cleared = false;
  if (anyCanceled) {
    const now = new Date().toISOString();
    const existingHistory = Array.isArray(order.melhor_envio_canceled_labels) ? order.melhor_envio_canceled_labels : [];
    const canceledLabels = canceledResults.map(r => ({
      volume_index: r.label?.volume_index,
      product_name: r.label?.product_name,
      label_tag: r.label?.label_tag,
      shipment_id: r.label?.shipment_id,
      tracking_code: r.label?.tracking_code,
      carrier: r.label?.carrier,
      label_url: r.label?.label_url,
      generated_at: r.label?.generated_at,
      canceled_status: r.status,
      canceled_at_me: r.canceled_at || null,
      detected_at: now,
      reason: 'Cancelada no Melhor Envio',
    }));

    const updatePayload = {
      melhor_envio_canceled_labels: [...existingHistory, ...canceledLabels],
      melhor_envio_labels: remaining,
    };
    if (remaining.length === 0) {
      updatePayload.expedition_label_url = '';
      updatePayload.tracking_code = '';
      updatePayload.melhor_envio_shipment_id = '';
      updatePayload.carrier = '';
      // Se todas as etiquetas foram canceladas e a OS estava em "Etiqueta Gerada", volta para "Produção Liberada"
      // para que o botão de gerar etiqueta reapareça e permita a reemissão.
      if (order.status === 'Etiqueta Gerada') {
        updatePayload.status = 'Produção Liberada';
      }
    } else {
      updatePayload.expedition_label_url = remaining[0]?.label_url || '';
      updatePayload.tracking_code = remaining[0]?.tracking_code || '';
      updatePayload.melhor_envio_shipment_id = remaining[0]?.shipment_id || '';
      updatePayload.carrier = remaining[0]?.carrier || '';
    }
    await base44.entities.ServiceOrder.update(order.id, updatePayload);
    cleared = remaining.length === 0;
  }

  return { checked, anyCanceled, allCanceled, cleared, remaining };
}

// --- Rastreio automático (consulta em lote pelo shipment_id) ---

// Mapeamento do macro-status do Melhor Envio para o status da OS no ciclo de expedição.
// Status não mapeados (pending, released, canceled, undelivered, etc.) não alteram a OS.
export const ME_TRACKING_STATUS_TO_OS = {
  generated: 'Etiqueta Gerada',
  posted: 'Em Transporte',
  delivered: 'Entregue',
};

// Resolve o macro-status efetivo de um resultado de rastreio.
// A API do Melhor Envio às vezes retorna status não-padrão (ex: "paused") mesmo quando
// o pacote já foi entregue ou postado. Os campos delivered_at e posted_at são indicadores
// mais confiáveis do estado real do envio e são usados como fallback.
export function resolveMeStatus(t) {
  if (!t || t.error) return null;
  if (t.delivered_at) return 'delivered';
  if (t.posted_at) return 'posted';
  const s = String(t.status || '').toLowerCase().trim();
  return s || null;
}

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Tempo de espera do header Retry-After (segundos ou data HTTP); usa o padrão quando ausente/inválido.
function parseRetryAfterMs(res, defaultMs) {
  let raw = null;
  if (res && typeof res.headers?.get === 'function') raw = res.headers.get('retry-after');
  if (raw) {
    const secs = Number(raw);
    if (!Number.isNaN(secs) && secs >= 0) return secs * 1000;
    const date = Date.parse(raw);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  }
  return defaultMs;
}

// Consulta em lote o status do ciclo de vida das etiquetas (POST /api/v2/me/shipment/tracking),
// com tratamento automático de rate limit (HTTP 429) e falhas transitórias:
// - 429: espera o tempo do header Retry-After (ou o tempo seguro padrão) e repete SOMENTE o
//   lote que falhou; lotes já consultados com sucesso não são consultados novamente;
// - se a espera exigida for muito longa ou as tentativas esgotarem, o lote é marcado como
//   indisponível (a OS correspondente não é alterada) e a execução encerra sem novas chamadas;
// - falhas de rede / 5xx / 408: mesma repetição por lote, com espera segura entre tentativas.
// Retorna um mapa { [shipment_id]: { status, tracking, posted_at, delivered_at, canceled_at, error } }.
export async function fetchMeTrackingBatch(shipmentIds, token, userAgent, useSandbox, options = {}) {
  const baseUrl = useSandbox ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';
  const ids = [...new Set((shipmentIds || []).map(s => String(s || '').trim()).filter(Boolean))];
  const result = {};
  const CHUNK = 25;
  const fetchImpl = options.fetchImpl || fetch;
  const defaultWaitMs = options.defaultWaitMs ?? 60 * 1000;
  const maxWaitMs = options.maxWaitMs ?? 180 * 1000;
  const maxAttempts = options.maxAttempts ?? 5;
  let aborted = false;

  const markUnavailable = (chunkIds, status) =>
    chunkIds.forEach(id => { result[id] = { status, tracking: null, error: true }; });

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    if (aborted) { markUnavailable(chunk, 'rate_limited'); continue; }

    let resolved = false;
    for (let attempt = 1; attempt <= maxAttempts && !resolved; attempt++) {
      let res;
      try {
        res = await fetchImpl(`${baseUrl}/api/v2/me/shipment/tracking`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'User-Agent': userAgent,
          },
          body: JSON.stringify({ orders: chunk }),
        });
      } catch (e) {
        if (attempt < maxAttempts) { await sleepMs(defaultWaitMs); continue; }
        markUnavailable(chunk, 'fetch_error');
        resolved = true;
        break;
      }

      if (res.status === 429) {
        const waitMs = parseRetryAfterMs(res, defaultWaitMs);
        if (waitMs > maxWaitMs || attempt >= maxAttempts) {
          markUnavailable(chunk, 'rate_limited');
          aborted = true; // os lotes restantes ficam para a próxima execução agendada
          resolved = true;
          break;
        }
        await sleepMs(waitMs);
        continue;
      }

      if (res.status === 408 || res.status >= 500) {
        if (attempt < maxAttempts) { await sleepMs(defaultWaitMs); continue; }
        markUnavailable(chunk, 'server_error');
        resolved = true;
        break;
      }

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = {}; }
      if (!res.ok) {
        chunk.forEach(id => { result[id] = { status: 'error', tracking: null, error: true, http_status: res.status, details: data }; });
        resolved = true;
        break;
      }
      chunk.forEach(id => {
        const o = data[id];
        if (o && o.id) {
          result[id] = {
            status: String(o.status || '').toLowerCase(),
            tracking: o.tracking || o.melhorenvio_tracking || null,
            posted_at: o.posted_at || null,
            delivered_at: o.delivered_at || null,
            canceled_at: o.canceled_at || null,
            error: false,
          };
        } else {
          result[id] = { status: 'not_found', tracking: null, error: true };
        }
      });
      resolved = true;
    }
  }
  return result;
}

// Consulta o rastreio pelo código de rastreio (GET /api/v2/me/orders/search?q=...).
// Usa o endpoint "Pesquisar etiqueta" do ME, que busca por tracking code e retorna o status
// do ciclo de vida (posted_at, delivered_at). Usado como fallback quando o status do ME (batch
// por shipment_id) não reflete o estado real do envio — a busca por código de rastreio pode
// retornar dados atualizados quando o batch retorna "released" sem posted_at/delivered_at.
export async function fetchMeTrackingByCode(trackingCode, token, userAgent, useSandbox) {
  const baseUrl = useSandbox ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';
  const code = String(trackingCode || '').trim();
  if (!code) return { status: null, posted_at: null, delivered_at: null, error: true };
  try {
    const res = await fetch(`${baseUrl}/api/v2/me/orders/search?q=${encodeURIComponent(code)}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': userAgent,
      },
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) return { status: null, posted_at: null, delivered_at: null, error: true, details: data };

    // A resposta é um array de orders que correspondem ao tracking_code.
    // Pegamos o status mais avançado entre todos os matches (delivered_at e posted_at
    // são indicadores confiáveis do estado real do envio).
    const orders = Array.isArray(data) ? data : (data.data || []);
    let delivered_at = null;
    let posted_at = null;
    for (const o of orders) {
      if (o.delivered_at) delivered_at = o.delivered_at;
      if (o.posted_at) posted_at = o.posted_at;
    }

    return {
      status: delivered_at ? 'delivered' : (posted_at ? 'posted' : null),
      posted_at,
      delivered_at,
      error: false,
    };
  } catch (e) {
    return { status: null, posted_at: null, delivered_at: null, error: true, message: String(e?.message || e) };
  }
}