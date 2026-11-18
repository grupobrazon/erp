-- Ajustes na sincronização: datas ausentes viram "agora" e usuários vindos da Base44 ficam liberados.
create or replace function public.b44_sync_upsert(p_entity text, p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_cols text[];
  v_list text;
  v_sel text;
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
  select string_agg(case when c in ('created_date', 'updated_date')
                         then format('coalesce(r.%1$I, now())', c)
                         else format('r.%I', c) end, ', ')
    into v_sel from unnest(v_cols) c;
  select string_agg(format('%1$I = excluded.%1$I', c), ', ') into v_set
    from unnest(v_cols) c where c <> 'id';

  execute format(
    'insert into public.%1$I (%2$s) select %3$s from jsonb_populate_recordset(null::public.%1$I, $1) r where r.id is not null on conflict (id) do update set %4$s',
    p_entity, v_list, v_sel, v_set)
    using p_rows;
  get diagnostics v_n = row_count;

  if p_entity = 'User' then
    update public."User" set disabled = false
     where disabled and id in (select r.id from jsonb_to_recordset(p_rows) as r(id text));
  end if;
  return v_n;
end $$;

revoke execute on function public.b44_sync_upsert(text, jsonb) from public, anon, authenticated;
grant execute on function public.b44_sync_upsert(text, jsonb) to service_role;
