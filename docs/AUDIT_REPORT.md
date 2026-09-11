# Auditoria geral — preparação para o primeiro deploy

Data: 10/09/2026. Base inicial: `6ff3ec8`; correções principais já registradas em
`5eca755`, com conclusão documental e de validação neste complemento ao ADR 0006.
Escopo: segurança → dados → PWA/UX → performance/manutenção. Nenhum ambiente
Supabase/Vercel hospedado foi criado ou alterado nesta auditoria.

## Veredito e divergências do contexto

Concordância parcial com as sugestões: preservar módulos válidos, executar SQL,
gerar PNGs e preparar o smoke. Foram vetados sexto estado, Realtime público de
pedidos, cache genérico de respostas e promessa de produção comercial gratuita
na Vercel. A documentação e o código reais prevalecem sobre o resumo externo.

| Informação conferida | Resultado |
| --- | --- |
| Testes anteriores | 36, não 13 |
| Confirmação | `pending && needs_confirmation && !confirmed_at`; sem estado `pending_manual_confirm` |
| Cancelamento | Só `pending`/`preparing`; `ready → cancelled` é ilegal |
| Status público | Polling 5 s pela URL do pedido; Realtime exclusivo do dono |
| Sessão | `/api/tables/[tableId]/session`; QR usa UUID estável |
| Carrinho e geo | `cd.cart.{tableId}`, TTL 4 h; raio padrão 150 m, intervalo 30–1000 m |
| Documentos existentes | Isto já existe em `docs/ADR/0006-smoke-test-antes-de-features.md`, `docs/SMOKE_TEST.md`, `docs/E2E_CHECKLIST.md`, `docs/BUG_TEMPLATE.md` e `supabase/seed.sql`; foram complementados |

Severidades: **Bloqueante** impede iniciar/validar o fluxo ou expõe informação
crítica; **Alta** compromete segurança ou integridade; **Média** tem contorno
operacional seguro; **Baixa** é manutenção/documentação sem impacto essencial.
“Corrigido” abaixo refere-se ao código e aos testes locais, não à instalação
dessas correções em um Supabase remoto.

## Eixo 1 — Segurança

| ID | Severidade | Achado e impacto | Correção/evidência |
| --- | --- | --- | --- |
| S01 | Bloqueante | RLS pública de `tables` também permitia ler `session_token`/expiração | 0004 revoga acesso geral e concede só campos públicos. `SELECT *` e leitura dos tokens falham para anon e dono; projeção pública permanece funcional |
| S02 | Alta | Dono podia alterar total, mesa, flag e outros campos históricos de pedidos | Grants de UPDATE só para `status`, `confirmed_at`, `note`; trigger protege identidade, total e confirmação. Testes de dono A/B e service role |
| S03 | Alta | Pedido marcado para confirmação podia avançar direto para preparo | Trigger exige confirmação e registra horário do banco; tentativa sem confirmação falha com `ORDER_CONFIRMATION_REQUIRED` |
| S04 | Alta | RPC aceitava item de categoria inativa; FKs permitiam vínculos entre estabelecimentos | FKs compostas, filtro de categoria ativa na RPC/RLS e teste de item/categoria de outro dono |
| S05 | Alta | Endpoints de criação/sessão não tinham limite por IP compartilhado entre instâncias | HMAC do IP + RPC privada `consume_ip_rate_limit`: 60 pedidos/120 sessões por 60 s. Header confiável só na Vercel; fallback coletivo local. HTTP 429 com Retry-After; 20 concorrentes/7 permitidos em quota de teste |
| S06 | Alta | `service_role` era protegida por convenção de imports | `server-only` nos módulos de servidor e env secreto separado; segredo não faz parte das variáveis públicas |
| S07 | Bloqueante | Defaults do SW guardavam APIs, páginas administrativas e respostas autenticadas Supabase | Cache por lista explícita; dados privados e RSC usam NetworkOnly; limpeza dos nomes de caches legados em `sw-cleanup.js`. Testes das regras incluídos em `npm test` |
| S08 | Alta | Corpo JSON sem limite local; campos extras eram silenciosamente descartados | Leitura limitada a 64 KiB reais, Content-Type validado e Zod strict no pedido/itens. Nome/preço do prato e total do cliente são rejeitados; observações existentes preservadas |
| S09 | Bloqueante | Next 14 fora de suporte e dependências com avisos altos/críticos | Next 15.5.25 LTS, ESLint correspondente, Vitest 4.1.11 e patches transitivos PostCSS/serialize-javascript; Node 22. Sem troca de stack ou React 18 |
| S10 | Média | Guard de callback incompleto para barras invertidas/controles; redirect do middleware perdia cookies renovados | `safeAuthRedirect` testado e cookies copiados ao redirect; fluxo PKCE preservado |
| S11 | Média, residual | IP/NAT é heurística de abuso, não identidade; quota compartilhada pode limitar uma rede ocupada | Limites configuráveis em constants, teste NAT no E2E. Ataque distribuído/GET de status não é resolvido por essa quota; acompanhar uso no piloto |

