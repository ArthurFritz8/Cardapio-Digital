-- Regressões comportamentais de 0004. Execute como postgres em banco de teste.
-- Tudo é revertido no final; UUIDs exclusivos desta suíte. ON_ERROR_STOP obrigatório no psql.
begin;
create function pg_temp.expect_error(p_sql text, p_expected text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_expected in sqlerrm) > 0 or sqlstate = p_expected then return; end if;
    raise exception 'Esperado %, recebido %: %', p_expected, sqlstate, sqlerrm;
  end;
  raise exception 'Operação indevidamente permitida (esperado %): %', p_expected, p_sql;
end;
$$;
create function pg_temp.assert_true(p_condition boolean, p_label text)
returns void language plpgsql as $$ begin
  if p_condition is distinct from true then raise exception 'ASSERTION: %', p_label; end if;
end $$;

insert into auth.users (id) values
  ('a0060000-0000-4000-a000-000000000001'), ('a0060000-0000-4000-a000-000000000002');
insert into public.establishments (id,owner_id,name,slug) values
  ('a0060000-0000-4000-a000-000000000010','a0060000-0000-4000-a000-000000000001','Audit A','audit-a-0006'),
  ('a0060000-0000-4000-a000-000000000011','a0060000-0000-4000-a000-000000000002','Audit B','audit-b-0006');
insert into public.categories (id,establishment_id,name,is_active) values
  ('a0060000-0000-4000-a000-000000000020','a0060000-0000-4000-a000-000000000010','Ativa',true),
  ('a0060000-0000-4000-a000-000000000021','a0060000-0000-4000-a000-000000000010','Inativa',false),
  ('a0060000-0000-4000-a000-000000000022','a0060000-0000-4000-a000-000000000011','Outro dono',true);
insert into public.menu_items (id,establishment_id,category_id,name,price_cents) values
  ('a0060000-0000-4000-a000-000000000030','a0060000-0000-4000-a000-000000000010','a0060000-0000-4000-a000-000000000020','Prato A',1990),
  ('a0060000-0000-4000-a000-000000000031','a0060000-0000-4000-a000-000000000010','a0060000-0000-4000-a000-000000000021','Oculto',100),
  ('a0060000-0000-4000-a000-000000000032','a0060000-0000-4000-a000-000000000011','a0060000-0000-4000-a000-000000000022','Prato B',200),
  ('a0060000-0000-4000-a000-000000000033','a0060000-0000-4000-a000-000000000010','a0060000-0000-4000-a000-000000000020','Caro',10000000);
insert into public.tables (id,establishment_id,label) values
  ('a0060000-0000-4000-a000-000000000040','a0060000-0000-4000-a000-000000000010','Audit Mesa A'),
  ('a0060000-0000-4000-a000-000000000041','a0060000-0000-4000-a000-000000000011','Audit Mesa B');

-- Papel anônimo: menu público disponível; tokens, pedidos e RPCs privados.
set local role anon;
select pg_temp.assert_true((select count(*)=1 from public.menu_items where establishment_id='a0060000-0000-4000-a000-000000000010' and price_cents=1990), 'anon lê item disponível');
select pg_temp.assert_true((select count(*)=0 from public.menu_items where id='a0060000-0000-4000-a000-000000000031'), 'categoria inativa oculta seus itens no banco');
select pg_temp.assert_true((select count(*)=0 from public.categories where id='a0060000-0000-4000-a000-000000000021'), 'anon não lê categoria inativa');
select pg_temp.assert_true((select label='Audit Mesa A' from public.tables where id='a0060000-0000-4000-a000-000000000040'), 'QR lê campos públicos de mesa');
select pg_temp.expect_error('select session_token from public.tables', '42501');
select pg_temp.expect_error('select * from public.tables', '42501');
select pg_temp.expect_error('select * from public.orders', '42501');
select pg_temp.expect_error('select * from public.order_items', '42501');
select pg_temp.expect_error('select * from public.ip_requests', '42501');
select pg_temp.expect_error($q$insert into public.orders(establishment_id,table_id,total_cents) values ('a0060000-0000-4000-a000-000000000010','a0060000-0000-4000-a000-000000000040',0)$q$, '42501');
select pg_temp.expect_error($q$insert into public.establishments(owner_id,name,slug) values ('a0060000-0000-4000-a000-000000000001','Ataque','ataque-anon')$q$,'42501');
select pg_temp.expect_error($q$update public.menu_items set price_cents=1$q$,'42501');
select pg_temp.expect_error($q$delete from public.categories$q$,'42501');
select pg_temp.expect_error($q$select public.start_table_session('a0060000-0000-4000-a000-000000000040')$q$, '42501');
select pg_temp.expect_error($q$select public.create_order(null,null,'[]')$q$, '42501');
select pg_temp.expect_error($q$select public.consume_ip_rate_limit(repeat('a',64),'orders',2,60)$q$, '42501');
reset role;

