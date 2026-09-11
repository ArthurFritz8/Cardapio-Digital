import type { Category, MenuItem } from "@/types/domain";

function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

/** Busca local também funciona sobre o cardápio em cache, sem novas consultas. */
export function searchMenu<T extends Pick<MenuItem, "name" | "description" | "category_id">>(
  items: T[], categories: Pick<Category, "id" | "name">[], query: string,
): T[] {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return items;
  const names = new Map(categories.map((category) => [category.id, category.name]));
  return items.filter((item) => {
    const text = normalizeSearch(`${item.name} ${item.description ?? ""} ${names.get(item.category_id) ?? ""}`);
    return terms.every((term) => text.includes(term));
  });
}
