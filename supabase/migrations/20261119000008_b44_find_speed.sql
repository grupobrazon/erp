-- b44_find mais rápido: primeiro filtra, ordena e corta (limit/offset);
-- só depois transforma em JSON as linhas que vão voltar.
-- Antes, todas as linhas da tabela viravam JSON antes do corte.
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
  v_sql := format('select coalesce(jsonb_agg(r), ''[]''::jsonb) from (select %s as r from (select * from public.%I t where %s%s limit %s offset %s) t) q',
                  v_row, p_entity, public.b44_where(p_entity, p_query), public.b44_order(p_entity, p_sort),
                  least(greatest(coalesce(p_limit, 5000), 0), 5000), greatest(coalesce(p_skip, 0), 0));
  execute v_sql into v_out;
  return v_out;
end $$;

grant execute on function public.b44_find(text, jsonb, text, integer, integer, text[]) to authenticated, service_role;

-- Ordenação: em colunas que nunca ficam vazias (created_date, updated_date, id…)
-- não precisa de "nulls last/first". Assim o índice (created_date desc) é usado
-- direto e o banco não ordena a tabela inteira a cada lista.
create or replace function public.b44_order(p_entity text, p_sort text)
returns text language plpgsql stable set search_path = '' as $$
declare
  s text;
  f text;
  v_notnull boolean;
  parts text[] := array[]::text[];
begin
  if p_sort is null or btrim(p_sort) = '' then
    return '';
  end if;
  foreach s in array string_to_array(p_sort, ',') loop
    s := btrim(s);
    f := ltrim(ltrim(s, '-'), '+');
    if public.b44_coltype(p_entity, f) is not null then
      select a.attnotnull into v_notnull
        from pg_catalog.pg_attribute a
       where a.attrelid = format('public.%I', p_entity)::regclass and a.attname = f and not a.attisdropped;
      parts := parts || format('t.%I %s', f,
                               case when s like '-%' then (case when v_notnull then 'desc' else 'desc nulls last' end)
                                    else (case when v_notnull then 'asc' else 'asc nulls first' end) end);
    end if;
  end loop;
  if array_length(parts, 1) is null then return ''; end if;
  return ' order by ' || array_to_string(parts, ', ');
end $$;
