import { describe, expect, it } from "vitest";
import {
  addCartItem,
  cartCount,
  cartTotalCents,
  changeCartQuantity,
  isCartExpired,
  pruneCartItems,
  setCartItemNote,
  type CartItem,
} from "./cart";

const beer: Omit<CartItem, "quantity"> = {
  menu_item_id: "a1",
  name: "Cerveja",
  price_cents: 1200,
};
const fries: Omit<CartItem, "quantity"> = {
  menu_item_id: "b2",
  name: "Batata",
  price_cents: 2500,
};

describe("addCartItem", () => {
  it("adiciona item novo com quantidade 1", () => {
    const items = addCartItem([], beer);
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(1);
  });

  it("mescla item repetido incrementando quantidade", () => {
    const items = addCartItem(addCartItem([], beer), beer);
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(2);
  });

  it("respeita o teto de 50 unidades", () => {
    let items = addCartItem([], beer);
    items = items.map((i) => ({ ...i, quantity: 50 }));
    items = addCartItem(items, beer);
    expect(items[0]?.quantity).toBe(50);
  });
});

describe("changeCartQuantity", () => {
  it("remove o item quando quantidade chega a 0", () => {
    const items = changeCartQuantity(addCartItem([], beer), "a1", -1);
    expect(items).toHaveLength(0);
  });
});

describe("totais", () => {
  it("calcula total e contagem", () => {
    let items = addCartItem(addCartItem([], beer), beer);
    items = addCartItem(items, fries);
    expect(cartTotalCents(items)).toBe(2 * 1200 + 2500);
    expect(cartCount(items)).toBe(3);
  });
});

describe("setCartItemNote", () => {
  it("define e limpa observação", () => {
    let items = addCartItem([], beer);
    items = setCartItemNote(items, "a1", " sem gelo ");
    expect(items[0]?.note).toBe("sem gelo");
    items = setCartItemNote(items, "a1", "  ");
    expect(items[0]?.note).toBeUndefined();
  });
});

describe("pruneCartItems", () => {
  it("remove itens que ficaram indisponíveis", () => {
    const items = addCartItem(addCartItem([], beer), fries);
    const pruned = pruneCartItems(items, new Set(["a1"]));
    expect(pruned).toHaveLength(1);
    expect(pruned[0]?.menu_item_id).toBe("a1");
  });
});

describe("isCartExpired", () => {
  it("expira após o TTL de 4h", () => {
    const now = Date.now();
    const fresh = new Date(now - 3 * 60 * 60 * 1000).toISOString();
    const stale = new Date(now - 5 * 60 * 60 * 1000).toISOString();
    expect(isCartExpired(fresh, now)).toBe(false);
    expect(isCartExpired(stale, now)).toBe(true);
  });

  it("trata timestamp inválido como expirado", () => {
    expect(isCartExpired("lixo")).toBe(true);
  });
});
