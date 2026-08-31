-- ============================================================
-- Cardápio Digital — Sessão de mesa + triagem geo + confirmação
-- Migration: 0002_table_sessions_geo_confirmation
-- Depende de: 0001_initial_schema.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. COLUNAS NOVAS
-- ------------------------------------------------------------

-- Coordenadas do estabelecimento (nullable = triagem geo desligada)
alter table public.establishments
  add column latitude double precision check (latitude between -90 and 90),
  add column longitude double precision check (longitude between -180 and 180),
  add column order_radius_meters integer not null default 150
    check (order_radius_meters between 30 and 1000);

-- Sessão da mesa (token rotativo com expiração)
alter table public.tables
  add column session_token uuid,
  add column session_expires_at timestamptz;

-- Flag de verificação ORTOGONAL à máquina de estados (pedido segue 'pending';
-- painel exibe badge enquanto needs_confirmation = true e confirmed_at é null)
alter table public.orders
  add column needs_confirmation boolean not null default false,
  add column confirmed_at timestamptz;

-- Índice parcial para o rate limit por mesa (count de pedidos ativos)
create index idx_orders_table_active on public.orders (table_id)
  where status in ('pending', 'preparing');

-- ------------------------------------------------------------
-- 2. FUNÇÃO: iniciar/reusar sessão da mesa (atômica, sem corrida
--    entre dois clientes escaneando o mesmo QR simultaneamente)
-- ------------------------------------------------------------
create or replace function public.start_table_session(
  p_table_id uuid,
  p_session_hours integer default 2
)
returns table (session_token uuid, session_expires_at timestamptz, establishment_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_session_hours not between 1 and 24 then
    raise exception 'VALIDATION';
  end if;

  if not exists (
    select 1 from public.tables t
    where t.id = p_table_id and t.is_active
  ) then
    raise exception 'TABLE_NOT_FOUND';
  end if;

  return query
  update public.tables t
  set session_token = case
        when t.session_token is null
          or t.session_expires_at is null
          or t.session_expires_at < now()
        then gen_random_uuid()
        else t.session_token
      end,
      session_expires_at = case
        when t.session_token is null
          or t.session_expires_at is null
          or t.session_expires_at < now()
        then now() + make_interval(hours => p_session_hours)
        else t.session_expires_at
      end
  where t.id = p_table_id
  returning t.session_token, t.session_expires_at, t.establishment_id;
end;
$$;

-- ------------------------------------------------------------
-- 3. FUNÇÃO: criação ATÔMICA de pedido (supabase-js não tem
--    transação multi-statement — sem isso, order_items falhando
--    deixaria pedido órfão). Preços/nomes resolvidos AQUI, do
--    banco — payload do cliente traz apenas IDs e quantidades.
-- ------------------------------------------------------------
create or replace function public.create_order(
  p_table_id uuid,
  p_session_token uuid,
  p_items jsonb,
  p_customer_name text default null,
  p_note text default null,
  p_needs_confirmation boolean default false,
  p_max_active_orders integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table public.tables%rowtype;
  v_is_open boolean;
  v_active_count integer;
  v_total integer;
  v_order_id uuid := gen_random_uuid();
begin
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'VALIDATION';
  end if;

  -- FOR UPDATE serializa pedidos simultâneos da mesma mesa:
  -- rate limit sem corrida (TOCTOU)
  select * into v_table
  from public.tables
  where id = p_table_id and is_active
  for update;

  if not found then
    raise exception 'TABLE_NOT_FOUND';
  end if;

  select e.is_open into v_is_open
  from public.establishments e
  where e.id = v_table.establishment_id;

  if not v_is_open then
    raise exception 'ESTABLISHMENT_CLOSED';
  end if;

  if v_table.session_token is null
     or v_table.session_expires_at is null
     or v_table.session_token <> p_session_token
     or v_table.session_expires_at < now() then
    raise exception 'SESSION_EXPIRED';
  end if;

  select count(*) into v_active_count
  from public.orders o
  where o.table_id = p_table_id and o.status in ('pending', 'preparing');

  if v_active_count >= p_max_active_orders then
    raise exception 'TABLE_ORDER_LIMIT';
  end if;

  -- Todos os itens devem existir, estar disponíveis e pertencer
  -- ao MESMO estabelecimento da mesa (anti item de outro bar)
  if exists (
    select 1
    from jsonb_array_elements(p_items) elem
    left join public.menu_items mi
      on mi.id = (elem->>'menu_item_id')::uuid
     and mi.establishment_id = v_table.establishment_id
     and mi.is_available
    where mi.id is null
  ) then
    raise exception 'ITEM_UNAVAILABLE';
  end if;

  select sum(mi.price_cents * (elem->>'quantity')::integer)
  into v_total
  from jsonb_array_elements(p_items) elem
  join public.menu_items mi on mi.id = (elem->>'menu_item_id')::uuid;

  insert into public.orders
    (id, establishment_id, table_id, status, customer_name, note, total_cents, needs_confirmation)
  values
    (v_order_id, v_table.establishment_id, p_table_id, 'pending',
     nullif(trim(p_customer_name), ''), nullif(trim(p_note), ''),
     v_total, p_needs_confirmation);

  insert into public.order_items
    (order_id, menu_item_id, item_name, unit_price_cents, quantity, note)
  select
    v_order_id, mi.id, mi.name, mi.price_cents,
    (elem->>'quantity')::integer,
    nullif(trim(elem->>'note'), '')
  from jsonb_array_elements(p_items) elem
  join public.menu_items mi on mi.id = (elem->>'menu_item_id')::uuid;

  return jsonb_build_object(
    'id', v_order_id,
    'status', 'pending',
    'needs_confirmation', p_needs_confirmation,
    'total_cents', v_total
  );
end;
$$;

-- ------------------------------------------------------------
-- 4. SEGURANÇA: funções em public são expostas via PostgREST
--    com EXECUTE para todos por padrão. REVOKE obriga o fluxo
--    a passar pela API Route (service_role) — sem isso, anon
--    chamaria create_order via RPC pulando validação e rate limit.
-- ------------------------------------------------------------
revoke execute on function public.start_table_session(uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.create_order(uuid, uuid, jsonb, text, text, boolean, integer)
  from public, anon, authenticated;

grant execute on function public.start_table_session(uuid, integer) to service_role;
grant execute on function public.create_order(uuid, uuid, jsonb, text, text, boolean, integer) to service_role;
