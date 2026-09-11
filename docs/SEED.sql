-- Guia do seed de demonstração pessoal (ADR 0006), sem duplicação de INSERTs.
-- 1. Use um projeto de TESTE com migrations 0001..0004 verificadas.
-- 2. Crie/confirme uma conta de teste no Auth e copie seu UUID.
-- 3. Abra supabase/seed.sql e substitua o null de v_owner por 'SEU-UUID'::uuid
--    em uma cópia no SQL Editor. Execute o arquivo inteiro.
-- 4. Não salve credenciais nem dados pessoais em arquivos versionados.
-- Sem v_owner válido, o seed falha. Reexecução não sobrescreve registros.
-- Mantemos supabase/seed.sql como única fonte, conforme decisão já registrada
-- no commit 04be486. Este arquivo atende ao roteiro /docs sem divergir os dados.

-- Após o seed: estado inicial esperado é 2 categorias, 4 itens e 3 mesas.
select e.name, e.slug,
  (select count(*) from public.categories c where c.establishment_id=e.id) as categories,
  (select count(*) from public.menu_items i where i.establishment_id=e.id) as items,
  (select count(*) from public.tables t where t.establishment_id=e.id) as tables
from public.establishments e
where e.id='00000000-0000-4000-a000-000000000001';

-- Confirmar no /admin se o estabelecimento está aberto; configurar localização
-- pelo navegador antes do teste geográfico. Coordenadas nulas desligam a triagem.
-- Mesa 1: /m/00000000-0000-4000-a000-000000000030
-- Mesa 2: /m/00000000-0000-4000-a000-000000000031
-- Pedidos, tokens e sessões devem nascer pelo fluxo real da aplicação.
