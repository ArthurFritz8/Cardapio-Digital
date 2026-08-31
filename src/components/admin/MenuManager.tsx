"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, cn, ErrorText, Input, Label, Textarea } from "@/components/ui";
import { formatCents, parseCents } from "@/lib/money";
import { uploadImage } from "@/lib/storage";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { categorySchema, menuItemSchema } from "@/schemas/menu";
import type { Category, MenuItem } from "@/types/domain";

interface MenuManagerProps {
  establishmentId: string;
  categories: Category[];
  items: MenuItem[];
}

/** Troca sort_order entre dois registros (reordenar acima/abaixo). */
async function swapSortOrder(
  table: "categories" | "menu_items",
  a: { id: string; sort_order: number },
  b: { id: string; sort_order: number },
) {
  const supabase = createSupabaseBrowserClient();
  const [r1, r2] = await Promise.all([
    supabase.from(table).update({ sort_order: b.sort_order }).eq("id", a.id),
    supabase.from(table).update({ sort_order: a.sort_order }).eq("id", b.id),
  ]);
  if (r1.error || r2.error) throw r1.error ?? r2.error;
}

export function MenuManager({
  establishmentId,
  categories,
  items,
}: MenuManagerProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [itemFormFor, setItemFormFor] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  const supabase = createSupabaseBrowserClient();

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operação falhou.");
    }
  }

  // ---------- Categorias ----------

  async function addCategory() {
    const parsed = categorySchema.safeParse({
      establishment_id: establishmentId,
      name: newCategoryName,
      sort_order: (categories.at(-1)?.sort_order ?? -1) + 1,
    });
    if (!parsed.success) {
      setError("Nome de categoria inválido (2 a 50 caracteres).");
      return;
    }
    await run(async () => {
      const { error: e } = await supabase.from("categories").insert(parsed.data);
      if (e) {
        throw new Error(
          e.code === "23505" ? "Já existe uma categoria com esse nome." : e.message,
        );
      }
      setNewCategoryName("");
    });
  }

  async function renameCategory(category: Category) {
    const name = editingCategoryName.trim();
    if (name.length < 2 || name.length > 50) {
      setError("Nome de categoria inválido (2 a 50 caracteres).");
      return;
    }
    await run(async () => {
      const { error: e } = await supabase
        .from("categories")
        .update({ name })
        .eq("id", category.id);
      if (e) throw new Error(e.message);
      setEditingCategoryId(null);
    });
  }

  async function toggleCategory(category: Category) {
    await run(async () => {
      const { error: e } = await supabase
        .from("categories")
        .update({ is_active: !category.is_active })
        .eq("id", category.id);
      if (e) throw new Error(e.message);
    });
  }

  function moveCategory(index: number, direction: -1 | 1) {
    const current = categories[index];
    const neighbor = categories[index + direction];
    if (!current || !neighbor) return;
    void run(() => swapSortOrder("categories", current, neighbor));
  }

  // ---------- Itens ----------

  function moveItem(categoryItems: MenuItem[], index: number, direction: -1 | 1) {
    const current = categoryItems[index];
    const neighbor = categoryItems[index + direction];
    if (!current || !neighbor) return;
    void run(() => swapSortOrder("menu_items", current, neighbor));
  }

  async function toggleItem(item: MenuItem) {
    await run(async () => {
      const { error: e } = await supabase
        .from("menu_items")
        .update({ is_available: !item.is_available })
        .eq("id", item.id);
      if (e) throw new Error(e.message);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Input
          placeholder="Nova categoria (ex: Porções)"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCategory())}
        />
        <Button onClick={addCategory} className="shrink-0">
          <Plus className="h-4 w-4" aria-hidden /> Categoria
        </Button>
      </div>

      <ErrorText>{error}</ErrorText>

      {categories.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-500">
          Crie a primeira categoria (ex: Cervejas, Porções, Drinks) para
          começar a adicionar itens.
        </p>
      ) : null}

      {categories.map((category, categoryIndex) => {
        const categoryItems = items.filter((i) => i.category_id === category.id);
        return (
          <section
            key={category.id}
            className={cn(
              "rounded-2xl border border-neutral-200 dark:border-neutral-800",
              !category.is_active && "opacity-60",
            )}
          >
            <header className="flex items-center gap-1 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
              {editingCategoryId === category.id ? (
                <>
                  <Input
                    value={editingCategoryName}
                    onChange={(e) => setEditingCategoryName(e.target.value)}
                    className="h-8"
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    className="h-8 px-2"
                    onClick={() => renameCategory(category)}
                    aria-label="Salvar nome"
                  >
                    <Check className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-8 px-2"
                    onClick={() => setEditingCategoryId(null)}
                    aria-label="Cancelar"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="flex-1 truncate font-semibold">
                    {category.name}
                    {!category.is_active && (
                      <span className="ml-2 text-xs font-normal text-neutral-500">
                        (desativada — itens ocultos do cardápio)
                      </span>
                    )}
                  </h3>
                  <IconButton
                    label="Renomear"
                    onClick={() => {
                      setEditingCategoryId(category.id);
                      setEditingCategoryName(category.name);
                    }}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </IconButton>
                  <IconButton
                    label="Mover para cima"
                    disabled={categoryIndex === 0}
                    onClick={() => moveCategory(categoryIndex, -1)}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </IconButton>
                  <IconButton
                    label="Mover para baixo"
                    disabled={categoryIndex === categories.length - 1}
                    onClick={() => moveCategory(categoryIndex, 1)}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </IconButton>
                  <IconButton
                    label={category.is_active ? "Desativar" : "Reativar"}
                    onClick={() => toggleCategory(category)}
                  >
                    {category.is_active ? (
                      <Eye className="h-4 w-4" aria-hidden />
                    ) : (
                      <EyeOff className="h-4 w-4" aria-hidden />
                    )}
                  </IconButton>
                </>
              )}
            </header>

            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {categoryItems.map((item, itemIndex) =>
                editingItem?.id === item.id ? (
                  <li key={item.id} className="p-4">
                    <ItemForm
                      establishmentId={establishmentId}
                      categories={categories}
                      initial={item}
                      onDone={() => {
                        setEditingItem(null);
                        router.refresh();
                      }}
                      onCancel={() => setEditingItem(null)}
                    />
                  </li>
                ) : (
                  <li key={item.id} className="flex items-center gap-2 px-4 py-3">
                    <div className={cn("min-w-0 flex-1", !item.is_available && "opacity-50")}>
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="text-sm text-neutral-500">
                        {formatCents(item.price_cents)}
                      </p>
                    </div>
                    <IconButton label="Editar" onClick={() => setEditingItem(item)}>
                      <Pencil className="h-4 w-4" aria-hidden />
                    </IconButton>
                    <IconButton
                      label="Mover para cima"
                      disabled={itemIndex === 0}
                      onClick={() => moveItem(categoryItems, itemIndex, -1)}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </IconButton>
                    <IconButton
                      label="Mover para baixo"
                      disabled={itemIndex === categoryItems.length - 1}
                      onClick={() => moveItem(categoryItems, itemIndex, 1)}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </IconButton>
                    <IconButton
                      label={item.is_available ? "Marcar indisponível" : "Marcar disponível"}
                      onClick={() => toggleItem(item)}
                    >
                      {item.is_available ? (
                        <Eye className="h-4 w-4" aria-hidden />
                      ) : (
                        <EyeOff className="h-4 w-4" aria-hidden />
                      )}
                    </IconButton>
                  </li>
                ),
              )}
            </ul>

            <div className="p-4">
              {itemFormFor === category.id ? (
                <ItemForm
                  establishmentId={establishmentId}
                  categories={categories}
                  defaultCategoryId={category.id}
                  nextSortOrder={(categoryItems.at(-1)?.sort_order ?? -1) + 1}
                  onDone={() => {
                    setItemFormFor(null);
                    router.refresh();
                  }}
                  onCancel={() => setItemFormFor(null)}
                />
              ) : (
                <Button variant="ghost" onClick={() => setItemFormFor(category.id)}>
                  <Plus className="h-4 w-4" aria-hidden /> Novo item
                </Button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function IconButton({
  label,
  children,
  ...props
}: { label: string } & React.ComponentPropsWithoutRef<"button">) {
  return (
    <button
      aria-label={label}
      title={label}
      className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-neutral-800"
      {...props}
    >
      {children}
    </button>
  );
}

interface ItemFormProps {
  establishmentId: string;
  categories: Category[];
  initial?: MenuItem;
  defaultCategoryId?: string;
  nextSortOrder?: number;
  onDone: () => void;
  onCancel: () => void;
}

function ItemForm({
  establishmentId,
  categories,
  initial,
  defaultCategoryId,
  nextSortOrder = 0,
  onDone,
  onCancel,
}: ItemFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [price, setPrice] = useState(
    initial ? (initial.price_cents / 100).toFixed(2).replace(".", ",") : "",
  );
  const [categoryId, setCategoryId] = useState(
    initial?.category_id ?? defaultCategoryId ?? categories[0]?.id ?? "",
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const priceCents = parseCents(price);
    if (priceCents === null) {
      setError("Preço inválido. Use o formato 19,90.");
      return;
    }

    const parsed = menuItemSchema.safeParse({
      establishment_id: establishmentId,
      category_id: categoryId,
      name,
      description: description.trim() || null,
      price_cents: priceCents,
      sort_order: initial?.sort_order ?? nextSortOrder,
      is_available: initial?.is_available ?? true,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }

    setSaving(true);
    const supabase = createSupabaseBrowserClient();
    try {
      let imageUrl = initial?.image_url ?? null;
      if (imageFile) {
        imageUrl = await uploadImage(supabase, imageFile, establishmentId, "item");
      }
      const payload = { ...parsed.data, image_url: imageUrl };
      const { error: e } = initial
        ? await supabase.from("menu_items").update(payload).eq("id", initial.id)
        : await supabase.from("menu_items").insert(payload);
      if (e) throw new Error(e.message);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-dashed border-neutral-300 p-4 dark:border-neutral-700"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="item-name">Nome</Label>
          <Input
            id="item-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="item-price">Preço (R$)</Label>
          <Input
            id="item-price"
            inputMode="decimal"
            placeholder="19,90"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
        </div>
      </div>
      <div>
        <Label htmlFor="item-description">Descrição (opcional)</Label>
        <Textarea
          id="item-description"
          rows={2}
          maxLength={300}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="item-category">Categoria</Label>
          <select
            id="item-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="item-image">Foto (opcional)</Label>
          <Input
            id="item-image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando..." : initial ? "Salvar item" : "Adicionar item"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
