"use client";

import { History, Volume2, VolumeX } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { OrderCard } from "@/components/admin/OrderCard";
import { Button, cn } from "@/components/ui";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import {
  useOrdersRealtime,
  type ConnectionState,
} from "@/hooks/useOrdersRealtime";
import { formatCents } from "@/lib/money";
import {
  appendCancelReason,
  boardColumn,
  isAwaitingConfirmation,
  type BoardColumn,
  type OwnerOrder,
} from "@/lib/order-board";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { OrderStatus } from "@/types/domain";

const COLUMNS: Array<{ key: BoardColumn; title: string; accent?: boolean }> = [
  { key: "awaiting", title: "Aguardando confirmação", accent: true },
  { key: "queue", title: "Fila" },
  { key: "preparing", title: "Preparando" },
  { key: "ready", title: "Pronto" },
];

const CONNECTION_LABELS: Record<
  ConnectionState,
  { label: string; dot: string }
> = {
  live: { label: "Ao vivo", dot: "bg-green-500" },
  reconnecting: { label: "Reconectando…", dot: "bg-amber-500" },
  offline: { label: "Offline — atualizando a cada 30s", dot: "bg-red-500" },
};

const CANCEL_REASONS = [
  "Cliente desistiu",
  "Item indisponível",
  "Erro do sistema",
  "Outro",
] as const;

interface HistoryOrder {
  id: string;
  status: OrderStatus;
  total_cents: number;
  created_at: string;
  tables: { label: string } | { label: string }[] | null;
}

