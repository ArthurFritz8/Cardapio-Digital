-- ADR 0006: correções incrementais da auditoria pré-deploy.
-- Aplicar depois de 0001–0003. Não altera o enum nem apaga dados.
begin;

-- RLS protege linhas, não colunas. Nunca publicar credenciais de sessão.
revoke all on public.establishments, public.tables, public.categories,
  public.menu_items, public.orders, public.order_items from anon, authenticated;
grant select on public.establishments, public.categories, public.menu_items
  to anon, authenticated;
grant insert, update, delete on public.establishments, public.categories,
  public.menu_items to authenticated;
grant select (id, establishment_id, label, is_active, created_at)
  on public.tables to anon, authenticated;
grant insert (establishment_id, label, is_active), update (label, is_active), delete
  on public.tables to authenticated;
grant select on public.orders, public.order_items to authenticated;
grant update (status, confirmed_at, note) on public.orders to authenticated;
grant all on public.establishments, public.tables, public.categories,
  public.menu_items, public.orders, public.order_items to service_role;

alter policy establishments_owner_insert on public.establishments to authenticated;
alter policy establishments_owner_update on public.establishments to authenticated;
alter policy establishments_owner_delete on public.establishments to authenticated;
alter policy tables_owner_all on public.tables to authenticated;
alter policy categories_owner_all on public.categories to authenticated;
alter policy menu_items_owner_all on public.menu_items to authenticated;
alter policy orders_owner_read on public.orders to authenticated;
alter policy orders_owner_update on public.orders to authenticated;
alter policy order_items_owner_read on public.order_items to authenticated;
alter policy categories_public_read on public.categories using (is_active);
alter policy menu_items_public_read on public.menu_items using (
  is_available and exists (
    select 1 from public.categories c
    where c.id = category_id and c.establishment_id = menu_items.establishment_id
      and c.is_active
  )
);
alter function public.is_establishment_owner(uuid) set search_path = '';
revoke execute on function public.is_establishment_owner(uuid) from public, anon;
grant execute on function public.is_establishment_owner(uuid) to authenticated, service_role;

-- Relações sempre no mesmo estabelecimento. Substituir, não duplicar FKs:
-- PostgREST continua encontrando uma única relação para os joins existentes.
alter table public.categories add constraint categories_id_establishment_key
  unique (id, establishment_id);
alter table public.tables add constraint tables_id_establishment_key
  unique (id, establishment_id);
alter table public.menu_items drop constraint menu_items_category_id_fkey;
alter table public.menu_items add constraint menu_items_category_id_fkey
  foreign key (category_id, establishment_id)
  references public.categories (id, establishment_id) on delete cascade;
alter table public.orders drop constraint orders_table_id_fkey;
alter table public.orders add constraint orders_table_id_fkey
  foreign key (table_id, establishment_id)
  references public.tables (id, establishment_id) on delete restrict;
create index idx_orders_table on public.orders (table_id);
create index idx_order_items_menu_item on public.order_items (menu_item_id)
  where menu_item_id is not null;

-- Chave de tentativa estável no cliente: timeout/retry não duplica pedido.
alter table public.orders
  add column request_id uuid,
  add column request_fingerprint text,
  add constraint orders_request_pair_check check (
    (request_id is null) = (request_fingerprint is null)
  ),
  add constraint orders_table_request_key unique (table_id, request_id);

create function public.protect_order_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if row(new.id, new.establishment_id, new.table_id, new.customer_name,
         new.total_cents, new.needs_confirmation, new.created_at,
         new.request_id, new.request_fingerprint)
     is distinct from
     row(old.id, old.establishment_id, old.table_id, old.customer_name,
         old.total_cents, old.needs_confirmation, old.created_at,
         old.request_id, old.request_fingerprint) then
    raise exception 'ORDER_SNAPSHOT_IMMUTABLE';
  end if;
  if old.confirmed_at is not null then
    -- Uma confirmação repetida é idempotente; nunca apaga/reescreve a evidência.
    if new.confirmed_at is null then
      raise exception 'ORDER_SNAPSHOT_IMMUTABLE';
    end if;
    new.confirmed_at := old.confirmed_at;
  elsif new.confirmed_at is not null then
    if old.status <> 'pending' or not old.needs_confirmation then
      raise exception 'INVALID_ORDER_TRANSITION';
    end if;
    new.confirmed_at := clock_timestamp();
  end if;
  if new.needs_confirmation and new.confirmed_at is null
     and new.status in ('preparing', 'ready', 'delivered') then
    raise exception 'ORDER_CONFIRMATION_REQUIRED';
  end if;
  return new;
end;
$$;
create trigger trg_orders_protect_fields before update on public.orders
  for each row execute function public.protect_order_fields();

