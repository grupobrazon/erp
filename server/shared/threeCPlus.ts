// Cópia de base44/shared/threeCPlus.ts gerada por tools/port_function.py.
// Helpers compartilhados para integração com o discador 3C Plus.
// Usados por: sync3CCampaign e webhook3C.
//
// A configuração (api_token, base_url) vem da entidade SystemSetting — NÃO de secrets.
// As funções que usam este módulo devem carregar a config do SystemSetting e passar para buildUrl/call3C.

const DEFAULT_BASE_URL = "http://app.3c.fluxoti.com.br/api/v1";

// Monta a URL completa com o api_token como query param.
export function buildUrl(path, config = {}, extraParams = {}) {
  const base = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const url = new URL(base + path);
  url.searchParams.set("api_token", config.apiToken || "");
  for (const [k, v] of Object.entries(extraParams)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export function hasCredentials(config = {}) {
  return Boolean(config.apiToken);
}

// Normaliza telefone para o formato esperado pelo 3C Plus (apenas dígitos com DDD).
export function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 0) return "";
  // Se não tem código do país, assume 55 (Brasil)
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  if (digits.length === 12 || digits.length === 13) return digits;
  return digits;
}

// Mapeia o status de chamada retornado pelo 3C Plus para o enum interno.
export function mapCallStatus(rawStatus) {
  const s = String(rawStatus || "").toLowerCase().trim();
  if (["atendida", "answered", "answer", "success", "conectado", "completed", "call-was-connected"].includes(s)) return "Atendida";
  if (["nao atendida", "nao_atendida", "no answer", "noanswer", "sem resposta"].includes(s)) return "Não Atendida";
  if (["ocupado", "busy", "busy_here", "busyhere"].includes(s)) return "Ocupado";
  if (["caixa postal", "caixa_postal", "voicemail", "voicemail_box", "machine"].includes(s)) return "Caixa Postal";
  if (["invalido", "invalid", "invalid_number", "failed", "falha", "erro"].includes(s)) return "Inválido";
  return "Outro";
}

// Faz uma chamada autenticada à API do 3C Plus.
// form = true envia application/x-www-form-urlencoded (necessário para criar listas).
export async function call3C(method, path, config = {}, { body, params, form } = {}) {
  if (!hasCredentials(config)) {
    return { ok: false, status: 401, error: "Credenciais do 3C Plus não configuradas (threec_api_token no SystemSetting)." };
  }
  const url = buildUrl(path, config, params);
  const headers = { "Accept": "application/json" };
  let requestBody;
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    const formBody = new URLSearchParams();
    for (const [k, v] of Object.entries(form)) {
      if (Array.isArray(v)) {
        for (const item of v) formBody.append(`${k}[]`, String(item));
      } else {
        formBody.append(k, String(v));
      }
    }
    requestBody = formBody.toString();
  } else {
    headers["Content-Type"] = "application/json";
    requestBody = body ? JSON.stringify(body) : undefined;
  }
  const res = await fetch(url, { method, headers, body: requestBody });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}