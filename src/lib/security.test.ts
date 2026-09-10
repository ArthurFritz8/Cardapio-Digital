import { describe, expect, it } from "vitest";
import { safeAuthRedirect } from "./auth-redirect";
import { AppError, ERROR_CODES, errorResponseBody, fromDbError } from "./errors";
import { apiErrorResponse, readOrderBody } from "./http";
import { MAX_ORDER_BODY_BYTES } from "./constants";
import { rateLimitKey } from "./request-ip";

describe("fronteiras HTTP", () => {
  it.each(["https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/\n/evil.invalid", null])("bloqueia redirect externo %s", (path) => {
    expect(safeAuthRedirect(path)).toBe("/admin");
  });
  it("mantém recuperação PKCE interna", () => expect(safeAuthRedirect("/reset-password")).toBe("/reset-password"));
  it("não expõe detalhes do erro", () => {
    expect(errorResponseBody(new AppError(ERROR_CODES.INTERNAL, "Falhou", { token: "privado" }))).toEqual({ error: { code: "INTERNAL_ERROR", message: "Falhou" } });
    expect(fromDbError("IDEMPOTENCY_CONFLICT").status).toBe(409);
    expect(fromDbError("SESSION_EXPIRED").status).toBe(410);
    expect(fromDbError("ORDER_CONFIRMATION_REQUIRED").status).toBe(422);
  });
  it("429 IP fornece Retry-After e nenhuma resposta privada é cacheável", () => {
    const response = apiErrorResponse(new AppError(ERROR_CODES.IP_RATE_LIMIT, "Aguarde"));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("limita tamanho real ignorando Content-Length mentiroso", async () => {
    const request = new Request("http://localhost/api/orders", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": "1" }, body: "x".repeat(MAX_ORDER_BODY_BYTES + 1) });
    await expect(readOrderBody(request)).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION });
  });
  it("valida JSON e Content-Type", async () => {
    const request = (body: string, mime = "application/json") => new Request("http://localhost", { method: "POST", headers: { "Content-Type": mime }, body });
    await expect(readOrderBody(request('{"items":[]}'))).resolves.toEqual({ items: [] });
    await expect(readOrderBody(request("{"))).rejects.toMatchObject({ status: 400 });
    await expect(readOrderBody(request("{}", "text/plain"))).rejects.toMatchObject({ status: 400 });
  });
});

describe("limite IP atrás da borda", () => {
  const secret = "test-only-key";
  it("ignora XFF arbitrário e header Vercel fora da Vercel", () => {
    const headers = new Headers({ "x-forwarded-for": "192.0.2.1", "x-vercel-forwarded-for": "192.0.2.2" });
    expect(rateLimitKey(headers, false, secret)).toBe(rateLimitKey(new Headers(), false, secret));
    expect(rateLimitKey(new Headers({ "x-forwarded-for": "192.0.2.3" }), true, secret)).toBe(rateLimitKey(new Headers(), true, secret));
  });
  it("persiste só HMAC e normaliza IPv6 equivalente", () => {
    const hash = (ip: string) => rateLimitKey(new Headers({ "x-vercel-forwarded-for": ip }), true, secret);
    expect(hash("192.0.2.1")).toMatch(/^[a-f0-9]{64}$/);
    expect(hash("192.0.2.1")).not.toBe(hash("192.0.2.2"));
    expect(hash("2001:db8::1")).toBe(hash("2001:0db8:0:0:0:0:0:1"));
    expect(hash("invalid, 192.0.2.1")).toBe(rateLimitKey(new Headers(), true, secret));
  });
});
