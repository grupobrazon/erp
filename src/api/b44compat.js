// Camada de compatibilidade: oferece a mesma interface do SDK da Base44
// (base44.entities.X.list/filter/get/create/update/delete..., base44.auth.*,
// base44.functions.invoke, base44.integrations.Core.*) usando o Supabase.
//
// Não depende do navegador: o mesmo arquivo serve ao front (Vite) e às
// Edge Functions (Deno), recebendo o cliente do Supabase já criado.

import { ENTITY_COLUMNS } from './entityColumns.js';

const BUILTIN = new Set(['id', 'created_date', 'updated_date', 'created_by', 'created_by_id']);
const BULK_CONCURRENCY = 8;

// Erro no formato que o código da Base44 espera (err.message, err.status, err.response.data).
export class B44Error extends Error {
  constructor(message, status = 500, data = undefined) {
    super(message);
    this.name = 'B44Error';
    this.status = status;
    this.response = { status, data: data ?? { error: message, message } };
    this.data = this.response.data;
  }
}

function fromSupabase(error, fallbackStatus = 400) {
  if (!error) return null;
  if (error instanceof B44Error) return error;
  let status = fallbackStatus;
  if (error.code === 'PGRST116') status = 404;            // nenhum registro
  else if (error.code === '42501') status = 403;          // sem permissão
  else if (typeof error.status === 'number') status = error.status;
  return new B44Error(error.message || 'Erro ao acessar o banco de dados', status, error);
}

function toNumber(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function toBool(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0') return false;
  return Boolean(v);
}

// Mantém só as colunas da entidade e converte os tipos, como a Base44 faz ao validar.
export function cleanRecord(entity, data, { keepId = false } = {}) {
  const cols = ENTITY_COLUMNS[entity];
  if (!cols) throw new B44Error(`Entidade desconhecida: ${entity}`, 404);
  const out = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined) continue;
    if (BUILTIN.has(key)) {
      if (keepId && key === 'id' && value) out.id = String(value);
      continue;
    }
    const type = cols[key];
    if (!type) continue;
    if (type === 'n') out[key] = toNumber(value);
    else if (type === 'b') out[key] = toBool(value);
    else if (type === 't') out[key] = value === null ? null : (typeof value === 'string' ? value : String(value));
    else out[key] = value;
  }
  return out;
}

async function pool(items, size, worker) {
  const results = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
  return results;
}

