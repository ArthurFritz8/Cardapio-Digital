-- ============================================================
-- Seed de teste (smoke test) — IDEMPOTENTE, pode rodar N vezes.
-- Pré-requisito: já existir um usuário (signup no app) — o
-- estabelecimento é vinculado ao primeiro usuário do auth.
-- QR Codes apontam para /m/{table_id} (uuid ESTÁVEL abaixo);
-- session_token NÃO é semeado: a RPC start_table_session cria.
-- ============================================================

do $$
declare
  v_owner uuid;
  v_est constant uuid := '00000000-0000-4000-a000-000000000001';
  v_cat_bebidas constant uuid := '00000000-0000-4000-a000-000000000010';
  v_cat_petiscos constant uuid := '00000000-0000-4000-a000-000000000011';
begin
  select id into v_owner from auth.users order by created_at limit 1;
  if v_owner is null then
    raise notice 'Seed ignorado: nenhum usuário em auth.users. Crie a conta pelo signup e rode de novo.';
    return;
  end if;

  insert into public.establishments
    (id, owner_id, name, slug, description, is_open, latitude, longitude, order_radius_meters)
  values
    (v_est, v_owner, 'Bar de Teste', 'test-bar',
     'Dados de smoke test — pode apagar', true, -23.5505, -46.6333, 150)
  on conflict (id) do update
    set owner_id = excluded.owner_id, is_open = true;

  insert into public.categories (id, establishment_id, name, sort_order) values
    (v_cat_bebidas,  v_est, 'Bebidas',  0),
    (v_cat_petiscos, v_est, 'Petiscos', 1)
  on conflict (id) do nothing;

  -- Preços SEMPRE em centavos (inteiro)
  insert into public.menu_items
    (id, establishment_id, category_id, name, description, price_cents, sort_order)
  values
    ('00000000-0000-4000-a000-000000000020', v_est, v_cat_bebidas,
     'Chopp Pilsen 300ml', 'Gelado, colarinho de dois dedos', 1200, 0),
    ('00000000-0000-4000-a000-000000000021', v_est, v_cat_bebidas,
     'Refrigerante Lata', null, 800, 1),
    ('00000000-0000-4000-a000-000000000022', v_est, v_cat_petiscos,
     'Batata Frita', 'Porção 400g com cheddar e bacon', 3500, 0),
    ('00000000-0000-4000-a000-000000000023', v_est, v_cat_petiscos,
     'Bolinho de Bacalhau', '8 unidades', 4200, 1)
  on conflict (id) do nothing;

  insert into public.tables (id, establishment_id, label) values
    ('00000000-0000-4000-a000-000000000030', v_est, 'Mesa 1'),
    ('00000000-0000-4000-a000-000000000031', v_est, 'Mesa 2'),
    ('00000000-0000-4000-a000-000000000032', v_est, 'Mesa 3')
  on conflict (id) do nothing;

  raise notice 'Seed ok. Menu da Mesa 1: /m/00000000-0000-4000-a000-000000000030';
end $$;
