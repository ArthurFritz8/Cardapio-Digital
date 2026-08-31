"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Category, MenuItem } from "@/types/domain";

export interface PublicMenuData {
  table: { id: string; label: string };
  establishment: {
    id: string;
    name: string;
    description: string | null;
    logo_url: string | null;
    is_open: boolean;
  };
  categories: Category[];
  items: MenuItem[];
}

const cacheKey = (tableId: string) => `cd.menu.${tableId}`;

/**
 * SWR manual (sem lib): serve o cache do localStorage instantâneo,
 * revalida em background, no foco da aba e ao voltar online.
 * Offline com cache = menu abre normalmente.
 */
export function useMenu(tableId: string) {
  const [menu, setMenu] = useState<PublicMenuData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasDataRef = useRef(false);

  const refresh = useCallback(async (): Promise<PublicMenuData | null> => {
    try {
      const supabase = createSupabaseBrowserClient();

      const { data: table, error: tableError } = await supabase
        .from("tables")
        .select(
          "id, label, is_active, establishment:establishments(id, name, description, logo_url, is_open)",
        )
        .eq("id", tableId)
        .maybeSingle();
      if (tableError) throw tableError;

      if (!table || !table.is_active) {
        setError("Mesa não encontrada ou inativa. Confira o QR Code.");
        setMenu(null);
        return null;
      }

      const establishment = (
        Array.isArray(table.establishment)
          ? table.establishment[0]
          : table.establishment
      ) as PublicMenuData["establishment"] | undefined;
      if (!establishment) throw new Error("establishment missing");

      const [{ data: categories, error: catError }, { data: items, error: itemError }] =
        await Promise.all([
          supabase
            .from("categories")
            .select("*")
            .eq("establishment_id", establishment.id)
            .eq("is_active", true)
            .order("sort_order")
            .returns<Category[]>(),
          supabase
            .from("menu_items")
            .select("*")
            .eq("establishment_id", establishment.id)
            .eq("is_available", true)
            .order("sort_order")
            .returns<MenuItem[]>(),
        ]);
      if (catError || itemError) throw catError ?? itemError;

      // Regra ADR 0003: categoria inativa oculta os itens dela
      const activeCategoryIds = new Set((categories ?? []).map((c) => c.id));
      const fresh: PublicMenuData = {
        table: { id: table.id, label: table.label },
        establishment,
        categories: categories ?? [],
        items: (items ?? []).filter((i) => activeCategoryIds.has(i.category_id)),
      };

      hasDataRef.current = true;
      setMenu(fresh);
      setError(null);
      try {
        window.localStorage.setItem(cacheKey(tableId), JSON.stringify(fresh));
      } catch {
        // cache é otimização, não requisito
      }
      return fresh;
    } catch {
      // Falha de rede: mantém cache; erro só se não há nada para mostrar
      if (!hasDataRef.current) {
        setError("Não foi possível carregar o cardápio. Verifique sua conexão.");
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [tableId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(cacheKey(tableId));
      if (raw) {
        setMenu(JSON.parse(raw) as PublicMenuData);
        hasDataRef.current = true;
        setIsLoading(false);
      }
    } catch {
      // cache corrompido — segue para o fetch
    }

    void refresh();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onOnline = () => void refresh();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
    };
  }, [refresh, tableId]);

  return { menu, isLoading, error, refresh };
}
