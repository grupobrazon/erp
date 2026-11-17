// Cliente usado por todo o front. Antes era o SDK da Base44; agora tem a mesma
// interface, mas fala com o Supabase (ver src/api/b44compat.js).
import { createClient } from '@supabase/supabase-js';
import {
  B44Error,
  createEntities,
  createFunctions,
  createIntegrations,
  toB44User,
} from './b44compat.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Falha cedo e com mensagem clara em vez de telas vazias.
  throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.local');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

const functions = createFunctions({ sb: supabase, url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });

// Nomes de provedor usados pelo app -> nomes do Supabase.
const PROVIDERS = { google: 'google', microsoft: 'azure', facebook: 'facebook', apple: 'apple' };

const PT_ERRORS = {
  'Invalid login credentials': 'E-mail ou senha inválidos',
  'Email not confirmed': 'Confirme seu e-mail antes de entrar',
  'User already registered': 'Este e-mail já está cadastrado',
  'Token has expired or is invalid': 'Código inválido ou expirado',
};
const authError = (error, status = 400) =>
  new B44Error(PT_ERRORS[error?.message] || error?.message || 'Falha na autenticação', error?.status || status, error);

function absolute(path) {
  try {
    return new URL(path || '/', window.location.origin).href;
  } catch {
    return window.location.origin + '/';
  }
}

function returnToPath(url) {
  try {
    const u = new URL(url || window.location.href, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search : '/';
  } catch {
    return '/';
  }
}

async function currentProfile() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new B44Error('Autenticação necessária', 401, { extra_data: { reason: 'auth_required' } });
  const { data, error } = await supabase.from('User').select('*').eq('auth_id', session.user.id).maybeSingle();
  if (error) throw new B44Error(error.message, 500, error);
  if (!data || data.disabled || !data.role) {
    throw new B44Error('Usuário não liberado para o ERP. Peça acesso a um administrador.', 403,
      { extra_data: { reason: 'user_not_registered' } });
  }
  return { row: data, authUser: session.user };
}

const auth = {
  async me() {
    const { row, authUser } = await currentProfile();
    return toB44User(row, authUser);
  },

  async isAuthenticated() {
    const { data: { session } } = await supabase.auth.getSession();
    return Boolean(session);
  },

  async updateMe(changes) {
    const { row, authUser } = await currentProfile();
    const user = await entities.User.update(row.id, changes);
    return toB44User(user, authUser);
  },

  async loginViaEmailPassword(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw authError(error, 401);
    return { access_token: data.session?.access_token, user: data.user };
  },

  async loginWithProvider(provider, returnTo = '/') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: PROVIDERS[provider] || provider,
      options: {
        redirectTo: absolute(returnTo),
        ...(provider === 'microsoft' ? { scopes: 'email' } : {}),
      },
    });
    if (error) throw authError(error);
  },

  // Cadastro: o Supabase envia um código por e-mail, confirmado em verifyOtp.
  async register({ email, password, full_name }) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: full_name ? { full_name } : undefined, emailRedirectTo: absolute('/') },
    });
    if (error) throw authError(error);
    return { success: true };
  },

  async verifyOtp({ email, otpCode }) {
    const { data, error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'signup' });
    if (error) throw authError(error);
    return { access_token: data.session?.access_token, user: data.user };
  },

  async resendOtp(email) {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw authError(error);
    return { success: true };
  },

  // O link do e-mail volta para /reset-password já com a sessão de recuperação.
  async resetPasswordRequest(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: absolute('/reset-password?token=recovery'),
    });
    if (error) throw authError(error);
    return { success: true };
  },

  async resetPassword({ newPassword }) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw authError(error);
    return { success: true };
  },

  // A sessão é guardada pelo Supabase; mantido para compatibilidade.
  setToken() {},

  async logout(redirectUrl) {
    await supabase.auth.signOut();
    if (redirectUrl) window.location.href = `/login?returnTo=${encodeURIComponent(returnToPath(redirectUrl))}`;
  },

  redirectToLogin(nextUrl) {
    window.location.href = `/login?returnTo=${encodeURIComponent(returnToPath(nextUrl))}`;
  },

  onChange(callback) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => callback(event, session));
    return () => data.subscription.unsubscribe();
  },
};

const entities = createEntities(supabase);

// Conector do Google Agenda dos técnicos: passa a ser uma Edge Function própria (fase 5).
const connectors = {
  async connectAppUser(connectorId) {
    const { data } = await functions.invoke('connectorConnect', { connector_id: connectorId });
    return data?.url || data;
  },
  async disconnectAppUser(connectorId) {
    const { data } = await functions.invoke('connectorDisconnect', { connector_id: connectorId });
    return data;
  },
};

export const base44 = {
  entities,
  auth,
  functions,
  integrations: createIntegrations({ sb: supabase, functions }),
  connectors,
};
