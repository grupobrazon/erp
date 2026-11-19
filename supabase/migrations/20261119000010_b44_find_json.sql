-- b44_find devolve json (texto) em vez de jsonb: montar listas grandes em jsonb usa muita
-- memória e CPU (5 a 10x mais lento no banco Micro). O conteúdo devolvido é o mesmo.
drop function if exists public.b44_find(text, jsonb, text, integer, integer, text[]);

create function public.b44_find(
  p_entity text,
  p_query jsonb default '{}'::jsonb,
  p_sort text default null,
  p_limit integer default null,
  p_skip integer default 0,
  p_fields text[] default null
) returns json language plpgsql stable set search_path = '' as $$
declare
  v_sql text;
  v_out json;
  v_row text := 't';
begin
  perform public.b44_assert_entity(p_entity);
  if p_fields is not null and array_length(p_fields, 1) > 0 then
    v_row := format('(select json_object_agg(k, v) from json_each(to_json(t.*)) as x(k, v) where k = any(%L::text[]))',
                    array_append(p_fields, 'id'));
  end if;
  v_sql := format('select coalesce(json_agg(%s), ''[]''::json) from (select * from public.%I t where %s%s limit %s offset %s) t',
                  v_row, p_entity, public.b44_where(p_entity, p_query), public.b44_order(p_entity, p_sort),
                  least(greatest(coalesce(p_limit, 5000), 0), 5000), greatest(coalesce(p_skip, 0), 0));
  execute v_sql into v_out;
  return v_out;
end $$;

revoke execute on function public.b44_find(text, jsonb, text, integer, integer, text[]) from public, anon;
grant execute on function public.b44_find(text, jsonb, text, integer, integer, text[]) to authenticated, service_role;
