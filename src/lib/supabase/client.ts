import { createBrowserClient } from "@supabase/ssr";
import { getClientEnv } from "@/lib/env";

/**
 * Client Supabase para uso em Client Components (browser).
 * Usa anon key — todo acesso é protegido por RLS.
 */
export function createSupabaseBrowserClient() {
  const env = getClientEnv();
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
