"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OWNER_ORDERS_POLL_INTERVAL_MS } from "@/lib/constants";
import {
  ACTIVE_ORDER_STATUSES,
  sortActiveOrders,
  upsertActiveOrder,
  type OwnerOrder,
  type OwnerOrderItem,
} from "@/lib/order-board";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Order } from "@/types/domain";

export type ConnectionState = "live" | "reconnecting" | "offline";

const ORDER_SELECT =
  "*, tables ( label ), order_items ( item_name, unit_price_cents, quantity, note )";

interface RawOrderRow extends Order {
  tables: { label: string } | { label: string }[] | null;
  order_items: OwnerOrderItem[] | null;
}

function toOwnerOrder(row: RawOrderRow): OwnerOrder {
  const { tables, order_items, ...order } = row;
  const table = Array.isArray(tables) ? tables[0] : tables;
  return { ...order, table_label: table?.label ?? "", items: order_items ?? [] };
}

/**
 * Pedidos ativos do dono em 3 camadas (ADR 0005):
 * 1. Realtime = acelerador (evento → refetch incremental do pedido);
 * 2. refetch completo em todo SUBSCRIBED (cobre eventos perdidos na reconexão);
 * 3. polling 30s como rede de segurança (pausado com aba oculta).
 * Som: QUALQUER caminho que traga um id nunca visto dispara onNewOrder —
 * se só o INSERT do Realtime apitasse, pedido chegando via polling seria mudo.
 */
export function useOrdersRealtime(
  establishmentId: string,
  onNewOrder?: (order: OwnerOrder) => void,
) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [orders, setOrders] = useState<OwnerOrder[]>([]);
  const [connection, setConnection] = useState<ConnectionState>("offline");
  const [now, setNow] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const knownIdsRef = useRef<Set<string> | null>(null);
  const onNewOrderRef = useRef(onNewOrder);
  onNewOrderRef.current = onNewOrder;

  const registerOrders = useCallback((incoming: OwnerOrder[]) => {
    const known = knownIdsRef.current;
    if (!known) {
      // Primeira carga: registra sem apitar (pedidos já estavam na tela de alguém)
      knownIdsRef.current = new Set(incoming.map((o) => o.id));
      return;
    }
    for (const order of incoming) {
      if (!known.has(order.id)) {
        known.add(order.id);
        onNewOrderRef.current?.(order);
      }
    }
  }, []);

  const refetchAll = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("establishment_id", establishmentId)
      .in("status", ACTIVE_ORDER_STATUSES)
      .order("created_at")
      .returns<RawOrderRow[]>();
    if (!error && data) {
      const mapped = data.map(toOwnerOrder);
      registerOrders(mapped);
      setOrders(sortActiveOrders(mapped));
    }
    setNow(Date.now());
    setIsLoading(false);
  }, [supabase, establishmentId, registerOrders]);

  const refetchOne = useCallback(
    async (orderId: string) => {
      const { data, error } = await supabase
        .from("orders")
        .select(ORDER_SELECT)
        .eq("id", orderId)
        .maybeSingle<RawOrderRow>();
      if (error || !data) return;
      const order = toOwnerOrder(data);
      if (ACTIVE_ORDER_STATUSES.includes(order.status)) {
        registerOrders([order]);
      }
      setOrders((prev) => upsertActiveOrder(prev, order));
      setNow(Date.now());
    },
    [supabase, registerOrders],
  );

  /** Update otimista local; em falha, o chamador restaura com refetchOne. */
  const applyLocal = useCallback((order: OwnerOrder) => {
    setOrders((prev) => upsertActiveOrder(prev, order));
  }, []);

  useEffect(() => {
    void refetchAll();

    const channel = supabase
      .channel(`orders-${establishmentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `establishment_id=eq.${establishmentId}`,
        },
        (payload) => {
          const row = payload.new as { id?: string } | null;
          if (row?.id) void refetchOne(row.id);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnection("live");
          // Reconexão NÃO reenvia eventos perdidos — refetch completo obrigatório
          void refetchAll();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnection("reconnecting");
        } else if (status === "CLOSED") {
          setConnection("offline");
        }
      });

    const interval = setInterval(() => {
      if (!document.hidden) void refetchAll();
    }, OWNER_ORDERS_POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refetchAll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      void supabase.removeChannel(channel);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [supabase, establishmentId, refetchAll, refetchOne]);

  return { orders, connection, now, isLoading, refetchAll, refetchOne, applyLocal };
}
