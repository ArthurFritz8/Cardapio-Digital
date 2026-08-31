# ADR 0005 — Painel de pedidos do dono: Realtime como acelerador sobre base de refetch

- **Status**: Aceito
- **Data**: 2026-08-31
- **Relacionados**: ADR 0002 (needs_confirmation), ADR 0003 (padrão admin = browser client + RLS), ADR 0004 (veto de Realtime para anônimo)

## Objetivo

Tela `/admin/pedidos` onde o dono acompanha e opera os pedidos em tempo
real num tablet atrás do balcão, tolerando quedas de Wi-Fi sem perder
pedidos silenciosamente.

## Contexto

Realtime do Supabase **não reenvia eventos perdidos** durante uma
desconexão: se o socket cai por 2 minutos, os pedidos daquele intervalo
nunca chegam pelo stream. Confiar só no canal = pedido invisível até um
F5 — inaceitável numa cozinha. Aqui o Realtime funciona (diferente do
cliente anônimo do ADR 0004) porque o dono é autenticado e as policies
`orders_owner_read`/`orders_owner_update` liberam o canal.

## Solução

### Dados em 3 camadas ([useOrdersRealtime.ts](../../src/hooks/useOrdersRealtime.ts))

1. **Realtime = acelerador**: evento INSERT/UPDATE (canal filtrado por
   `establishment_id`) dispara refetch **incremental** do pedido alterado
   (payload não traz os joins de `order_items`/`tables`).
2. **Refetch completo em todo `SUBSCRIBED`**: cobre o buraco da
   reconexão — o estado da tela é reconstruído do banco, não do stream.
3. **Polling de 30s** (`OWNER_ORDERS_POLL_INTERVAL_MS`): rede de
   segurança se o canal não reconectar. Pausado com aba oculta
   (`document.hidden`); ao voltar o foco, refetch imediato.

Indicador no header: 🟢 Ao vivo (`SUBSCRIBED`) / 🟡 Reconectando
(`CHANNEL_ERROR`/`TIMED_OUT`) / 🔴 Offline (`CLOSED`, polling segue).

### Kanban sem drag-and-drop

Colunas: **Aguardando confirmação** (destaque âmbar) → **Fila** →
**Preparando** → **Pronto**. "Aguardando confirmação" é **projeção**
(`pending && needs_confirmation && !confirmed_at`), não status do enum —
a IA externa insistiu pela 3ª vez num `pending_manual_confirm` que foi
vetado nos ADRs 0002/0004. "Confirmar mesa" apenas seta `confirmed_at`
e o card desliza para a Fila. Dono de bar precisa de botão grande, não
gesto de arrastar. Idade do pedido com escala 10/20 min (branco/âmbar/
vermelho), atualizada no mesmo ciclo do polling (estado `now`).

### Ações direto no banco (sem API route)

**VETO ao `PATCH /api/orders/[id]`** sugerido: o padrão admin (ADR 0003)
é browser client + RLS. O trigger `enforce_order_status_transition` é a
autoridade da máquina de estados; a UI só exibe botões de transições
válidas. Update **otimista** (card move na hora); em erro, `refetchOne`
restaura a verdade do banco + toast. **Correção**: cancelamento só em
`pending`/`preparing` — o trigger proíbe cancelar `ready` (a sugestão
"cancelar em tudo exceto delivered" violaria o banco). Motivo de
cancelamento via `appendCancelReason` (append no `note`, nunca
sobrescreve a observação do cliente).

### Som via Web Audio API (sem arquivo)

[useNotificationSound.ts](../../src/hooks/useNotificationSound.ts):
osciladores — zero asset, zero bundle, zero hospedagem. Browsers exigem
gesto do usuário: banner "Toque para ativar notificações sonoras" chama
`ctx.resume()` uma vez. Dois sons: ascendente (pedido normal) e beep
duplo agudo (needs_confirmation). Toggle persistido em
`cd.admin-sound-enabled`.

**Detecção de pedido novo é centralizada num `Set` de IDs conhecidos**:
qualquer caminho (Realtime OU polling) que traga um id inédito apita.
Se o som dependesse só do INSERT do Realtime, pedido chegando com o
canal caído seria mudo — exatamente o cenário em que o som mais importa.
Primeira carga popula o Set sem apitar.

### Histórico mínimo

Toggle "Histórico de hoje": `delivered`/`cancelled` com
`created_at >= hoje 00:00`, lista simples (mesa, hora, status, total)
para conferência no fechamento.

## Prevenção (vetos e armadilhas)

1. **Nunca confiar só no stream Realtime**: reconexão não reenvia
   eventos. Todo `SUBSCRIBED` = refetch completo; polling 30s sempre vivo.
2. **VETO — `pending_manual_confirm` como status** (3ª recusa):
   projeção via flag, coluna do kanban ≠ estado do banco.
3. **VETO — API route para ações do dono**: redundante com RLS +
   trigger; manter convenção do ADR 0003.
4. **Cancelamento de `ready` é proibido pelo trigger** — UI não pode
   oferecer o botão.
5. Som/polling "inteligente" por diff de listas foi simplificado:
   replace ordenado + Set de IDs conhecidos entrega o mesmo com um terço
   do código.
6. Web Audio só toca com `AudioContext.state === "running"` — sempre
   exigir o gesto de unlock antes.

## Pendências

- Realtime em `order_items` não é necessário (itens são imutáveis após
  o INSERT do pedido).
- Métricas do dia (faturamento, ticket médio) podem evoluir do histórico.
- Ícones PWA definitivos (pendência herdada).
