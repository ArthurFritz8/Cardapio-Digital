import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCart, isCartExpired, loadCart, saveCart } from "./cart";
import { clearOrderAttempt, loadOrderAttempt, orderAttempt } from "./order-attempt";
import { loadTableSession } from "./table-session";
import { parseCents } from "./money";

const id = "11111111-1111-4111-8111-111111111111";
const item = { menu_item_id: id, name: "Prato", quantity: 1, price_cents: 1990 };
const data = new Map<string, string>();
beforeEach(() => {
  data.clear();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) } });
});
afterEach(() => vi.unstubAllGlobals());

describe("persistência tolerante a corrupção", () => {
  it("isola mesas e repara JSON inválido na próxima edição", () => {
    data.set(`cd.cart.${id}`, "{");
    expect(loadCart(id)).toEqual([]);
    saveCart(id, [item]);
    expect(loadCart(id)).toEqual([item]);
    expect(loadCart("outra")).toEqual([]);
    clearCart(id);
    expect(loadCart(id)).toEqual([]);
  });
  it("recusa itens inválidos e timestamp futuro", () => {
    data.set(`cd.cart.${id}`, JSON.stringify({ items: [{ ...item, quantity: -1 }], created_at: new Date().toISOString() }));
    expect(loadCart(id)).toEqual([]);
    expect(isCartExpired(new Date(Date.now() + 10000).toISOString())).toBe(true);
    data.set(`cd.table-session.${id}`, JSON.stringify({ token: id, expiresAt: "lixo" }));
    expect(loadTableSession(id)).toBeNull();
  });
  it("mantém id da tentativa após reload/timeout e só troca com conteúdo novo", () => {
    const first = orderAttempt(id, { items: [item] }, "Ana");
    expect(orderAttempt(id, { items: [item] }, "Ana").id).toBe(first.id);
    expect(loadOrderAttempt(id)?.customerName).toBe("Ana");
    expect(orderAttempt(id, { items: [{ ...item, quantity: 2 }] }, "Ana").id).not.toBe(first.id);
    clearOrderAttempt(id);
    expect(loadOrderAttempt(id)).toBeNull();
  });
});

describe("parse de dinheiro sem coerção numérica permissiva", () => {
  it.each(["0x10", "1e3", "1.2,34", "1,234", "1.005", "999999999999999999999999"])("rejeita %s", (input) => expect(parseCents(input)).toBeNull());
  it("não perde um centavo por arredondamento binário", () => {
    expect(parseCents("1.15")).toBe(115);
    expect(parseCents("1,1")).toBe(110);
    expect(parseCents("R$ 1.234,56")).toBe(123456);
  });
});
