# Checklist E2E — dois dispositivos e duas contas

Execute após [SMOKE_TEST.md](SMOKE_TEST.md), no commit auditado, com dados sintéticos. Cada caixa começa **pendente**; anote data/evidência ao marcar. Uma falha Bloqueante/Alta interrompe a liberação e vira registro em [BUG_TEMPLATE.md](BUG_TEMPLATE.md).

**Dispositivo A:** Android do dono, Conta A. **Dispositivo B:** celular do cliente, sem login, inicialmente em rede móvel. **Conta B:** segundo dono, em outro perfil de navegador para teste de RLS; não reutilizar cookies da Conta A. São dois aparelhos e três perfis, não três aparelhos obrigatórios.

O cliente consulta status a cada cinco segundos enquanto acompanha o pedido; o dono usa Realtime com refetch na reconexão e polling de segurança de 30 segundos. Não esperar Realtime anônimo. Os tempos abaixo são metas de teste em rede saudável, não garantia de entrega do provedor.

## A. Cadastro e operação do dono

- [ ] **A01** `/admin` sem login redireciona para `/login`; após login sem estabelecimento, `/onboarding`.
- [ ] **A02** Signup com email autorizado → email recebido → callback PKCE no mesmo navegador → onboarding. Se SMTP/limite impedir, registrar pendente, mesmo que login com usuário confirmado no Dashboard funcione.
- [ ] **A03** Recuperar senha de conta existente e testar senha nova. Email inexistente recebe a mesma mensagem pública. Link inválido/expirado termina em erro seguro, sem sessão nem redirecionamento externo.
- [ ] **A04** Conta A: executar seed com UUID explícito ou cadastrar 2 categorias/4 itens/3 mesas manualmente. Conta B: cadastrar estabelecimento próprio pelo onboarding.
- [ ] **A05** Salvar coordenadas reais do local de teste em `/admin` antes dos casos de geo. Raio inicial 150 m. Coordenadas nulas desligam a triagem.
- [ ] **A06** Cadastrar/editar preço `19.90` e `19,90`: ambos exibem R$ 19,90. Renomear e reordenar categorias/itens; atualizar a página pública e conferir.
- [ ] **A07** Upload de foto grande válida → compressão client-side e imagem exibida. MIME não permitido e arquivo final acima do limite de 2 MB são recusados. Testar logo e foto de prato.
- [ ] **A08** Baixar QR PNG 1024 px da Mesa 1. Decodificação contém somente origem correta + `/m/{table_id}`; nenhum token de sessão.
- [ ] **A09** Abrir `/admin/pedidos`, aguardar carga e indicador “Ao vivo”. Primeira carga com pedidos existentes não toca notificações antigas.
- [ ] **A10** Tocar no aviso para liberar áudio; enviar pedido pelo outro aparelho e ouvir o som. Desativar/reativar som funciona no primeiro toque e preferência persiste após reload. Repetir com PWA instalada.

## B. QR → pedido → cozinha → cliente

- [ ] **B01** Escanear Mesa 1 no dispositivo B sem login; conferir estabelecimento, mesa, categorias ativas, fotos e preços.
- [ ] **B02** Adicionar 2 chopps e 1 refrigerante do seed: contador 3, total estimado R$ 32,00. Abrir carrinho, ajustar +/−, testar remoção em zero e observação “sem gelo”.
- [ ] **B03** Preencher nome sintético, enviar e permitir geo no local correto. Network: primeiro obtém/reutiliza sessão por `/api/tables/{id}/session`; pedido inclui UUID `request_id`, IDs/quantidades/observações, sem preço/nome do produto.
- [ ] **B04** Sucesso HTTP 201 → `/pedido/{order_id}`, total do banco R$ 32,00, itens snapshot e timeline. Carrinho limpo. Guardar o link de acompanhamento; é uma URL de acesso e não deve ser publicada.
- [ ] **B05** Pedido aparece na Fila do dono, com itens/observações/mesa/total e som de novo pedido. Registrar latência; meta ≤ 2 s com canal conectado, recuperação em até um ciclo de 30 s se o evento se perder.
- [ ] **B06** “Iniciar preparo” → Preparando; “Marcar pronto” → Pronto; “Marcar entregue” → sai do kanban e entra no histórico de hoje. Tocar repetidamente enquanto uma ação está pendente não dispara transições concorrentes.
- [ ] **B07** Cliente acompanha cada avanço no próximo polling, sem precisar recarregar. Ao ficar pronto, vibra quando o navegador/dispositivo permitir; ausência de suporte à vibração deve ser registrada como limitação, não falha de status.
- [ ] **B08** Em `delivered` ou `cancelled`, parar novas consultas de polling. Reabrir o link permite consultar o pedido finalizado. “Fazer outro pedido” volta à mesma mesa.

