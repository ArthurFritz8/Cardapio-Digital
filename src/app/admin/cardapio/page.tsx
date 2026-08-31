import { MenuManager } from "@/components/admin/MenuManager";
import { requireEstablishment } from "@/lib/admin/guard";
import type { Category, MenuItem } from "@/types/domain";

export const metadata = { title: "Cardápio" };

export default async function CardapioPage() {
  const { establishment, supabase } = await requireEstablishment();

  const [{ data: categories }, { data: items }] = await Promise.all([
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

  return (
    <MenuManager
      establishmentId={establishment.id}
      categories={categories ?? []}
      items={items ?? []}
    />
  );
}
