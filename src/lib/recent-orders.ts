import { z } from "zod";
import { uuidSchema } from "@/schemas/common";
import { MAX_RECENT_ORDERS, RECENT_ORDERS_TTL_MS } from "./constants";

const recentOrderSchema = z.object({
  id: uuidSchema,
  savedAt: z.number().int().nonnegative(),
}).strict();

export type RecentOrder = z.infer<typeof recentOrderSchema>;
export const recentOrdersKey = (tableId: string) => `cd.recent-orders.${tableId}`;

/** Os IDs são atalhos de acesso, nunca prova de identidade ou estado do pedido. */
export function loadRecentOrders(tableId: string, now = Date.now()): RecentOrder[] {
  if (typeof window === "undefined" || !uuidSchema.safeParse(tableId).success) return [];
  try {
    const key = recentOrdersKey(tableId);
    const raw = window.localStorage.getItem(key);
    const parsed = z.array(recentOrderSchema).safeParse(
      JSON.parse(raw ?? "[]"),
    );
    if (!parsed.success) return [];
    const seen = new Set<string>();
    const orders = parsed.data
      .filter((order) => order.savedAt <= now && now - order.savedAt < RECENT_ORDERS_TTL_MS)
      .sort((a, b) => b.savedAt - a.savedAt)
      .filter((order) => {
        if (seen.has(order.id)) return false;
        seen.add(order.id);
        return true;
      })
      .slice(0, MAX_RECENT_ORDERS);
    // Expiração é local: limpar quando a página voltar a ler os atalhos.
    try {
      if (raw && !orders.length) window.localStorage.removeItem(key);
      else if (raw && raw !== JSON.stringify(orders)) window.localStorage.setItem(key, JSON.stringify(orders));
    } catch {
      // A leitura válida continua útil mesmo se a escrita estiver bloqueada.
    }
    return orders;
  } catch {
    return [];
  }
}

/** Chamar somente após o servidor confirmar o envio; falha de storage não impede navegar. */
export function saveRecentOrder(tableId: string, orderId: string, now = Date.now()): void {
  if (typeof window === "undefined" || !uuidSchema.safeParse(tableId).success) return;
  const parsed = recentOrderSchema.safeParse({ id: orderId, savedAt: now });
  if (!parsed.success) return;
  try {
    const orders = loadRecentOrders(tableId, now);
    // Retry idempotente não duplica o atalho nem renova sua retenção.
    if (!orders.some((order) => order.id === orderId)) orders.unshift(parsed.data);
    window.localStorage.setItem(recentOrdersKey(tableId), JSON.stringify(orders.slice(0, MAX_RECENT_ORDERS)));
  } catch {
    // Navegação segue mesmo em modo privado, storage bloqueado ou quota esgotada.
  }
}

export function clearRecentOrders(tableId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(recentOrdersKey(tableId));
    return true;
  } catch {
    return false;
  }
}
