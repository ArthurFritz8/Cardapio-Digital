import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { AppError, ERROR_CODES } from "@/lib/errors";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("@/lib/rate-limit", () => ({ enforceIpRateLimit: mocks.limit }));

const id = "11111111-1111-4111-8111-111111111111";
const payload = { table_id: id, session_token: id, request_id: id, items: [{ menu_item_id: id, quantity: 2 }] };
function request(body: unknown = payload) {
  return new Request("http://localhost/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.limit.mockResolvedValue(undefined);
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { is_active: true, establishments: { latitude: 0, longitude: 0, order_radius_meters: 150 } }, error: null }) };
  mocks.from.mockReturnValue(query);
  mocks.rpc.mockResolvedValue({ data: { id, total_cents: 3980 }, error: null });
});

describe("POST /api/orders", () => {
  it("encaminha chave e IDs à RPC, com confirmação quando geo foi negada", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("create_order", expect.objectContaining({
      p_request_id: id, p_items: payload.items, p_needs_confirmation: true, p_max_active_orders: 5,
    }));
  });
  it("rejeita preço adulterado antes de acesso ao banco", async () => {
    const response = await POST(request({ ...payload, items: [{ ...payload.items[0], price_cents: 1 }] }));
    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("limite IP bloqueia criação com Retry-After", async () => {
    mocks.limit.mockRejectedValue(new AppError(ERROR_CODES.IP_RATE_LIMIT, "Aguarde"));
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([["SESSION_EXPIRED",410], ["TABLE_ORDER_LIMIT",429], ["IDEMPOTENCY_CONFLICT",409], ["ITEM_UNAVAILABLE",422]])("mapeia %s em %s", async (code, status) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: code } });
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code } });
  });
});
