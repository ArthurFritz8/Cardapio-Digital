"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { RECENT_ORDERS_TTL_HOURS, RECENT_ORDERS_TTL_MS } from "@/lib/constants";
import { clearRecentOrders, loadRecentOrders, recentOrdersKey, type RecentOrder } from "@/lib/recent-orders";

export function RecentOrders({ tableId }: { tableId: string }) {
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => setOrders(loadRecentOrders(tableId)), [tableId]);

  useEffect(() => {
    refresh();
    const onVisible = () => { if (!document.hidden) refresh(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === recentOrdersKey(tableId)) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh, tableId]);

  useEffect(() => {
    if (!orders.length) return;
    const expiresAt = Math.min(...orders.map((order) => order.savedAt + RECENT_ORDERS_TTL_MS));
    const timer = setTimeout(refresh, Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [orders, refresh]);

  if (!orders.length) return null;
  return (
    <section aria-labelledby="recent-orders-title" className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-2">
        <h2 id="recent-orders-title" className="text-sm font-bold">Seus pedidos nesta mesa</h2>
        <Button variant="ghost" onClick={() => {
          if (clearRecentOrders(tableId)) { setOrders([]); setError(null); }
          else setError("Não foi possível limpar os atalhos neste navegador.");
        }}>Limpar atalhos</Button>
      </div>
      <p className="mb-2 text-xs text-neutral-500">Enviados neste navegador nas últimas {RECENT_ORDERS_TTL_HOURS} horas. Abra um pedido para consultar o status com conexão.</p>
      <ul className="space-y-1">
        {orders.map((order) => (
          <li key={order.id}>
            <Link prefetch={false} href={`/pedido/${order.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 text-sm text-brand-600 underline">
              <span>Acompanhar #{order.id.slice(0, 8)}</span>
              <time dateTime={new Date(order.savedAt).toISOString()} className="text-xs text-neutral-500">
                {new Date(order.savedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </time>
            </Link>
          </li>
        ))}
      </ul>
      {error ? <p role="alert" className="mt-2 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
