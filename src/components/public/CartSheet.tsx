"use client";

import { Loader2, Minus, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Textarea } from "@/components/ui";
import type { CartApi } from "@/hooks/useCart";
import { useGeolocation } from "@/hooks/useGeolocation";
import { clearCart, type CartItem } from "@/lib/cart";
import { formatCents } from "@/lib/money";
import {
  clearTableSession,
  loadTableSession,
  saveTableSession,
} from "@/lib/table-session";

interface CartSheetProps {
  open: boolean;
  onClose: () => void;
  tableId: string;
  cart: CartApi;
  establishmentOpen: boolean;
  online: boolean;
  /** Refresca o cardápio e poda do carrinho itens que ficaram indisponíveis. */
  onItemsUnavailable: () => Promise<void>;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

async function ensureSession(tableId: string): Promise<string> {
  const existing = loadTableSession(tableId);
  if (existing) return existing.token;

  const response = await fetch(`/api/tables/${tableId}/session`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Não foi possível iniciar a sessão da mesa.");
  }
  const body = (await response.json()) as {
    session: { session_token: string; session_expires_at: string };
  };
  saveTableSession(tableId, {
    token: body.session.session_token,
    expiresAt: body.session.session_expires_at,
  });
  return body.session.session_token;
}

export function CartSheet({
  open,
  onClose,
  tableId,
  cart,
  establishmentOpen,
  online,
  onItemsUnavailable,
}: CartSheetProps) {
  const router = useRouter();
  const geolocation = useGeolocation();
  const [customerName, setCustomerName] = useState("");
  const [noteOpenFor, setNoteOpenFor] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!open) return null;

  const canSend =
    online && establishmentOpen && cart.items.length > 0 && !sending;

  async function submitOrder(retrying = false): Promise<void> {
    const sessionToken = await ensureSession(tableId);
    const location = await geolocation.request();

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table_id: tableId,
        session_token: sessionToken,
        customer_name: customerName.trim() || undefined,
        location: location ?? undefined,
        items: cart.items.map((i: CartItem) => ({
          menu_item_id: i.menu_item_id,
          quantity: i.quantity,
          note: i.note,
        })),
      }),
    });

    if (response.ok) {
      const body = (await response.json()) as { order: { id: string } };
      clearCart(tableId);
      router.push(`/pedido/${body.order.id}`);
      return;
    }

    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    const code = body.error?.code;

    if (code === "SESSION_EXPIRED" && !retrying) {
      // Sessão venceu no meio do pedido: renova uma vez e tenta de novo
      clearTableSession(tableId);
      return submitOrder(true);
    }
    if (code === "ITEM_UNAVAILABLE") {
      await onItemsUnavailable();
      throw new Error(
        "Um item do carrinho acabou de ficar indisponível e foi removido. Revise o pedido e envie novamente.",
      );
    }
    throw new Error(
      body.error?.message ?? "Não foi possível enviar o pedido. Tente de novo.",
    );
  }

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    setErrorMessage(null);
    try {
      await submitOrder();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Erro inesperado.",
      );
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30" role="dialog" aria-modal="true">
      <button
        aria-label="Fechar carrinho"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 dark:bg-neutral-950">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Seu pedido</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {cart.items.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-500">
            Seu carrinho está vazio.
          </p>
        ) : (
          <ul className="space-y-4">
            {cart.items.map((item) => (
              <li key={item.menu_item_id}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {item.name}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {formatCents(item.price_cents)} un.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => cart.changeQuantity(item.menu_item_id, -1)}
                      aria-label={`Diminuir ${item.name}`}
                      className="h-8 w-8 rounded-full border border-neutral-300 dark:border-neutral-700"
                    >
                      <Minus className="mx-auto h-4 w-4" aria-hidden />
                    </button>
                    <span className="w-6 text-center text-sm font-bold">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => cart.changeQuantity(item.menu_item_id, 1)}
                      aria-label={`Aumentar ${item.name}`}
                      className="h-8 w-8 rounded-full border border-neutral-300 dark:border-neutral-700"
                    >
                      <Plus className="mx-auto h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setNoteOpenFor((prev) =>
                      prev === item.menu_item_id ? null : item.menu_item_id,
                    )
                  }
                  className="mt-1 text-xs text-brand-600 underline"
                >
                  {item.note ? `Obs: ${item.note}` : "Adicionar observação"}
                </button>
                {noteOpenFor === item.menu_item_id ? (
                  <Textarea
                    value={item.note ?? ""}
                    onChange={(e) =>
                      cart.setNote(item.menu_item_id, e.target.value)
                    }
                    placeholder="Ex.: sem cebola, ponto da carne…"
                    rows={2}
                    maxLength={200}
                    className="mt-2"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {cart.items.length > 0 ? (
          <>
            <div className="mt-5">
              <label
                htmlFor="customer-name"
                className="mb-1 block text-xs font-medium text-neutral-500"
              >
                Seu nome (opcional — ajuda o garçom a te achar)
              </label>
              <input
                id="customer-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                maxLength={80}
                className="w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
              />
            </div>

            <div className="mt-4 flex items-baseline justify-between border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <span className="text-sm text-neutral-500">
                Valor estimado — confirmado no envio
              </span>
              <span className="text-lg font-bold">
                {formatCents(cart.totalCents)}
              </span>
            </div>

            {errorMessage ? (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {errorMessage}
              </p>
            ) : null}

            <Button
              onClick={handleSend}
              disabled={!canSend}
              className="mt-4 w-full py-3"
            >
              {sending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Enviando…
                </span>
              ) : !online ? (
                "Sem conexão — reconecte para enviar"
              ) : !establishmentOpen ? (
                "Estabelecimento fechado"
              ) : (
                "Enviar pedido"
              )}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
