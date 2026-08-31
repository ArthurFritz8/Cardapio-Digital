-- ============================================================
-- Cardápio Digital — Schema inicial
-- Migration: 0001_initial_schema
-- Executar no SQL Editor do Supabase (ou via supabase db push)
-- ============================================================

-- ------------------------------------------------------------
-- 1. ENUM: status do pedido (máquina de estados)
--    pending -> preparing -> ready -> delivered
--    pending|preparing -> cancelled
-- ------------------------------------------------------------
create type public.order_status as enum (
  'pending',
  'preparing',
  'ready',
  'delivered',
  'cancelled'
);

-- ------------------------------------------------------------
-- 2. TABELAS
-- ------------------------------------------------------------

-- Estabelecimentos (1 dono -> N estabelecimentos)
create table public.establishments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 50),
  description text check (char_length(description) <= 300),
  logo_url text,
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Mesas (QR Code aponta para /m/{table_id})
create table public.tables (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 30),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (establishment_id, label)
);

-- Categorias do cardápio
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 50),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (establishment_id, name)
);

-- Itens do cardápio (preço SEMPRE em centavos — nunca float p/ dinheiro)
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 300),
  price_cents integer not null check (price_cents >= 0 and price_cents <= 10000000),
  image_url text,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Pedidos
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  table_id uuid not null references public.tables (id) on delete restrict,
  status public.order_status not null default 'pending',
  customer_name text check (char_length(customer_name) <= 60),
  note text check (char_length(note) <= 300),
  total_cents integer not null check (total_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Itens do pedido (snapshot de nome/preço: histórico imune a edições do menu)
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  menu_item_id uuid references public.menu_items (id) on delete set null,
  item_name text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity between 1 and 50),
  note text check (char_length(note) <= 200)
);

-- ------------------------------------------------------------
-- 3. ÍNDICES (consultas do painel do bar e do menu público)
-- ------------------------------------------------------------
create index idx_tables_establishment on public.tables (establishment_id);
create index idx_categories_establishment on public.categories (establishment_id, sort_order);
create index idx_menu_items_establishment on public.menu_items (establishment_id, sort_order);
create index idx_menu_items_category on public.menu_items (category_id);
create index idx_orders_establishment_status on public.orders (establishment_id, status, created_at desc);
create index idx_order_items_order on public.order_items (order_id);
create index idx_establishments_owner on public.establishments (owner_id);

-- ------------------------------------------------------------
-- 4. TRIGGERS
-- ------------------------------------------------------------

-- 4.1 updated_at automático
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_establishments_updated_at
  before update on public.establishments
  for each row execute function public.set_updated_at();

create trigger trg_menu_items_updated_at
  before update on public.menu_items
  for each row execute function public.set_updated_at();

create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- 4.2 Máquina de estados do pedido — enforçada NO BANCO.
--     Transições válidas:
--       pending   -> preparing | cancelled
--       preparing -> ready     | cancelled
--       ready     -> delivered
--       delivered / cancelled  -> (terminais)
create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
as $$
begin
  if old.status = new.status then
    return new;
  end if;

  if (old.status = 'pending'   and new.status in ('preparing', 'cancelled'))
  or (old.status = 'preparing' and new.status in ('ready', 'cancelled'))
  or (old.status = 'ready'     and new.status = 'delivered')
  then
    return new;
  end if;

  raise exception 'INVALID_ORDER_TRANSITION: % -> %', old.status, new.status
    using errcode = 'P0001';
end;
$$;

create trigger trg_orders_status_transition
  before update of status on public.orders
  for each row execute function public.enforce_order_status_transition();

-- ------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.establishments enable row level security;
alter table public.tables enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Helper: usuário logado é dono do estabelecimento?
create or replace function public.is_establishment_owner(est_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.establishments e
    where e.id = est_id and e.owner_id = auth.uid()
  );
$$;

-- 5.1 establishments: leitura pública (menu é público), escrita só do dono
create policy "establishments_public_read"
  on public.establishments for select
  using (true);

create policy "establishments_owner_insert"
  on public.establishments for insert
  with check (auth.uid() = owner_id);

create policy "establishments_owner_update"
  on public.establishments for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "establishments_owner_delete"
  on public.establishments for delete
  using (auth.uid() = owner_id);

-- 5.2 tables: leitura pública (validação do QR), escrita só do dono
create policy "tables_public_read"
  on public.tables for select
  using (true);

create policy "tables_owner_all"
  on public.tables for all
  using (public.is_establishment_owner(establishment_id))
  with check (public.is_establishment_owner(establishment_id));

-- 5.3 categories: leitura pública, escrita só do dono
create policy "categories_public_read"
  on public.categories for select
  using (true);

create policy "categories_owner_all"
  on public.categories for all
  using (public.is_establishment_owner(establishment_id))
  with check (public.is_establishment_owner(establishment_id));

-- 5.4 menu_items: leitura pública, escrita só do dono
create policy "menu_items_public_read"
  on public.menu_items for select
  using (true);

create policy "menu_items_owner_all"
  on public.menu_items for all
  using (public.is_establishment_owner(establishment_id))
  with check (public.is_establishment_owner(establishment_id));

-- 5.5 orders: SEM política para anon (cliente cria pedido via API Route
--     com service_role, após validação server-side — anti-spam e
--     anti-manipulação de preço). Dono lê e atualiza status.
create policy "orders_owner_read"
  on public.orders for select
  using (public.is_establishment_owner(establishment_id));

create policy "orders_owner_update"
  on public.orders for update
  using (public.is_establishment_owner(establishment_id))
  with check (public.is_establishment_owner(establishment_id));

-- 5.6 order_items: dono lê via join com orders
create policy "order_items_owner_read"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and public.is_establishment_owner(o.establishment_id)
    )
  );

-- ------------------------------------------------------------
-- 6. REALTIME: painel do bar escuta novos pedidos / mudanças de status
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.orders;
