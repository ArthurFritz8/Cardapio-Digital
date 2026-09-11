# ADR 0006 — Smoke test e auditoria geral pré-deploy

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

---

## Complemento O.C.S.P. — auditoria de 10/09/2026

**Status:** aceito; implementação local verificada, smoke hospedado pendente.
O registro original acima é preservado como histórico. O ADR 0007 detalha
o hardening já commitado; este complemento consolida os quatro eixos pedidos
sem renumerar ou apagar decisões anteriores.

### Objetivo

Preparar o repositório para o primeiro deploy de demonstração, corrigindo
achados Bloqueantes/Altos com mudanças incrementais e entregando roteiro,
seed, relatório por severidade e verificação reproduzível do banco.

### Contexto

A base real tinha 36 testes, não 13; os roteiros e este ADR já existiam.
As três migrations ainda não tinham evidência de execução hospedada. Foram
encontradas exposição de sessão por leitura de colunas, permissões amplas de
UPDATE, falta de confirmação obrigatória no banco, inconsistência potencial
de snapshot e duplicação por retry, cache privado no SW e dependências vulneráveis.
O relatório [AUDIT_REPORT.md](../AUDIT_REPORT.md) identifica cada achado,
severidade, correção e pendência.

### Solução

1. Migration 0004 após as originais: privilégios mínimos, FKs compostas,
   triggers de proteção, RPCs com locks, snapshot único e idempotência;
   limite por IP em tabela privada sem Realtime ou serviço externo.
2. Next 15.5.25 e Vitest 4.1.11 corrigidos, React 18 e App Router preservados.
   `cookies()`/`params` assíncronos; marcador `server-only` e env secreto
   separado. Overrides de PostCSS/serialize-javascript eliminam alertas
   transitivos, mantendo o plugin PWA. Node 22 documentado em engines.
3. `request_id` obrigatório na API e persistido no cliente: retry/timeout
   recupera o mesmo pedido; mesma chave com conteúdo diferente gera 409.
   Sessão expirada renova uma vez; não se adiciona fila offline de pedidos.
4. Cache permitido só para shell público, assets e imagens; respostas de
   API são privadas/no-store. Ícones PNG e maskable produzidos sem biblioteca
   nova por `scripts/generate-pwa-icons.mjs`.
5. Kanban mantém as três camadas existentes, com erros visíveis, paginação,
   serialização e proteção contra resposta atrasada. Comparação do status no
   UPDATE detecta alteração concorrente/RLS com zero linhas afetadas.
6. `scripts/verify-migrations.sql`, regressões SQL, harness PostgreSQL local
   e testes concorrentes. Seed exige owner explícito; `supabase/seed.sql`
   permanece a única fonte de INSERTs. `docs/SEED.sql` contém guia/conferência,
   respeitando a remoção prévia da cópia duplicada no commit `04be486`.
7. Roteiros SMOKE_TEST, E2E_CHECKLIST e BUG_TEMPLATE preenchidos; comandos
   generate:icons/test:pwa reparados e teste do SW integrado à suíte.

### Vetos e impactos de comportamento

- **Sexto estado e cancelar em qualquer estado — vetados:** conflitam com
  ADRs 0002/0004/0005 e trigger existente. “Aguardando confirmação” continua
  projeção da flag em pending, com cancelamento apenas antes de ready.
- **Realtime anônimo — vetado:** exigiria abrir acesso aos pedidos.
  Cliente mantém polling 5 s; dono mantém Realtime + refetch + polling 30 s.
- **Reescrita geral, infraestrutura externa e serviços pagos — vetados:**
  ajustes limitados aos achados. Não se introduzem Docker, Redis ou nova lib SWR.
- **Cache genérico — removido:** admin, auth e acompanhamento não são
  disponibilizados offline pelo SW. Só menu previamente visitado e imagens
  armazenadas têm garantia de leitura offline; envio exige rede.
- **Escritas amplas em pedidos — removidas:** clientes diretos antigos que
  alterem total/mesa/flag ou leiam `tables.*` deixam de funcionar. Queries do
  app foram adequadas; aplicar SQL antes do frontend compatível, sem reabrir grants.
- **Validação permissiva — restringida:** preços/nomes de pratos extras,
  itens repetidos, corpo acima de 64 KiB e formatos monetários ambíguos são
  recusados. Inputs legítimos anteriores de IDs/quantidades/observações continuam.
- **“Todas as constantes” como todo literal — corrigido:** limites e tempos
  compartilhados de domínio ficam em constants.ts; estilos, desenho do ícone,
  matemática e regras SQL de migrations permanecem nos módulos apropriados.
  Mover CSS/números matemáticos para um módulo global criaria acoplamento inútil.
- **“Zero bloqueantes em produção” sem ambiente real — vetado:** testes locais
  não atestam PostgREST, Auth, Storage HTTP, Realtime ou Android. Vercel Hobby
  restringe uso comercial e o SMTP padrão não atende signup público geral;
  as restrições de custo/hospedagem não foram silenciosamente alteradas.

### Prevenção e evidências

- `npm ci`, `npm test`, typecheck strict, lint, scanner de segredos, auditoria
  de dependências e build de produção são as travas reproduzíveis.
- **83 testes em 11 arquivos**: dinheiro, geo, carrinho/cache, estados, fila,
  persistência de tentativa, schemas, HTTP/rate headers, Route Handler simulado
  e política de cache do SW. Os testes PWA antes excluídos agora são executados.
- **PostgreSQL 16 local:** migrations 0001–0004, verificador e regressões de
  anon/dois donos, FKs, snapshots e 25 transições passaram. Schemas auxiliares
  simulam contratos Supabase; nenhum banco remoto foi acessado.
- **Concorrência:** 12 scans compartilharam 1 token; 12 pedidos respeitaram
  limite 5; 12 retries criaram 1 pedido; quota 7 aceitou 7 de 20 solicitações.
  Seed sem owner falhou; execução/reexecução com owner manteve preço editado.
- PNG maskable inspecionado visualmente; compilação gera SW e manifest.
  Instalação efetiva, som e UX em dois dispositivos são checks do smoke.
- Instalação limpa pelo lockfile passou e `npm audit` completo retornou zero
  vulnerabilidades conhecidas. Smoke HTTP do build passou para home, manifest,
  quatro PNGs, SW e validação/no-store das três rotas. Scanner e inspeção do JS
  cliente não encontraram os padrões de segredo verificados.
- Não reverter grants/triggers para resolver erro de deploy. Restaurar apenas
  frontend compatível e registrar bugs conforme o template; SQL de teste roda
  exclusivamente em ambiente descartável, encerrado e removido pelo harness.

### Pendências restantes

Projeto Supabase e env/URLs, migrations hospedadas, geração e integração dos
tipos oficiais, SMTP/PKCE real, deploy HTTPS e E2E em dois aparelhos continuam
pendentes do desenvolvedor. Para operação comercial, resolver incompatibilidade
com Vercel Hobby dentro do custo zero. Melhorias Médias/Baixas (paginação de
histórico/catálogo grande, transação de reordenação, foco dos modais e limpeza
de imagens órfãs) estão explicitadas no relatório; nenhuma é apresentada como
teste aprovado ou implementada sem necessidade.

Referências: [Hobby Vercel](https://vercel.com/docs/plans/hobby),
[SMTP Supabase](https://supabase.com/docs/guides/auth/auth-smtp),
[suporte Next.js](https://nextjs.org/support-policy).
