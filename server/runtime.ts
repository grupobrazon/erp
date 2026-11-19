// Substitui o módulo "base44:runtime" da Base44: os segredos vêm das variáveis do servidor
// (preenchidas no painel da Hostinger, arquivo /docker/erp/.env).
export const secrets = {
  get(name: string): string | undefined {
    return Deno.env.get(String(name)) ?? undefined;
  },
};