### Matriz de RLS e privilégios revisada

| Recurso | Anônimo | Dono autenticado | Outro dono |
| --- | --- | --- | --- |
| establishments | Leitura do cadastro público | CRUD próprio; não transfere owner por UPDATE | Lê dados públicos, não escreve na loja alheia |
| tables | Apenas id, estabelecimento, rótulo, ativo e criação | Lê campos públicos; cria/edita rótulo e ativo; exclui apenas sem pedidos vinculados | Sem escrita alheia; sem tokens |
| categories | Lê ativas | CRUD próprio, inclusive inativas | Só leitura pública |
| menu_items | Lê disponíveis em categoria ativa | CRUD próprio e FK exige categoria da mesma loja | Só leitura pública |
| orders | Sem SELECT/INSERT/UPDATE direto | SELECT próprio e UPDATE das três colunas autorizadas, sujeito a triggers | Sem leitura/escrita alheia |
| order_items | Sem acesso direto | SELECT próprio; sem alteração/exclusão direta | Sem acesso alheio |
| ip_requests | Nenhum acesso | Nenhum acesso direto | Nenhum acesso direto |
| storage.objects/menu-images | Leitura pública | Escrita só sob pasta UUID da loja própria; troca de pasta checa destino | Sem escrita alheia |
| RPCs sessão/pedido/IP | EXECUTE revogado | EXECUTE revogado | EXECUTE revogado |

Service role tem acesso privilegiado exclusivamente no servidor; as RPCs têm
`search_path` fixo. Geolocalização continua sendo entrada spoofável, com cap de
accuracy e fallback manual. O UUID de `/pedido/{id}` é uma credencial de acesso:
não publicar links completos de clientes; RLS pública de pedidos continua vetada.

## Eixo 2 — Dados e consistência

| ID | Severidade | Achado e impacto | Correção/evidência |
| --- | --- | --- | --- |
| D01 | Bloqueante | Migrations nunca executadas e sem verificação reproduzível | 0001–0004 executadas em PostgreSQL 16 isolado; `verify-migrations.sql` e regressões passaram. Integração hospedada permanece pendente externa |
| D02 | Alta | Total e itens eram lidos em statements diferentes; edição concorrente de preço podia divergir snapshot | Uma leitura materializada com locks de itens/categorias alimenta total e itens; soma em bigint validada antes de gravar INTEGER |
| D03 | Alta | Retry após perda de resposta podia duplicar pedido | `request_id` persistente e UNIQUE por mesa, fingerprint de conteúdo e lock; 12 reenvios simultâneos produzem 1 pedido. Conteúdo diferente na mesma chave gera 409 |
| D04 | Alta | Snapshot dependia apenas de restrições de acesso do cliente | Trigger de imutabilidade. Excluir prato anula só sua FK e preserva nome/preço/quantidade; testes executados |
| D05 | Alta | Seed escolhia primeiro usuário e sobrescrevia campos em reexecução | Owner explícito confirmado, transação, proteção de colisões e INSERT DO NOTHING. Seed executado duas vezes, preservando preço alterado entre as execuções |
| D06 | Média | FKs de pedidos por mesa e itens históricos por item sem índices dedicados | `idx_orders_table` e índice parcial `idx_order_items_menu_item` adicionados em 0004 |
| D07 | Média, residual | Tipos manuais não foram gerados do schema Supabase hospedado | Comando de geração com validação de saída no SMOKE_TEST; aplicar genérico Database aos clientes exige conferir joins e RPCs reais |

Aprovado: os índices existentes do kanban `(establishment_id,status,created_at)`,
menu `(establishment_id,sort_order)` e itens por pedido já atendem às consultas
atuais. Não houve criação indiscriminada de índices. Os 25 pares de estados
foram exercitados no SQL; repetir o mesmo estado é permitido e estados terminais
não avançam. As migrations 0001–0003 permanecem intactas, com endurecimento na 0004.

## Eixo 3 — PWA, UX e instalabilidade

