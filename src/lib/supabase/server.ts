import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerEnv } from "@/lib/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Client Supabase para Server Components / Route Handlers,
 * autenticado via cookies da sessão do usuário (RLS aplicado).
 */
export function createSupabaseServerClient() {
  // cookies() ANTES do env: marca a rota como dinâmica no build,
  // evitando prerender que quebraria sem .env (CI/build local)
  const cookieStore = cookies();
  const env = getServerEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // set() falha em Server Components (read-only) — ok ignorar,
            // o middleware é quem renova a sessão.
          }
        },
      },
    },
  );
}
