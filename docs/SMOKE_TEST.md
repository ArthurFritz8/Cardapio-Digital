# Smoke Test — validação das migrations e do deploy

Roteiro para o primeiro deploy real (Supabase + Vercel). Rodar **na ordem**.
Nenhuma feature nova — o objetivo é descobrir bugs antes de continuar.

## 1. Criar o projeto Supabase

1. [supabase.com](https://supabase.com) → New Project (free tier).
2. Região: `sa-east-1` (São Paulo) — latência menor para o público-alvo.
3. Guardar a senha do banco (não é usada pelo app, mas pelo CLI).

## 2. Rodar as migrations (SQL Editor, uma por vez, na ordem)

| Ordem | Arquivo | O que cria |
|---|---|---|
| 1 | `supabase/migrations/0001_initial_schema.sql` | 6 tabelas, enum, triggers, RLS, índices |
| 2 | `supabase/migrations/0002_table_sessions_geo_confirmation.sql` | Sessão de mesa, geo, RPCs atômicas |
| 3 | `supabase/migrations/0003_storage_bucket.sql` | Bucket `menu-images` + policies |

> Cada arquivo em uma execução separada. Se uma falhar, **não** rodar a próxima.

### Verificação da 0001

```sql
-- 6 tabelas criadas?
select tablename from pg_tables where schemaname = 'public' order by 1;
-- esperado: categories, establishments, menu_items, order_items, orders, tables

-- Enum com os 5 status?
select enum_range(null::public.order_status);
-- esperado: {pending,preparing,ready,delivered,cancelled}

-- RLS habilitada em TODAS as tabelas? (rowsecurity = true em todas)
select tablename, rowsecurity from pg_tables where schemaname = 'public';

-- Triggers ativos (updated_at + máquina de estados)?
select event_object_table, trigger_name
from information_schema.triggers where trigger_schema = 'public';

-- Policies criadas?
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' order by tablename;
-- orders/order_items NÃO devem ter policy para anon (só owner)

-- Helper do owner existe e retorna false sem login?
select public.is_establishment_owner(gen_random_uuid());
-- esperado: false

-- Máquina de estados bloqueia transição inválida?
-- (rodar só depois de existir um pedido; deve dar ERRO)
-- update public.orders set status = 'delivered' where status = 'pending';
```

### Verificação da 0002

```sql
-- Colunas de sessão em tables?
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'tables'
  and column_name like 'session%';
-- esperado: session_token, session_expires_at

-- Colunas de geo em establishments?
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'establishments'
  and column_name in ('latitude', 'longitude', 'order_radius_meters');

-- Colunas de confirmação em orders?
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'orders'
  and column_name in ('needs_confirmation', 'confirmed_at');

-- RPCs existem?
select p.proname from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('start_table_session', 'create_order');

-- CRÍTICO: anon NÃO pode executar as RPCs (REVOKE aplicado)?
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public' and routine_name = 'create_order';
-- esperado: NENHUMA linha com grantee anon/authenticated/public
```

### Verificação da 0003

```sql
-- Bucket criado, público, 2MB, mimetypes certos?
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'menu-images';

-- Policies de escrita por dono?
select policyname, cmd from pg_policies where schemaname = 'storage';
```

### Verificação do Realtime

```sql
-- orders na publication (painel do dono depende disso)?
select schemaname, tablename from pg_publication_tables
where pubname = 'supabase_realtime';
-- esperado: public.orders
```

> Se `orders` não aparecer, ativar em Database → Replication → supabase_realtime.

## 3. Auth (Dashboard → Authentication)

- [ ] Email provider habilitado (confirmação de email ligada).
- [ ] **URL Configuration → Site URL** = URL da Vercel (após o deploy).
- [ ] **Redirect URLs**: adicionar `https://SEU-APP.vercel.app/auth/callback`
      (e `http://localhost:3000/auth/callback` para dev).

## 4. Seed de teste

Rodar `supabase/seed.sql` no SQL Editor **depois de criar a conta via
signup no app** (o seed vincula o estabelecimento ao primeiro usuário do
auth — sem usuário, ele avisa e não faz nada). É idempotente: pode rodar
de novo sem duplicar.

## 5. Deploy na Vercel

1. Import do repositório GitHub (framework: Next.js, defaults servem —
   **não** precisa de `output: standalone`, isso é para Docker).
2. Environment Variables (Production + Preview):

| Variável | Origem | Exposição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Dashboard → Settings → API | pública |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | idem (anon/public key) | pública (protegida por RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | idem (service_role) | **SECRETA — nunca `NEXT_PUBLIC_`** |
| `NEXT_PUBLIC_APP_URL` | URL final da Vercel | pública (gera os QR Codes) |

3. **Armadilha do `NEXT_PUBLIC_APP_URL`**: no primeiro deploy você ainda
   não sabe a URL. Deploy → copiar a URL → setar a variável → **redeploy**
   (variáveis `NEXT_PUBLIC_` são embutidas no build). QR Codes baixados
   antes disso apontam para a URL errada.
4. PWA: o service worker só existe em produção (`disable` em dev) — o
   teste de cache offline só vale no deploy da Vercel, não no localhost.

## 6. Fluxo ponta a ponta

Seguir [E2E_CHECKLIST.md](E2E_CHECKLIST.md) com dois dispositivos.
Bugs encontrados → [BUG_TEMPLATE.md](BUG_TEMPLATE.md).