| ID | Severidade | Achado e impacto | Correção/evidência |
| --- | --- | --- | --- |
| U01 | Alta | Manifest dependia de SVG placeholder | PNGs 192/512, maskable 512 e Apple 180 gerados por Node sem dependência nova. Manifest/metadata atualizados; arte maskable inspecionada visualmente |
| U02 | Alta | Primeira visita podia instalar SW sem guardar HTML do menu | Preaquecimento explícito do HTML público após controllerchange; SWR só para `/m/{UUID}` e CacheFirst para imagens públicas/assets |
| U03 | Alta | Falha de consulta do kanban podia parecer quadro vazio/Ao vivo; respostas concorrentes podiam sobrescrever estado mais recente | Mensagem persistente de sincronização, indicador derivado também de rede/erro, fila de refetch e invalidação por revisão; operações usam comparação do status e checam linhas afetadas |
| U04 | Média | Controles de 32 px e áudio suspenso sem atualização do indicador | Controles principais de 44 px; estado real do AudioContext e limpeza de osciladores/contexto; sem dependência exclusiva de hover |
| U05 | Média | Carrinho/cache corrompidos e data inválida podiam persistir; nome do cliente aceitava mais que a API | Validação de cache, limite de 60 caracteres na UI, timestamps inválidos/futuros tratados, UUID de tentativa preservado após reload; testes de persistência |
| U06 | Média | Status já carregado podia continuar silencioso quando dispositivo ficava offline | Evento offline agora informa perda da conexão, mantendo o último estado; reconexão revalida |
| U07 | Média, residual | Modais não têm gerenciamento completo de foco/Escape; Android físico e teclado não exercitados | Identificação acessível dos diálogos e roteiro mobile preparados; revisão de foco e testes em aparelho permanecem para o piloto |

Offline é **leitura de menu previamente visitado**, não primeira visita sem
rede nem envio enfileirado. Status exige rede para abrir; áudio depende de gesto
e navegador ativo. Configuração/PNGs aprovados não equivalem a instalação já
comprovada no Android/iOS. A execução F01–F12 do E2E continua necessária.

## Eixo 4 — Performance e manutenibilidade

| ID | Severidade | Achado e impacto | Correção/evidência |
| --- | --- | --- | --- |
| P01 | Alta | Kanban podia truncar silenciosamente na quota de linhas PostgREST | Paginação de 100 com ordenação estável e deduplicação; joins de mesa/itens preservados |
| P02 | Média | Biblioteca QR carregada antes de qualquer download | Import dinâmico de qrcode no download; PNG continua gerado localmente, sem Storage |
| P03 | Média | Falha de busca de estabelecimento/menu/mesas era tratada como inexistência/lista vazia | Erro explícito, boundary de página e tentativa de recuperação; guard permanece server-side |
| P04 | Média | parseCents aceitava expoente/hex e formatos ambíguos | Parse decimal estrito e cálculo de centavos inteiros; regressões de precisão e formatos inválidos |
| P05 | Média | Comandos generate:icons e test:pwa apontavam para arquivo/executor errado; teste SW fora da suíte | Scripts corrigidos e testes PWA incluídos no Vitest; configuração .mts elimina aviso CJS/ESM |
| P06 | Baixa | Constantes de limites/timeouts espalhadas e falta de scanner reproduzível | constants centraliza limites compartilhados; scanner versionado sem imprimir possíveis segredos |
| P07 | Média, residual | Reordenação do menu faz duas escritas independentes; falha parcial pode empatar posições | Não altera preços/pedidos; erro aparece e é possível corrigir no painel. Transação de reordenação é melhoria futura, com ADR próprio |
| P08 | Média, residual | Histórico diário e listas de CRUD/menu ainda dependem da quota máxima PostgREST | Piloto deve permanecer abaixo do limite configurado; ampliar paginação antes de operar catálogos/históricos maiores |
| P09 | Baixa, residual | Troca/falha de upload pode deixar imagem órfã no Storage; onboarding e logo são passos distintos | Cadastro pode ser recuperado no /admin; limpeza de órfãos/manutenção de quota fica registrada, sem excluir assets automaticamente |

Não há N+1 de itens/mesas no carregamento do kanban: uma consulta relaciona
pedidos, itens e mesa por página. Refetch individual por evento é o acelerador
existente. Tamanhos de first load medidos no build Next 15.5.25: menu **193 kB**,
kanban **192 kB**, mesas **188 kB**, status **113 kB**, compartilhado **105 kB**.
Esses números não são medição de latência no celular nem comparação equivalente
com um build anterior. Cache de compilação Webpack emitiu avisos de strings
grandes; não houve erro de build.

## Arquivos/fluxos aprovados sem reescrita

