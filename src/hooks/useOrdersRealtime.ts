"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ORDER_REQUEST_TIMEOUT_MS, OWNER_ORDERS_PAGE_SIZE, OWNER_ORDERS_POLL_INTERVAL_MS } from "@/lib/constants";
import {
  ACTIVE_ORDER_STATUSES,
  sortActiveOrders,
  upsertActiveOrder,
  type OwnerOrder,
  type OwnerOrderItem,
} from "@/lib/order-board";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { createRequestQueue } from "@/lib/request-queue";
import { useOnline } from "@/hooks/useOnline";
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
  const [error, setError] = useState<string | null>(null);
  const online = useOnline();
  const enqueue = useMemo(() => createRequestQueue(), []);
  const fullRequestRef = useRef<Promise<void> | null>(null);
  const generationRef = useRef(0);
  const revisionRef = useRef(0);
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

  const refetchAll = useCallback((force = false) => {
    if (fullRequestRef.current && !force) return fullRequestRef.current;
    const generation = generationRef.current;
    const request = enqueue(async () => {
      if (generation !== generationRef.current) return;
      const revision = revisionRef.current;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), ORDER_REQUEST_TIMEOUT_MS);
      try {
        const rows: RawOrderRow[] = [];
        for (let from = 0; ; from += OWNER_ORDERS_PAGE_SIZE) {
          const { data, error: queryError } = await supabase
            .from("orders")
            .select(ORDER_SELECT)
            .eq("establishment_id", establishmentId)
            .in("status", ACTIVE_ORDER_STATUSES)
            .order("created_at")
            .order("id")
            .range(from, from + OWNER_ORDERS_PAGE_SIZE - 1)
            .abortSignal(controller.signal)
            .returns<RawOrderRow[]>();
          if (queryError) throw queryError;
          rows.push(...(data ?? []));
          if (!data || data.length < OWNER_ORDERS_PAGE_SIZE) break;
        }
        if (generation !== generationRef.current) return;
        if (revision === revisionRef.current) {
          const mapped = Array.from(new Map(rows.map((row) => [row.id, toOwnerOrder(row)])).values());
          registerOrders(mapped);
          setOrders(sortActiveOrders(mapped));
        }
        setError(null);
      } catch {
        if (generation === generationRef.current) {
          setError("Não foi possível sincronizar os pedidos. Tentaremos novamente; confira a conexão.");
        }
      } finally {
        clearTimeout(timeout);
        if (generation === generationRef.current) {
          setNow(Date.now());
          setIsLoading(false);
        }
      }
    });
    fullRequestRef.current = request;
    void request.finally(() => {
      if (fullRequestRef.current === request) fullRequestRef.current = null;
    });
    return request;
  }, [enqueue, supabase, establishmentId, registerOrders]);

  const refetchOne = useCallback(
    (orderId: string) => {
      const generation = generationRef.current;
      return enqueue(async () => {
        if (generation !== generationRef.current) return;
        const revision = revisionRef.current;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ORDER_REQUEST_TIMEOUT_MS);
        try {
          const { data, error: queryError } = await supabase
            .from("orders")
            .select(ORDER_SELECT)
            .eq("establishment_id", establishmentId)
            .eq("id", orderId)
            .abortSignal(controller.signal)
            .maybeSingle<RawOrderRow>();
          if (queryError) throw queryError;
          if (generation !== generationRef.current || revision !== revisionRef.current) return;
          if (!data) {
            setOrders((prev) => prev.filter((order) => order.id !== orderId));
            return;
          }
          const order = toOwnerOrder(data);
          if (ACTIVE_ORDER_STATUSES.includes(order.status)) registerOrders([order]);
          setOrders((prev) => upsertActiveOrder(prev, order));
          setNow(Date.now());
        } catch {
          if (generation === generationRef.current) setError("Falha ao atualizar um pedido. A sincronização será repetida.");
        } finally {
          clearTimeout(timeout);
        }
      });
    },
    [enqueue, supabase, establishmentId, registerOrders],
  );

  /** Update otimista local; em falha, o chamador restaura com refetchOne. */
  const applyLocal = useCallback((order: OwnerOrder) => {
    revisionRef.current++;
    setOrders((prev) => upsertActiveOrder(prev, order));
  }, []);

  useEffect(() => {
    generationRef.current++;
    fullRequestRef.current = null;
    knownIdsRef.current = null;
    setOrders([]);
    setIsLoading(true);
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
          const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as { id?: string } | null;
          if (row?.id) void refetchOne(row.id);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnection("live");
          // Reconexão NÃO reenvia eventos perdidos — refetch completo obrigatório
          void refetchAll(true);
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
    window.addEventListener("online", onVisibilityChange);

    return () => {
      // Contador de invalidação (não ref de nó React) — incremento é sempre correto no unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generationRef.current++;
      void supabase.removeChannel(channel);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onVisibilityChange);
    };
  }, [supabase, establishmentId, refetchAll, refetchOne]);

  const effectiveConnection = !online ? "offline" : error && connection === "live" ? "reconnecting" : connection;
  return { orders, connection: effectiveConnection, error, now, isLoading, refetchAll, refetchOne, applyLocal };
}
