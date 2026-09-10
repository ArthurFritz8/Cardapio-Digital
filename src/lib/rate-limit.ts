import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IP_RATE_LIMITS, IP_RATE_WINDOW_SECONDS } from "./constants";
import { AppError, ERROR_CODES, fromDbError } from "./errors";
import { rateLimitKey } from "./request-ip";
import { getServerEnv } from "./server-env";

export async function enforceIpRateLimit(
  request: Request,
  admin: SupabaseClient,
  action: keyof typeof IP_RATE_LIMITS,
): Promise<void> {
  const key = rateLimitKey(request.headers, process.env.VERCEL === "1", getServerEnv().SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await admin.rpc("consume_ip_rate_limit", {
    p_key_hash: key, p_action: action,
    p_limit: IP_RATE_LIMITS[action], p_window_seconds: IP_RATE_WINDOW_SECONDS,
  });
  if (error) throw fromDbError(error.message);
  if (data !== true) throw new AppError(ERROR_CODES.IP_RATE_LIMIT, "Muitas tentativas nesta rede. Aguarde um minuto e tente novamente.");
}
