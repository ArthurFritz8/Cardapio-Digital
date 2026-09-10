# Cardápio Digital

PWA para o cliente consultar o cardápio pelo QR Code da mesa, enviar pedidos e acompanhar o status. O dono cadastra o estabelecimento e opera os pedidos em um kanban no Android.

Next.js (App Router), TypeScript strict, Tailwind CSS, Supabase (PostgreSQL, Auth, Storage e Realtime), Zod, Lucide React e `@ducanh2912/next-pwa`. Sem Docker, Redis ou serviço de filas.

## Primeiro deploy de fumaça

O roteiro executável está em [docs/SMOKE_TEST.md](docs/SMOKE_TEST.md). A validação no Supabase hospedado, na Vercel e em dois dispositivos precisa ser registrada; um build local não comprova essa integração.

1. Crie um projeto Supabase de teste e execute **0001, 0002, 0003 e 0004**, em ordem, da pasta [supabase/migrations](supabase/migrations/).
2. Execute [scripts/verify-migrations.sql](scripts/verify-migrations.sql) após a última migration.
3. Copie `.env.example` para `.env.local` e preencha as quatro variáveis. `SUPABASE_SERVICE_ROLE_KEY` é exclusiva do servidor.
4. Execute os comandos abaixo. Para o PWA, use o build de produção; `npm run dev` desabilita o Service Worker.
5. Configure as URLs de Auth e a URL pública final antes de gerar os QR Codes. Execute [E2E_CHECKLIST.md](docs/E2E_CHECKLIST.md), inclusive isolamento RLS entre duas contas.

```powershell
npm ci
npm run test
npm run typecheck
npm run lint
npm run build
npm run start
```

Para desenvolver, use `npm run dev`. Não é necessário executar Supabase local ou instalar Docker: migrations e geração dos tipos podem usar o projeto hospedado.

O seed é opcional: [supabase/seed.sql](supabase/seed.sql), também disponível em [docs/SEED.sql](docs/SEED.sql), exige o UUID de uma conta de teste escolhida explicitamente. Não seleciona usuários automaticamente nem sobrescreve dados existentes.

## Limites para uso real

O plano gratuito Hobby da Vercel é destinado a uso pessoal e não comercial. **Operar pedidos de um restaurante comercial conflita com essa condição**; a restrição de manter Vercel gratuita precisa ser resolvida antes dessa operação. O roteiro contempla uma demonstração pessoal sem vendas, sem recomendar contratação paga. [Condições do Hobby](https://vercel.com/docs/plans/hobby).

O SMTP padrão do Supabase é limitado a endereços da equipe do projeto e, na documentação consultada em 10/09/2026, a dois emails por hora. Testar RLS com usuários confirmados no Dashboard não comprova entrega de email de cadastro/recuperação para clientes reais. Esse fluxo exige uma configuração SMTP compatível com a restrição de custo zero antes de abrir cadastros. [SMTP do Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

## Fluxos preservados

- Dinheiro em `INTEGER` centavos; preços e nomes do pedido são resolvidos no banco. O carrinho mostra um valor estimado.
- QR Code usa `table_id` estável. A sessão rotativa tem duração de duas horas e é obtida por `POST /api/tables/[tableId]/session`.
- Pedidos entram por `POST /api/orders`, com Zod e RPC atômica exclusiva do servidor.
- Estados: `pending → preparing → ready → delivered`; cancelamento permitido a partir de `pending`/`preparing`. `delivered` e `cancelled` são terminais.
- Confirmação manual usa `needs_confirmation` e `confirmed_at`; não existe `pending_manual_confirm` no enum. A geolocalização é heurística.
- Dono: Supabase Realtime, refetch na reconexão e polling de segurança de 30 segundos. Ações usam cliente autenticado + RLS + trigger.
- Cliente: consulta de status por URL de acesso ao pedido e polling de cinco segundos; RLS de `orders` continua fechada para anônimos. Guarde esse link como comprovante de acompanhamento.
- Menu previamente visitado funciona offline; envio exige conexão. Carrinho com TTL de quatro horas e isolamento por mesa em `cd.cart.{tableId}`.

## Documentação e verificações

| Arquivo | Uso |
| --- | --- |
| [docs/SMOKE_TEST.md](docs/SMOKE_TEST.md) | Preparar banco, Auth, ambiente, tipos e deploy |
| [scripts/verify-migrations.sql](scripts/verify-migrations.sql) | Validar invariantes do schema após as migrations |
| [docs/E2E_CHECKLIST.md](docs/E2E_CHECKLIST.md) | Testar dois dispositivos, duas contas, PWA e regressões |
| [docs/BUG_TEMPLATE.md](docs/BUG_TEMPLATE.md) | Registrar falha, severidade, reprodução e evidências |
| [docs/ADR](docs/ADR/) | Decisões O.C.S.P.; ADR 0006 consolida a auditoria |

A geração dos tipos reais com `npx supabase gen types typescript --project-id ... --schema public` está descrita no smoke test. Só trate o schema como validado no ambiente hospedado depois de registrar o resultado da verificação SQL e do E2E.
