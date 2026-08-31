import { CART_TTL_HOURS } from "./constants";

/**
 * Carrinho do cliente anônimo. Nome/preço aqui são SNAPSHOT ESTIMADO
 * para exibição — o servidor resolve os valores reais no envio
 * (create_order ignora qualquer preço vindo do cliente).
 */

export interface CartItem {
  menu_item_id: string;
  name: string;
  price_cents: number;
  quantity: number;
  note?: string;
}

interface StoredCart {
  items: CartItem[];
  created_at: string;
}

const MAX_QUANTITY = 50;

const storageKey = (tableId: string) => `cd.cart.${tableId}`;

// ---------- Funções puras (testáveis) ----------

export function isCartExpired(createdAt: string, now = Date.now()): boolean {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return true;
  return now - created > CART_TTL_HOURS * 60 * 60 * 1000;
}

export function cartTotalCents(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.price_cents * i.quantity, 0);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

/** Adiciona mesclando por menu_item_id (quantidade limitada a 50). */
export function addCartItem(
  items: CartItem[],
  item: Omit<CartItem, "quantity">,
): CartItem[] {
  const existing = items.find((i) => i.menu_item_id === item.menu_item_id);
  if (existing) {
    return items.map((i) =>
      i.menu_item_id === item.menu_item_id
        ? { ...i, quantity: Math.min(i.quantity + 1, MAX_QUANTITY) }
        : i,
    );
  }
  return [...items, { ...item, quantity: 1 }];
}

/** Ajusta quantidade (delta ±1); em 0, remove o item. */
export function changeCartQuantity(
  items: CartItem[],
  menuItemId: string,
  delta: number,
): CartItem[] {
  return items
    .map((i) =>
      i.menu_item_id === menuItemId
        ? { ...i, quantity: Math.min(Math.max(i.quantity + delta, 0), MAX_QUANTITY) }
        : i,
    )
    .filter((i) => i.quantity > 0);
}

export function setCartItemNote(
  items: CartItem[],
  menuItemId: string,
  note: string,
): CartItem[] {
  const trimmed = note.trim().slice(0, 200);
  return items.map((i) =>
    i.menu_item_id === menuItemId
      ? { ...i, note: trimmed || undefined }
      : i,
  );
}

/** Remove itens que saíram do cardápio (ficaram indisponíveis). */
export function pruneCartItems(
  items: CartItem[],
  availableIds: ReadonlySet<string>,
): CartItem[] {
  return items.filter((i) => availableIds.has(i.menu_item_id));
}

// ---------- Persistência (localStorage) ----------

export function loadCart(tableId: string): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(tableId));
    if (!raw) return [];
    const stored = JSON.parse(raw) as Partial<StoredCart>;
    if (
      !Array.isArray(stored.items) ||
      typeof stored.created_at !== "string" ||
      isCartExpired(stored.created_at)
    ) {
      window.localStorage.removeItem(storageKey(tableId));
      return [];
    }
    return stored.items;
  } catch {
    return [];
  }
}

export function saveCart(tableId: string, items: CartItem[]): void {
  if (typeof window === "undefined") return;
  try {
    if (items.length === 0) {
      window.localStorage.removeItem(storageKey(tableId));
      return;
    }
    const existing = window.localStorage.getItem(storageKey(tableId));
    const createdAt =
      (existing ? (JSON.parse(existing) as StoredCart).created_at : null) ??
      new Date().toISOString();
    const stored: StoredCart = { items, created_at: createdAt };
    window.localStorage.setItem(storageKey(tableId), JSON.stringify(stored));
  } catch {
    // storage indisponível — carrinho vive só em memória
  }
}

export function clearCart(tableId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(tableId));
  } catch {
    // noop
  }
}
