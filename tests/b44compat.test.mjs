// Testes da camada de compatibilidade com um Supabase simulado: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanRecord, createEntities, createFunctions, B44Error } from '../src/api/b44compat.js';

function fakeSb(log, rows = { Client: [{ id: 'c1', name: 'Ana' }] }) {
  const builder = (table) => {
    const st = { table, op: 'select', filters: [], payload: null };
    const done = () => {
      log.push(st);
      if (st.op === 'select' || st.op === 'update') {
        const hit = (rows[table] || []).find((r) => st.filters.every(([c, v]) => r[c] === v));
        return { data: hit ? { ...hit, ...(st.payload || {}) } : null, error: null };
      }
      if (st.op === 'insert') {
        const arr = Array.isArray(st.payload) ? st.payload : [st.payload];
        const out = arr.map((r, i) => ({ id: r.id || `n${i}`, ...r }));
        return { data: Array.isArray(st.payload) ? out : out[0], error: null };
      }
      return { data: null, error: null };
    };
    const b = {
      select() { return b; }, eq(c, v) { st.filters.push([c, v]); return b; },
      insert(p) { st.op = 'insert'; st.payload = p; return b; },
      update(p) { st.op = 'update'; st.payload = p; return b; },
      delete() { st.op = 'delete'; return b; },
      single: async () => done(), maybeSingle: async () => done(),
      then: (res, rej) => Promise.resolve(done()).then(res, rej),
    };
    return b;
  };
  return {
    from: builder,
    rpc: async (name, args) => { log.push({ rpc: name, args }); return { data: name === 'b44_find' ? [{ id: 'x' }] : 2, error: null }; },
    auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) },
  };
}

test('cleanRecord descarta campos desconhecidos e converte tipos', () => {
  const r = cleanRecord('Client', { name: 'Ana', inventado: 1, clint_deal_count: '3', is_active: 'false',
    ghl_tags: ['a'], id: 'zz', created_date: 'x', zip_code: 30100 });
  assert.deepEqual(r, { name: 'Ana', clint_deal_count: 3, is_active: false, ghl_tags: ['a'], zip_code: '30100' });
  assert.equal(cleanRecord('Client', { id: 'abc' }, { keepId: true }).id, 'abc');
  assert.equal(cleanRecord('Sale', { total: '' }).total, null);
  assert.throws(() => cleanRecord('NaoExiste', {}), B44Error);
});

test('list e filter usam b44_find com sort, limit, skip e fields', async () => {
  const log = []; const e = createEntities(fakeSb(log));
  await e.Client.list('-created_date', 200);
  await e.Client.filter({ status: { $in: ['Novo'] } }, 'name', 10, 20, ['name']);
  assert.deepEqual(log[0], { rpc: 'b44_find', args: { p_entity: 'Client', p_query: {}, p_sort: '-created_date', p_limit: 200, p_skip: 0, p_fields: null } });
  assert.deepEqual(log[1].args, { p_entity: 'Client', p_query: { status: { $in: ['Novo'] } }, p_sort: 'name', p_limit: 10, p_skip: 20, p_fields: ['name'] });
});

test('get, create, update, delete e bulkUpdate', async () => {
  const log = []; const e = createEntities(fakeSb(log));
  assert.equal((await e.Client.get('c1')).name, 'Ana');
  await assert.rejects(e.Client.get('nao'), (err) => err.status === 404);
  const c = await e.Client.create({ name: 'Bia', lixo: 1 });
  assert.deepEqual(log.at(-1).payload, { name: 'Bia' });
  assert.equal(c.name, 'Bia');
  const u = await e.Client.update('c1', { city: 'BH', updated_date: 'x' });
  assert.equal(u.city, 'BH');
  assert.deepEqual(log.at(-1).payload, { city: 'BH' });
  await e.Client.delete('c1');
  assert.equal(log.at(-1).op, 'delete');
  const many = await e.Client.bulkUpdate([{ id: 'c1', city: 'A' }, { id: 'c1', city: 'B' }]);
  assert.equal(many.length, 2);
  const um = await e.Product.updateMany({ group_id: 'g' }, { $set: { cost: 5 } });
  assert.equal(um.modifiedCount, 2);
});

test('entidades dinâmicas e desconhecidas', () => {
  const e = createEntities(fakeSb([]));
  assert.ok(e['ServiceOrder']);
  assert.equal(e.Inexistente, undefined);
  assert.equal(Object.keys(e).length, 65);
});

test('functions.invoke devolve {data,status} e lança erro com response', async () => {
  const calls = [];
  globalThis.fetch = async (url, opt) => {
    calls.push({ url, opt });
    const ok = !url.endsWith('/falha');
    return new Response(JSON.stringify(ok ? { ok: 1 } : { error: 'deu ruim' }), {
      status: ok ? 200 : 422, headers: { 'content-type': 'application/json' } });
  };
  const f = createFunctions({ sb: fakeSb([]), url: 'https://x.supabase.co', anonKey: 'anon' });
  const r = await f.invoke('emitNFe', { id: 1 });
  assert.deepEqual(r.data, { ok: 1 });
  assert.equal(r.status, 200);
  assert.equal(calls[0].url, 'https://x.supabase.co/functions/v1/emitNFe');
  assert.equal(calls[0].opt.headers.Authorization, 'Bearer tok');
  await assert.rejects(f.invoke('falha'), (err) => err.status === 422 && err.message === 'deu ruim' && err.response.data.error === 'deu ruim');
});
