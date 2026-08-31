-- ============================================================
-- Cardápio Digital — Storage bucket para imagens (logo + pratos)
-- Migration: 0003_storage_bucket
-- Depende de: 0001 (is_establishment_owner)
-- ============================================================

-- Bucket público (leitura); limites enforçados no próprio bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-images',
  'menu-images',
  true,
  2097152, -- 2MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Path convention: {establishment_id}/{kind}/{uuid}.jpg
-- O primeiro folder DEVE ser um establishment do usuário logado.
create policy "menu_images_public_read"
  on storage.objects for select
  using (bucket_id = 'menu-images');

create policy "menu_images_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'menu-images'
    and public.is_establishment_owner(((storage.foldername(name))[1])::uuid)
  );

create policy "menu_images_owner_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'menu-images'
    and public.is_establishment_owner(((storage.foldername(name))[1])::uuid)
  );

create policy "menu_images_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'menu-images'
    and public.is_establishment_owner(((storage.foldername(name))[1])::uuid)
  );
