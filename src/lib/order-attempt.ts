import { CART_TTL_HOURS } from "./constants";

interface OrderAttempt {
  id: string;
  fingerprint: string;
  customerName: string;
  createdAt: number;
}

const storageKey = (tableId: string) => `cd.order-attempt.${tableId}`;

/** Mantém a tentativa quando a resposta se perde ou a página é recarregada. */
export function loadOrderAttempt(tableId: string): OrderAttempt | null {
  if (typeof window === "undefined") return null;
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(storageKey(tableId)) ?? "null");
    if (!raw || typeof raw !== "object") return null;
    const value = raw as Partial<OrderAttempt>;
    if (typeof value.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id) ||
      typeof value.fingerprint !== "string" || typeof value.customerName !== "string" ||
      typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt) ||
      Date.now() - value.createdAt >= CART_TTL_HOURS * 3_600_000 || value.createdAt > Date.now()) return null;
    return value as OrderAttempt;
  } catch { return null; }
}

export function orderAttempt(
  tableId: string,
  payload: unknown,
  customerName: string,
  previous: OrderAttempt | null = null,
): OrderAttempt {
  const fingerprint = JSON.stringify(payload);
  const existing = previous ?? loadOrderAttempt(tableId);
  if (existing?.fingerprint === fingerprint) return existing;
  const next = { id: crypto.randomUUID(), fingerprint, customerName, createdAt: Date.now() };
  try { window.localStorage.setItem(storageKey(tableId), JSON.stringify(next)); } catch { /* fallback no ref do carrinho */ }
  return next;
}

export function clearOrderAttempt(tableId: string): void {
  try { window.localStorage.removeItem(storageKey(tableId)); } catch { /* storage opcional */ }
}
