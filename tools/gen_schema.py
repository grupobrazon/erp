#!/usr/bin/env python3
"""Gera a migração das entidades a partir de base44/entities/*.jsonc.

Uso: python3 -I gen_schema.py <pasta_entities> <arquivo_saida.sql>

A migração contém uma função (public.b44_create_entity) e a especificação
compacta das 65 entidades em JSON; o banco cria tabelas, índices e regras de
acesso a partir dela. Decisões:
- tabela = nome da entidade, colunas = nomes das propriedades;
- id em texto (24 hex, como a Base44) para preservar os vínculos importados;
- string (inclusive date/date-time) -> text, number -> numeric,
  boolean -> boolean, array/object -> jsonb; sem NOT NULL nem CHECK de enum,
  para a importação aceitar os dados exatamente como estão na Base44;
- RLS em todas as tabelas: as entidades com regra própria seguem os perfis
  declarados; as demais exigem um usuário ativo do ERP.
"""
import json
import re
import sys
from pathlib import Path

TYPES = {"string": "t", "number": "n", "integer": "n", "boolean": "b", "array": "j", "object": "j"}

FUNCTION = r"""
-- Cria uma tabela da Base44 a partir da especificação compacta:
-- {"n": nome, "c": [[coluna, tipo(t|n|b|j), default?], ...], "r": {op: [perfis]} | null}
create or replace function public.b44_create_entity(spec jsonb)
returns void language plpgsql set search_path = '' as $fn$
declare
  v_name text := spec ->> 'n';
  v_cols text[] := array[
    'id text primary key default public.b44_new_id()',
    'created_date timestamptz not null default now()',
    'updated_date timestamptz not null default now()',
    'created_by text default public.b44_current_email()',
    'created_by_id text default public.b44_current_user_id()'];
  c jsonb;
  v_col text;
  v_type text;
  v_def text;
  v_op text;
  v_cmd text;
  v_cond text;
  v_roles jsonb;
begin
  if v_name = 'User' then
    v_cols := v_cols || array[
      'auth_id uuid unique references auth.users(id) on delete set null',
      'email text unique', 'full_name text', 'disabled boolean not null default false'];
  end if;
  for c in select * from jsonb_array_elements(spec -> 'c') loop
    v_col := c ->> 0;
    v_type := case c ->> 1 when 't' then 'text' when 'n' then 'numeric'
                           when 'b' then 'boolean' else 'jsonb' end;
    v_def := '';
    if jsonb_array_length(c) > 2 and c -> 2 <> 'null'::jsonb then
      if v_type = 'jsonb' then
        v_def := format(' default %L::jsonb', (c -> 2)::text);
      elsif v_type = 'numeric' and jsonb_typeof(c -> 2) = 'number' then
        v_def := format(' default %s', c ->> 2);
      elsif v_type = 'boolean' and jsonb_typeof(c -> 2) = 'boolean' then
        v_def := format(' default %s', c ->> 2);
      elsif v_type = 'text' then
        v_def := format(' default %L', c ->> 2);
      end if;
    end if;
    v_cols := v_cols || format('%I %s%s', v_col, v_type, v_def);
  end loop;

  execute format('create table public.%I (%s)', v_name, array_to_string(v_cols, ', '));
  execute format('create trigger b44_touch before update on public.%I for each row execute function public.b44_touch_updated()', v_name);
  execute format('create index on public.%I (created_date desc)', v_name);
  for c in select * from jsonb_array_elements(spec -> 'c') loop
    if c ->> 0 like '%\_id' and c ->> 1 = 't' then
      execute format('create index on public.%I (%I)', v_name, c ->> 0);
    end if;
  end loop;
  execute format('alter table public.%I enable row level security', v_name);
  insert into public.b44_entities(name) values (v_name);

  if v_name = 'User' then
    return;  -- regras próprias na migração seguinte
  end if;
  foreach v_op in array array['create', 'read', 'update', 'delete'] loop
    v_roles := spec -> 'r' -> v_op;
    if v_roles is not null and jsonb_array_length(v_roles) > 0 then
      v_cond := format('public.b44_has_any_role(%L::text[])',
                       (select array_agg(x) from jsonb_array_elements_text(v_roles) x));
    else
      v_cond := 'public.b44_is_active_user()';
    end if;
    v_cmd := case v_op when 'create' then 'insert' when 'read' then 'select' else v_op end;
    if v_cmd = 'insert' then
      execute format('create policy b44_%s on public.%I for insert to authenticated with check (%s)', v_op, v_name, v_cond);
    elsif v_cmd = 'update' then
      execute format('create policy b44_%s on public.%I for update to authenticated using (%s) with check (%s)', v_op, v_name, v_cond, v_cond);
    else
      execute format('create policy b44_%s on public.%I for %s to authenticated using (%s)', v_op, v_name, v_cmd, v_cond);
    end if;
  end loop;
end $fn$;
"""


def load(path):
    text = path.read_text(encoding="utf-8")
    text = re.sub(r"^\s*//.*$", "", text, flags=re.M)
    return json.loads(text)


def roles_of(rule):
    if rule is None:
        return None
    if "user_condition" in rule:
        return [rule["user_condition"]["role"]]
    if "$or" in rule:
        out = []
        for item in rule["$or"]:
            out += roles_of(item)
        return out
    raise ValueError(f"regra não suportada: {rule}")


def compact(ent):
    cols = []
    for key, prop in ent["properties"].items():
        col = [key, TYPES.get(prop.get("type"), "j")]
        if prop.get("default") is not None:
            col.append(prop["default"])
        cols.append(col)
    rls = ent.get("rls")
    roles = {op: roles_of(rls.get(op)) for op in ("create", "read", "update", "delete")} if rls else None
    return {"n": ent["name"], "c": cols, "r": roles}


def main():
    src, dest = Path(sys.argv[1]), Path(sys.argv[2])
    ents = [load(p) for p in sorted(src.glob("*.jsonc"))]
    ents.sort(key=lambda e: (e["name"] != "User", e["name"]))
    spec = json.dumps([compact(e) for e in ents], ensure_ascii=False, separators=(",", ":"))
    assert "$spec$" not in spec
    sql = ("-- Gerado por tools/gen_schema.py a partir de base44/entities. Não editar à mão.\n"
           + FUNCTION
           + "\nselect public.b44_create_entity(e)\n  from jsonb_array_elements($spec$"
           + spec + "$spec$::jsonb) e;\n")
    dest.write_text(sql, encoding="utf-8")
    print(f"{len(ents)} entidades -> {dest} ({len(sql.encode())} bytes)")


if __name__ == "__main__":
    main()
