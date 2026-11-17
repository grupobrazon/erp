-- Usuários, convites, consultas no estilo Base44, arquivos e tempo real.

-- ---------------------------------------------------------------------------
-- 1. Tabela "User": quem pode ver e alterar
-- ---------------------------------------------------------------------------
create policy b44_read on public."User" for select to authenticated
  using (public.b44_is_active_user() or auth_id = auth.uid());
create policy b44_create on public."User" for insert to authenticated
  with check (public.b44_is_admin());
create policy b44_update on public."User" for update to authenticated
  using (public.b44_is_admin() or auth_id = auth.uid())
  with check (public.b44_is_admin() or auth_id = auth.uid());
create policy b44_delete on public."User" for delete to authenticated
  using (public.b44_is_admin());

-- Ninguém além do admin muda o próprio perfil, permissões ou vínculo de login.
create or replace function public.b44_user_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' or public.b44_is_admin() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.additional_roles is distinct from old.additional_roles
     or new.extra_permissions is distinct from old.extra_permissions
     or new.extra_menu_access is distinct from old.extra_menu_access
     or new.disabled is distinct from old.disabled
     or new.auth_id is distinct from old.auth_id
     or new.email is distinct from old.email
     or new.seller_id is distinct from old.seller_id
     or new.technician_id is distinct from old.technician_id then
    raise exception 'Somente administradores podem alterar perfil, permissões ou vínculos do usuário'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger b44_user_guard before update on public."User"
  for each row execute function public.b44_user_guard();

-- ---------------------------------------------------------------------------
-- 2. Novo login: liga ao usuário importado ou ao convite; sem convite, fica bloqueado
-- ---------------------------------------------------------------------------
create or replace function public.b44_on_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(new.email);
  v_inv public."Invitation";
  v_name text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name');
begin
  if v_email is null then return new; end if;

  update public."User" set auth_id = new.id
   where lower(email) = v_email and auth_id is null;
  if found then return new; end if;
  if exists (select 1 from public."User" where auth_id = new.id) then return new; end if;

  select * into v_inv from public."Invitation"
   where lower(email) = v_email order by created_date desc limit 1;

  if v_inv.id is not null then
    insert into public."User"(auth_id, email, full_name, role, seller_id, technician_id, photo_url, created_by)
    values (new.id, v_email, coalesce(v_inv.full_name, v_name), coalesce(v_inv.role, 'vendedor'),
            v_inv.seller_id, v_inv.technician_id, v_inv.photo_url, v_email);
    update public."Invitation" set status = 'Aceito' where id = v_inv.id;
  else
    -- Sem convite: o registro existe para o admin liberar, mas não acessa nada.
    insert into public."User"(auth_id, email, full_name, role, disabled, created_by)
    values (new.id, v_email, v_name, null, true, v_email);
  end if;
  return new;
end $$;
create trigger b44_on_auth_user after insert on auth.users
  for each row execute function public.b44_on_auth_user();

-- ---------------------------------------------------------------------------
-- 3. Consultas no formato da Base44 (filtros estilo Mongo)
--    Operadores suportados: $and $or $nor $in $nin $ne $gt $gte $lt $lte
--    $exists $regex/$options $eq. Campo inexistente = não casa (como na Base44).
--    SECURITY INVOKER: as regras de acesso de cada tabela continuam valendo.
-- ---------------------------------------------------------------------------
create or replace function public.b44_assert_entity(p_entity text)
returns void language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from public.b44_entities where name = p_entity) then
    raise exception 'Entidade desconhecida: %', p_entity using errcode = '42P01';
  end if;
end $$;

-- Tipo da coluna (null se a coluna não existe).
create or replace function public.b44_coltype(p_entity text, p_col text)
returns text language sql stable set search_path = '' as $$
  select format_type(a.atttypid, a.atttypmod)
    from pg_attribute a
   where a.attrelid = format('public.%I', p_entity)::regclass
     and a.attname = p_col and a.attnum > 0 and not a.attisdropped
$$;

create or replace function public.b44_cond(p_entity text, p_field text, p_op text, p_val jsonb)
returns text language plpgsql stable set search_path = '' as $$
declare
  v_col text := split_part(p_field, '.', 1);
  v_path text[] := (string_to_array(p_field, '.'))[2:];
  v_type text := public.b44_coltype(p_entity, v_col);
  v_json boolean;
  e text;     -- expressão da coluna
  t text;     -- texto do valor
  parts text[];
  item jsonb;
  sqlop text;
