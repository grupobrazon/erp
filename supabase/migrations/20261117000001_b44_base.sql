-- Base da compatibilidade com a Base44: utilitários usados por todas as tabelas.

create extension if not exists pgcrypto with schema extensions;

-- Registro das entidades migradas (lista branca para as funções genéricas).
create table public.b44_entities (
  name text primary key
);
alter table public.b44_entities enable row level security;
create policy b44_entities_read on public.b44_entities for select to authenticated using (true);

-- Identificador no mesmo formato da Base44: 24 caracteres hexadecimais.
create or replace function public.b44_new_id()
returns text language sql volatile set search_path = '' as $$
  select encode(extensions.gen_random_bytes(12), 'hex')
$$;

create or replace function public.b44_current_email()
returns text language sql stable set search_path = '' as $$
  select nullif(auth.jwt() ->> 'email', '')
$$;

create or replace function public.b44_touch_updated()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_date := now();
  new.id := old.id;
  new.created_date := old.created_date;
  return new;
end $$;

-- Funções de perfil. SECURITY DEFINER para ler "User" sem cair nas regras de acesso
-- da própria tabela (evita recursão). plpgsql porque "User" é criada depois.
create or replace function public.b44_current_user_id()
returns text language plpgsql stable security definer set search_path = '' as $$
declare v text;
begin
  if auth.uid() is null then return null; end if;
  select u.id into v from public."User" u where u.auth_id = auth.uid();
  return v;
end $$;

create or replace function public.b44_is_active_user()
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then return false; end if;
  return exists (select 1 from public."User" u
                 where u.auth_id = auth.uid() and not u.disabled and u.role is not null);
end $$;

-- Verdadeiro se o usuário logado tem algum dos perfis (perfil principal ou adicional).
create or replace function public.b44_has_any_role(roles text[])
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then return false; end if;
  return exists (
    select 1 from public."User" u
    where u.auth_id = auth.uid() and not u.disabled
      and (u.role = any(roles)
           or exists (select 1 from jsonb_array_elements_text(coalesce(u.additional_roles, '[]'::jsonb)) r
                      where r = any(roles)))
  );
end $$;

create or replace function public.b44_is_admin()
returns boolean language sql stable set search_path = '' as $$
  select public.b44_has_any_role(array['admin'])
$$;

revoke execute on function public.b44_current_user_id() from anon;
revoke execute on function public.b44_is_active_user() from anon;
revoke execute on function public.b44_has_any_role(text[]) from anon;