export function OrdersBoard({ establishmentId }: { establishmentId: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const sound = useNotificationSound();

  const onNewOrder = useCallback(
    (order: OwnerOrder) => {
      if (isAwaitingConfirmation(order)) sound.playUrgent();
      else sound.playNew();
    },
    [sound],
  );

  const { orders, connection, now, isLoading, refetchOne, applyLocal } =
    useOrdersRealtime(establishmentId, onNewOrder);

  const [toast, setToast] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OwnerOrder | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryOrder[] | null>(null);

  const showError = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 5000);
  }, []);

  async function advance(order: OwnerOrder, next: OrderStatus) {
    applyLocal({ ...order, status: next });
    const { error } = await supabase
      .from("orders")
      .update({ status: next })
      .eq("id", order.id);
    if (error) {
      await refetchOne(order.id);
      showError(`Não foi possível atualizar a ${order.table_label}. Tente de novo.`);
    }
  }

  async function confirmTable(order: OwnerOrder) {
    const confirmedAt = new Date().toISOString();
    applyLocal({ ...order, confirmed_at: confirmedAt });
    const { error } = await supabase
      .from("orders")
      .update({ confirmed_at: confirmedAt })
      .eq("id", order.id);
    if (error) {
      await refetchOne(order.id);
      showError("Não foi possível confirmar a mesa. Tente de novo.");
    }
  }

  async function cancelOrder() {
    if (!cancelTarget) return;
    setCancelling(true);
    const order = cancelTarget;
    const note = appendCancelReason(order.note, cancelReason);
    applyLocal({ ...order, status: "cancelled" });
    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled", note })
      .eq("id", order.id);
    if (error) {
      await refetchOne(order.id);
      showError(`Não foi possível cancelar o pedido da ${order.table_label}.`);
    }
    setCancelling(false);
    setCancelTarget(null);
    setCancelReason("");
  }

  async function toggleHistory() {
    const opening = !historyOpen;
    setHistoryOpen(opening);
    if (!opening) return;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("orders")
      .select("id, status, total_cents, created_at, tables ( label )")
      .eq("establishment_id", establishmentId)
      .in("status", ["delivered", "cancelled"])
      .gte("created_at", startOfDay.toISOString())
      .order("created_at", { ascending: false })
      .returns<HistoryOrder[]>();
    setHistory(data ?? []);
  }

  const connectionInfo = CONNECTION_LABELS[connection];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={cn("h-2.5 w-2.5 rounded-full", connectionInfo.dot)}
            aria-hidden
          />
          {connectionInfo.label}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={toggleHistory}>
            <History className="h-4 w-4" aria-hidden />
            Histórico de hoje
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (!sound.unlocked) sound.unlock();
              sound.toggle();
            }}
            aria-label={sound.enabled ? "Desativar som" : "Ativar som"}
          >
            {sound.enabled ? (
              <Volume2 className="h-4 w-4" aria-hidden />
            ) : (
              <VolumeX className="h-4 w-4" aria-hidden />
            )}
          </Button>
        </div>
      </div>

      {sound.enabled && !sound.unlocked ? (
        <button
          onClick={sound.unlock}
          className="mb-4 w-full rounded-xl bg-amber-100 px-4 py-3 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          Toque aqui para ativar as notificações sonoras de pedidos novos
        </button>
      ) : null}

      {toast ? (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {toast}
        </p>
      ) : null}

      {historyOpen ? (
        <section className="mb-6 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-3 text-sm font-bold">Finalizados hoje</h2>
          {history === null ? (
            <p className="text-sm text-neutral-500">Carregando…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Nenhum pedido finalizado hoje.
            </p>
          ) : (
            <ul className="space-y-1">
              {history.map((h) => {
                const table = Array.isArray(h.tables) ? h.tables[0] : h.tables;
                return (
                  <li
                    key={h.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span>
                      {table?.label ?? "—"} ·{" "}
                      {new Date(h.created_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          h.status === "cancelled"
                            ? "text-red-600 dark:text-red-400"
                            : "text-green-600 dark:text-green-400",
                        )}
                      >
                        {h.status === "cancelled" ? "Cancelado" : "Entregue"}
                      </span>
                      {formatCents(h.total_cents)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {isLoading ? (
        <div className="grid animate-pulse gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-40 rounded-2xl bg-neutral-200 dark:bg-neutral-800"
            />
          ))}
        </div>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((column) => {
            const columnOrders = orders.filter(
              (o) => boardColumn(o) === column.key,
            );
            return (
              <section
                key={column.key}
                className={cn(
                  "rounded-2xl border p-3",
                  column.accent
                    ? "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20"
                    : "border-neutral-200 dark:border-neutral-800",
                )}
              >
                <h2 className="mb-3 flex items-center justify-between text-sm font-bold">
                  {column.title}
                  <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs dark:bg-neutral-800">
                    {columnOrders.length}
                  </span>
                </h2>
                <div className="space-y-3">
                  {columnOrders.length === 0 ? (
                    <p className="py-6 text-center text-xs text-neutral-400">
                      Vazio
                    </p>
                  ) : (
                    columnOrders.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        now={now}
                        onAdvance={advance}
                        onConfirmTable={confirmTable}
                        onRequestCancel={setCancelTarget}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {cancelTarget ? (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            aria-label="Fechar"
            onClick={() => setCancelTarget(null)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-neutral-950">
            <h2 className="mb-1 text-lg font-bold">
              {isAwaitingConfirmation(cancelTarget) ? "Recusar" : "Cancelar"}{" "}
              pedido da {cancelTarget.table_label}?
            </h2>
            <p className="mb-4 text-sm text-neutral-500">
              {formatCents(cancelTarget.total_cents)} ·{" "}
              {cancelTarget.items.length} item(ns). Essa ação não pode ser
              desfeita.
            </p>
            <label
              htmlFor="cancel-reason"
              className="mb-1 block text-xs font-medium text-neutral-500"
            >
              Motivo (opcional)
            </label>
            <select
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mb-4 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              <option value="">Sem motivo</option>
              {CANCEL_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => setCancelTarget(null)}
                className="flex-1"
              >
                Voltar
              </Button>
              <Button
                variant="danger"
                onClick={cancelOrder}
                disabled={cancelling}
                className="flex-1"
              >
                {cancelling ? "Cancelando…" : "Confirmar cancelamento"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