begin
  if v_type is null then
    -- Campo que não existe: comporta-se como valor ausente.
    e := 'null::jsonb'; v_json := true;
  elsif v_type = 'jsonb' then
    v_json := true;
    e := case when coalesce(array_length(v_path, 1), 0) = 0 then format('t.%I', v_col)
              else format('(t.%I #> %L::text[])', v_col, v_path) end;
  elsif coalesce(array_length(v_path, 1), 0) > 0 then
    e := 'null::jsonb'; v_json := true;
  else
    v_json := false; e := format('t.%I', v_col);
  end if;

  if p_op = '$eq' then
    if p_val is null or p_val = 'null'::jsonb then
      return case when v_json then format('(%1$s is null or %1$s = ''null''::jsonb)', e)
                  else format('%s is null', e) end;
    end if;
    if v_json then
      return format('(%1$s = %2$L::jsonb or (jsonb_typeof(%1$s) = ''array'' and %1$s @> jsonb_build_array(%2$L::jsonb)))', e, p_val::text);
    end if;
    if jsonb_typeof(p_val) in ('object', 'array')
       or (v_type = 'numeric' and jsonb_typeof(p_val) <> 'number')
       or (v_type = 'boolean' and jsonb_typeof(p_val) <> 'boolean') then
      return format('to_jsonb(%s) = %L::jsonb', e, p_val::text);
    end if;
    return format('%s = %L::%s', e, p_val #>> '{}', v_type);

  elsif p_op = '$ne' then
    return format('not coalesce((%s), false)', public.b44_cond(p_entity, p_field, '$eq', p_val));

  elsif p_op in ('$in', '$nin') then
    if jsonb_typeof(p_val) <> 'array' then
      raise exception '% espera uma lista', p_op;
    end if;
    parts := array[]::text[];
    for item in select * from jsonb_array_elements(p_val) loop
      parts := parts || public.b44_cond(p_entity, p_field, '$eq', item);
    end loop;
    t := case when array_length(parts, 1) is null then 'false'
              else '(' || array_to_string(parts, ' or ') || ')' end;
    return case when p_op = '$in' then t else format('not coalesce(%s, false)', t) end;

  elsif p_op in ('$gt', '$gte', '$lt', '$lte') then
    sqlop := case p_op when '$gt' then '>' when '$gte' then '>=' when '$lt' then '<' else '<=' end;
    if v_json then
      return format('%s %s %L::jsonb', e, sqlop, p_val::text);
    end if;
    if (v_type = 'numeric' and jsonb_typeof(p_val) <> 'number')
       or jsonb_typeof(p_val) in ('object', 'array', 'null') then
      return format('to_jsonb(%s) %s %L::jsonb', e, sqlop, p_val::text);
    end if;
    return format('%s %s %L::%s', e, sqlop, p_val #>> '{}', v_type);

  elsif p_op = '$exists' then
    t := case when v_json then format('(%1$s is not null and %1$s <> ''null''::jsonb)', e)
              else format('%s is not null', e) end;
    return case when p_val = 'true'::jsonb then t else format('not %s', t) end;

  else
    raise exception 'Operador não suportado: %', p_op;
  end if;
end $$;

create or replace function public.b44_where(p_entity text, p_query jsonb)
returns text language plpgsql stable set search_path = '' as $$
declare
  k text;
  v jsonb;
  op text;
  parts text[] := array[]::text[];
  sub text[];
  el jsonb;
  e text;
  v_regex text;
  v_flags text;
begin
  if p_query is null or p_query = '{}'::jsonb or jsonb_typeof(p_query) <> 'object' then
    return 'true';
  end if;
  for k, v in select * from jsonb_each(p_query) loop
    if k in ('$and', '$or', '$nor') then
      sub := array[]::text[];
      for el in select * from jsonb_array_elements(v) loop
        sub := sub || ('(' || public.b44_where(p_entity, el) || ')');
      end loop;
      if array_length(sub, 1) is null then
        parts := parts || (case when k = '$or' then 'false' else 'true' end);
      elsif k = '$and' then parts := parts || ('(' || array_to_string(sub, ' and ') || ')');
      elsif k = '$or' then parts := parts || ('(' || array_to_string(sub, ' or ') || ')');
      else parts := parts || ('not (' || array_to_string(sub, ' or ') || ')');
      end if;
    elsif k like '$%' then
      raise exception 'Operador não suportado: %', k;
    elsif jsonb_typeof(v) = 'object' and exists (select 1 from jsonb_object_keys(v) x where x like '$%') then
      for op in select * from jsonb_object_keys(v) loop
        if op = '$options' then
          continue;
        elsif op = '$regex' then
          v_regex := v ->> '$regex';
          v_flags := coalesce(v ->> '$options', '');
          if public.b44_coltype(p_entity, split_part(k, '.', 1)) is null then
            parts := parts || 'false'::text;
            continue;
          end if;
          if public.b44_coltype(p_entity, split_part(k, '.', 1)) = 'jsonb' then
            e := case when position('.' in k) > 0
                      then format('(t.%I #>> %L::text[])', split_part(k, '.', 1), (string_to_array(k, '.'))[2:])
                      else format('(t.%I #>> ''{}'')', k) end;
          else
            e := format('t.%I::text', k);
          end if;
          parts := parts || format('coalesce(%s %s %L, false)', e,
                                   case when v_flags like '%i%' then '~*' else '~' end, v_regex);
        elsif op = '$not' then
          parts := parts || format('not coalesce((%s), false)',
                                   public.b44_where(p_entity, jsonb_build_object(k, v -> '$not')));
        else
          parts := parts || public.b44_cond(p_entity, k, op, v -> op);
        end if;
      end loop;
    else
      parts := parts || public.b44_cond(p_entity, k, '$eq', v);
    end if;
  end loop;
  return case when array_length(parts, 1) is null then 'true'
              else array_to_string(parts, ' and ') end;
end $$;

-- "-created_date" ou "nome" (também aceita vários separados por vírgula).
create or replace function public.b44_order(p_entity text, p_sort text)
returns text language plpgsql stable set search_path = '' as $$
declare
  s text;
  f text;
  parts text[] := array[]::text[];
begin
  if p_sort is null or btrim(p_sort) = '' then
    return '';
  end if;
  foreach s in array string_to_array(p_sort, ',') loop
    s := btrim(s);
    f := ltrim(ltrim(s, '-'), '+');
    if public.b44_coltype(p_entity, f) is not null then
      parts := parts || format('t.%I %s', f,
                               case when s like '-%' then 'desc nulls last' else 'asc nulls first' end);
    end if;
  end loop;
  if array_length(parts, 1) is null then return ''; end if;
  return ' order by ' || array_to_string(parts, ', ');
end $$;

create or replace function public.b44_find(
  p_entity text,
  p_query jsonb default '{}'::jsonb,
  p_sort text default null,
  p_limit integer default null,
  p_skip integer default 0,
  p_fields text[] default null
) returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_sql text;
  v_out jsonb;
  v_row text := 'to_jsonb(t.*)';
begin
  perform public.b44_assert_entity(p_entity);
  if p_fields is not null and array_length(p_fields, 1) > 0 then
    v_row := format('(select jsonb_object_agg(k, v) from jsonb_each(to_jsonb(t.*)) as x(k, v) where k = any(%L::text[]))',
                    array_append(p_fields, 'id'));
  end if;
  v_sql := format('select coalesce(jsonb_agg(r), ''[]''::jsonb) from (select %s as r from public.%I t where %s%s limit %s offset %s) q',
                  v_row, p_entity, public.b44_where(p_entity, p_query), public.b44_order(p_entity, p_sort),
                  least(greatest(coalesce(p_limit, 5000), 0), 5000), greatest(coalesce(p_skip, 0), 0));
  execute v_sql into v_out;
  return v_out;
end $$;

create or replace function public.b44_count(p_entity text, p_query jsonb default '{}'::jsonb)
returns bigint language plpgsql stable set search_path = '' as $$
declare v bigint;
begin
  perform public.b44_assert_entity(p_entity);
  execute format('select count(*) from public.%I t where %s', p_entity, public.b44_where(p_entity, p_query)) into v;
  return v;
end $$;

-- updateMany(query, {$set: {...}}) — devolve quantos registros mudaram.
create or replace function public.b44_update_many(p_entity text, p_query jsonb, p_update jsonb)
returns bigint language plpgsql volatile set search_path = '' as $$
declare
  v_set jsonb := coalesce(p_update -> '$set', p_update);
  v_cols text[];
  v bigint;
begin
  perform public.b44_assert_entity(p_entity);
  if exists (select 1 from jsonb_object_keys(p_update) k where k like '$%' and k <> '$set') then
    raise exception 'updateMany: somente $set é suportado';
  end if;
  select array_agg(k) into v_cols from jsonb_object_keys(v_set) k
   where k not in ('id', 'created_date', 'updated_date', 'created_by', 'created_by_id')
     and public.b44_coltype(p_entity, k) is not null;
  if v_cols is null then return 0; end if;
  execute format('update public.%1$I t set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1)) where %3$s',
                 p_entity,
                 (select string_agg(format('%I', c), ', ') from unnest(v_cols) c),
                 public.b44_where(p_entity, p_query))
    using v_set;
  get diagnostics v = row_count;
  return v;
end $$;

create or replace function public.b44_delete_many(p_entity text, p_query jsonb)
returns bigint language plpgsql volatile set search_path = '' as $$
declare v bigint;
begin
  perform public.b44_assert_entity(p_entity);
  if p_query is null or p_query = '{}'::jsonb then
    raise exception 'deleteMany sem filtro não é permitido';
  end if;
  execute format('delete from public.%I t where %s', p_entity, public.b44_where(p_entity, p_query));
  get diagnostics v = row_count;
  return v;
end $$;

revoke execute on function public.b44_find(text, jsonb, text, integer, integer, text[]) from anon;
revoke execute on function public.b44_count(text, jsonb) from anon;
revoke execute on function public.b44_update_many(text, jsonb, jsonb) from anon;
revoke execute on function public.b44_delete_many(text, jsonb) from anon;

-- ---------------------------------------------------------------------------
-- 4. Arquivos: um bucket público (UploadPublicFile/UploadFile) e um privado
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('public-files', 'public-files', true),
  ('private-files', 'private-files', false)
on conflict (id) do nothing;

create policy b44_public_upload on storage.objects for insert to authenticated
  with check (bucket_id in ('public-files', 'private-files') and public.b44_is_active_user());
create policy b44_private_read on storage.objects for select to authenticated
  using (bucket_id = 'private-files' and public.b44_is_active_user());

-- ---------------------------------------------------------------------------
-- 5. Tempo real: telas que usam subscribe()
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public."ServiceOrder";
