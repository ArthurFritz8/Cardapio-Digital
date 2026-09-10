import { MenuManager } from "@/components/admin/MenuManager";
import { requireEstablishment } from "@/lib/admin/guard";
import type { Category, MenuItem } from "@/types/domain";

export const metadata = { title: "Cardápio" };

export default async function CardapioPage() {
  const { establishment, supabase } = await requireEstablishment();

  const [{ data: categories, error: categoryError }, { data: items, error: itemError }] = await Promise.all([
    supabase
      .from("categories")
      .select("*")
      .eq("establishment_id", establishment.id)
      .order("sort_order")
      .order("created_at")
      .returns<Category[]>(),
    supabase
      .from("menu_items")
      .select("*")
      .eq("establishment_id", establishment.id)
      .order("sort_order")
      .order("created_at")
      .returns<MenuItem[]>(),
  ]);

  if (categoryError || itemError) throw new Error("Não foi possível carregar o cardápio. Tente novamente.");

  return (
    <MenuManager
      establishmentId={establishment.id}
      categories={categories ?? []}
      items={items ?? []}
    />
  );
}
