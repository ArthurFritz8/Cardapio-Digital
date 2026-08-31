# Checklist E2E — fluxo ponta a ponta com 2 dispositivos

Executar após o [SMOKE_TEST.md](SMOKE_TEST.md) (migrations + deploy ok).
**Dispositivo A** = dono (desktop ou tablet). **Dispositivo B** = cliente
(celular, de preferência em 4G para testar fora da rede local).

> Nota de arquitetura: o cliente acompanha o pedido por **polling de 5s**
> (não Realtime — ADR 0004); atualização pode demorar até ~5s e isso é
> o comportamento esperado. Realtime é só no painel do dono.

## Passo 1 — Setup do dono (Dispositivo A)

- [ ] Acessar a URL do app → landing abre
- [ ] Criar conta (signup) → mensagem de confirmação de email
- [ ] Confirmar email (link chega no inbox; conferir spam)
- [ ] Login → redireciona para `/onboarding` (sem estabelecimento)
- [ ] Criar estabelecimento com "Usar minha localização" (permitir GPS)
- [ ] `/admin` abre com o formulário preenchido
- [ ] Cadastrar 2 categorias (Bebidas, Petiscos) — ou rodar o seed
- [ ] Cadastrar 4 itens, **pelo menos 1 com foto** (testa upload +
      compressão canvas + bucket)
- [ ] Cadastrar 3 mesas → QR Codes aparecem
- [ ] Baixar o QR da Mesa 1 (PNG 1024px)
- [ ] Abrir `/admin/pedidos` → kanban vazio, indicador **🟢 Ao vivo**
- [ ] Tocar no banner "ativar notificações sonoras"

## Passo 2 — Cliente pede (Dispositivo B)

- [ ] Escanear o QR da Mesa 1 (URL `/m/{table_id}` — uuid estável da mesa)
- [ ] Ver logo/nome do bar + badge **Mesa 1** no header
- [ ] Ver categorias (chips sticky) e itens com preço formatado (R$)
- [ ] Adicionar 2 itens → FAB aparece com contagem e total **"estimado"**
- [ ] Abrir carrinho → adicionar observação "sem cebola" em 1 item
- [ ] Ajustar quantidade com +/− (em 0 o item some)
- [ ] Preencher nome ("Cliente Teste") e **Enviar pedido**
- [ ] Browser pede localização → **permitir** (dentro do raio)
- [ ] Redireciona direto para `/pedido/{order_id}` (não há tela
      intermediária) com timeline em **"Recebido"** e total real do banco
- [ ] Carrinho foi limpo (voltar ao menu → FAB sumiu)

## Passo 3 — Dono opera (Dispositivo A)

- [ ] Pedido aparece no kanban em **"Fila"** em ≤ 2s + **som** tocou
- [ ] Card mostra: Mesa 1, "há X min", itens, obs "sem cebola", nome, total
- [ ] "Iniciar preparo" → card move para **Preparando** na hora (otimista)
- [ ] "Marcar pronto" → card move para **Pronto**

## Passo 4 — Cliente acompanha (Dispositivo B)

- [ ] Timeline avança para **"Em preparo"** em ≤ 5s (polling)
- [ ] Timeline avança para **"Pronto!"** em ≤ 5s + **vibração** no celular

## Passo 5 — Entrega (Dispositivo A)

- [ ] "Marcar entregue" → card sai do kanban
- [ ] "Histórico de hoje" → pedido listado como Entregue com total

## Passo 6 — Encerramento (Dispositivo B)

- [ ] Timeline mostra **"Entregue"** e o polling PARA (conferir na aba
      Network: sem novas requisições após o estado terminal)
- [ ] "Fazer outro pedido" volta para `/m/{table_id}`

## Passo 7 — Fluxo de confirmação manual (geo negada)

- [ ] Dispositivo B: novo pedido, mas **negar** a localização
- [ ] Pedido criado normalmente; cliente vê banner âmbar "Aguardando
      confirmação do estabelecimento"
- [ ] Dispositivo A: card entra na coluna **"Aguardando confirmação"**
      (borda âmbar) com **som urgente** (beep duplo)
- [ ] "Confirmar mesa" → card desliza para "Fila" (status continua
      pending; só `confirmed_at` foi setado)
- [ ] Repetir negando a geo e usar **"Recusar"** → modal → pedido some;
      cliente vê "Pedido cancelado"

## Passo 8 — Edge cases

- [ ] **Offline (cliente)**: modo avião no Dispositivo B → recarregar
      `/m/{table_id}` → menu abre do cache (PWA; imagens incluídas);
      banner "Você está offline" e botão de envio desabilitado
- [ ] **Volta online**: sair do modo avião → banner some, menu revalida
- [ ] **Reconexão do dono**: desligar Wi-Fi do Dispositivo A por ~1 min →
      indicador sai de 🟢; religar → volta a 🟢 e o kanban faz refetch
      completo (criar um pedido DURANTE a queda: ele deve aparecer ao
      reconectar, ou em ≤ 30s pelo polling de segurança)
- [ ] **Carrinho persiste**: montar carrinho, recarregar a página →
      carrinho intacto (localStorage)
- [ ] **TTL do carrinho**: DevTools → Application → Local Storage → editar
      `cd.cart.{tableId}` colocando `created_at` de 5h atrás → recarregar
      → carrinho vazio (não esperar 4h reais)
- [ ] **Item fica indisponível**: dono desativa um item que está no
      carrinho do cliente → cliente envia → erro claro, item removido do
      carrinho automaticamente, reenvio funciona
- [ ] **Estabelecimento fechado**: dono marca fechado → cliente vê banner
      vermelho e não consegue enviar
- [ ] **Auth gate**: janela anônima em `/admin` → redireciona `/login`
- [ ] **Mesa inexistente**: `/m/{uuid-aleatorio}` → "Mesa não encontrada"
- [ ] **Limite de pedidos**: enviar 6 pedidos seguidos da mesma mesa →
      o 6º falha com mensagem de limite (máx. 5 ativos)

## Registro

Cada falha vira um registro no formato do
[BUG_TEMPLATE.md](BUG_TEMPLATE.md), commitado em `docs/bugs/`.
