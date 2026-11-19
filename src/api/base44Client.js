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

// Funções de backend: rodam no servidor da VPS, no mesmo domínio do site (/functions).
const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL || '/functions';
const functions = createFunctions({
  sb: supabase, url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, functionsUrl: FUNCTIONS_URL,
});

// ---- Login em popup -------------------------------------------------------
export const OAUTH_POPUP_PARAM = 'oauth_popup';
const OAUTH_CHANNEL = 'erp-oauth';

function openCenteredPopup() {
  const w = 480;
  const h = 640;
  const left = Math.max(0, (window.screenX || 0) + ((window.outerWidth || w) - w) / 2);
  const top = Math.max(0, (window.screenY || 0) + ((window.outerHeight || h) - h) / 2);
  try {
    return window.open('about:blank', 'erp-oauth', `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
  } catch {
    return null;
  }
}

// Espera o popup avisar (BroadcastChannel ou postMessage) ou o próprio Supabase
// avisar que a sessão foi criada. Termina com erro se o login for cancelado.
function waitForPopupLogin() {
  return new Promise((resolve, reject) => {
    let finished = false;
    let channel = null;
    let sub = null;
    const finish = (err) => {
      if (finished) return;
      finished = true;
      window.removeEventListener('message', onMessage);
      try { channel?.close(); } catch { /* nada */ }
      try { sub?.unsubscribe(); } catch { /* nada */ }
      if (err) reject(err); else resolve();
    };
    const handle = (msg) => {
      if (msg?.type === 'signed-in') finish();
      else if (msg?.type === 'error') finish(new B44Error(msg.message || 'Login com Google cancelado.', 401));
    };
    const onMessage = (e) => {
      if (e.origin === window.location.origin && e.data?.source === OAUTH_CHANNEL) handle(e.data);
    };
    window.addEventListener('message', onMessage);
    try {
      channel = new BroadcastChannel(OAUTH_CHANNEL);
      channel.onmessage = (e) => handle(e.data);
    } catch { /* navegador sem BroadcastChannel */ }
    ({ data: { subscription: sub } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) finish();
    }));
  });
}

// Dentro do popup, depois que o Google devolve para o ERP: o Supabase troca o
// código pela sessão; aqui só avisamos a janela principal e fechamos o popup.
export const isOAuthPopupReturn = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has(OAUTH_POPUP_PARAM);

if (isOAuthPopupReturn) {
  const params = new URLSearchParams(window.location.search);
  supabase.auth.getSession().then(({ data }) => {
    const message = data?.session
      ? { source: OAUTH_CHANNEL, type: 'signed-in' }
      : { source: OAUTH_CHANNEL, type: 'error', message: params.get('error_description') || 'Login não concluído.' };
    try { const ch = new BroadcastChannel(OAUTH_CHANNEL); ch.postMessage(message); ch.close(); } catch { /* nada */ }
    try { window.opener?.postMessage(message, window.location.origin); } catch { /* nada */ }
    setTimeout(() => window.close(), 150);
  });
}

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
    let { data, error } = await supabase.auth.signInWithPassword({ email, password });
    // Primeiro acesso de quem vem da Base44: confere a senha lá e traz para cá.
    if (error && error.message === 'Invalid login credentials') {
      const migrated = await functions.invoke('legacyLogin', { email, password }).catch(() => null);
      if (migrated?.data?.ok) {
        ({ data, error } = await supabase.auth.signInWithPassword({ email, password }));
      }
    }
    if (error) throw authError(error, 401);
    return { access_token: data.session?.access_token, user: data.user };
  },

  // Login com Google/Microsoft em janela popup. O ERP continua aberto atrás;
  // quando o login termina, o popup fecha e o ERP entra.
  // Se o navegador bloquear o popup, faz o caminho normal (página inteira).
  async loginWithProvider(provider, returnTo = '/') {
    const target = absolute(returnTo);
    const extra = provider === 'microsoft' ? { scopes: 'email' } : {};
    const popup = openCenteredPopup();
    if (!popup) {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: PROVIDERS[provider] || provider,
        options: { redirectTo: target, ...extra },
      });
      if (error) throw authError(error);
      return;
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: PROVIDERS[provider] || provider,
      options: { redirectTo: absolute(`/login?${OAUTH_POPUP_PARAM}=1`), skipBrowserRedirect: true, ...extra },
    });
    if (error || !data?.url) {
      popup.close();
      throw authError(error || { message: 'Não foi possível abrir o login.' });
    }
    popup.location.href = data.url;
    await waitForPopupLogin();
    window.location.href = target;
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
