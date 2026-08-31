"use client";

import { AlertTriangle, MapPinOff } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { formatCents } from "@/lib/money";
import {
  ageLevel,
  elapsedMinutes,
  isAwaitingConfirmation,
  type OwnerOrder,
} from "@/lib/order-board";
import type { OrderStatus } from "@/types/domain";

interface OrderCardProps {
  order: OwnerOrder;
  now: number;
  onAdvance: (order: OwnerOrder, next: OrderStatus) => void;
  onConfirmTable: (order: OwnerOrder) => void;
  onRequestCancel: (order: OwnerOrder) => void;
}

const AGE_CLASSES = {
  ok: "text-neutral-500",
  warn: "text-amber-600 font-semibold dark:text-amber-500",
  late: "text-red-600 font-semibold dark:text-red-400",
} as const;

export function OrderCard({
  order,
  now,
  onAdvance,
  onConfirmTable,
  onRequestCancel,
}: OrderCardProps) {
  const awaiting = isAwaitingConfirmation(order);
  const minutes = elapsedMinutes(order.created_at, now);
  const level = ageLevel(minutes);
  // Trigger do banco: cancelled só a partir de pending/preparing (ready não cancela)
  const canCancel =
    !awaiting && (order.status === "pending" || order.status === "preparing");

  return (
    <article
      className={cn(
        "rounded-2xl border bg-white p-3 dark:bg-neutral-900",
        awaiting
          ? "border-amber-400 dark:border-amber-600"
          : "border-neutral-200 dark:border-neutral-800",
      )}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <span className="rounded-lg bg-brand-500 px-2.5 py-1 text-sm font-bold text-white">
          {order.table_label}
        </span>
        <span className={cn("text-xs", AGE_CLASSES[level])}>
          {minutes === 0 ? "agora" : `há ${minutes} min`}
        </span>
      </header>

      {order.customer_name ? (
        <p className="mb-1 truncate text-xs text-neutral-500">
          {order.customer_name}
        </p>
      ) : null}

      {order.needs_confirmation ? (
        <p className="mb-2 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-500">
          <MapPinOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Sem confirmação de localização
        </p>
      ) : null}

      <ul className="mb-2 space-y-1">
        {order.items.map((item, index) => (
          <li key={index} className="text-sm">
            <span className="font-semibold">{item.quantity}×</span>{" "}
            {item.item_name}
            {item.note ? (
              <span className="block pl-4 text-xs text-neutral-500">
                Obs: {item.note}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {order.note ? (
        <p className="mb-2 text-xs text-neutral-500">Nota: {order.note}</p>
      ) : null}

      <p className="mb-3 text-sm font-bold">{formatCents(order.total_cents)}</p>

      <div className="flex flex-col gap-2">
        {awaiting ? (
          <>
            <Button
              onClick={() => onConfirmTable(order)}
              className="w-full py-2.5"
            >
              <AlertTriangle className="h-4 w-4" aria-hidden />
              Confirmar mesa
            </Button>
            <Button
              variant="danger"
              onClick={() => onRequestCancel(order)}
              className="w-full"
            >
              Recusar
            </Button>
          </>
        ) : (
          <>
            {order.status === "pending" ? (
              <Button
                onClick={() => onAdvance(order, "preparing")}
                className="w-full py-2.5"
              >
                Iniciar preparo
              </Button>
            ) : null}
            {order.status === "preparing" ? (
              <Button
                onClick={() => onAdvance(order, "ready")}
                className="w-full py-2.5"
              >
                Marcar pronto
              </Button>
            ) : null}
            {order.status === "ready" ? (
              <Button
                onClick={() => onAdvance(order, "delivered")}
                className="w-full py-2.5"
              >
                Marcar entregue
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                variant="ghost"
                onClick={() => onRequestCancel(order)}
                className="w-full text-red-600 dark:text-red-400"
              >
                Cancelar
              </Button>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}