create function public.protect_order_item_snapshot()
returns trigger language plpgsql set search_path = '' as $$
begin
  if row(new.id, new.order_id, new.item_name, new.unit_price_cents, new.quantity, new.note)
     is distinct from
     row(old.id, old.order_id, old.item_name, old.unit_price_cents, old.quantity, old.note)
     or (new.menu_item_id is distinct from old.menu_item_id and new.menu_item_id is not null)
  then
    raise exception 'ORDER_SNAPSHOT_IMMUTABLE';
  end if;
  -- ON DELETE SET NULL do item do menu continua preservando o histórico.
  return new;
end;
$$;
create trigger trg_order_items_immutable before update on public.order_items
  for each row execute function public.protect_order_item_snapshot();

create or replace function public.start_table_session(
  p_table_id uuid, p_session_hours integer default 2
)
returns table (session_token uuid, session_expires_at timestamptz, establishment_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_table public.tables%rowtype;
  v_now timestamptz;
begin
  if p_table_id is null or p_session_hours is null or p_session_hours not between 1 and 24 then
    raise exception 'VALIDATION';
  end if;
  select * into v_table from public.tables t where t.id = p_table_id for update;
  if not found or not v_table.is_active then
    raise exception 'TABLE_NOT_FOUND';
  end if;
  v_now := clock_timestamp();
  if v_table.session_token is null or v_table.session_expires_at is null
     or v_table.session_expires_at <= v_now then
    update public.tables t
    set session_token = gen_random_uuid(),
        session_expires_at = v_now + make_interval(hours => p_session_hours)
    where t.id = p_table_id returning t.* into v_table;
  end if;
  return query select v_table.session_token, v_table.session_expires_at, v_table.establishment_id;
end;
$$;

-- A assinatura antiga é removida para não criar sobrecarga ambígua no PostgREST.
drop function public.create_order(uuid, uuid, jsonb, text, text, boolean, integer);
create function public.create_order(
  p_table_id uuid, p_session_token uuid, p_items jsonb,
  p_customer_name text default null, p_note text default null,
  p_needs_confirmation boolean default false, p_max_active_orders integer default 5,
  p_request_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_table public.tables%rowtype;
  v_existing public.orders%rowtype;
  v_fingerprint text;
  v_snapshot jsonb;
  v_item jsonb;
  v_is_open boolean;
  v_total bigint;
  v_order_id uuid := gen_random_uuid();
begin
  if p_table_id is null or p_session_token is null or p_needs_confirmation is null
     or p_max_active_orders is null or p_max_active_orders not between 1 and 100
     or char_length(p_customer_name) > 60 or char_length(p_note) > 300
     or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'VALIDATION';
  end if;
  if jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'VALIDATION';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'VALIDATION'; end if;
    if exists (select 1 from jsonb_object_keys(v_item) k where k not in ('menu_item_id', 'quantity', 'note'))
       or jsonb_typeof(v_item->'menu_item_id') is distinct from 'string'
       or (v_item->>'menu_item_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(v_item->'quantity') is distinct from 'number'
       or (v_item->>'quantity') !~ '^[1-9][0-9]?$'
       or (v_item ? 'note' and (jsonb_typeof(v_item->'note') <> 'string' or char_length(v_item->>'note') > 200))
    then raise exception 'VALIDATION'; end if;
    if (v_item->>'quantity')::integer > 50 then raise exception 'VALIDATION'; end if;
  end loop;
  v_fingerprint := md5(jsonb_build_object(
    'items', p_items, 'customer_name', nullif(btrim(p_customer_name), ''),
    'note', nullif(btrim(p_note), '')
  )::text);

  -- Serializa sessão, limite por mesa e idempotência da mesma tentativa.
  select * into v_table from public.tables where id = p_table_id for update;
  if not found or not v_table.is_active then raise exception 'TABLE_NOT_FOUND'; end if;
  if v_table.session_token is null or v_table.session_expires_at is null
     or v_table.session_token <> p_session_token
     or v_table.session_expires_at <= clock_timestamp() then
    raise exception 'SESSION_EXPIRED';
  end if;
  if p_request_id is not null then
    select * into v_existing from public.orders
    where table_id = p_table_id and request_id = p_request_id;
    if found then
      if v_existing.request_fingerprint <> v_fingerprint then
        raise exception 'IDEMPOTENCY_CONFLICT';
      end if;
      return jsonb_build_object('id', v_existing.id, 'status', v_existing.status,
        'needs_confirmation', v_existing.needs_confirmation, 'total_cents', v_existing.total_cents);
    end if;
  end if;

  select is_open into v_is_open from public.establishments
  where id = v_table.establishment_id for share;
  if not v_is_open then raise exception 'ESTABLISHMENT_CLOSED'; end if;
  if (select count(*) from public.orders where table_id = p_table_id
      and status in ('pending', 'preparing')) >= p_max_active_orders then
    raise exception 'TABLE_ORDER_LIMIT';
  end if;

  -- Um único snapshot bloqueado alimenta total + itens. FOR SHARE também
  -- impede alteração de preço/disponibilidade/categoria durante a compra.
  with locked_items as materialized (
    select mi.id, mi.name, mi.price_cents, (i.value->>'quantity')::integer as quantity,
      nullif(btrim(i.value->>'note'), '') as note, i.ordinality
    from jsonb_array_elements(p_items) with ordinality i
    join public.menu_items mi on mi.id = (i.value->>'menu_item_id')::uuid
    join public.categories c on c.id = mi.category_id and c.establishment_id = mi.establishment_id
    where mi.establishment_id = v_table.establishment_id and mi.is_available and c.is_active
    order by mi.id, i.ordinality
    for share of mi, c
  )
  select jsonb_agg(to_jsonb(li) order by li.ordinality),
    sum(li.price_cents::bigint * li.quantity)
  into v_snapshot, v_total from locked_items li;
  if v_snapshot is null or jsonb_array_length(v_snapshot) <> jsonb_array_length(p_items) then
    raise exception 'ITEM_UNAVAILABLE';
  end if;
  if v_total > 2147483647 then raise exception 'VALIDATION'; end if;

  insert into public.orders (id, establishment_id, table_id, status, customer_name,
    note, total_cents, needs_confirmation, request_id, request_fingerprint)
  values (v_order_id, v_table.establishment_id, p_table_id, 'pending',
    nullif(btrim(p_customer_name), ''), nullif(btrim(p_note), ''), v_total::integer,
    p_needs_confirmation, p_request_id, case when p_request_id is null then null else v_fingerprint end);
  insert into public.order_items (order_id, menu_item_id, item_name, unit_price_cents, quantity, note)
  select v_order_id, s.id, s.name, s.price_cents, s.quantity, s.note
  from jsonb_to_recordset(v_snapshot) as s(id uuid, name text, price_cents integer, quantity integer, note text);
  return jsonb_build_object('id', v_order_id, 'status', 'pending',
    'needs_confirmation', p_needs_confirmation, 'total_cents', v_total);
end;
$$;

-- Limite compartilhado entre instâncias Vercel, hash HMAC do IP no servidor.
-- Uma linha por IP/ação; sem IP bruto, sem cron e sem publicação Realtime.
create table public.ip_requests (
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  action text not null check (action ~ '^[a-z_]{1,32}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  expires_at timestamptz not null,
  primary key (key_hash, action)
);
create index idx_ip_requests_expiry on public.ip_requests (expires_at);
alter table public.ip_requests enable row level security;
revoke all on public.ip_requests from public, anon, authenticated;
grant all on public.ip_requests to service_role;

create function public.consume_ip_rate_limit(
  p_key_hash text, p_action text, p_limit integer, p_window_seconds integer
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_action is null or p_action !~ '^[a-z_]{1,32}$'
     or p_limit is null or p_limit not between 1 and 10000
     or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'VALIDATION';
  end if;
  delete from public.ip_requests where (key_hash, action) in (
    select key_hash, action from public.ip_requests where expires_at <= v_now
    order by expires_at limit 100 for update skip locked
  );
  insert into public.ip_requests as r (key_hash, action, window_started_at, request_count, expires_at)
  values (p_key_hash, p_action, v_now, 1, v_now + make_interval(secs => p_window_seconds))
  on conflict (key_hash, action) do update set
    window_started_at = case when r.expires_at <= v_now then v_now else r.window_started_at end,
    request_count = case when r.expires_at <= v_now then 1 else least(r.request_count + 1, p_limit + 1) end,
    expires_at = case when r.expires_at <= v_now then excluded.expires_at else r.expires_at end
  returning request_count into v_count;
  return v_count <= p_limit;
end;
$$;

revoke execute on function public.start_table_session(uuid, integer),
  public.create_order(uuid, uuid, jsonb, text, text, boolean, integer, uuid),
  public.consume_ip_rate_limit(text, text, integer, integer),
  public.protect_order_fields(), public.protect_order_item_snapshot()
  from public, anon, authenticated;
grant execute on function public.start_table_session(uuid, integer),
  public.create_order(uuid, uuid, jsonb, text, text, boolean, integer, uuid),
  public.consume_ip_rate_limit(text, text, integer, integer) to service_role;

-- Bucket existente deve receber os limites, mesmo se criado manualmente antes.
update storage.buckets set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'menu-images';
alter policy menu_images_owner_update on storage.objects with check (
  bucket_id = 'menu-images'
  and public.is_establishment_owner(((storage.foldername(name))[1])::uuid)
);
commit;
