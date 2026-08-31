"use client";

import { Plus, ShoppingBag, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { CartSheet } from "@/components/public/CartSheet";
import { cn } from "@/components/ui";
import { useCart } from "@/hooks/useCart";
import { useMenu } from "@/hooks/useMenu";
import { useOnline } from "@/hooks/useOnline";
import { formatCents } from "@/lib/money";
import type { MenuItem } from "@/types/domain";

export function PublicMenu({ tableId }: { tableId: string }) {
  const { menu, isLoading, error, refresh } = useMenu(tableId);
  const cart = useCart(tableId);
  const online = useOnline();
  const [cartOpen, setCartOpen] = useState(false);
  const [fabBump, setFabBump] = useState(false);

  useEffect(() => {
    if (!fabBump) return;
    const timer = setTimeout(() => setFabBump(false), 300);
    return () => clearTimeout(timer);
  }, [fabBump]);

  if (error && !menu) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <p className="max-w-sm text-center text-neutral-600 dark:text-neutral-400">
          {error}
        </p>
      </main>
    );
  }

  if (isLoading && !menu) return <MenuSkeleton />;
  if (!menu) return null;

  const { establishment, table, categories, items } = menu;

  function handleAdd(item: MenuItem) {
    cart.add({
      menu_item_id: item.id,
      name: item.name,
      price_cents: item.price_cents,
    });
    setFabBump(true);
  }

  return (
    <div className="min-h-dvh pb-28">
      <header className="border-b border-neutral-200 bg-white px-4 py-4 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          {establishment.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL direta p/ cache-first do SW
            <img
              src={establishment.logo_url}
              alt=""
              className="h-12 w-12 rounded-xl object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold">{establishment.name}</h1>
            {establishment.description ? (
              <p className="truncate text-xs text-neutral-500">
                {establishment.description}
              </p>
            ) : null}
          </div>
          <span className="shrink-0 rounded-full bg-brand-500 px-3 py-1 text-sm font-bold text-white">
            {table.label}
          </span>
        </div>
      </header>

      {!online ? (
        <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
          Você está offline — dá para ver o cardápio, mas não enviar pedidos.
        </div>
      ) : null}

      {!establishment.is_open ? (
        <div className="bg-red-100 px-4 py-2 text-center text-sm font-medium text-red-900 dark:bg-red-950 dark:text-red-200">
          O estabelecimento está fechado no momento.
        </div>
      ) : null}

      {categories.length > 0 ? (
        <nav className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-neutral-200 bg-white/95 px-4 py-2 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
          {categories.map((category) => (
            <a
              key={category.id}
              href={`#cat-${category.id}`}
              className="shrink-0 rounded-full border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700"
            >
              {category.name}
            </a>
          ))}
        </nav>
      ) : null}

      <main className="mx-auto max-w-lg space-y-8 px-4 py-6">
        {items.length === 0 ? (
          <p className="py-16 text-center text-sm text-neutral-500">
            Nenhum item disponível no momento. Chame o garçom para saber as
            opções de hoje!
          </p>
        ) : (
          categories.map((category) => {
            const categoryItems = items.filter(
              (i) => i.category_id === category.id,
            );
            if (categoryItems.length === 0) return null;
            return (
              <section key={category.id} id={`cat-${category.id}`}>
                <h2 className="mb-3 scroll-mt-14 text-base font-bold">
                  {category.name}
                </h2>
                <ul className="space-y-3">
                  {categoryItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex gap-3 rounded-2xl border border-neutral-200 p-3 dark:border-neutral-800"
                    >
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- URL direta p/ cache-first do SW
                        <img
                          src={item.image_url}
                          alt={item.name}
                          loading="lazy"
                          className="h-20 w-20 shrink-0 rounded-xl object-cover"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold">{item.name}</h3>
                        {item.description ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">
                            {item.description}
                          </p>
                        ) : null}
                        <p className="mt-1 text-sm font-bold text-brand-600">
                          {formatCents(item.price_cents)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleAdd(item)}
                        disabled={!establishment.is_open}
                        aria-label={`Adicionar ${item.name}`}
                        className="h-9 w-9 shrink-0 self-center rounded-full bg-brand-500 text-white transition-transform active:scale-90 disabled:opacity-40"
                      >
                        <Plus className="mx-auto h-5 w-5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </main>

      {cart.count > 0 ? (
        <button
          onClick={() => setCartOpen(true)}
          className={cn(
            "fixed bottom-4 left-4 right-4 z-20 mx-auto flex max-w-lg items-center justify-between rounded-2xl bg-brand-500 px-5 py-4 text-white shadow-xl transition-transform",
            fabBump && "scale-105",
          )}
        >
          <span className="flex items-center gap-2 font-semibold">
            <ShoppingBag className="h-5 w-5" aria-hidden />
            Ver carrinho ({cart.count})
          </span>
          <span className="text-sm">
            {formatCents(cart.totalCents)}
            <span className="ml-1 opacity-75">estimado</span>
          </span>
        </button>
      ) : null}

      <CartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        tableId={tableId}
        cart={cart}
        establishmentOpen={establishment.is_open}
        online={online}
        onItemsUnavailable={async () => {
          // Busca o cardápio fresco e só então poda o carrinho —
          // usar o Set antigo não removeria o item recém-indisponível
          const fresh = await refresh();
          if (fresh) cart.prune(new Set(fresh.items.map((i) => i.id)));
        }}
      />
    </div>
  );
}

function MenuSkeleton() {
  return (
    <div className="mx-auto max-w-lg animate-pulse space-y-4 px-4 py-6">
      <div className="h-12 w-2/3 rounded-xl bg-neutral-200 dark:bg-neutral-800" />
      <div className="h-8 w-full rounded-xl bg-neutral-200 dark:bg-neutral-800" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-24 rounded-2xl bg-neutral-200 dark:bg-neutral-800"
        />
      ))}
    </div>
  );
}
