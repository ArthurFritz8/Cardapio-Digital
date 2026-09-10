-- Seed opcional para ambiente de smoke test (ADR 0006).
-- Arquivo canônico: supabase/seed.sql; docs/SEED.sql é uma cópia idêntica.
-- Após migrations 0001..0004, crie/confirme uma conta DE TESTE no Auth.
-- Substitua SOMENTE o null de v_owner abaixo por 'UUID-DA-CONTA'::uuid.
-- Sem escolha explícita, falha sem alterar dados. Não execute em produção.
-- Reexecução preserva alterações feitas pelo dono: nenhum UPDATE/DELETE.

begin;

do $$
declare
  v_owner uuid := null; -- OBRIGATÓRIO: UUID da conta de teste escolhida.
  v_est constant uuid := '00000000-0000-4000-a000-000000000001';
  v_cat_bebidas constant uuid := '00000000-0000-4000-a000-000000000010';
  v_cat_petiscos constant uuid := '00000000-0000-4000-a000-000000000011';
begin
  if v_owner is null then
    raise exception 'SEED_OWNER_REQUIRED: escolha explicitamente o UUID da conta de teste em v_owner.';
  end if;

  if not exists (
    select 1 from auth.users
    where id = v_owner and email_confirmed_at is not null
  ) then
    raise exception 'SEED_OWNER_INVALID: a conta escolhida deve existir e ter email confirmado.';
  end if;

  -- Serializa somente execuções deste seed; não interfere no fluxo de pedidos.
  perform pg_advisory_xact_lock(63846006);

  -- O MVP assume um estabelecimento por dono. Não semear sobre conta real.
  if exists (
    select 1 from public.establishments
    where owner_id = v_owner and id <> v_est
  ) then
    raise exception 'SEED_OWNER_HAS_BUSINESS: use outra conta de teste, sem estabelecimento.';
  end if;

  if exists (
    select 1 from public.establishments
    where (id = v_est and (owner_id <> v_owner or slug <> 'smoke-test-bar'))
       or (slug = 'smoke-test-bar' and id <> v_est)
  ) then
    raise exception 'SEED_COLLISION: estabelecimento/slug reservado já pertence a outro registro.';
  end if;

  if exists (
    select 1 from public.categories
    where id in (v_cat_bebidas, v_cat_petiscos) and establishment_id <> v_est
  ) or exists (
    select 1 from public.menu_items
    where id in (
      '00000000-0000-4000-a000-000000000020'::uuid,
      '00000000-0000-4000-a000-000000000021'::uuid,
      '00000000-0000-4000-a000-000000000022'::uuid,
      '00000000-0000-4000-a000-000000000023'::uuid
    ) and establishment_id <> v_est
  ) or exists (
    select 1 from public.tables
    where id in (
      '00000000-0000-4000-a000-000000000030'::uuid,
      '00000000-0000-4000-a000-000000000031'::uuid,
      '00000000-0000-4000-a000-000000000032'::uuid
    ) and establishment_id <> v_est
  ) then
    raise exception 'SEED_COLLISION: categoria, item ou mesa reservado pertence a outro estabelecimento.';
  end if;

  insert into public.establishments
    (id, owner_id, name, slug, description, is_open, latitude, longitude, order_radius_meters)
  values
    (v_est, v_owner, 'Bar de Teste', 'smoke-test-bar',
     'Dados sintéticos para smoke test.', true, null, null, 150)
  on conflict (id) do nothing;

  insert into public.categories (id, establishment_id, name, sort_order) values
    (v_cat_bebidas, v_est, 'Bebidas', 0),
    (v_cat_petiscos, v_est, 'Petiscos', 1)
  on conflict (id) do nothing;

  -- Valores em centavos. Não criar pedidos, sessões ou tokens artificiais.
  insert into public.menu_items
    (id, establishment_id, category_id, name, description, price_cents, sort_order)
  values
    ('00000000-0000-4000-a000-000000000020', v_est, v_cat_bebidas,
     'Chopp Pilsen 300ml', 'Gelado', 1200, 0),
    ('00000000-0000-4000-a000-000000000021', v_est, v_cat_bebidas,
     'Refrigerante Lata', null, 800, 1),
    ('00000000-0000-4000-a000-000000000022', v_est, v_cat_petiscos,
     'Batata Frita', 'Porção 400g com cheddar e bacon', 3500, 0),
    ('00000000-0000-4000-a000-000000000023', v_est, v_cat_petiscos,
     'Bolinho de Bacalhau', '8 unidades', 4200, 1)
  on conflict (id) do nothing;

  insert into public.tables (id, establishment_id, label) values
    ('00000000-0000-4000-a000-000000000030', v_est, '1'),
    ('00000000-0000-4000-a000-000000000031', v_est, '2'),
    ('00000000-0000-4000-a000-000000000032', v_est, '3')
  on conflict (id) do nothing;

  raise notice 'Seed concluído sem sobrescrever registros. Configure a localização no /admin antes do teste de geo.';
  raise notice 'Mesa 1: /m/00000000-0000-4000-a000-000000000030';
end $$;

commit;

-- Contagens iniciais: 1 estabelecimento, 2 categorias, 4 itens, 3 mesas.
select
  e.id, e.name, e.slug,
  (select count(*) from public.categories c where c.establishment_id = e.id) as categories,
  (select count(*) from public.menu_items mi where mi.establishment_id = e.id) as menu_items,
  (select count(*) from public.tables t where t.establishment_id = e.id) as tables
from public.establishments e
where e.id = '00000000-0000-4000-a000-000000000001';
