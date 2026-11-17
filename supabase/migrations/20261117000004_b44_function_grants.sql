-- Funções de perfil: só usuários logados (as regras de acesso precisam delas).
revoke execute on function public.b44_current_user_id() from public, anon;
revoke execute on function public.b44_is_active_user() from public, anon;
revoke execute on function public.b44_has_any_role(text[]) from public, anon;
revoke execute on function public.b44_is_admin() from public, anon;
grant execute on function public.b44_current_user_id() to authenticated, service_role;
grant execute on function public.b44_is_active_user() to authenticated, service_role;
grant execute on function public.b44_has_any_role(text[]) to authenticated, service_role;
grant execute on function public.b44_is_admin() to authenticated, service_role;
-- Gatilho de cadastro: ninguém chama diretamente.
revoke execute on function public.b44_on_auth_user() from public, anon, authenticated;
-- Consultas: só logados e o servidor.
revoke execute on function public.b44_find(text, jsonb, text, integer, integer, text[]) from public, anon;
revoke execute on function public.b44_count(text, jsonb) from public, anon;
revoke execute on function public.b44_update_many(text, jsonb, jsonb) from public, anon;
revoke execute on function public.b44_delete_many(text, jsonb) from public, anon;
grant execute on function public.b44_find(text, jsonb, text, integer, integer, text[]) to authenticated, service_role;
grant execute on function public.b44_count(text, jsonb) to authenticated, service_role;
grant execute on function public.b44_update_many(text, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.b44_delete_many(text, jsonb) to authenticated, service_role;
