-- Segredos das integrações (GHL, NF-e, Melhor Envio, Google Maps, Clint...) trazidos da Base44.
-- Só o servidor (service_role) lê e grava: nenhuma regra de acesso para usuários.
create table if not exists public.b44_app_secrets (
  name text primary key,
  value text not null,
  source text not null default 'base44',
  updated_at timestamptz not null default now()
);
alter table public.b44_app_secrets enable row level security;
revoke all on public.b44_app_secrets from anon, authenticated;
grant all on public.b44_app_secrets to service_role;

-- Senhas de uso único para importar segredos (guardamos só o hash SHA-256).
create table if not exists public.b44_import_tokens (
  sha256 text primary key,
  purpose text not null,
  expires_at timestamptz not null
);
alter table public.b44_import_tokens enable row level security;
revoke all on public.b44_import_tokens from anon, authenticated;
grant all on public.b44_import_tokens to service_role;
