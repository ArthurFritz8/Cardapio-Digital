"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ORDER_POLL_INTERVAL_MS } from "@/lib/constants";
import type { PublicOrder } from "@/app/api/orders/[orderId]/route";
import type { OrderStatus } from "@/types/domain";

const TERMINAL_STATUSES: OrderStatus[] = ["delivered", "cancelled"];

/**
 * Status do pedido via POLLING (RLS de orders é fechada para anon —
 * Realtime anônimo não funcionaria). Para automaticamente em estado
 * terminal; revalida ao voltar o foco (reabrir a página "reconecta").
 */
export function useOrderStatus(orderId: string) {
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const statusRef = useRef<OrderStatus | null>(null);

  const refresh = useCallback(async () => {
    if (statusRef.current && TERMINAL_STATUSES.includes(statusRef.current)) {
      return;
    }
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 404) setError("Pedido não encontrado.");
        return;
      }
      const body = (await response.json()) as { order: PublicOrder };
      statusRef.current = body.order.status;
      setOrder(body.order);
      setError(null);
    } catch {
      // offline momentâneo — mantém último estado conhecido
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), ORDER_POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  return { order, error, isLoading };
}
