import { z } from "zod";
import { ORDER_STATUSES } from "@/types/domain";
import { uuidSchema } from "./common";

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
  customer_name: z.string().trim().min(1).max(60).optional(),
  note: z.string().trim().max(300).optional(),
  location: clientLocationSchema.optional(),
  items: z
    .array(
      z.object({
        menu_item_id: uuidSchema,
        quantity: z.number().int().min(1).max(50),
        note: z.string().trim().max(200).optional(),
      }),
    )
    .min(1, "O pedido precisa de pelo menos um item")
    .max(50, "Pedido excede o limite de itens"),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
