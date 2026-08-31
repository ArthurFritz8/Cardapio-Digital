"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addCartItem,
  cartCount,
  cartTotalCents,
  changeCartQuantity,
  clearCart,
  loadCart,
  pruneCartItems,
  saveCart,
  setCartItemNote,
  type CartItem,
} from "@/lib/cart";

/** Estado do carrinho isolado por mesa, persistido com TTL de 4h. */
export function useCart(tableId: string) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(loadCart(tableId));
  }, [tableId]);

  const mutate = useCallback(
    (updater: (prev: CartItem[]) => CartItem[]) => {
      setItems((prev) => {
        const next = updater(prev);
        saveCart(tableId, next);
        return next;
      });
    },
    [tableId],
  );

  return {
    items,
    totalCents: cartTotalCents(items),
    count: cartCount(items),
    add: (item: Omit<CartItem, "quantity">) =>
      mutate((prev) => addCartItem(prev, item)),
    changeQuantity: (menuItemId: string, delta: number) =>
      mutate((prev) => changeCartQuantity(prev, menuItemId, delta)),
    setNote: (menuItemId: string, note: string) =>
      mutate((prev) => setCartItemNote(prev, menuItemId, note)),
    prune: (availableIds: ReadonlySet<string>) =>
      mutate((prev) => pruneCartItems(prev, availableIds)),
    clear: () => {
      clearCart(tableId);
      setItems([]);
    },
  };
}

export type CartApi = ReturnType<typeof useCart>;
