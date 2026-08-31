import { z } from "zod";
import { priceCentsSchema, slugSchema, uuidSchema } from "./common";

export const establishmentSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(80),
  slug: slugSchema,
  description: z.string().trim().max(300).nullable().optional(),
  is_open: z.boolean().default(true),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  order_radius_meters: z.number().int().min(30).max(1000).default(150),
});

export const tableSchema = z.object({
  establishment_id: uuidSchema,
  label: z.string().trim().min(1, "Identifique a mesa").max(30),
  is_active: z.boolean().default(true),
});

export const categorySchema = z.object({
  establishment_id: uuidSchema,
  name: z.string().trim().min(2).max(50),
  sort_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

export const menuItemSchema = z.object({
  establishment_id: uuidSchema,
  category_id: uuidSchema,
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).nullable().optional(),
  price_cents: priceCentsSchema,
  is_available: z.boolean().default(true),
  sort_order: z.number().int().min(0).default(0),
});

export type EstablishmentInput = z.infer<typeof establishmentSchema>;
export type TableInput = z.infer<typeof tableSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type MenuItemInput = z.infer<typeof menuItemSchema>;
