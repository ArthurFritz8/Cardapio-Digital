"use client";

import {
  Check,
  ChefHat,
  ClipboardList,
  HandPlatter,
  PartyPopper,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { cn } from "@/components/ui";
import { useOrderStatus } from "@/hooks/useOrderStatus";
import { formatCents } from "@/lib/money";
import type { OrderStatus } from "@/types/domain";

const TIMELINE: Array<{
  status: OrderStatus;
  label: string;
  icon: typeof Check;
}> = [
  { status: "pending", label: "Recebido", icon: ClipboardList },
  { status: "preparing", label: "Em preparo", icon: ChefHat },
  { status: "ready", label: "Pronto!", icon: PartyPopper },
  { status: "delivered", label: "Entregue", icon: HandPlatter },
];

export function OrderStatusView({ orderId }: { orderId: string }) {
  const { order, error, isLoading } = useOrderStatus(orderId);
  const prevStatusRef = useRef<OrderStatus | null>(null);

  // Vibra quando o pedido fica pronto (celular no bolso, bar barulhento)
  useEffect(() => {
    if (!order) return;
    if (
      prevStatusRef.current &&
      prevStatusRef.current !== "ready" &&
      order.status === "ready" &&
      typeof navigator !== "undefined" &&
      "vibrate" in navigator
    ) {
      navigator.vibrate(200);
    }
    prevStatusRef.current = order.status;
  }, [order]);

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <p className="text-center text-neutral-600 dark:text-neutral-400">
          {error}
        </p>
      </main>
    );
  }

  if (isLoading || !order) {
    return (
      <main className="mx-auto max-w-lg animate-pulse space-y-4 px-4 py-10">
        <div className="h-8 w-1/2 rounded-xl bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-64 rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
      </main>
    );
  }

  const currentIndex = TIMELINE.findIndex((s) => s.status === order.status);
  const isCancelled = order.status === "cancelled";
  const awaitingConfirmation =
    order.status === "pending" &&
    order.needs_confirmation &&
    !order.confirmed_at;

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-bold">Acompanhar pedido</h1>
        <p className="text-sm text-neutral-500">
          Mesa {order.table_label} · {formatCents(order.total_cents)}
        </p>
      </header>

      {isCancelled ? (
        <div className="mb-6 flex items-center gap-3 rounded-2xl bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
          <XCircle className="h-6 w-6 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Pedido cancelado</p>
            <p className="text-sm">
              Fale com o garçom se isso foi um engano.
            </p>
          </div>
        </div>
      ) : (
        <ol className="mb-6 space-y-0" aria-label="Progresso do pedido">
          {TIMELINE.map((step, index) => {
            const done = index < currentIndex;
            const current = index === currentIndex;
            const Icon = step.icon;
            return (
              <li key={step.status} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border-2",
                      done &&
                        "border-brand-500 bg-brand-500 text-white",
                      current &&
                        "border-brand-500 text-brand-600 dark:text-brand-500",
                      !done &&
                        !current &&
                        "border-neutral-300 text-neutral-400 dark:border-neutral-700",
                    )}
                  >
                    {done ? (
                      <Check className="h-5 w-5" aria-hidden />
                    ) : (
                      <Icon className="h-5 w-5" aria-hidden />
                    )}
                  </div>
                  {index < TIMELINE.length - 1 ? (
                    <div
                      className={cn(
                        "h-8 w-0.5",
                        done
                          ? "bg-brand-500"
                          : "bg-neutral-300 dark:bg-neutral-700",
                      )}
                    />
                  ) : null}
                </div>
                <div className="pt-2">
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      current && "text-brand-600 dark:text-brand-500",
                      !done && !current && "text-neutral-400",
                    )}
                  >
                    {step.label}
                  </p>
                  {current && step.status === "pending" ? (
                    <p className="text-xs text-neutral-500">
                      {awaitingConfirmation
                        ? "Aguardando confirmação do estabelecimento."
                        : "O estabelecimento recebeu seu pedido."}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {awaitingConfirmation ? (
        <div className="mb-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Não conseguimos confirmar que você está no local, então o
          estabelecimento vai validar seu pedido antes de preparar. Nada a
          fazer — é rapidinho.
        </div>
      ) : null}

      <section className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 text-sm font-bold">Itens</h2>
        <ul className="space-y-2">
          {order.items.map((item, index) => (
            <li key={index} className="flex justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{item.quantity}×</span>{" "}
                {item.item_name}
                {item.note ? (
                  <span className="block text-xs text-neutral-500">
                    Obs: {item.note}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-neutral-500">
                {formatCents(item.unit_price_cents * item.quantity)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-neutral-200 pt-3 text-sm font-bold dark:border-neutral-800">
          <span>Total</span>
          <span>{formatCents(order.total_cents)}</span>
        </div>
      </section>

      <Link
        href={`/m/${order.table_id}`}
        className="mt-6 block rounded-2xl bg-brand-500 py-3 text-center font-semibold text-white"
      >
        Fazer outro pedido
      </Link>
    </main>
  );
}
