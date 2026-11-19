// Cópia de base44/shared/melhorEnvioCart.ts gerada por tools/port_function.py.
// Helpers compartilhados para criação de carrinhos no Melhor Envio (envio forward e coleta reversa).
// Usados por: generateMelhorEnvioLabel e generateReverseShippingLabel.

export const sanitizeCep = (c: string): string =>
  String(c || '').replace(/\D/g, '');

// Valida CEP brasileiro: exatamente 8 dígitos numéricos.
export function isValidCep(c: string): boolean {
  return /^\d{8}$/.test(sanitizeCep(c));
}

export const sanitizeDoc = (c: string): string =>
  String(c || '').replace(/\D/g, '');

export function isValidCPF(doc: string): boolean {
  if (doc.length !== 11 || /^(\d)\1{10}$/.test(doc)) return false;
  let sum = 0, rest;
  for (let i = 1; i <= 9; i++) sum += parseInt(doc[i - 1]) * (11 - i);
  rest = (sum * 10) % 11; if (rest === 10) rest = 0;
  if (rest !== parseInt(doc[9])) return false;
  sum = 0;
  for (let i = 1; i <= 10; i++) sum += parseInt(doc[i - 1]) * (12 - i);
  rest = (sum * 10) % 11; if (rest === 10) rest = 0;
  return rest === parseInt(doc[10]);
}

export function isValidCNPJ(doc: string): boolean {
  if (doc.length !== 14 || /^(\d)\1{13}$/.test(doc)) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    let s = 0; for (let i = 0; i < len; i++) s += parseInt(doc[i]) * w[i];
    const r = s % 11; return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === parseInt(doc[12]) && calc(13) === parseInt(doc[13]);
}

export function formatDoc(d: string): string {
  return d.length === 11
    ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    : d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

// Valida o documento do cliente (CPF ou CNPJ) antes de enviar ao Melhor Envio.
// Retorna { ok, doc } quando válido, ou { ok: false, error } com mensagem pronta para o usuário.
export function validateClientDocument(client: any, sale: any): { ok: boolean; error?: string; doc?: string } {
  const doc = sanitizeDoc(client?.document);
  const label = client?.name || sale?.client_name || 'cliente';
  if (!doc) {
    return { ok: false, error: `O cliente "${label}" não possui CPF/CNPJ cadastrado. Acesse o cadastro do cliente, informe o documento e tente novamente.` };
  }
  if (doc.length === 11 && !isValidCPF(doc)) {
    return { ok: false, error: `O CPF do cliente "${label}" (${formatDoc(doc)}) é inválido (dígito verificador não confere). Acesse o cadastro do cliente, corrija o CPF e tente novamente.` };
  }
  if (doc.length === 14 && !isValidCNPJ(doc)) {
    return { ok: false, error: `O CNPJ do cliente "${label}" (${formatDoc(doc)}) é inválido (dígito verificador não confere). Acesse o cadastro do cliente, corrija o CNPJ e tente novamente.` };
  }
  if (doc.length !== 11 && doc.length !== 14) {
    return { ok: false, error: `O documento do cliente "${label}" tem ${doc.length} dígitos — não é um CPF (11) nem CNPJ (14) válido. Acesse o cadastro do cliente, corrija o documento e tente novamente.` };
  }
  return { ok: true, doc };
}

export function meErrorDetail(d: any): string {
  if (!d) return '';
  if (typeof d === 'string') return d;
  const parts: string[] = [];
  if (d.message) parts.push(d.message);
  if (d.error && typeof d.error === 'string') parts.push(d.error);
  if (d.errors && typeof d.errors === 'object') {
    for (const [k, v] of Object.entries(d.errors)) {
      const val = Array.isArray(v) ? v.join(', ') : String(v);
      parts.push(`${k}: ${val}`);
    }
  }
  return parts.join(' | ');
}

// Resolve a cotação selecionada do histórico da venda (mesma lógica para envio forward e reverso).
export function resolveSelectedQuote(sale: any) {
  const allQuotes = sale.shipping_quote_history || [];
  const selectedQuotes = allQuotes.filter(q => q.selected);
  let selectedQuote = selectedQuotes.find(q =>
    q.service_name === sale.selected_service && q.company_name === sale.selected_carrier
  );
  if (!selectedQuote && selectedQuotes.length > 0) selectedQuote = selectedQuotes[selectedQuotes.length - 1];
  if (!selectedQuote && sale.selected_service && sale.selected_carrier) {
    const matches = allQuotes.filter(q =>
      q.service_name === sale.selected_service && q.company_name === sale.selected_carrier
    );
    if (matches.length > 0) selectedQuote = matches[matches.length - 1];
  }
  return selectedQuote;
}

export function resolveMeBaseUrl(environment?: string): { useSandbox: boolean; baseUrl: string } {
  const useSandbox = (environment || 'production') !== 'production';
  return { useSandbox, baseUrl: useSandbox ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br' };
}

export function meHeaders(token: string, userAgent: string) {
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'User-Agent': userAgent,
  };
}