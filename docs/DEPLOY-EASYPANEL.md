# Publicar o ERP na VPS (Hostinger + Easypanel)

O banco fica no Supabase (projeto `erp-brazon`, São Paulo). Na VPS rodam dois contêineres,
definidos em `docker-compose.yml`:

| Serviço | O que faz | Porta interna |
| --- | --- | --- |
| `web` | Site React compilado, servido pelo nginx. Encaminha `/functions/*` para `functions` | 80 |
| `functions` | Servidor Deno com as funções de backend (antigas funções da Base44) | 8000 |

## Configuração única no Easypanel

1. **Criar o serviço:** no Easypanel, crie um projeto `erp` e, dentro dele, um serviço do tipo **Compose**.
2. **Origem (Source):** Git, repositório `git@github.com:grupobrazon/erp.git`, branch `main`,
   Build Path `/`, Docker Compose File `docker-compose.yml`.
   Como o repositório é privado, copie a chave SSH do serviço e cadastre no GitHub em
   grupobrazon/erp > Settings > Deploy keys (somente leitura).
3. **Variáveis (Environment):** cole o conteúdo de `.env.example`, preencha os segredos
   e ligue **Create .env file**. A `SUPABASE_SERVICE_ROLE_KEY` está no painel do Supabase
   em Project Settings > API Keys. Nunca coloque segredos no repositório.
4. **Domínio:** em Domains, aponte o domínio para o serviço `web`, porta `80`, HTTPS ligado.
   Comece por um endereço de teste (por exemplo `novo.sistemabrazon.com.br`); o domínio
   principal só muda na virada.
5. **Publicar:** clique em Deploy. O Easypanel roda `docker compose up --build -d`.
6. **Deploy automático (opcional):** copie a URL de Deployment Trigger do serviço e cadastre
   como webhook de push em grupobrazon/erp > Settings > Webhooks.

## Supabase: liberar o domínio no login

Em Authentication > URL Configuration, coloque o domínio do site em **Site URL** e adicione
`https://<domínio>/**` em **Redirect URLs**. Sem isso, login com Google/Microsoft e os links
de e-mail voltam para o endereço errado.

## Como conferir

- `https://<domínio>/healthz` responde `ok` (site no ar).
- `https://<domínio>/functions/_health` responde `{"ok":true,...}` (funções no ar).
- Uma função ainda não migrada responde 501 com a mensagem "ainda não foi migrada".
