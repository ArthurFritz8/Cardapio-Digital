import { z } from "zod";
import { uuidSchema } from "../schemas/common";
import { categorySchema, menuItemSchema } from "../schemas/menu";

const publicMenuSchema = z.object({
  table: z.object({ id: uuidSchema, label: z.string() }),
  establishment: z.object({
    id: uuidSchema,
    name: z.string(),
    description: z.string().nullable(),
    logo_url: z.string().nullable(),
    is_open: z.boolean(),
  }),
  categories: z.array(categorySchema.extend({ id: uuidSchema, created_at: z.string() })),
  items: z.array(menuItemSchema.extend({
    id: uuidSchema,
    description: z.string().nullable(),
    image_url: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })),
});

export type PublicMenuData = z.infer<typeof publicMenuSchema>;

/** localStorage é entrada não confiável: cache inválido nunca deve quebrar o menu. */
export function parseMenuCache(raw: string | null, tableId: string): PublicMenuData | null {
  if (!raw) return null;
  try {
    const parsed = publicMenuSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.table.id === tableId ? parsed.data : null;
  } catch {
    return null;
  }
}
