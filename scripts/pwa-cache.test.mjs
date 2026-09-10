import { describe, expect, it } from "vitest";
import { pwaOptions } from "../next.config.mjs";

function strategy(path, { origin = "https://menu.example", mode = "cors", headers = {} } = {}) {
  const url = new URL(path, origin);
  const request = { mode, headers: new Headers(headers) };
  return pwaOptions.workboxOptions.runtimeCaching.find((rule) =>
    rule.urlPattern instanceof RegExp ? rule.urlPattern.test(url.href) :
      rule.urlPattern({ url, request, sameOrigin: url.origin === "https://menu.example" }),
  )?.handler;
}

describe("limites de cache do Service Worker", () => {
  it("nunca guarda API, admin, autenticação, RSC ou dados autenticados Supabase", () => {
    for (const path of ["/api/orders/uuid", "/admin/pedidos", "/login", "/auth/callback?code=secret",
      "https://test.supabase.co/rest/v1/orders?select=*", "https://test.supabase.co/auth/v1/user"]) {
      expect(strategy(path)).toBe("NetworkOnly");
    }
    expect(strategy("/m/11111111-1111-4111-8111-111111111111", { headers: { RSC: "1" } })).toBe("NetworkOnly");
    expect(pwaOptions.extendDefaultRuntimeCaching).toBe(false);
    expect(pwaOptions.cacheOnFrontEndNav).toBe(false);
  });

  it("preserva offline apenas do HTML público e cache-first das fotos", () => {
    const menu = "/m/11111111-1111-4111-8111-111111111111";
    expect(strategy(menu, { mode: "navigate" })).toBe("StaleWhileRevalidate");
    expect(strategy(menu, { headers: { "X-Public-Menu-Shell": "1" } })).toBe("StaleWhileRevalidate");
    expect(strategy("https://test.supabase.co/storage/v1/object/public/menu-images/a.jpg")).toBe("CacheFirst");
    expect(strategy("/_next/static/chunks/main.js")).toBe("CacheFirst");
  });
});
