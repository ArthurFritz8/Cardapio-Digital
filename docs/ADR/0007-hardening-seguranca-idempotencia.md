# ADR 0007 — Hardening de segurança, idempotência e upgrade de dependências

- **Status**: Aceito
- **Data**: 2026-09-10
- **Relacionados**: ADR 0001 (schema/RLS), ADR 0002 (RPCs create_order/start_table_session), ADR 0006 (smoke test)

## Objetivo

Fechar lacunas encontradas na revisão pré-deploy do schema e das API
routes: RLS protege linhas mas não colunas, o pedido não tinha proteção
de imutabilidade pós-criação, retry de rede podia duplicar pedidos, e
não havia rate limit contra abuso das rotas públicas.

## Contexto

Antes do primeiro deploy real (ADR 0006), uma segunda revisão de
segurança encontrou 4 gaps que RLS por linha não cobre e que só
aparecem sob concorrência ou acesso direto ao banco. Não havia smoke test
hospedado registrado; esta revisão não comprova essa integração:

1. Policies de RLS por **linha** não impedem que uma coluna sensível
   (ex.: `tables.session_token`) vaze para `anon` num `select *`.
2. Nada impedia um `UPDATE` direto (via RLS do dono) de reescrever
   `orders.total_cents` ou o snapshot de `order_items` depois de criado.
3. Cliente com rede ruim que reenvia `POST /api/orders` (timeout sem
   resposta) podia criar 2 pedidos idênticos.
4. Rotas públicas (`/api/orders`, `/api/tables/[id]/session`) não tinham
   limite de taxa — abuso trivial de um único IP.

## Solução

### Migration 0004 (`supabase/migrations/0004_audit_hardening.sql`)

- **Privilégios por coluna via GRANT/REVOKE, combinados com RLS**: `revoke all` seguido de `grant
  select`/`insert`/`update` explícito por coluna. `tables` expõe a
  `anon`/`authenticated` só `id, establishment_id, label, is_active,
  created_at`. Ler `session_token`/`session_expires_at` é proibido;
  `select *` é rejeitado, exigindo projeção explícita dos campos públicos.
- **FKs compostas** `(id, establishment_id)` em `categories`/`tables`,
  refletidas nas FKs de `menu_items.category_id` e `orders.table_id`:
  impossível referenciar categoria/mesa de **outro** estabelecimento
  mesmo com um payload malicioso.
- **Imutabilidade pós-criação**: triggers
  `protect_order_fields`/`protect_order_item_snapshot` bloqueiam UPDATE
  em qualquer campo do pedido/itens exceto `status`/`confirmed_at`/`note`
  do pedido — e `confirmed_at` só pode ser setado uma vez, dentro da
  transição válida (`pending` + `needs_confirmation`).
- **Idempotência**: `create_order` ganha `p_request_id` opcional; com
  `unique (table_id, request_id)`, reenvio do mesmo `request_id` retorna
  o pedido já criado (verificando fingerprint dos itens) em vez de
  duplicar. Cliente gera um uuid por tentativa de envio
  ([order-attempt.ts](../../src/lib/order-attempt.ts)).
- **Rate limit por IP**: tabela `ip_requests` (chave = HMAC-SHA256 do
  IP, nunca IP cru) + RPC atômica `consume_ip_rate_limit` (janela fixa
  iniciada na primeira requisição, via `ON CONFLICT DO UPDATE`). Sem cron: linhas
  expiradas são varridas de forma incremental a cada chamada.

### Código

- [src/lib/request-ip.ts](../../src/lib/request-ip.ts): só confia em
  `x-vercel-forwarded-for` (reescrito pela borda da Vercel); qualquer
  outro cenário (localhost, header ausente) cai num balde compartilhado
  — nunca um bypass do limite.
- [src/lib/rate-limit.ts](../../src/lib/rate-limit.ts): aplica o limite
  chamando a RPC antes de processar a rota.
- [src/lib/http.ts](../../src/lib/http.ts): `readOrderBody` limita bytes
  **realmente recebidos** (streaming com corte), não confia em
  `Content-Length`; headers `Cache-Control: no-store`,
  `Referrer-Policy`, `X-Content-Type-Options` em toda resposta de erro.
- [src/lib/auth-redirect.ts](../../src/lib/auth-redirect.ts):
  `safeAuthRedirect` also rejeita barra invertida e caracteres de
  controle no `next` (variações de open-redirect além de `//`).
- [src/hooks/useOrdersRealtime.ts](../../src/hooks/useOrdersRealtime.ts):
  reescrito com paginação (`OWNER_ORDERS_PAGE_SIZE`), `AbortController`
  com timeout, e guard de `generation`/`revision` — refetch concorrente
  (polling + evento Realtime disparando ao mesmo tempo) não aplica
  resposta desatualizada por cima de uma mais recente.
- Ícones PWA reais (192/512/maskable/apple-touch) via
  `scripts/generate-pwa-icons.mjs`, substituindo o SVG placeholder.
- `scripts/scan-secrets.mjs`: scanner de segredos versionado (antes era
  só um `grep` ad-hoc no terminal a cada commit).

### Upgrades

Next 14.2 → 15.5, Vitest 2 → 4 (74 testes migrados sem quebra de
asserção).

## Prevenção

1. RLS por linha **não é suficiente** quando uma tabela mistura colunas
   públicas e privadas — revisar GRANT por coluna sempre que uma tabela
   pública ganhar um campo sensível.
2. Toda tabela de histórico/pedido precisa de trigger de imutabilidade
   explícito; RLS de `UPDATE` sozinha não impede reescrever o passado.
3. Idempotência de escrita pública é obrigatória sempre que o cliente
   pode reenviar por timeout — sem isso, todo endpoint de criação vira
   fonte potencial de duplicata.
4. A decisão do projeto é não persistir IP cru: usar HMAC com segredo do
   servidor reduz exposição. É pseudonimização, não uma garantia jurídica
   de anonimização. Linhas expiradas são removidas em chamadas subsequentes.
5. **Bug de validação encontrado nesta própria tarefa**: `tsconfig.json`
   sem `target` cai em ES3 por padrão do TypeScript; um spread de
   `Map.values()` só falha silenciosamente até alguém rodar
   `tsc --noEmit` — `target` explícito deveria estar lá desde o início.
   Corrigido para `ES2017` (mesmo valor que o `next build` sugere) e o
   spread trocado por `Array.from` como defesa adicional.
6. Antes de comitar uma leva grande de mudanças (geradas fora de uma
   sessão supervisionada), rodar `test && typecheck && lint && build`
   **sempre** — foi assim que os 2 problemas acima foram pegos antes do
   push.

## Pendências

- Rodar o smoke test (ADR 0006) contra o schema 0001–0004 completo.
- `supabase/tests/audit-regression.sql` ainda não foi executado num
  projeto real (só revisado estaticamente).

### Validação complementar da auditoria (ADR 0006)

Em 10/09/2026 a suíte SQL passou em PostgreSQL 16 descartável com roles
e schemas auxiliares simulando os contratos do Supabase. Também passaram
testes concorrentes de sessão, limite por mesa, idempotência e quota IP,
além da execução/reexecução do seed. Isso substitui a indicação de
“só revisado estaticamente” para o teste local; Supabase hospedado continua
pendente. O relatório completo está em [AUDIT_REPORT.md](../AUDIT_REPORT.md).
