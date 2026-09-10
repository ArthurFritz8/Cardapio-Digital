import { createHmac } from "node:crypto";
import { isIP } from "node:net";

/** Só o header reescrito pela borda Vercel é confiável. Nunca usar XFF do cliente. */
export function rateLimitKey(headers: Headers, onVercel: boolean, secret: string): string {
  const candidate = onVercel ? headers.get("x-vercel-forwarded-for")?.trim() : undefined;
  let address = "unknown-shared";
  if (candidate && isIP(candidate)) {
    address = isIP(candidate) === 6
      ? new URL(`http://[${candidate}]/`).hostname.toLowerCase()
      : candidate;
  }
  // Fallback coletivo limita abuso também no localhost/headers ausentes, sem bypass.
  return createHmac("sha256", secret).update(`cardapio-rate-limit:${address}`).digest("hex");
}
