# ADR 0003 — Autenticação e painel admin mínimo

**Data:** 2026-08-30
**Status:** Aceito

## Objetivo

Permitir que o dono do bar crie conta, cadastre o estabelecimento (onboarding), gerencie cardápio (categorias + itens), mesas e QR Codes — o mínimo para alimentar a página pública do cliente. **Fora de escopo (decisão explícita):** dashboard, relatórios, gráficos, configurações avançadas, multi-estabelecimento.

Ordem de build confirmada: Auth → painel admin → página pública do cliente → pedidos realtime (cada etapa alimenta a seguinte com dados reais).

## Contexto

Sugestões da IA externa revisadas com poder de veto (protocolo padrão).

## Solução

### Auth (Supabase Auth, free tier)
- Login, signup (com fluxo de confirmação de email OU sessão imediata, conforme config do projeto), recuperação de senha (`resetPasswordForEmail` + página `/reset-password`), logout.
- `src/middleware.ts`: refresh de sessão (@supabase/ssr) + gate de `/admin/*` e `/onboarding`; `getUser()` valida o JWT no servidor (não confia no cookie). Auth pages redirecionam para `/admin` se já logado.
- `src/app/auth/callback/route.ts`: troca PKCE code por sessão, com **guarda anti open-redirect** no parâmetro `next`.
- Forgot password sempre responde sucesso (anti user-enumeration).

### Guard e layout
- `src/lib/admin/guard.ts`: guard **server-side** com `React.cache()` — sem flash de conteúdo não autorizado, sem fetch duplicado. Sem establishment → redirect `/onboarding` (fora do layout `/admin` para evitar loop de redirect).
- Layout admin responsivo (header fixo + nav horizontal rolável — funciona no Android do dono).

### CRUDs (browser client + RLS — sem API routes para admin)
As policies `*_owner_all` do ADR 0001 já protegem as escritas do dono; API routes intermediárias seriam camada redundante.
- **Estabelecimento:** form único reutilizado (onboarding + edição): nome, slug auto-gerado (`lib/slug.ts`, editável), descrição, logo, lat/lng com botão "usar minha localização" (reusa `useGeolocation`), raio, aberto/fechado.
- **Cardápio:** categorias (criar, renomear, reordenar por swap de `sort_order`, soft-delete `is_active`) e itens (criar/editar com preço via `parseCents`, foto, trocar categoria, reordenar, toggle disponibilidade). Tela única.
- **Mesas:** criar, ativar/desativar, QR Code client-side (`qrcode` npm, PNG 1024px, correção H) com download para impressão.

### Storage (migration 0003)
- Bucket `menu-images` público (leitura), 2MB, MIME whitelist. Escrita restrita por policy: primeiro folder do path = establishment do usuário (`is_establishment_owner`).
- **Compressão client-side via canvas** (máx. 1200px, JPEG 0.82) antes do upload.

## Vetos aplicados às sugestões externas

1. **QR Code apontando para `/m/{qr_code_token}` — VETADO (crítico).** O `session_token` é rotativo com TTL 2h (ADR 0002); QR impresso com token viraria lixo a cada 2h. QR aponta para `/m/{table_id}` (uuid estável); token obtido no scan.
2. **Supabase Image Transformations "free tier" — VETADO.** É recurso do plano Pro. Correção: compressão client-side (custo zero, resolve também fotos de celular >2MB).
3. **`AdminGuard` client + `useEstablishment` com Context — VETADO.** Anti-pattern no App Router (flash de conteúdo, fetch duplo, waterfall). Correção: guard server-side no layout com `React.cache()`; dados fluem por props de server components.
4. **Telefone, geocoding de endereço e assentos por mesa — VETADOS (YAGNI).** Colunas inexistentes no schema e sem uso no MVP; geocoding exigiria API externa. Correção: botão de geolocalização do navegador para lat/lng.

## Prevenção

- Correção estrutural em `createSupabaseServerClient`: `cookies()` é chamado **antes** de `getServerEnv()` — o bailout dinâmico do Next ocorre primeiro e o build não quebra em ambiente sem `.env` (CI).
- Slug duplicado (23505) tratado com mensagem amigável; regex do slug validada em 3 camadas (client, Zod, constraint SQL).
- Reordenação por swap de `sort_order` — sem renumeração em massa (O(1) por operação).
- Regra "categoria inativa oculta seus itens do cardápio público mesmo com `is_available=true`" fica REGISTRADA aqui e será aplicada na query pública (próxima tarefa).

## Pendências conhecidas

- Página pública `/m/[tableId]` e tela de pedidos realtime (próximas tarefas).
- Imagens antigas não são deletadas do Storage ao trocar logo/foto (limpeza fica para tarefa de manutenção; 1GB dá folga no piloto).
- MVP assume 1 establishment por dono (primeiro criado); multi-loja exige ADR futuro.
