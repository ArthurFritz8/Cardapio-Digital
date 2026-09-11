"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ORDER_POLL_INTERVAL_MS, ORDER_REQUEST_TIMEOUT_MS } from "@/lib/constants";
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
  const requestRef = useRef<AbortController | null>(null);
  const activeOrderIdRef = useRef(orderId);

  const refresh = useCallback(async () => {
    if (document.hidden || !navigator.onLine || requestRef.current ||
      (statusRef.current && TERMINAL_STATUSES.includes(statusRef.current))) {
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), ORDER_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (activeOrderIdRef.current !== orderId) return;
      if (!response.ok) {
        setError(response.status === 404
          ? "Pedido não encontrado."
          : "Não foi possível atualizar o pedido. Tentaremos novamente.");
        return;
      }
      const body = (await response.json()) as { order: PublicOrder };
      if (activeOrderIdRef.current !== orderId) return;
      statusRef.current = body.order.status;
      setOrder(body.order);
      setError(null);
    } catch {
      if (activeOrderIdRef.current === orderId) {
        setError("Não foi possível atualizar o pedido. Verifique sua conexão.");
      }
    } finally {
      clearTimeout(timeout);
      if (requestRef.current === controller) requestRef.current = null;
      if (activeOrderIdRef.current === orderId) setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    activeOrderIdRef.current = orderId;
    statusRef.current = null;
    setOrder(null);
    setError(navigator.onLine ? null : "Você está offline. Conecte-se para acompanhar o pedido.");
    setIsLoading(navigator.onLine);
    void refresh();
    const interval = setInterval(() => void refresh(), ORDER_POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onOffline = () => {
      if (statusRef.current && TERMINAL_STATUSES.includes(statusRef.current)) return;
      requestRef.current?.abort();
      setError("Você está offline. O acompanhamento será atualizado ao reconectar.");
      setIsLoading(false);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onVisibilityChange);
    window.addEventListener("offline", onOffline);
    return () => {
      activeOrderIdRef.current = "";
      requestRef.current?.abort();
      requestRef.current = null;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onVisibilityChange);
      window.removeEventListener("offline", onOffline);
    };
  }, [orderId, refresh]);

  return { order, error, isLoading };
}
