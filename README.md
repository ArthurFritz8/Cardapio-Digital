# Cardápio Digital

PWA para bares e restaurantes: o cliente escaneia o QR Code da mesa, vê o menu e faz o pedido — sem instalar app. O bar recebe os pedidos em tempo real.

## Stack

- **Next.js 14+** (App Router, TypeScript strict)
- **Tailwind CSS** (mobile-first, dark mode)
- **Supabase** (PostgreSQL + Auth + Storage + Realtime — free tier)
- **Zod** (validação compartilhada front + back)
- **@ducanh2912/next-pwa** (Service Worker, offline, instalável)

## Setup

1. Crie um projeto no [Supabase](https://supabase.com) (free tier).
2. Rode a migration [supabase/migrations/0001_initial_schema.sql](supabase/migrations/0001_initial_schema.sql) no SQL Editor do dashboard.
3. Copie `.env.example` para `.env.local` e preencha com as chaves do projeto (Settings > API).
4. Instale e rode:

```bash
npm install
npm run dev
```

## Scripts

| Script              | Descrição                     |
| ------------------- | ----------------------------- |
| `npm run dev`       | Servidor de desenvolvimento   |
| `npm run build`     | Build de produção (gera PWA)  |
| `npm run typecheck` | Checagem de tipos (strict)    |
| `npm run lint`      | ESLint                        |

## Arquitetura

```
src/
  app/            # App Router (páginas, layouts, manifest PWA)
  lib/
    env.ts        # Env validado com Zod (falha rápido)
    errors.ts     # Erros centralizados (códigos auditáveis)
    money.ts      # Dinheiro sempre em centavos (int)
    supabase/     # Clients: browser (anon), server (cookies), admin (service_role)
  schemas/        # Schemas Zod compartilhados front+back
  types/          # Tipos de domínio (espelho do schema SQL)
supabase/
  migrations/     # Schema SQL versionado (RLS + triggers)
docs/
  ADR/            # Architecture Decision Records (O.C.S.P.)
```

## Decisões-chave

- **Preços em centavos** (`INTEGER`) — nunca float para dinheiro.
- **Máquina de estados do pedido enforçada no banco** (trigger): `pending → preparing → ready → delivered`, com `cancelled` a partir de `pending`/`preparing`.
- **Pedidos criados via API Route** (service_role + validação Zod): preço resolvido server-side, anon não escreve direto no banco.
- **Snapshot de nome/preço** em `order_items`: histórico imune a edições do menu.

> Ícone PWA: SVG placeholder em `public/icons/`. Antes do lançamento, gerar PNGs 192/512 maskable.

## ADRs

Toda decisão relevante está documentada em [docs/ADR](docs/ADR/).
