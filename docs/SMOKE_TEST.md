# Smoke test — primeiro ambiente hospedado

**Estado deste documento:** roteiro preparado em 10/09/2026; execução no Supabase hospedado, deploy Vercel e testes em aparelhos ainda precisam ser registrados. Resultados de testes locais constam no ADR 0006. Não marcar itens por inferência a partir do build.

Use um projeto de teste, com dados sintéticos e duas contas controladas pelo desenvolvedor. Não execute seed nem testes de mutação em um estabelecimento em operação.

## 1. Condições externas antes de começar

- [ ] Confirmar que este deploy é uma demonstração pessoal, sem operação comercial. O Hobby gratuito da Vercel restringe uso comercial; operar pedidos reais para um restaurante conflita com essa condição. Resolver essa restrição é uma decisão pendente antes de produção, sem pressupor plano pago. [Documentação oficial do Hobby](https://vercel.com/docs/plans/hobby).
- [ ] Criar projeto Supabase gratuito, escolher região próxima dos dispositivos e aguardar o banco ficar disponível. Manter URL/chaves em configuração local e no painel de deploy.
- [ ] Definir como testar email: o SMTP padrão só entrega a membros da equipe do projeto e limita os envios (dois por hora na consulta de 10/09/2026). Para teste de RLS é possível criar contas de teste confirmadas em Authentication → Users; isso **não aprova** signup, confirmação nem recuperação por email. Cadastros reais precisam de SMTP compatível com custo zero e entrega verificada. [SMTP do Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

## 2. Aplicar migrations em ordem

No SQL Editor, abra cada arquivo completo, execute e registre o resultado antes do seguinte. Não execute apenas trechos. Em banco vazio, as migrations iniciais são executadas uma vez; não são scripts de reparo idempotentes.

| Ordem | Arquivo | Garantias principais |
| --- | --- | --- |
| 1 | [0001_initial_schema.sql](../supabase/migrations/0001_initial_schema.sql) | Seis tabelas de negócio, cinco estados, FKs, RLS, índices e Realtime em `orders` |
| 2 | [0002_table_sessions_geo_confirmation.sql](../supabase/migrations/0002_table_sessions_geo_confirmation.sql) | Sessão de mesa, geolocalização, confirmação por flag e RPC de pedido |
| 3 | [0003_storage_bucket.sql](../supabase/migrations/0003_storage_bucket.sql) | Bucket público `menu-images`, 2 MB, escrita por dono |
| 4 | [0004_audit_hardening.sql](../supabase/migrations/0004_audit_hardening.sql) | Grants mínimos, integridade entre estabelecimentos, confirmação obrigatória, snapshots, idempotência e rate limit por IP |

Se houver erro, registre SQLSTATE/mensagem/arquivo e interrompa a sequência. Não desative RLS, triggers ou constraints para concluir a execução. Se sua sessão SQL ficou em transação abortada, execute `rollback;` antes de diagnosticar. Em um projeto parcialmente migrado, inspecione o estado antes de decidir qual migration falta; não recrie tabelas com dados.

Execute [scripts/verify-migrations.sql](../scripts/verify-migrations.sql) **após a 0004** e guarde a saída. O script verifica catálogos, privilégios, RLS, triggers, funções, índices, constraints, bucket e publication, e falha quando uma garantia não existe. Ele não substitui testes de RLS via PostgREST, eventos Realtime ou upload no Storage real.

Confirme também no Dashboard que `public.orders` está na publication `supabase_realtime`. As tabelas de limites e os itens dos pedidos não precisam de Realtime. Não habilite publicação de todas as tabelas.

O estado final mantém `pending`, `preparing`, `ready`, `delivered`, `cancelled`. A coluna visual “Aguardando confirmação” corresponde a `pending && needs_confirmation && confirmed_at is null`, sem sexto estado.

### SQL Editor e histórico do CLI

Executar SQL manualmente não registra automaticamente versões na tabela de histórico de migrations do CLI. Neste roteiro, continue usando o SQL Editor com registro dos arquivos aplicados. Antes de adotar `supabase db push` no mesmo projeto, reconcilie o histórico com `supabase migration list`/`migration repair` somente após conferir cada versão aplicada. Não rode `db push` sobre banco já migrado manualmente esperando que ele reconheça o SQL. [Gerenciamento de migrations](https://supabase.com/docs/reference/cli/supabase-migration-repair).

## 3. Ambiente local e build

Copie `.env.example` para `.env.local` e configure:

| Variável | Valor | Exposição |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto de teste | Pública |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave `anon` do mesmo projeto | Pública, sujeita a grants/RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave `service_role` do mesmo projeto | Secreta, só servidor |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` local; URL HTTPS definitiva no deploy | Pública, usada no QR |

Use as chaves correspondentes aos nomes configurados; uma chave de administração nunca substitui a anon no navegador. Não copie `.env.local`, JWTs ou URLs de recuperação para relatório de bug. O validador de env é lazy: build sem erro não significa que as chaves de runtime estejam configuradas.

```powershell
npm ci
npm run test
npm run typecheck
npm run lint
npm run build
npm run start
```

- [ ] Registrar versão do Node (`node --version`), commit (`git rev-parse HEAD`) e saídas dos checks.
- [ ] Verificar `npm audit --omit=dev` e registrar qualquer vulnerabilidade de produção pendente.
- [ ] Abrir `/login` e uma rota pública para exercitar env e conexão real.

## 4. Configurar Auth e preparar as contas

Em Authentication → URL Configuration, configure Site URL com a origem usada no teste. Na lista de redirects, inclua a URL de callback da origem e os destinos usados pelo código, por exemplo:

```text
http://localhost:3000/auth/callback
http://localhost:3000/auth/callback?next=/onboarding
http://localhost:3000/auth/callback?next=/reset-password
https://SEU-APP.vercel.app/auth/callback
https://SEU-APP.vercel.app/auth/callback?next=/onboarding
https://SEU-APP.vercel.app/auth/callback?next=/reset-password
```

Substitua a origem do exemplo pela real; não libere domínios arbitrários. Abra o email de confirmação/recuperação no mesmo navegador/perfil que iniciou o fluxo PKCE. [Redirects de Auth](https://supabase.com/docs/guides/auth/redirect-urls).

Prepare:

- **Conta A:** dona do estabelecimento sintético do seed; ainda sem estabelecimento.
- **Conta B:** outro usuário confirmado, com seu próprio estabelecimento criado por `/onboarding`.
- **Cliente:** navegador sem login. Não usar a sessão da Conta A para testar acesso anônimo.

O signup, a recuperação de senha e a troca de senha devem ser exercitados separadamente mesmo se as contas A/B forem criadas pelo Dashboard para evitar o limite de email no smoke inicial. Registrar esses itens como pendentes até o email realmente chegar e o callback concluir.

## 5. Seed explícito e reexecutável

Abra [SEED.sql](SEED.sql), cópia idêntica de [supabase/seed.sql](../supabase/seed.sql). No SQL que será executado, substitua `v_owner uuid := null` pelo UUID da **Conta A**, copiado de Authentication → Users. Não escolha “primeiro usuário”, não use email de cliente real e não versione IDs de ambiente no arquivo canônico.

- [ ] Executar o arquivo completo após as quatro migrations. Sem escolha de dono, o seed deve falhar com `SEED_OWNER_REQUIRED` sem inserir dados.
- [ ] Verificar contagens iniciais: 1 estabelecimento, 2 categorias, 4 itens, 3 mesas.
- [ ] Reexecutar: as contagens permanecem e nenhum dado é sobrescrito. Se um nome/preço/estado foi alterado no admin, a alteração permanece.
- [ ] Um dono com outro estabelecimento ou IDs reservados usados por outro negócio deve abortar a transação; não contornar a proteção.
- [ ] Entrar como Conta A no `/admin`; configurar “Usar minha localização” no local dos testes e salvar. O seed deixa coordenadas nulas para não simular São Paulo em outro local; sem coordenadas, a triagem geo está desligada e negar GPS não exige confirmação.
- [ ] Enviar uma foto pelo admin para testar compressão e Storage. O seed não cria imagem, pedido ou token de sessão.

Mesa 1 do seed: `/m/00000000-0000-4000-a000-000000000030`. Os rótulos são `1`, `2`, `3`; a UI acrescenta “Mesa”. Os valores iniciais permitem conferir 2 chopps + 1 refrigerante = 3.200 centavos (R$ 32,00).

## 6. Gerar os tipos do schema hospedado

Depois de aplicar todas as migrations, autentique o CLI e gere os tipos do schema **do projeto de teste**. Isso exige acesso ao projeto, mas não exige Docker nem a `service_role` no comando. [Geração oficial de tipos](https://supabase.com/docs/guides/api/rest/generating-types).

```powershell
npx supabase login
npx supabase init
$smokeProjectRef = 'SEU_PROJECT_REF'
$smokeTypes = @(npx supabase gen types typescript --project-id $smokeProjectRef --schema public)
if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar tipos: arquivo existente preservado.' }
if (($smokeTypes -join "`n") -notmatch 'export type Database') { throw 'Saída de tipos inválida.' }
$smokeTypes | Set-Content -LiteralPath 'src/types/supabase.ts' -Encoding utf8
npm run typecheck
```

Execute `supabase init` apenas se `supabase/config.toml` ainda não existir. O `project-ref` é o identificador no Dashboard, não a URL nem uma chave. A validação da saída antes da gravação evita truncar um arquivo válido quando login/rede falha. Não execute `db reset` contra ambiente com dados para gerar tipos.

Compare `Tables`, `Enums` e `Functions` gerados com `src/types/domain.ts` e com as chamadas RPC. A 0004 acrescenta o parâmetro `p_request_id` de `create_order` e a função `consume_ip_rate_limit`. Gerar o arquivo por si só não tipa automaticamente os clientes: a integração do genérico `Database` deve passar por typecheck e revisão das queries/relacionamentos. Registre divergências como bug; não edite tipos gerados para esconder incompatibilidade.

## 7. Deploy de demonstração na Vercel

Importe o repositório, selecione Next.js e use o build convencional. Não é necessário `output: standalone`. Configure as quatro variáveis antes do build; selecione explicitamente o ambiente do deploy. Previews devem usar dados de teste.

No primeiro deploy, obtenha o domínio atribuído, configure `NEXT_PUBLIC_APP_URL=https://SEU-APP.vercel.app`, atualize Site URL/redirects de Auth e **faça novo deploy**. Valores `NEXT_PUBLIC_*` são embutidos no bundle durante o build; QR Codes baixados antes dessa correção precisam ser gerados novamente. [Variáveis públicas no Next.js](https://nextjs.org/docs/app/guides/environment-variables#bundling-environment-variables-for-the-browser).

- [ ] HTTPS válido, página pública acessível sem autenticação da plataforma, APIs respondendo com JSON.
- [ ] `manifest.webmanifest` e ícones PNG retornam HTTP 200; dimensões 192/512 e maskable correto.
- [ ] Confirmar o projeto Supabase nas requisições de rede e ausência da chave secreta em JS/HTML.
- [ ] Abrir dois dispositivos na URL definitiva, baixar o QR e escanear pelo celular.
- [ ] Executar o [E2E_CHECKLIST.md](E2E_CHECKLIST.md), incluindo os testes de RLS, repetição de pedido, IP/NAT, som e offline.

O Service Worker só é gerado no modo de produção. Também é possível testar `npm run build` + `npm run start` em `http://localhost`; para outro aparelho, use o deploy HTTPS. HTTP por IP da rede local não equivale a uma origem segura para PWA/geolocalização.

## 8. Registro de saída e liberação

Copie esta tabela para `docs/smoke-runs/AAAA-MM-DD.md` ao executar. Não preencher “passou” sem evidência.

| Campo | Estado inicial |
| --- | --- |
| Responsável/data, commit, Node e navegadores | A preencher na execução |
| Projeto de teste e URL de demonstração | A preencher, sem chaves/tokens |
| Migrations 0001–0004 no Supabase | Pendente |
| Saída de `verify-migrations.sql` hospedado | Pendente |
| RLS duas contas + cliente anônimo + Storage | Pendente |
| Tipos gerados do schema hospedado e revisados | Pendente |
| Email signup/recuperação PKCE | Pendente |
| QR → pedido → kanban → cliente, dois dispositivos | Pendente |
| Android instalável, som, reconexão e offline | Pendente |
| Bugs Bloqueante/Alta abertos | A preencher com links |
| Condições Vercel gratuita para uso pretendido | Restrição comercial identificada |

**O que impede rodar hoje em Supabase + Vercel reais?** Ainda faltam projeto/chaves/URLs configurados e a execução deste roteiro no ambiente hospedado; a integração não foi comprovada apenas pela auditoria local. Para operação comercial, há também o conflito com Hobby e a entrega SMTP para contas reais. O repositório fornece os passos para eliminar pendências técnicas, sem declarar resolvidas condições externas que continuam abertas.

Se houver Bloqueante/Alta, registrar em [BUG_TEMPLATE.md](BUG_TEMPLATE.md), corrigir com ADR e repetir o trecho afetado mais o fluxo principal antes de liberar. Um rollback de frontend deve usar versão compatível com o schema aplicado; não reverta as proteções SQL para recuperar um deploy antigo.
