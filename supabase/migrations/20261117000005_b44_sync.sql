-- Recebimento da sincronização Base44 -> Supabase.
-- Só o servidor (service_role) usa estas funções.

-- Durante a sincronização, as datas e o id vêm da Base44 e não podem ser trocados.
create or replace function public.b44_touch_updated()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_setting('b44.sync', true) = 'on' then
    return new;
  end if;
  new.updated_date := now();
  new.id := old.id;
  new.created_date := old.created_date;
  return new;
end $$;

create table if not exists public.b44_sync_state (
  entity text primary key,
  last_updated text,
  rows_total bigint not null default 0,
  last_run timestamptz,
  last_error text
);
alter table public.b44_sync_state enable row level security;
create policy b44_sync_state_admin on public.b44_sync_state for select to authenticated
  using (public.b44_is_admin());

-- Insere ou atualiza registros vindos da Base44, preservando id, datas e autor.
-- Em "User", não mexe no vínculo de login (auth_id) nem no bloqueio local (disabled),
-- e reaproveita um cadastro local feito com o mesmo e-mail.
create or replace function public.b44_sync_upsert(p_entity text, p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_cols text[];
  v_list text;
  v_set text;
  v_n integer;
begin
  perform public.b44_assert_entity(p_entity);
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return 0;
  end if;
  perform set_config('b44.sync', 'on', true);

  select array_agg(a.attname order by a.attnum) into v_cols
    from pg_attribute a
   where a.attrelid = format('public.%I', p_entity)::regclass
     and a.attnum > 0 and not a.attisdropped
     and not (p_entity = 'User' and a.attname in ('auth_id', 'disabled'));

  if p_entity = 'User' then
    update public."User" u set id = r.id
      from jsonb_to_recordset(p_rows) as r(id text, email text)
     where r.email is not null and lower(u.email) = lower(r.email) and u.id <> r.id
       and not exists (select 1 from public."User" x where x.id = r.id);
  end if;

  select string_agg(format('%I', c), ', ') into v_list from unnest(v_cols) c;
  select string_agg(format('%1$I = excluded.%1$I', c), ', ') into v_set
    from unnest(v_cols) c where c <> 'id';

  execute format(
    'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) r where r.id is not null on conflict (id) do update set %3$s',
    p_entity, v_list, v_set)
    using p_rows;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Remove registros que foram apagados na Base44.
create or replace function public.b44_sync_delete(p_entity text, p_ids text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  perform public.b44_assert_entity(p_entity);
  if p_entity = 'User' then
    raise exception 'Usuários não são apagados pela sincronização';
  end if;
  execute format('delete from public.%I where id = any($1)', p_entity) using p_ids;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Login com a senha da Base44: acha o usuário de login (auth) pelo e-mail.
create or replace function public.b44_auth_user_id(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;

revoke execute on function public.b44_sync_upsert(text, jsonb) from public, anon, authenticated;
revoke execute on function public.b44_sync_delete(text, text[]) from public, anon, authenticated;
revoke execute on function public.b44_auth_user_id(text) from public, anon, authenticated;
grant execute on function public.b44_sync_upsert(text, jsonb) to service_role;
grant execute on function public.b44_sync_delete(text, text[]) to service_role;
grant execute on function public.b44_auth_user_id(text) to service_role;
grant select, insert, update on public.b44_sync_state to service_role;