## C. Confirmação e máquina de estados

- [ ] **C01** Com coordenadas do estabelecimento configuradas, negar geo → pedido criado em `pending`, `needs_confirmation=true`, `confirmed_at=null`; cliente vê aviso, dono vê “Aguardando confirmação” e som urgente.
- [ ] **C02** “Confirmar mesa” preenche `confirmed_at` e move para Fila; `status` continua `pending`. Só então “Iniciar preparo” funciona.
- [ ] **C03** Recusar outro pedido aguardando confirmação: modal com motivo opcional → `cancelled`, cliente vê cancelamento. Repetir com observação de 300 caracteres; constraint não deve impedir cancelamento.
- [ ] **C04** Cancelar em `pending` e `preparing` funciona. `ready → cancelled`, `pending → delivered` e qualquer saída de estado terminal são rejeitados pelo banco, mesmo em requisição direta do dono. Repetir estado sem alterá-lo não cria transição nova.
- [ ] **C05** Tentativa direta `pending → preparing` com confirmação exigida ainda nula é rejeitada. Não é suficiente esconder o botão na UI.
- [ ] **C06** Geo fora do raio, timeout e precisão artificialmente grande não dispensam o cap de compensação de 100 m. Coordenadas enviadas continuam sendo heurística spoofável; não tratar aprovação geo como prova de presença.

## D. Isolamento RLS, grants e Storage

Use os UUIDs das duas contas e dos estabelecimentos/pedidos sintéticos. Nunca usar `service_role` para provar que RLS funciona: ela ignora RLS. `verify-migrations.sql` verifica privilégios; este bloco exercita linhas reais.

No SQL Editor do projeto de teste, o exemplo abaixo simula **Conta B** em uma transação revertida. Substitua os placeholders por UUIDs reais. As duas consultas em pedidos da Conta A e o UPDATE de categorias da Conta A devem retornar zero linhas. Consulta equivalente para pedido da própria Conta B deve retornar seu registro, depois de criar esse pedido pelo fluxo público.

```sql
begin;
select set_config('request.jwt.claims', json_build_object(
  'sub', 'UUID-CONTA-B', 'role', 'authenticated'
)::text, true);
set local role authenticated;

select id, status from public.orders
where establishment_id = 'UUID-ESTABELECIMENTO-A'::uuid;

select oi.id from public.order_items oi
where oi.order_id = 'UUID-PEDIDO-A'::uuid;

update public.categories set name = name
where establishment_id = 'UUID-ESTABELECIMENTO-A'::uuid
returning id;
rollback;
```

- [ ] **D01** Executar o bloco nos dois sentidos (A contra B e B contra A) e validar também leitura/edição dos próprios registros. Não concluir aprovação porque o banco de teste está vazio.
- [ ] **D02** No cliente sem login, selecionar campos públicos de mesa funciona; selecionar `session_token`/`session_expires_at` diretamente via PostgREST é negado. Repita logado como dono: a UI usa a projeção pública, não lê token bruto.
- [ ] **D03** `orders`/`order_items` anônimos não retornam pedidos; INSERT direto é negado. `start_table_session`, `create_order` e `consume_ip_rate_limit` não podem ser executadas por `anon` nem `authenticated`.
- [ ] **D04** Dono não consegue alterar `total_cents`, `table_id`, `establishment_id`, `needs_confirmation` ou campos de idempotência de um pedido. Em `order_items`, não consegue inserir/alterar/remover snapshot. Alterações legítimas de status/confirmado/nota continuam funcionando.
- [ ] **D05** Item de categoria de outro estabelecimento, pedido com mesa de outro estabelecimento e item de categoria inativa são recusados. Nenhum pedido parcial/sem itens permanece após erro da RPC.
- [ ] **D06** Por PostgREST no navegador da Conta B, tente ler pedido da Conta A usando o UUID conhecido e alterar uma categoria da Conta A; confirmar zero registros e zero efeitos no banco. Repetir no sentido oposto. O teste SQL acima não substitui esta chamada autenticada real.
- [ ] **D07** Cada dono faz upload no seu prefixo `{establishment_id}/...`; tentar INSERT/UPDATE/MOVE/DELETE no prefixo do outro dono é negado. O dono também não pode mover seu arquivo para prefixo alheio. Leitura de imagem pública funciona anônima.
- [ ] **D08** Menu público não mostra categorias inativas/itens indisponíveis. Network/JS/HTML não contêm `service_role`; respostas de erro não expõem SQL, tokens ou detalhes internos.
- [ ] **D09** O link `/pedido/{uuid}` permite acompanhamento anônimo sanitizado, sem nome do cliente nem dados administrativos. UUID inexistente retorna 404; UUID malformado, 400. Não há lista pública de pedidos. A posse do link dá acesso ao conteúdo sanitizado.

