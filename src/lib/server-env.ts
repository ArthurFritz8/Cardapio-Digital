import "server-only";
import { z } from "zod";
import { getClientEnv } from "./env";

/** Lazy e isolado: falha de configuração nunca imprime o valor do segredo. */
export function getServerEnv() {
  const key = z.string().min(20).safeParse(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!key.success) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente/inválida.");
  return { ...getClientEnv(), SUPABASE_SERVICE_ROLE_KEY: key.data };
}