-- Service role: sessão atômica reutiliza token; RPC valida entrada e contexto.
set local role service_role;
do $$
declare
  v_token uuid;
  v_again uuid;
  v_items jsonb := '[{"menu_item_id":"a0060000-0000-4000-a000-000000000030","quantity":2}]';
  v_order jsonb;
  v_retry jsonb;
begin
  select session_token into v_token from public.start_table_session('a0060000-0000-4000-a000-000000000040');
  select session_token into v_again from public.start_table_session('a0060000-0000-4000-a000-000000000040');
  perform pg_temp.assert_true(v_token=v_again,'scan simultâneo/repetido reutiliza sessão');
  perform pg_temp.expect_error($q$select public.start_table_session('a0060000-0000-4000-a000-000000000040',null)$q$,'VALIDATION');
  perform pg_temp.expect_error($q$select public.create_order('a0060000-0000-4000-a000-000000000040',null,'[]')$q$,'VALIDATION');
  perform pg_temp.expect_error(format('select public.create_order(%L,%L,%L)', 'a0060000-0000-4000-a000-000000000040',gen_random_uuid(),v_items),'SESSION_EXPIRED');
  perform pg_temp.expect_error(format('select public.create_order(%L,%L,%L)', 'a0060000-0000-4000-a000-000000000040',v_token,'{}'),'VALIDATION');
  perform pg_temp.expect_error(format('select public.create_order(%L,%L,%L)', 'a0060000-0000-4000-a000-000000000040',v_token,'[{"menu_item_id":"a0060000-0000-4000-a000-000000000030","quantity":0}]'),'VALIDATION');
  perform pg_temp.expect_error(format('select public.create_order(%L,%L,%L)', 'a0060000-0000-4000-a000-000000000040',v_token,'[{"menu_item_id":"a0060000-0000-4000-a000-000000000030","quantity":1,"unit_price_cents":1}]'),'VALIDATION');
  perform pg_temp.expect_error(format('select public.create_order(%L,%L,%L)', 'a0060000-0000-4000-a000-000000000040',v_token,'[{"menu_item_id":"a0060000-0000-4000-a000-000000000031","quantity":1}]'),'ITEM_UNAVAILABLE');
  perform pg_temp.expect_error(format('select public.create_order(%L,%L,%L)', 'a0060000-0000-4000-a000-000000000040',v_token,'[{"menu_item_id":"a0060000-0000-4000-a000-000000000032","quantity":1}]'),'ITEM_UNAVAILABLE');
  perform pg_temp.assert_true((select count(*)=0 from public.orders where table_id='a0060000-0000-4000-a000-000000000040'),'falhas não criam pedidos órfãos');
  v_order := public.create_order('a0060000-0000-4000-a000-000000000040',v_token,v_items,'Cliente','Sem gelo',true,1,'a0060000-0000-4000-a000-000000000050');
  perform pg_temp.assert_true((v_order->>'total_cents')::integer=3980,'total é preço do banco x quantidade');
  v_retry := public.create_order('a0060000-0000-4000-a000-000000000040',v_token,v_items,'Cliente','Sem gelo',false,1,'a0060000-0000-4000-a000-000000000050');
  perform pg_temp.assert_true(v_retry=v_order,'retry retorna mesmo pedido mesmo com geo diferente/mesa no limite');
  perform pg_temp.expect_error(format('select public.create_order(%L,%L,%L,%L,%L,true,1,%L)', 'a0060000-0000-4000-a000-000000000040',v_token,v_items,'Outro','Sem gelo','a0060000-0000-4000-a000-000000000050'),'IDEMPOTENCY_CONFLICT');
  perform pg_temp.expect_error(format('select public.create_order(%L,%L,%L,null,null,false,1)', 'a0060000-0000-4000-a000-000000000040',v_token,v_items),'TABLE_ORDER_LIMIT');
  perform pg_temp.assert_true((select total_cents=(select sum(unit_price_cents*quantity) from public.order_items where order_id=o.id) from public.orders o where id=(v_order->>'id')::uuid),'total igual aos snapshots');
end $$;
reset role;

