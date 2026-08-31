# ADR 0001 — Estrutura base do projeto e schema do banco

**Data:** 2026-08-30
**Status:** Aceito

## Objetivo

Criar a fundação do Cardápio Digital: scaffold Next.js 14 (App Router, TS strict), configuração PWA, libs centrais (env, erros, dinheiro, clients Supabase), schemas Zod compartilhados e o schema PostgreSQL inicial com RLS, triggers e Realtime.

## Contexto

MVP para bares/restaurantes: cliente escaneia QR Code da mesa, monta pedido e envia; o bar gerencia em tempo real. Restrições: 100% free tier (Vercel + Supabase), solo dev, sem serviços pagos, offline-first no cliente.

Sugestões da IA externa foram revisadas criticamente (protocolo de peer review com poder de veto).

## Solução

### Estrutura
- Next.js 14.2 + TS `strict` + `noUncheckedIndexedAccess`, Tailwind 3.4 (dark mode `class`), `@ducanh2912/next-pwa` (desabilitado em dev), `manifest.ts` nativo do Next (tipado).
- `src/lib/env.ts`: env validado com Zod, **lazy** (não quebra build sem secrets no CI).
- `src/lib/errors.ts`: `AppError` com códigos estáveis + mapeamento HTTP — erros centralizados e auditáveis.
- `src/lib/money.ts`: dinheiro **sempre em centavos (int)**; format/parse pt-BR.
- 3 clients Supabase segregados: browser (anon/RLS), server (cookies/RLS), admin (service_role, só Route Handlers).

### Schema (0001_initial_schema.sql)
- Tabelas: `establishments`, `tables`, `categories`, `menu_items`, `orders`, `order_items` — todas com constraints de tamanho/range no banco (defesa em profundidade, não só no Zod).
- **Enum `order_status`** + trigger `enforce_order_status_transition`: máquina de estados enforçada no banco (`pending → preparing → ready → delivered`; `cancelled` a partir de `pending`/`preparing`). Front nunca é a única barreira.
- **`order_items` com snapshot** (`item_name`, `unit_price_cents`): histórico de pedidos imune a renomeação/reprecificação do menu; `menu_item_id` com `on delete set null` preserva o histórico se o prato for excluído.
- **RLS**: leitura pública de menu/mesas (necessária ao cliente anônimo); escrita restrita ao dono via helper `is_establishment_owner()` (security definer). `orders`/`order_items` **sem política anon**.
- Realtime habilitado apenas em `orders` (canal mínimo, free tier).
- Índices para as consultas quentes: painel do bar (`establishment_id, status, created_at desc`) e menu público.

### Vetos aplicados às sugestões externas
1. **Insert anônimo direto em `orders` — VETADO.** Vetor de spam e manipulação de preço. Correção: pedidos entram via API Route (service_role) com validação Zod e preços resolvidos server-side.
2. **Preço em float/numeric — VETADO.** Erros de arredondamento em dinheiro. Correção: `price_cents INTEGER` + helpers em `lib/money.ts`.
3. **Máquina de estados só no front — VETADO.** Corrupção de fluxo por update direto. Correção: trigger no banco.

## Prevenção

- Constraints e trigger no banco impedem estados inválidos mesmo com bug no app.
- Env validado falha rápido com mensagem clara (sem `undefined` silencioso em produção).
- `.env*` no `.gitignore` + `.env.example` só com placeholders (trava de segredos).
- `ORDER_STATUS_TRANSITIONS` em `types/domain.ts` espelha o trigger — única fonte para o front, com o banco como autoridade final.
- Tipos de domínio serão substituídos por `supabase gen types` quando o projeto Supabase existir (anotado no arquivo).

## Pendências conhecidas

- Ícone PWA é SVG placeholder — gerar PNGs 192/512 maskable antes do lançamento.
- Cliente anônimo acompanhará status do pedido via API Route (polling) — Realtime anônimo exigiria política de select pública em `orders` (risco de enumeração); reavaliar com token de sessão de mesa em ADR futuro.