Para inspecionar chamadas reais, use Network → requisição Supabase → Edit and Resend/Copy as fetch no próprio navegador de teste, preservando a credencial **daquele** perfil. Alterar somente filtros/payload do caso e verificar resposta e estado final. Não colar tokens na documentação nem trocar pela chave de administração.

## E. Concorrência, repetição e limites

- [ ] **E01** Duas abas do cliente iniciam sessão da mesma mesa simultaneamente: recebem sessão válida, sem erro de corrida; QR impresso permanece válido após rotação.
- [ ] **E02** Em uma mesa vazia, enviar seis pedidos distintos simultaneamente, cada um com `request_id` diferente: no máximo cinco `pending`/`preparing`; excedente HTTP 429 `TABLE_ORDER_LIMIT`. `ready` não conta nesse limite já estabelecido. Confirmar contagem no banco.
- [ ] **E03** Repetir simultaneamente o mesmo POST válido, com mesmo `request_id` e conteúdo: respostas referenciam **um único** pedido; só um conjunto de `order_items`, um débito na contagem de ativos e uma notificação de pedido novo.
- [ ] **E04** Mesmo `request_id` com quantidade/itens/observação diferentes → conflito de idempotência, sem modificar pedido original. Novo pedido intencional usa novo `request_id`.
- [ ] **E05** Simular resposta perdida após o POST e tentar novamente: não duplicar pedido já criado. Distinguir “erro de transporte” de “pedido não criado”, conferindo o banco.
- [ ] **E06** Em pedido novo, sessão expirada/token incorreto → HTTP 410 `SESSION_EXPIRED`; UI renova sessão uma vez e reenvia mantendo a identidade da tentativa. Não ficar em loop de retry.
- [ ] **E07** Payload com `price_cents`/`item_name` inventados, quantidade zero/negativa/fracionária/acima de 50, lista vazia, UUID inválido ou corpo grande demais é rejeitado; preços não mudam e não fica pedido parcial.
- [ ] **E08** Dono altera nome/preço de item depois do pedido: histórico e total do pedido permanecem. Tornar item indisponível ou categoria inativa antes do envio resulta em erro e atualização/poda do carrinho com dados frescos.
- [ ] **E09** Estabelecimento fechado ou mesa inativa bloqueiam novo envio com mensagem clara. Voltar a abrir/ativar e retornar ao menu revalida o cache.
- [ ] **E10** No deploy Vercel de teste, testar duas mesas/clientes atrás do mesmo Wi-Fi/NAT abaixo dos limites: ambos conseguem pedir. Os limites são compartilhados por IP, não por pessoa; inicial de 60 pedidos/minuto e 120 sessões/minuto em `constants.ts`.
- [ ] **E11** Em janela limpa no ambiente de teste, exercitar o limite de sessões com requisições sequenciais até 429, sem criar pedidos. Aguardar `Retry-After` antes de repetir. Validar retomada, limitação atômica e que a tabela `ip_requests` não guarda IP bruto nem é publicada no Realtime. Não transformar esse teste em carga contínua.
- [ ] **E12** Cabeçalhos de IP fornecidos pelo cliente não permitem escolher outra identidade no deploy. O teste local não comprova o cabeçalho normalizado pela Vercel; registrar o comportamento real do proxy sem publicar IPs.

## F. Android, mobile, offline e reconexão

