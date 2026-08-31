# ADR 0004 — Experiência pública do cliente: carrinho local, SWR manual e polling de status

- **Status**: Aceito
- **Data**: 2026-02-10
- **Relacionados**: ADR 0001 (schema), ADR 0002 (sessão de mesa + geo), ADR 0003 (auth/admin)

## Objetivo

Entregar o fluxo completo do cliente anônimo: escanear QR → ver cardápio
(`/m/[tableId]`) → montar carrinho → enviar pedido → acompanhar status
(`/pedido/[orderId]`), com tolerância a rede ruim de bar (offline-first de
leitura) e custo zero.

## Contexto

O cliente NÃO tem conta (fricção zero é requisito do produto). Isso impõe
três restrições técnicas:

1. **RLS de `orders` é fechada para `anon`** (decisão do ADR 0002 — pedidos só
   nascem via RPC `create_order` com service_role). Logo, **Supabase Realtime
   não funciona para o cliente**: o canal respeitaria RLS e nunca entregaria
   eventos.
2. Não há identidade persistente além do `localStorage` do navegador.
3. Rede de bar é instável: o cardápio precisa abrir mesmo offline, mas o
   envio do pedido exige conexão.

A IA externa sugeriu Realtime para o cliente, fila offline com Background
Sync e um status `pending_manual_confirm`. As três sugestões foram vetadas
(ver Prevenção).

## Solução

### Carrinho: `localStorage` com TTL de 4h, isolado por mesa

- [src/lib/cart.ts](../../src/lib/cart.ts): funções **puras** (add com merge
  por item, quantidade 1..50, nota até 200 chars, prune de indisponíveis,
  total/contagem) + persistência em `cd.cart.${tableId}`.
- TTL de 4h (`CART_TTL_HOURS`): cliente que voltou no dia seguinte não
  encontra carrinho fantasma. A sessão de mesa (2h) renova sozinha no envio.
- **Por que não IndexedDB**: carrinho é <2KB de JSON; IndexedDB adicionaria
  API assíncrona e complexidade sem ganho. **Por que não só memória**: cliente
  troca de aba/app o tempo todo em bar; perder o carrinho é churn direto.
- Nome/preço no carrinho são **snapshot estimado para UI** — o servidor
  resolve preços reais do banco no `create_order` (cliente nunca dita preço).

### Cardápio: SWR manual sem biblioteca

- [src/hooks/useMenu.ts](../../src/hooks/useMenu.ts): cache em
  `cd.menu.${tableId}` servido instantâneo → fetch fresco em background →
  revalidação em `visibilitychange` e `online`.
- Erro de rede só é exibido se **não há cache** (stale-while-revalidate real).
- **Por que não a lib `swr`**: uma dependência a mais para ~40 linhas de
  lógica; o padrão aqui é fixo (1 chave, 2 gatilhos de revalidação).
- Regra de visibilidade: itens `is_available=true` cujo `category_id` está em
  categoria ativa (consistente com o painel admin — ADR 0003).

### Envio do pedido: sessão auto-renovável + geo opcional

- [src/components/public/CartSheet.tsx](../../src/components/public/CartSheet.tsx):
  `ensureSession` (usa token salvo ou `POST /api/tables/[id]/session`) →
  geolocalização opcional (5s timeout; recusa ≠ bloqueio, vira
  `needs_confirmation` no servidor) → `POST /api/orders`.
- `SESSION_EXPIRED` (410): limpa token, renova **uma vez** e reenvia —
  cliente não vê erro de sessão jamais.
- `ITEM_UNAVAILABLE`: refetch do cardápio fresco + prune automático do
  carrinho + mensagem explicando o que saiu. (Bug evitado: podar com o Set
  **antigo** de IDs não removeria o item recém-indisponível — o callback
  `onItemsUnavailable` usa o retorno do refresh.)
- Anti-fantasma de duplo clique: `sending` desabilita o botão até navegar.
- Offline: botão desabilitado com rótulo "Sem conexão" (evento `online`
  reabilita). Sucesso → `clearCart` + redirect `/pedido/[orderId]`.

### Status do pedido: capability URL + polling 5s

- [src/app/api/orders/[orderId]/route.ts](../../src/app/api/orders/[orderId]/route.ts):
  GET com service_role retornando payload **sanitizado** (status, itens
  snapshot, total, mesa). O UUID v4 do pedido é a credencial (capability URL,
  não-enumerável) — mesmo padrão de links de convite.
- [src/hooks/useOrderStatus.ts](../../src/hooks/useOrderStatus.ts): polling de
  5s (`ORDER_POLL_INTERVAL_MS`), refresh no foco, **para em estados terminais**
  (`delivered`/`cancelled`) — zero requisição desperdiçada depois disso.
- UX: timeline Recebido → Em preparo → Pronto! → Entregue;
  `navigator.vibrate(200)` na transição para `ready`; banner âmbar quando
  `pending && needs_confirmation && !confirmed_at` ("Aguardando confirmação").
- Custo do polling no free tier: 1 pedido ativo ≈ 12 req/min só enquanto a
  aba está visível — irrelevante frente ao limite do Supabase/Vercel.

### Imagens: cache-first no Service Worker

- [next.config.mjs](../../next.config.mjs): `extendDefaultRuntimeCaching` +
  regra `CacheFirst` para `*.supabase.co/storage/v1/object/public/*`
  (cache `supabase-images`, 128 entradas, 30 dias).
- Por isso as páginas públicas usam `<img loading="lazy">` em vez de
  `next/image`: o otimizador do Next reescreve a URL para `/_next/image`,
  quebrando o match do SW e gastando quota de otimização da Vercel.

## Prevenção (vetos e armadilhas)

1. **VETO — Realtime para cliente anônimo**: canal Realtime respeita RLS;
   com `orders` fechada para `anon`, o cliente nunca receberia eventos. Abrir
   RLS de leitura para `anon` exporia pedidos de todos. Polling em capability
   URL entrega o mesmo resultado com segurança. (Realtime **será** usado no
   painel do dono, que é autenticado e tem policy `orders_owner_read`.)
2. **VETO — Background Sync para fila offline**: iOS/Safari não suporta
   Background Sync; pedido enfileirado offline chegando 20min depois é pedido
   fantasma na cozinha (cliente pode ter ido embora). Honestidade > mágica:
   botão desabilitado com aviso claro.
3. **VETO — status `pending_manual_confirm` no enum**: `ALTER TYPE ... ADD
   VALUE` não roda em transação no SQL editor do Supabase e inflaria a máquina
   de estados. O flag `needs_confirmation + confirmed_at` (ADR 0002) já modela
   isso ortogonalmente.
4. `useMenu` retorna os dados frescos do `refresh()` — nunca podar carrinho
   com snapshot velho de disponibilidade.
5. Total no carrinho é sempre rotulado "estimado": o valor autoritativo é o
   `total_cents` calculado pelo banco no envio.

## Pendências

- Painel realtime de pedidos do dono (`/admin/pedidos`) com botão de
  confirmação para `needs_confirmation`.
- Ícones PWA definitivos (ainda placeholder SVG).
