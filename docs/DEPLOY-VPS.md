# Publicar o ERP na VPS (Hostinger)

VPS: srv2171077 (KVM 2, Campinas), Ubuntu 24.04 com Docker. O banco fica no Supabase
(projeto `erp-brazon`, São Paulo). Endereço de teste: https://erp.187-53-121-216.sslip.io

## Como está montado

O projeto `erp` do gerenciador Docker da Hostinger usa `deploy/vps-compose.yml`:

| Serviço | O que faz |
| --- | --- |
| `source` | Baixa grupobrazon/erp com a chave de implantação da VPS (somente leitura) |
| `web-build` | `npm ci` e `npm run build` do site |
| `functions` | Servidor Deno das funções (`/functions/<nome>`) |
| `web` | nginx com o site; encaminha `/functions/` para `functions` |

O HTTPS é feito pelo Caddy do projeto `cerebro` (Obsidian), que alcança o ERP pela rede
Docker `edge` no nome `erp-web:80`. O endereço vem da variável `ERP_HOST` do `cerebro`
(padrão `erp.187-53-121-216.sslip.io`). Os arquivos originais do `cerebro` estão em
`/docker/cerebro/*.antes-erp`.

A chave de implantação é gerada na própria VPS (volume `erp_deploy-key`) e está cadastrada em
GitHub > grupobrazon/erp > Settings > Deploy keys como "VPS Hostinger".

## Atualizar o site

1. Envie as mudanças para a branch `main` do GitHub.
2. No painel da Hostinger (VPS > Docker), atualize o projeto `erp`. Ele baixa a versão nova,
   recompila e reinicia.

## Segredos

No painel do projeto `erp`, em variáveis: `SUPABASE_SERVICE_ROLE_KEY`, `GHL_API_TOKEN`,
`ghl_location_id`, `GOOGLE_MAPS_API_KEY`, `FOCUSNFE_TOKEN`, `MELHOR_ENVIO_TOKEN`,
`MELHOR_ENVIO_USER_AGENT`. Nunca no repositório.

## Supabase: liberar o domínio no login

Em Authentication > URL Configuration: **Site URL** com o endereço do site e
`https://<endereço>/**` em **Redirect URLs**.

## Como conferir

- `/healthz` responde `ok` (site).
- `/functions/_health` responde `{"ok":true,...}` (funções).
