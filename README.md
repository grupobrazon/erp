# ERP Brazon

ERP da Brazon (React + Vite), migrado da Base44. Banco no Supabase (São Paulo); site e funções
na VPS da Hostinger (Docker). Publicação: [docs/DEPLOY-VPS.md](docs/DEPLOY-VPS.md).

## Rodar localmente

1. `npm install`
2. Copie `.env.example` para `.env.local` (já traz a URL e a chave publicável do Supabase).
3. `npm run dev`

## Como está organizado

- `src/api/base44Client.js` — cliente com a mesma interface do SDK da Base44 (`base44.entities.X`,
  `base44.auth`, `base44.functions.invoke`, `base44.integrations.Core`), agora sobre o Supabase.
  As telas continuam chamando `base44.*` sem mudança.
- `src/api/b44compat.js` — a tradução para o Supabase (consultas, tipos, uploads, Edge Functions).
- `src/api/entityColumns.js` — gerado de `base44/entities` por `tools/gen_entity_columns.py`.
- `supabase/migrations/` — esquema do banco. A migração das entidades é gerada por
  `tools/gen_schema.py` a partir de `base44/entities/*.jsonc`.
- `server/` — servidor Deno das funções de backend (`/functions/<nome>`); `server/b44.ts` traz o
  equivalente ao `createClientFromRequest` da Base44.
- `base44/functions/` — funções originais, migradas uma a uma para `server/functions/`.
- `docker-compose.yml` e `deploy/` — contêineres do site (nginx) e das funções (Deno) para o Easypanel.

## Banco (projeto `erp-brazon`, São Paulo)

- Uma tabela por entidade, com os campos automáticos da Base44 (`id` de 24 caracteres,
  `created_date`, `updated_date`, `created_by`, `created_by_id`).
- Filtros no formato da Base44 (`$in`, `$or`, `$regex`...) pela função `b44_find`.
- Regras de acesso por perfil em todas as tabelas; novo login sem convite fica bloqueado
  até um admin liberar.

## Testes

`npm test` — camada de compatibilidade com um Supabase simulado.