function entityHandler(sb, entity) {
  const table = () => sb.from(entity);
  const find = async (query, sort, limit, skip, fields) => {
    const { data, error } = await sb.rpc('b44_find', {
      p_entity: entity,
      p_query: query || {},
      p_sort: sort ?? null,
      p_limit: limit ?? null,
      p_skip: skip ?? 0,
      p_fields: Array.isArray(fields) && fields.length ? fields : null,
    });
    if (error) throw fromSupabase(error);
    return data || [];
  };

  return {
    list: (sort, limit, skip, fields) => find({}, sort, limit, skip, fields),
    filter: (query, sort, limit, skip, fields) => find(query, sort, limit, skip, fields),

    async get(id) {
      const { data, error } = await table().select('*').eq('id', String(id)).maybeSingle();
      if (error) throw fromSupabase(error);
      if (!data) throw new B44Error(`${entity} com id ${id} não encontrado`, 404);
      return data;
    },

    async create(record) {
      const { data, error } = await table().insert(cleanRecord(entity, record, { keepId: true })).select('*').single();
      if (error) throw fromSupabase(error);
      return data;
    },

    async bulkCreate(records) {
      if (!Array.isArray(records) || records.length === 0) return [];
      const rows = records.map((r) => cleanRecord(entity, r, { keepId: true }));
      const out = [];
      for (let i = 0; i < rows.length; i += 500) {
        const { data, error } = await table().insert(rows.slice(i, i + 500)).select('*');
        if (error) throw fromSupabase(error);
        out.push(...(data || []));
      }
      return out;
    },

    async update(id, changes) {
      const payload = cleanRecord(entity, changes);
      if (Object.keys(payload).length === 0) return this.get(id);
      const { data, error } = await table().update(payload).eq('id', String(id)).select('*').maybeSingle();
      if (error) throw fromSupabase(error);
      if (!data) throw new B44Error(`${entity} com id ${id} não encontrado`, 404);
      return data;
    },

    // Base44: lista de { id, ...campos } — cada registro recebe só os campos enviados.
    async bulkUpdate(records) {
      if (!Array.isArray(records) || records.length === 0) return [];
      return pool(records, BULK_CONCURRENCY, ({ id, ...rest }) => this.update(id, rest));
    },

    async updateMany(query, update) {
      const { data, error } = await sb.rpc('b44_update_many', { p_entity: entity, p_query: query || {}, p_update: update || {} });
      if (error) throw fromSupabase(error);
      return { updated: data, modifiedCount: data };
    },

    async delete(id) {
      const { error } = await table().delete().eq('id', String(id));
      if (error) throw fromSupabase(error);
      return { success: true, id };
    },

    async deleteMany(query) {
      const { data, error } = await sb.rpc('b44_delete_many', { p_entity: entity, p_query: query || {} });
      if (error) throw fromSupabase(error);
      return { deleted: data, deletedCount: data };
    },

    // Base44 chama callback({ type: 'create'|'update'|'delete', id, data }) e devolve a função para cancelar.
    subscribe(callback) {
      const kinds = { INSERT: 'create', UPDATE: 'update', DELETE: 'delete' };
      const channel = sb
        .channel(`b44-${entity}-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: entity }, (msg) => {
          const row = msg.eventType === 'DELETE' ? msg.old : msg.new;
          try {
            callback({ type: kinds[msg.eventType], id: row?.id, data: row });
          } catch (e) {
            console.error(e);
          }
        })
        .subscribe();
      return () => { sb.removeChannel(channel); };
    },
  };
}

export function createEntities(sb) {
  const cache = new Map();
  return new Proxy({}, {
    get(_, name) {
      if (typeof name !== 'string' || !(name in ENTITY_COLUMNS)) return undefined;
      if (!cache.has(name)) cache.set(name, entityHandler(sb, name));
      return cache.get(name);
    },
    has: (_, name) => name in ENTITY_COLUMNS,
    ownKeys: () => Object.keys(ENTITY_COLUMNS),
    getOwnPropertyDescriptor: (_, name) =>
      name in ENTITY_COLUMNS ? { enumerable: true, configurable: true } : undefined,
  });
}

// Chamada às Edge Functions no formato do axios usado pela Base44: { data, status, headers }.
export function createFunctions({ sb, url, anonKey }) {
  return {
    async invoke(name, payload = {}) {
      const { data: { session } = {} } = await sb.auth.getSession();
      const isForm = typeof FormData !== 'undefined' && payload instanceof FormData;
      const res = await fetch(`${url}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${session?.access_token || anonKey}`,
          ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        },
        body: isForm ? payload : JSON.stringify(payload ?? {}),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('application/json') ? await res.json().catch(() => null)
        : type.startsWith('text/') ? await res.text()
        : await res.arrayBuffer();
      if (!res.ok) {
        const msg = (data && (data.error || data.message)) || `Função ${name} falhou (${res.status})`;
        throw new B44Error(typeof msg === 'string' ? msg : JSON.stringify(msg), res.status, data);
      }
      return { data, status: res.status, headers: Object.fromEntries(res.headers.entries()) };
    },
  };
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function safeName(name) {
  return String(name || 'arquivo').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120);
}

export function createIntegrations({ sb, functions }) {
  const upload = async (bucket, file) => {
    if (!file) throw new B44Error('Arquivo não informado', 400);
    const path = `${new Date().toISOString().slice(0, 10)}/${randomId()}-${safeName(file.name)}`;
    const { error } = await sb.storage.from(bucket).upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (error) throw fromSupabase(error);
    return path;
  };
  const viaFunction = (name) => async (params = {}) => (await functions.invoke(name, params)).data;

  return {
    Core: {
      async UploadFile({ file }) {
        const path = await upload('public-files', file);
        return { file_url: sb.storage.from('public-files').getPublicUrl(path).data.publicUrl };
      },
      async UploadPublicFile({ file }) {
        const path = await upload('public-files', file);
        return { file_url: sb.storage.from('public-files').getPublicUrl(path).data.publicUrl };
      },
      async UploadPrivateFile({ file }) {
        return { file_uri: await upload('private-files', file) };
      },
      async CreateFileSignedUrl({ file_uri, expires_in = 300 }) {
        const { data, error } = await sb.storage.from('private-files').createSignedUrl(file_uri, expires_in);
        if (error) throw fromSupabase(error);
        return { signed_url: data.signedUrl };
      },
      // Estes três rodam no servidor (Edge Functions), onde ficam as chaves.
      InvokeLLM: viaFunction('invokeLLM'),
      ExtractDataFromUploadedFile: viaFunction('extractDataFromUploadedFile'),
      SendEmail: viaFunction('sendEmail'),
    },
  };
}

// Converte o registro de "User" no objeto que a Base44 devolve em auth.me().
export function toB44User(row, authUser) {
  return {
    ...row,
    email: row.email || authUser?.email,
    full_name: row.full_name || row.display_name || authUser?.user_metadata?.full_name || authUser?.email,
  };
}