- Auth login/signup/forgot-password, guard server-side, slug, estilos base,
  onboarding e CRUD: arquitetura preservada; ajustes localizados estão listados.
- `money.ts`, `geo.ts`, `cart.ts`, `table-session.ts`, `order-board.ts`: algoritmos
  existentes preservados, com validações pontuais e regressões; geolocalização
  não virou fator de autenticação.
- `schemas/*`, `types/domain.ts`, três clientes Supabase e rotas API: fluxo
  preservado; Zod não aceita preço/nome de prato, apenas IDs/quantidades e notas.
- `useMenu`, `useCart`, `useOrderStatus`, `useOrdersRealtime`, `useOnline`,
  `useGeolocation`, `useNotificationSound`: sem nova biblioteca de estado,
  SWR, WebSocket, Redis ou fila externa.
- `0001_initial_schema.sql`, `0002_table_sessions_geo_confirmation.sql`,
  `0003_storage_bucket.sql`: lidos integralmente e executados em ordem; as
  correções são posteriores, preservando o histórico das migrations.

## Evidências executadas e limites

- Suíte Vitest: **83 testes** (11 arquivos), incluindo regras do SW e Route
  Handler com cliente de banco simulado. Typecheck strict, lint e build passaram.
- Instalação limpa com `npm ci` passou; `npm audit` completo informou **zero
  vulnerabilidades conhecidas** na árvore instalada. Há avisos de depreciação
  em ferramentas legadas (incluindo ESLint 8); atualização de manutenção futura
  não é equivalente a uma vulnerabilidade de produção constatada.
- `npm run verify:build` iniciou e encerrou o servidor de produção local:
  home, manifest, quatro PNGs com dimensões corretas, SW e respostas 400/no-store
  nas três rotas passaram. A variável secreta não aparece no JavaScript cliente;
  scanner de padrões não encontrou segredos nos arquivos versionáveis.
- PostgreSQL 16 real, temporário em loopback: schema auxiliar simula roles,
  `auth.uid`, `auth.users`, Storage e publication. Não executa GoTrue, PostgREST,
  Storage HTTP ou websocket Realtime do Supabase.
- Verificação dos catálogos, regressões SQL de anon/dois donos, 25 transições,
  confirmação, snapshots, FK, sessão expirada, overflow e rollback atômico: passou.
- Concorrência: 12 scans → 1 token; 12 pedidos distintos → 5 aceitos;
  12 retries → 1 pedido; 20 requisições IP com limite 7 → 7 aceitas.
- Seed com owner ausente falhou sem efeito; seed configurado executou e
  reexecutou preservando alteração de preço. A instância temporária foi encerrada.
- Testes remotos, email, dois dispositivos e instalação real: **não executados**.

Reproduzir: `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`,
`npm run scan:secrets`, `npm audit`, `npm run generate:icons`, `npm run build`,
`npm run verify:build`.
No Windows com PostgreSQL 16: `./scripts/test-migrations.ps1`; informe
`-PostgreSqlBin` para outra instalação. O bootstrap recusa bancos fora do nome
de teste e o harness cria/remove somente seu diretório temporário.

## O que impede rodar hoje em Supabase + Vercel reais?

**Para um smoke pessoal:** faltam projeto Supabase, variáveis, URLs de Auth,
deploy HTTPS e execução registrada do roteiro. Não foram fornecidas chaves nem
acesso a esse ambiente. Não restou Bloqueante/Alta de código identificado sem
correção, mas ausência de teste hospedado não permite assegurar “zero falhas”.

**Para operação comercial:** há um impedimento de compatibilidade com a
restrição do projeto: Vercel Hobby é destinado a uso pessoal/não comercial.
Não foi sugerido serviço pago nem trocada hospedagem sem decisão do usuário.
[Condições oficiais do Hobby](https://vercel.com/docs/plans/hobby).

O email padrão Supabase atende apenas endereços da equipe e tem quota restrita;
signup/recuperação para outros donos exigem configuração e entrega verificadas
dentro de custo zero. Criar contas confirmadas manualmente aprova apenas a
parte de RLS, não o fluxo de email. [SMTP oficial](https://supabase.com/docs/guides/auth/auth-smtp).

Referências técnicas: [suporte Next.js](https://nextjs.org/support-policy),
[upgrade Next 15](https://nextjs.org/docs/app/guides/upgrading/version-15),
[headers da borda Vercel](https://vercel.com/docs/headers/request-headers),
[privilégios de coluna Supabase](https://supabase.com/docs/guides/database/postgres/column-level-security),
[cache runtime Workbox](https://developer.chrome.com/docs/workbox/caching-resources-during-runtime).
