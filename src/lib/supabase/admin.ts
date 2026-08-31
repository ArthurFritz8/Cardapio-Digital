import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

/**
 * Client ADMIN (service_role) — BYPASSA RLS.
 * Uso EXCLUSIVO em Route Handlers server-side (ex: criação de pedidos
 * pelo cliente anônimo, após validação Zod). NUNCA importar em
 * Client Components.
 */
export function createSupabaseAdminClient() {
  const env = getServerEnv();
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
