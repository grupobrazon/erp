-- updateMany com os operadores que o ERP usa além de $set:
--   $unset  -> limpa o campo (CRM de manutenção, estorno de distribuição)
--   $push   -> acrescenta item numa lista (histórico de contatos/produtos); aceita {$each: [...]}
--   $inc    -> soma num campo numérico
create or replace function public.b44_update_many(p_entity text, p_query jsonb, p_update jsonb)
returns bigint language plpgsql volatile set search_path = '' as $$
declare
  v_has_ops boolean := exists (select 1 from jsonb_object_keys(p_update) k where k like '$%');
  v_set jsonb := case when v_has_ops then coalesce(p_update -> '$set', '{}'::jsonb) else p_update end;
  v_unset jsonb := coalesce(p_update -> '$unset', '{}'::jsonb);
  v_push jsonb := coalesce(p_update -> '$push', '{}'::jsonb);
  v_inc jsonb := coalesce(p_update -> '$inc', '{}'::jsonb);
  v_parts text[] := array[]::text[];
  v_type text;
  k text;
  v bigint;
begin
  perform public.b44_assert_entity(p_entity);
  if v_has_ops and exists (select 1 from jsonb_object_keys(p_update) x where x not in ('$set', '$unset', '$push', '$inc')) then
    raise exception 'updateMany: operador não suportado (use $set, $unset, $push ou $inc)';
  end if;

  for k in select jsonb_object_keys(v_set) loop
    if k in ('id', 'created_date', 'updated_date', 'created_by', 'created_by_id') then continue; end if;
    if public.b44_coltype(p_entity, k) is null then continue; end if;
    v_parts := v_parts || format('%1$I = (select r.%1$I from jsonb_populate_record(null::public.%2$I, $1) r)', k, p_entity);
  end loop;

  for k in select jsonb_object_keys(v_unset) loop
    if k in ('id', 'created_date', 'updated_date', 'created_by', 'created_by_id') then continue; end if;
    if public.b44_coltype(p_entity, k) is null then continue; end if;
    v_parts := v_parts || format('%I = null', k);
  end loop;

  for k in select jsonb_object_keys(v_push) loop
    v_type := public.b44_coltype(p_entity, k);
    if v_type is null then continue; end if;
    if v_type <> 'jsonb' then raise exception 'updateMany: $push só vale para campos de lista (%)', k; end if;
    v_parts := v_parts || format(
      '%1$I = coalesce(t.%1$I, ''[]''::jsonb) || (case when jsonb_typeof($2 -> %2$L) = ''object'' and ($2 -> %2$L) ? ''$each'' then $2 -> %2$L -> ''$each'' else jsonb_build_array($2 -> %2$L) end)',
      k, k);
  end loop;

  for k in select jsonb_object_keys(v_inc) loop
    v_type := public.b44_coltype(p_entity, k);
    if v_type is null then continue; end if;
    v_parts := v_parts || format('%1$I = coalesce(t.%1$I, 0) + ($3 ->> %2$L)::numeric', k, k);
  end loop;

  if array_length(v_parts, 1) is null then return 0; end if;
  execute format('update public.%I t set %s where %s',
                 p_entity, array_to_string(v_parts, ', '), public.b44_where(p_entity, p_query))
    using v_set, v_push, v_inc;
  get diagnostics v = row_count;
  return v;
end $$;

revoke execute on function public.b44_update_many(text, jsonb, jsonb) from public, anon;
grant execute on function public.b44_update_many(text, jsonb, jsonb) to authenticated, service_role;
