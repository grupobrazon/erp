// Endereço público do app, usado nos links enviados ao cliente
// (link de adesão VIP, que precisa funcionar fora do sistema/app).
export const PUBLIC_APP_URL = "https://sistemabrazon.com.br";

export const buildPublicLink = (path) => `${PUBLIC_APP_URL}${path.startsWith("/") ? path : `/${path}`}`;