-- Dono A pode operar seus pedidos, não pode adulterar credenciais/dados.
set local role authenticated;
select set_config('request.jwt.claim.sub','a0060000-0000-4000-a000-000000000001',true);
select pg_temp.assert_true((select count(*)=1 from public.orders where establishment_id='a0060000-0000-4000-a000-000000000010'),'dono lê pedido');
select pg_temp.assert_true((select count(*)=1 from public.menu_items where id='a0060000-0000-4000-a000-000000000031'),'dono lê item de categoria inativa');
select pg_temp.expect_error('select session_token from public.tables','42501');
select pg_temp.expect_error($q$update public.orders set total_cents=1$q$,'42501');
select pg_temp.expect_error($q$update public.orders set needs_confirmation=false$q$,'42501');
select pg_temp.expect_error($q$update public.tables set session_token=gen_random_uuid()$q$,'42501');
select pg_temp.expect_error($q$update public.orders set status='preparing' where request_id='a0060000-0000-4000-a000-000000000050'$q$,'ORDER_CONFIRMATION_REQUIRED');
select pg_temp.expect_error($q$update public.order_items set unit_price_cents=1$q$,'42501');
select pg_temp.expect_error($q$delete from public.order_items$q$,'42501');
select pg_temp.expect_error($q$select public.create_order(null,null,'[]')$q$,'42501');
select pg_temp.expect_error($q$insert into public.menu_items(establishment_id,category_id,name,price_cents) values ('a0060000-0000-4000-a000-000000000010','a0060000-0000-4000-a000-000000000022','Ataque FK',1)$q$,'23503');
select pg_temp.expect_error($q$insert into public.tables(establishment_id,label) values ('a0060000-0000-4000-a000-000000000011','Mesa invasora')$q$,'42501');
select pg_temp.expect_error($q$insert into public.categories(establishment_id,name) values ('a0060000-0000-4000-a000-000000000011','Categoria invasora')$q$,'42501');
select pg_temp.expect_error($q$update public.establishments set owner_id='a0060000-0000-4000-a000-000000000002' where id='a0060000-0000-4000-a000-000000000010'$q$,'42501');
update public.orders set confirmed_at='2000-01-01' where request_id='a0060000-0000-4000-a000-000000000050';
select pg_temp.assert_true((select confirmed_at>now()-interval '1 minute' from public.orders where request_id='a0060000-0000-4000-a000-000000000050'),'confirmação usa relógio do banco');
select pg_temp.expect_error($q$update public.orders set confirmed_at=null where request_id='a0060000-0000-4000-a000-000000000050'$q$,'ORDER_SNAPSHOT_IMMUTABLE');
update public.orders set status='preparing' where request_id='a0060000-0000-4000-a000-000000000050';
select pg_temp.expect_error($q$insert into storage.objects(bucket_id,name) values ('menu-images','a0060000-0000-4000-a000-000000000011/items/ataque.jpg')$q$,'42501');
insert into storage.objects(bucket_id,name) values ('menu-images','a0060000-0000-4000-a000-000000000010/items/permitido.jpg');
select pg_temp.expect_error($q$update storage.objects set name='a0060000-0000-4000-a000-000000000011/items/movido.jpg' where name='a0060000-0000-4000-a000-000000000010/items/permitido.jpg'$q$,'42501');