- [ ] **F01** Em build de produção HTTPS, abrir `/manifest.webmanifest`; `icon-192.png`, `icon-512.png` e `icon-maskable-512.png` têm dimensões corretas, PNG válido e HTTP 200. Marca maskable permanece visível no recorte circular.
- [ ] **F02** Android Chrome oferece “Instalar app”/“Adicionar à tela inicial”; instalar, fechar e reabrir. Ícone correto, modo standalone, navegação/login/kanban operáveis. No iOS disponível, conferir `apple-touch-icon.png` (180 px) e adicionar à tela inicial.
- [ ] **F03** Em largura 320–390 px, sem zoom, operar navegação admin, CRUD, carrinho, modal de cancelamento e botões do kanban. Sem texto cortado, rolagem horizontal acidental, ação que dependa de hover ou botão encoberto pelo teclado.
- [ ] **F04** Warm offline: visitar `/m/{table_id}` online, aguardar o Service Worker controlar a página, rolar para carregar fotos e confirmar cache; modo avião e reload → menu anterior abre, carrinho persiste, imagens já visitadas aparecem, aviso offline e envio desabilitado.
- [ ] **F05** Cold offline: em perfil sem cache ou URL de mesa nunca visitada, modo avião não cria cardápio inexistente; pode aparecer erro offline do navegador. Essa é a limitação esperada, não uma promessa de primeira visita offline.
- [ ] **F06** Voltar online → aviso some, cardápio revalida e envio volta a funcionar. Fotos nunca carregadas podem precisar da rede. Não há fila automática de pedidos offline.
- [ ] **F07** DevTools → Cache Storage: somente recursos estáticos/ícones, imagens públicas e páginas `/m/{UUID}` autorizadas. Nenhuma resposta de `/admin`, `/auth`, `/api/orders`, `/api/tables`, `/pedido` ou Auth/PostgREST do Supabase. Atualizar SW antigo deve remover caches privados herdados.
- [ ] **F08** Status já aberto perde rede: mantém último estado conhecido e informa falha de atualização; ao retornar, consulta estado real. Primeira abertura do acompanhamento exige rede; não presumir comprovante offline.
- [ ] **F09** Dono perde Wi-Fi por cerca de um minuto: indicador deixa de mostrar “Ao vivo”; falha de sincronização é visível. Criar pedido pelo cliente em rede móvel durante a queda. Reconectar dono → refetch recupera pedido e som toca uma vez se áudio liberado.
- [ ] **F10** Aba do dono em segundo plano → voltar ao foco revalida. Não prometer som com Android suspendendo navegador ou tela bloqueada; testar operação com kanban visível.
- [ ] **F11** Carrinho em Mesa 1 não aparece na Mesa 2; voltar à Mesa 1 preserva itens. Recarregar página mantém o carrinho.
- [ ] **F12** Em DevTools → Local Storage, chave `cd.cart.{tableId}`, alterar `created_at` para mais de quatro horas atrás e recarregar: carrinho vazio. JSON inválido ou storage bloqueado não derruba a página.

## G. Evidência de performance e fechamento

- [ ] **G01** Network do kanban inicial agrupa pedido + itens + rótulo da mesa na consulta; não dispara uma consulta separada por item/mesa. Um evento Realtime pode fazer refetch do pedido afetado.
- [ ] **G02** Cardápio público faz consultas de mesa/estabelecimento, categorias e itens; mudar quantidade no carrinho não refaz queries. Retorno ao foco revalida sem apagar menu durante a requisição.
- [ ] **G03** Registrar tamanho de JS das rotas principais no build e, no Android, tempo de primeira carga com rede móvel. Investigar regressão observada, sem impor limite fictício de bundle ou latência ao free tier.
- [ ] **G04** Registrar bugs por severidade e evidências sanitizadas; repetir o fluxo B completo após correção Bloqueante/Alta. Marcar SMTP, tipos hospedados e condição comercial separadamente de checks locais.

## H. Busca, atalhos locais e diálogos (ADR 0008)

- [ ] **H01** Buscar um produto por nome/descrição/categoria, sem acento e com letras maiúsculas. Termos inexistentes mostram mensagem; limpar restaura itens e categorias. Busca não altera carrinho nem gera novas consultas. Repetir com cardápio em cache offline.
- [ ] **H02** Após envio confirmado, voltar ao cardápio/recarregar: atalho em “Seus pedidos nesta mesa” abre o pedido original. Em outra mesa ou navegador, esse atalho não aparece. Storage contém apenas ID e data, sem itens/nome/preço/status.
- [ ] **H03** Reenvio após resposta perdida recupera o mesmo pedido sem duplicar atalho. Mais de cinco envios preservam os cinco mais recentes. Antecipar `savedAt` em `cd.recent-orders.{tableId}` para mais de 24 horas e recarregar remove o expirado. “Limpar atalhos” não cancela pedidos nem limpa carrinho.
- [ ] **H04** Com localStorage indisponível, envio confirmado continua navegando para acompanhamento; recuperação local não é garantida. JSON corrompido na chave de atalhos não derruba o cardápio.
- [ ] **H05** Carrinho e cancelamento: Tab/Shift+Tab não alcançam controles do fundo; Escape/toque fora fecham e foco retorna ao botão de abertura quando ainda existe. Corpo não rola atrás. Durante envio/cancelamento, Escape/toque fora/Voltar/Fechar não interrompem a ação.
- [ ] **H06** No Android físico em 320–390 px, abrir teclado no nome/observação e motivo: campo e ação continuam alcançáveis por rolagem. Conferir fechamento/restauração e leitura dos títulos via TalkBack. Roteiro automatizado local cobre UI pública com APIs simuladas, não esta operação hospedada.

Resultado: **Pendente até execução**. Registrar em `docs/smoke-runs/AAAA-MM-DD.md`: commit, ambiente, itens aprovados/falhos/pendentes e links para bugs. “Sem bloqueantes” exige que os casos obrigatórios executados não tenham falhas e que as condições externas para o uso pretendido estejam resolvidas.
