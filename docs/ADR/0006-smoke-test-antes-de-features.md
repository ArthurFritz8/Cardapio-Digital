# ADR 0006 — Smoke test antes de novas features

- **Status**: Aceito
- **Data**: 2026-08-31
- **Relacionados**: todos os anteriores (é a validação deles)

## Objetivo

Congelar features e validar o sistema ponta a ponta em ambiente real
(Supabase + Vercel) com roteiro reproduzível: as 3 migrations nunca
rodaram num banco de verdade e o fluxo completo nunca foi percorrido
por dois dispositivos.

## Contexto

Risco assimétrico: um typo de SQL nas migrations ou uma policy RLS
errada custa muito mais caro descoberto sob features empilhadas do que
agora. A tarefa é 100% documental + 1 correção de código encontrada
durante a revisão do schema.

## Solução

- [docs/SMOKE_TEST.md](../SMOKE_TEST.md): ordem das migrations com
  **query de verificação SQL para cada garantia** (tabelas, enum, RLS,
  triggers, REVOKE das RPCs para anon, bucket, publication do Realtime),
  configuração de Auth (Site URL/Redirect) e deploy Vercel — incluindo a
  armadilha do `NEXT_PUBLIC_APP_URL` (embutido no build: setar e
  **redeployar** antes de baixar QR Codes).
- [supabase/seed.sql](../../supabase/seed.sql) (convenção do CLI, não
  `/docs`): `DO` block idempotente com UUIDs fixos + `ON CONFLICT`.
  Vincula ao **primeiro usuário real** do `auth.users` (FK impede dono
  fictício); sem usuário, `RAISE NOTICE` e skip — não quebra `db reset`.
- [docs/E2E_CHECKLIST.md](../E2E_CHECKLIST.md): 8 passos com 2
  dispositivos, incluindo o fluxo `needs_confirmation` (geo negada →
  coluna âmbar → confirmar/recusar) que o plano externo omitiu, e edge
  cases executáveis (TTL do carrinho simulado via DevTools, não "esperar
  4h").
- [docs/BUG_TEMPLATE.md](../BUG_TEMPLATE.md): severidade, ambiente,
  passos, esperado × observado, evidência, ADR contradito.

### Bug corrigido durante a revisão (antes do deploy)

`orders.note` tem `check (char_length(note) <= 300)`. O
`appendCancelReason` concatenava `" | Cancelado: X"` sem limite: com
nota longa do cliente, o **cancelamento falharia** por violação de
constraint. Corrigido em [order-board.ts](../../src/lib/order-board.ts)
com truncamento que preserva o motivo (informação nova) e corta a cauda
da nota antiga; teste de regressão adicionado (36 testes).

## Prevenção

1. **Correções ao plano externo**: `qr_code_token` não existe (QR usa
   `table_id` estável; `session_token` é criado pela RPC, nunca no
   seed); seed não pode inventar `owner_id` (FK para `auth.users`);
   `output: standalone` é para Docker, não Vercel (veto); cliente
   acompanha por **polling 5s**, não Realtime (ADR 0004) — checklist
   corrigido para não reportar "bug" de comportamento esperado; som é do
   dono, cliente tem vibração.
2. Toda coluna com `check` de tamanho no banco precisa de truncamento
   correspondente no código que concatena texto nela.
3. PWA/service worker só existe em produção — teste offline só vale na
   Vercel, não em `npm run dev`.
4. Bugs do smoke test entram em `docs/bugs/` no formato do template,
   um commit `fix:` por bug.

## Pendências

- Executar o roteiro (requer as keys do Supabase — usuário vai criar).
- `docs/bugs/` será criado na primeira falha encontrada.
