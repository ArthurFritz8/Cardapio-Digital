# ADR 0002 — Sessão de mesa, triagem por geolocalização e confirmação manual

**Data:** 2026-08-30
**Status:** Aceito

## Objetivo

Mitigar pedidos fantasma (foto do QR Code usada remotamente) sem fricção para o cliente legítimo e sem trabalho extra para o bar, mantendo custo zero.

## Contexto

QR Code impresso é estático: qualquer foto o reproduz para sempre. **Não existe solução gratuita que bloqueie 100% um atacante determinado.** A estratégia adotada é defesa em camadas contra o caso casual (a esmagadora maioria):

1. **Sessão de mesa** (token rotativo, TTL 2h) — limita a janela de replay.
2. **Triagem por geolocalização** — heurística: fora do raio ou sem localização → pedido flagrado para confirmação do garçom (1 toque).
3. **Rate limit por mesa** — máx. 5 pedidos ativos simultâneos (anti-flood real, server-side).
4. **Confirmação manual** — a defesa definitiva é humana: o garçom está fisicamente lá.

## Solução

### Migration 0002
- `establishments`: `latitude`/`longitude` (nullable = triagem desligada) + `order_radius_meters` (default 150, range 30–1000).
- `tables`: `session_token uuid` + `session_expires_at`.
- `orders`: `needs_confirmation boolean` + `confirmed_at timestamptz`.
- `start_table_session(table_id, hours)`: get-or-create atômico do token (UPDATE único — sem corrida entre dois scans simultâneos). Duração vem por parâmetro do TS (`TABLE_SESSION_HOURS`) — single source of truth.
- `create_order(...)`: criação **atômica** de pedido + itens com validação completa (sessão válida, estabelecimento aberto, itens disponíveis **e do mesmo estabelecimento**, rate limit com `SELECT ... FOR UPDATE` anti-TOCTOU) e preços resolvidos do banco. Exceções nomeadas (`SESSION_EXPIRED`, `TABLE_ORDER_LIMIT`, ...) mapeadas para `AppError` em `lib/errors.ts`.
- **`REVOKE EXECUTE` de `anon`/`authenticated`/`public`** nas duas funções: PostgREST expõe funções do schema `public` por padrão — sem revoke, o RPC pularia a API Route.

### Código
- `lib/geo.ts`: Haversine + `shouldRequireManualConfirmation` com compensação de `accuracy` do GPS **com cap de 100m** (sem cap, accuracy spoofada auto-aprovaria).
- `lib/constants.ts`: constantes de domínio (TTL, rate limit, timeout geo).
- `POST /api/tables/[tableId]/session` e `POST /api/orders` (service_role + Zod).
- `hooks/useGeolocation.ts`: timeout 5s com guarda própria (browsers ignoram `options.timeout`), fallback gracioso — recusa nunca bloqueia o pedido.
- `lib/table-session.ts`: reuso da sessão via localStorage (UX); validade real sempre checada no servidor.
- Vitest + 13 testes (`geo`, `money`).

## Vetos aplicados às sugestões externas

1. **`ALTER TYPE order_status ADD VALUE 'pending_manual_confirm'` — VETADO.** (a) Mistura *verificação* (ortogonal) com *fulfillment* na máquina de estados; (b) todo consumidor precisaria tratar um 6º estado; (c) footgun: `ALTER TYPE ADD VALUE` não pode ser usado na mesma transação — o SQL Editor do Supabase envolve a migration em transação e ela quebraria. **Correção:** flag `needs_confirmation` + `confirmed_at`; trigger de transição intocada.
2. **TTL em env var — VETADO.** Constante de domínio, não configuração de ambiente → `lib/constants.ts`.
3. **Premissa "Haversine server-side resolve spoofing" — CORRIGIDA.** As coordenadas vêm do cliente; server-side evita apenas adulteração do *resultado*, não da *entrada*. Documentado como triagem heurística; a segurança real é confirmação manual + rate limit.

## Prevenção

- Testes cobrem raio, compensação de accuracy e o cap anti-spoof.
- Bug de regressão em `parseCents` (`"19.90"` → 199000) detectado pelos novos testes e corrigido; teste de regressão adicionado.
- Rate limit dentro da função com lock de linha — imune a requisições concorrentes.
- `REVOKE` garante que toda criação de pedido passa por Zod na API Route.

## Pendências conhecidas

- Rate limit por IP na API Route (Vercel free não tem WAF) — avaliar quando houver tráfego real.
- Painel do dono precisa do botão "confirmar mesa" (`confirmed_at = now()`), coberto pela RLS `orders_owner_update` existente.
- `npm audit` acusa vulnerabilidades em devDependencies (eslint 8/vitest 2 transit: dev-only, sem impacto em produção) — revisar ao subir para Next 15/ESLint 9.
