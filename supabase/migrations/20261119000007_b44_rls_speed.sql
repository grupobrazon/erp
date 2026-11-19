-- Velocidade das regras de acesso (RLS).
-- As regras chamavam b44_is_active_user(), b44_has_any_role(...), b44_is_admin() e auth.uid()
-- uma vez por linha. Com "(select ...)" o Postgres calcula uma vez por consulta.
-- O resultado das regras não muda: só a forma de calcular.
do $$
declare
  p record;
  v_using text;
  v_check text;
  v_sql text;
  function_re constant text := '(public\.)?(b44_is_active_user|b44_is_admin)\(\)';
  roles_re constant text := '(public\.)?b44_has_any_role\(([^()]*)\)';
  uid_re constant text := 'auth\.uid\(\)';
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
      and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(b44_is_active_user|b44_is_admin|b44_has_any_role|auth\.uid)\('
  loop
    v_using := p.qual;
    v_check := p.with_check;
    if v_using is not null and v_using !~* '\(\s*select ' then
      v_using := regexp_replace(v_using, function_re, '(select public.\2())', 'g');
      v_using := regexp_replace(v_using, roles_re, '(select public.b44_has_any_role(\2))', 'g');
      v_using := regexp_replace(v_using, uid_re, '(select auth.uid())', 'g');
    end if;
    if v_check is not null and v_check !~* '\(\s*select ' then
      v_check := regexp_replace(v_check, function_re, '(select public.\2())', 'g');
      v_check := regexp_replace(v_check, roles_re, '(select public.b44_has_any_role(\2))', 'g');
      v_check := regexp_replace(v_check, uid_re, '(select auth.uid())', 'g');
    end if;
    v_sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if v_using is not null then v_sql := v_sql || format(' using (%s)', v_using); end if;
    if v_check is not null then v_sql := v_sql || format(' with check (%s)', v_check); end if;
    execute v_sql;
  end loop;
end $$;
