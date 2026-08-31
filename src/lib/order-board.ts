import type { Order, OrderStatus } from "@/types/domain";

/**
 * Lógica pura do quadro de pedidos do dono (kanban /admin/pedidos).
 * "Aguardando confirmação" NÃO é status no banco — é projeção do flag
 * needs_confirmation sobre pending (ADRs 0002/0004).
 */

export interface OwnerOrderItem {
  item_name: string;
  unit_price_cents: number;
  quantity: number;
  note: string | null;
}

export interface OwnerOrder extends Order {
  table_label: string;
  items: OwnerOrderItem[];
}

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "preparing",
  "ready",
];

export type BoardColumn = "awaiting" | "queue" | "preparing" | "ready";

export function isAwaitingConfirmation(order: Order): boolean {
  return (
    order.status === "pending" &&
    order.needs_confirmation &&
    !order.confirmed_at
  );
}

export function boardColumn(order: Order): BoardColumn | null {
  if (isAwaitingConfirmation(order)) return "awaiting";
  if (order.status === "pending") return "queue";
  if (order.status === "preparing") return "preparing";
  if (order.status === "ready") return "ready";
  return null;
}

export function sortActiveOrders(orders: OwnerOrder[]): OwnerOrder[] {
  return [...orders].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Insere/atualiza um pedido na lista ativa; estados terminais removem o card. */
export function upsertActiveOrder(
  orders: OwnerOrder[],
  order: OwnerOrder,
): OwnerOrder[] {
  const without = orders.filter((o) => o.id !== order.id);
  if (!ACTIVE_ORDER_STATUSES.includes(order.status)) return without;
  return sortActiveOrders([...without, order]);
}

export function elapsedMinutes(createdAt: string, nowMs: number): number {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, Math.floor((nowMs - created) / 60_000));
}

export type AgeLevel = "ok" | "warn" | "late";

export function ageLevel(minutes: number): AgeLevel {
  if (minutes >= 20) return "late";
  if (minutes >= 10) return "warn";
  return "ok";
}

/** Anexa motivo de cancelamento ao note sem sobrescrever o que o cliente escreveu. */
export function appendCancelReason(
  note: string | null,
  reason: string,
): string | null {
  const trimmed = reason.trim().slice(0, 200);
  if (!trimmed) return note;
  const suffix = `Cancelado: ${trimmed}`;
  const combined = note ? `${note} | ${suffix}` : suffix;
  // orders.note tem check <= 300 no banco — estourar faria o UPDATE falhar
  if (combined.length <= 300) return combined;
  const room = Math.max(0, 300 - suffix.length - 4);
  return `${(note ?? "").slice(0, room)}… | ${suffix}`.slice(0, 300);
}
