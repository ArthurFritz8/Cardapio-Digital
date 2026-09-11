import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_RECENT_ORDERS, RECENT_ORDERS_TTL_MS } from "./constants";
import { clearRecentOrders, loadRecentOrders, recentOrdersKey, saveRecentOrder } from "./recent-orders";

const tableId = "11111111-1111-4111-8111-111111111111";
const otherTable = "22222222-2222-4222-8222-222222222222";
const orderId = "33333333-3333-4333-8333-333333333333";
const now = Date.UTC(2026, 8, 10, 12);
const data = new Map<string, string>();

beforeEach(() => {
  data.clear();
  vi.stubGlobal("window", { localStorage: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  } });
});
afterEach(() => vi.unstubAllGlobals());

describe("atalhos locais de pedidos", () => {
  it("persiste somente id/data, isola mesas e permite apagar sem afetar outra mesa", () => {
    saveRecentOrder(tableId, orderId, now);
    expect(loadRecentOrders(tableId, now)).toEqual([{ id: orderId, savedAt: now }]);
    expect(loadRecentOrders(otherTable, now)).toEqual([]);
    saveRecentOrder(otherTable, orderId, now);
    expect(clearRecentOrders(tableId)).toBe(true);
    expect(loadRecentOrders(tableId, now)).toEqual([]);
    expect(loadRecentOrders(otherTable, now)).toHaveLength(1);
  });
  it("retry não duplica nem renova TTL; expira exatamente no limite", () => {
    saveRecentOrder(tableId, orderId, now);
    saveRecentOrder(tableId, orderId, now + 1000);
    expect(loadRecentOrders(tableId, now + 1000)).toEqual([{ id: orderId, savedAt: now }]);
    expect(loadRecentOrders(tableId, now + RECENT_ORDERS_TTL_MS - 1)).toHaveLength(1);
    expect(loadRecentOrders(tableId, now + RECENT_ORDERS_TTL_MS)).toEqual([]);
  });
  it("limita aos cinco mais recentes e mantém ordem após reabrir", () => {
    for (let i = 0; i < MAX_RECENT_ORDERS + 2; i++) {
      saveRecentOrder(tableId, `44444444-4444-4444-8444-${String(i).padStart(12, "0")}`, now + i);
    }
    const orders = loadRecentOrders(tableId, now + MAX_RECENT_ORDERS + 2);
    expect(orders).toHaveLength(MAX_RECENT_ORDERS);
    expect(orders[0]?.savedAt).toBe(now + MAX_RECENT_ORDERS + 1);
    expect(orders.at(-1)?.savedAt).toBe(now + 2);
  });
  it.each(["{", "null", "{}", '[{"id":"javascript:alert(1)","savedAt":0}]', JSON.stringify([{ id: orderId, savedAt: now, customerName: "Não persistir" }])])("recusa storage inválido: %s", (raw) => {
    data.set(recentOrdersKey(tableId), raw);
    expect(loadRecentOrders(tableId, now)).toEqual([]);
  });
  it("descarta datas futuras, antigas e IDs duplicados", () => {
    data.set(recentOrdersKey(tableId), JSON.stringify([
      { id: orderId, savedAt: now - RECENT_ORDERS_TTL_MS },
      { id: otherTable, savedAt: now + 1 },
      { id: orderId, savedAt: now },
      { id: orderId, savedAt: now },
    ]));
    expect(loadRecentOrders(tableId, now)).toEqual([{ id: orderId, savedAt: now }]);
  });
  it("não grava IDs inválidos nem timestamps inválidos", () => {
    saveRecentOrder(tableId, "../admin", now);
    saveRecentOrder("mesa", orderId, now);
    saveRecentOrder(tableId, orderId, NaN);
    expect(data.size).toBe(0);
  });
  it("storage bloqueado não interrompe o pedido e não simula remoção bem-sucedida", () => {
    vi.stubGlobal("window", { get localStorage() { throw new Error("blocked"); } });
    expect(() => saveRecentOrder(tableId, orderId, now)).not.toThrow();
    expect(loadRecentOrders(tableId, now)).toEqual([]);
    expect(clearRecentOrders(tableId)).toBe(false);
  });
  it("é seguro durante renderização no servidor", () => {
    vi.stubGlobal("window", undefined);
    expect(() => saveRecentOrder(tableId, orderId, now)).not.toThrow();
    expect(loadRecentOrders(tableId, now)).toEqual([]);
    expect(clearRecentOrders(tableId)).toBe(false);
  });
});
