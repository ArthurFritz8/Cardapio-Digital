-- Executar no SQL Editor do Supabase após 0001–0004.
-- Somente leitura; qualquer invariável ausente gera erro e interrompe o smoke.
do $$
declare
  v_name text;
  v_oid regprocedure;
  v_failures text[] := array[]::text[];
begin
  foreach v_name in array array['establishments','tables','categories','menu_items','orders','order_items','ip_requests'] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_name and c.relkind = 'r' and c.relrowsecurity
    ) then v_failures := array_append(v_failures, 'Tabela/RLS ausente: ' || v_name); end if;
  end loop;
  if (select array_agg(e.enumlabel::text order by e.enumsortorder)
      from pg_enum e where e.enumtypid = to_regtype('public.order_status'))
     is distinct from array['pending','preparing','ready','delivered','cancelled'] then
    v_failures := array_append(v_failures, 'Enum de status diverge dos ADRs 0002/0005');
  end if;
  foreach v_name in array array['trg_establishments_updated_at','trg_menu_items_updated_at',
    'trg_orders_updated_at','trg_orders_status_transition','trg_orders_protect_fields','trg_order_items_immutable'] loop
    if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and t.tgname = v_name and not t.tgisinternal and t.tgenabled in ('O','A')) then
      v_failures := array_append(v_failures, 'Trigger ausente/desativado: ' || v_name);
    end if;
  end loop;
  foreach v_name in array array['public.start_table_session(uuid,integer)',
    'public.create_order(uuid,uuid,jsonb,text,text,boolean,integer,uuid)',
    'public.consume_ip_rate_limit(text,text,integer,integer)'] loop
    v_oid := to_regprocedure(v_name);
    if v_oid is null then
      v_failures := array_append(v_failures, 'RPC ausente: ' || v_name);
    elsif has_function_privilege('anon', v_oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_oid, 'EXECUTE')
       or not has_function_privilege('service_role', v_oid, 'EXECUTE') then
      v_failures := array_append(v_failures, 'Privilégios incorretos da RPC: ' || v_name);
    elsif not exists (select 1 from pg_proc where oid = v_oid and prosecdef and proconfig @> array['search_path=""']) then
      v_failures := array_append(v_failures, 'RPC sem SECURITY DEFINER/search_path fixo: ' || v_name);
    end if;
  end loop;
  if to_regprocedure('public.create_order(uuid,uuid,jsonb,text,text,boolean,integer)') is not null then
    v_failures := array_append(v_failures, 'Assinatura create_order antiga ainda existe');
  end if;
  -- Testar apenas quando as tabelas existem, mantendo diagnóstico legível.
  if to_regclass('public.tables') is not null then
    foreach v_name in array array['anon','authenticated'] loop
      if has_column_privilege(v_name,'public.tables','session_token','SELECT')
         or has_column_privilege(v_name,'public.tables','session_expires_at','SELECT')
         or has_column_privilege(v_name,'public.tables','session_token','UPDATE') then
        v_failures := array_append(v_failures, 'Sessão exposta ao role: ' || v_name);
      end if;
    end loop;
  end if;
  if to_regclass('public.orders') is not null then
    if has_table_privilege('anon','public.orders','INSERT')
       or has_table_privilege('authenticated','public.orders','INSERT')
       or has_table_privilege('anon','public.orders','SELECT')
       or has_column_privilege('authenticated','public.orders','total_cents','UPDATE')
       or has_column_privilege('authenticated','public.orders','needs_confirmation','UPDATE')
       or not has_column_privilege('authenticated','public.orders','status','UPDATE') then
      v_failures := array_append(v_failures, 'Privilégios de orders incorretos');
    end if;
  end if;
  if to_regclass('public.ip_requests') is not null and (
    has_table_privilege('anon','public.ip_requests','SELECT')
    or has_table_privilege('authenticated','public.ip_requests','SELECT')
    or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ip_requests')
  ) then v_failures := array_append(v_failures, 'Rate limit não está privado'); end if;
  foreach v_name in array array['orders_owner_read','orders_owner_update','order_items_owner_read',
    'tables_public_read','tables_owner_all','categories_public_read','categories_owner_all',
    'menu_items_public_read','menu_items_owner_all','establishments_public_read',
    'establishments_owner_insert','establishments_owner_update','establishments_owner_delete'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = v_name) then
      v_failures := array_append(v_failures, 'Policy ausente: ' || v_name);
    end if;
  end loop;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'orders')
    or exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename <> 'orders') then
    v_failures := array_append(v_failures, 'Realtime deve publicar somente orders deste app');
  end if;
  if not exists (select 1 from storage.buckets where id = 'menu-images' and public
    and file_size_limit = 2097152
    and allowed_mime_types @> array['image/jpeg','image/png','image/webp']
    and cardinality(allowed_mime_types) = 3) then
    v_failures := array_append(v_failures, 'Bucket/limites menu-images incorretos');
  end if;
  foreach v_name in array array['menu_images_public_read','menu_images_owner_insert',
    'menu_images_owner_update','menu_images_owner_delete'] loop
    if not exists (select 1 from pg_policies where schemaname = 'storage'
      and tablename = 'objects' and policyname = v_name) then
      v_failures := array_append(v_failures, 'Policy Storage ausente: ' || v_name);
    end if;
  end loop;
  foreach v_name in array array['menu_items_category_id_fkey','orders_table_id_fkey'] loop
    if not exists (select 1 from pg_constraint where connamespace = 'public'::regnamespace
      and conname = v_name and contype = 'f' and array_length(conkey,1) = 2 and convalidated) then
      v_failures := array_append(v_failures, 'FK composta ausente: ' || v_name);
    end if;
  end loop;
  foreach v_name in array array['idx_orders_establishment_status','idx_orders_table_active',
    'idx_orders_table','idx_order_items_order','idx_order_items_menu_item',
    'idx_categories_establishment','idx_menu_items_establishment','idx_menu_items_category',
    'orders_table_request_key','idx_ip_requests_expiry'] loop
    if not exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
      where c.relnamespace = 'public'::regnamespace and c.relname = v_name and i.indisvalid) then
      v_failures := array_append(v_failures, 'Índice ausente/inválido: ' || v_name);
    end if;
  end loop;
  if cardinality(v_failures) > 0 then
    raise exception 'VERIFICAÇÃO REPROVADA:%', E'\n' || array_to_string(v_failures,E'\n');
  end if;
  raise notice 'VERIFICAÇÃO APROVADA: 7 tabelas, RLS/grants, 5 status, 6 triggers, 3 RPCs privadas, FKs, índices, Storage e Realtime.';
end $$;
