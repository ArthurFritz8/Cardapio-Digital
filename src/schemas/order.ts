import { z } from "zod";
import { ORDER_STATUSES } from "@/types/domain";
import { uuidSchema } from "./common";
import { MAX_CUSTOMER_NAME_LENGTH, MAX_ITEM_NOTE_LENGTH, MAX_ITEM_QUANTITY, MAX_ORDER_ITEMS, MAX_ORDER_NOTE_LENGTH } from "@/lib/constants";

/** Localização opcional do cliente (triagem heurística — spoofável). */
export const clientLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000).optional(),
});

/**
 * Payload de criação de pedido enviado pelo cliente anônimo.
 * SEGURANÇA: o cliente envia apenas IDs e quantidades — preços e nomes
 * são resolvidos SERVER-SIDE a partir do banco (nunca confiar no client).
 */
export const createOrderSchema = z.object({
  table_id: uuidSchema,
  session_token: uuidSchema,
  request_id: uuidSchema,
  customer_name: z.string().trim().min(1).max(MAX_CUSTOMER_NAME_LENGTH).optional(),
  note: z.string().trim().max(MAX_ORDER_NOTE_LENGTH).optional(),
  location: clientLocationSchema.optional(),
  items: z
    .array(
      z.object({
        menu_item_id: uuidSchema,
        quantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY),
        note: z.string().trim().max(MAX_ITEM_NOTE_LENGTH).optional(),
      }).strict(),
    )
    .min(1, "O pedido precisa de pelo menos um item")
    .max(MAX_ORDER_ITEMS, "Pedido excede o limite de itens"),
}).strict().refine((value) => new Set(value.items.map((item) => item.menu_item_id)).size === value.items.length, {
  message: "Itens repetidos devem ser agrupados pela quantidade.", path: ["items"],
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