-- Outro dono não vê pedidos/itens nem altera as linhas do dono A.
select set_config('request.jwt.claim.sub','a0060000-0000-4000-a000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.orders where establishment_id='a0060000-0000-4000-a000-000000000010'),'isolamento orders outro dono');
select pg_temp.assert_true((select count(*)=0 from public.order_items),'isolamento order_items outro dono');
with changed as (update public.orders set status='ready' where request_id='a0060000-0000-4000-a000-000000000050' returning id)
select pg_temp.assert_true((select count(*)=0 from changed),'outro dono não altera pedido');
with changed as (update public.menu_items set price_cents=1 where id='a0060000-0000-4000-a000-000000000030' returning id)
select pg_temp.assert_true((select count(*)=0 from changed),'outro dono não altera menu');
with changed as (delete from public.categories where id='a0060000-0000-4000-a000-000000000020' returning id)
select pg_temp.assert_true((select count(*)=0 from changed),'outro dono não apaga categoria');
reset role;

-- Defesa em profundidade, snapshots e todas as 25 combinações de status.
do $$
declare
  v_from public.order_status;
  v_to public.order_status;
  v_id uuid;
  v_allowed boolean;
  v_token uuid;
  v_expensive jsonb;
begin
  perform pg_temp.expect_error($q$update public.orders set total_cents=1 where request_id='a0060000-0000-4000-a000-000000000050'$q$,'ORDER_SNAPSHOT_IMMUTABLE');
  perform pg_temp.expect_error($q$update public.order_items set item_name='Alterado'$q$,'ORDER_SNAPSHOT_IMMUTABLE');
  perform pg_temp.expect_error($q$insert into public.orders(establishment_id,table_id,total_cents) values ('a0060000-0000-4000-a000-000000000011','a0060000-0000-4000-a000-000000000040',1)$q$,'23503');
  for v_from in select unnest(enum_range(null::public.order_status)) loop
    for v_to in select unnest(enum_range(null::public.order_status)) loop
      insert into public.orders(establishment_id,table_id,total_cents,status)
      values ('a0060000-0000-4000-a000-000000000010','a0060000-0000-4000-a000-000000000040',0,v_from) returning id into v_id;
      v_allowed := v_from=v_to or (v_from='pending' and v_to in ('preparing','cancelled'))
        or (v_from='preparing' and v_to in ('ready','cancelled')) or (v_from='ready' and v_to='delivered');
      if v_allowed then update public.orders set status=v_to where id=v_id;
      else perform pg_temp.expect_error(format('update public.orders set status=%L where id=%L',v_to,v_id),'INVALID_ORDER_TRANSITION'); end if;
      delete from public.orders where id=v_id;
    end loop;
  end loop;
  select session_token into v_token from public.tables where id='a0060000-0000-4000-a000-000000000040';
  select jsonb_agg(jsonb_build_object('menu_item_id','a0060000-0000-4000-a000-000000000033','quantity',50))
  into v_expensive from generate_series(1,5);
  perform pg_temp.expect_error(format('select public.create_order(%L,%L,%L)','a0060000-0000-4000-a000-000000000040',v_token,v_expensive),'VALIDATION');
  update public.establishments set is_open=false where id='a0060000-0000-4000-a000-000000000010';
  perform pg_temp.expect_error(format('select public.create_order(%L,%L,%L)','a0060000-0000-4000-a000-000000000040',v_token,'[{"menu_item_id":"a0060000-0000-4000-a000-000000000030","quantity":1}]'),'ESTABLISHMENT_CLOSED');
  update public.establishments set is_open=true where id='a0060000-0000-4000-a000-000000000010';
  update public.tables set session_expires_at=now()-interval '1 second' where id='a0060000-0000-4000-a000-000000000040';
  perform pg_temp.expect_error(format('select public.create_order(%L,%L,%L)','a0060000-0000-4000-a000-000000000040',v_token,'[{"menu_item_id":"a0060000-0000-4000-a000-000000000030","quantity":1}]'),'SESSION_EXPIRED');
  perform pg_temp.assert_true((select session_token<>v_token from public.start_table_session('a0060000-0000-4000-a000-000000000040')),'sessão expirada gira token');
  update public.menu_items set price_cents=2500,name='Novo nome' where id='a0060000-0000-4000-a000-000000000030';
  perform pg_temp.assert_true((select bool_and(item_name='Prato A' and unit_price_cents=1990) from public.order_items),'renomear/reprecificar não muda snapshot');
  delete from public.menu_items where id='a0060000-0000-4000-a000-000000000030';
  perform pg_temp.assert_true((select bool_and(menu_item_id is null and unit_price_cents=1990) from public.order_items),'exclusão preserva snapshots e anula FK');
  perform pg_temp.expect_error($q$delete from public.tables where id='a0060000-0000-4000-a000-000000000040'$q$,'23503');
end $$;

set local role service_role;
select pg_temp.assert_true(public.consume_ip_rate_limit(repeat('a',64),'orders',2,60),'primeiro IP permitido');
select pg_temp.assert_true(public.consume_ip_rate_limit(repeat('a',64),'orders',2,60),'segundo IP permitido');
select pg_temp.assert_true(not public.consume_ip_rate_limit(repeat('a',64),'orders',2,60),'terceiro IP recusado');
select pg_temp.assert_true(public.consume_ip_rate_limit(repeat('a',64),'sessions',2,60),'ações com janelas independentes');
select pg_temp.assert_true(public.consume_ip_rate_limit(repeat('b',64),'orders',2,60),'IPs independentes');
update public.ip_requests set expires_at=now()-interval '1 second' where key_hash=repeat('a',64);
select pg_temp.assert_true(public.consume_ip_rate_limit(repeat('a',64),'orders',2,60),'quota expirada é renovada');
select pg_temp.expect_error($q$select public.consume_ip_rate_limit('192.0.2.1','orders',2,60)$q$,'VALIDATION');
select pg_temp.expect_error($q$select public.consume_ip_rate_limit(repeat('a',64),'orders',null,60)$q$,'VALIDATION');
reset role;
rollback;
do $$ begin raise notice 'REGRESSÕES APROVADAS: RLS/grants anon e 2 donos, Storage, FKs, 25 transições, confirmação, snapshot, sessão, atomicidade, overflow, idempotência e rate limit.'; end $$;
