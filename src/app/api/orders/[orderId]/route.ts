import { NextResponse } from "next/server";
import {
  AppError,
  ERROR_CODES,
  errorResponseBody,
  toAppError,
} from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { uuidSchema } from "@/schemas/common";
import type { OrderStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

export interface PublicOrder {
  id: string;
  status: OrderStatus;
  needs_confirmation: boolean;
  confirmed_at: string | null;
  total_cents: number;
  created_at: string;
  table_id: string;
  table_label: string;
  items: Array<{
    item_name: string;
    unit_price_cents: number;
    quantity: number;
    note: string | null;
  }>;
}

/**
 * GET /api/orders/[orderId] — status do pedido para o cliente anônimo.
 * Capability URL: o uuid v4 é não-enumerável; RLS de orders continua
 * fechada para anon (Realtime anônimo é inviável — por isso polling).
 */
export async function GET(
  _request: Request,
  { params }: { params: { orderId: string } },
) {
  try {
    const parsed = uuidSchema.safeParse(params.orderId);
    if (!parsed.success) {
      throw new AppError(ERROR_CODES.VALIDATION, "Pedido inválido.");
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("orders")
      .select(
        "id, status, needs_confirmation, confirmed_at, total_cents, created_at, table_id, tables ( label ), order_items ( item_name, unit_price_cents, quantity, note )",
      )
      .eq("id", parsed.data)
      .maybeSingle();

    if (error) {
      throw new AppError(ERROR_CODES.INTERNAL, "Erro ao buscar pedido.", {
        originalMessage: error.message,
      });
    }
    if (!data) {
      throw new AppError(ERROR_CODES.NOT_FOUND, "Pedido não encontrado.");
    }

    const table = Array.isArray(data.tables) ? data.tables[0] : data.tables;
    const order: PublicOrder = {
      id: data.id,
      status: data.status,
      needs_confirmation: data.needs_confirmation,
      confirmed_at: data.confirmed_at,
      total_cents: data.total_cents,
      created_at: data.created_at,
      table_id: data.table_id,
      table_label: (table as { label: string } | null)?.label ?? "",
      items: data.order_items ?? [],
    };

    return NextResponse.json({ order });
  } catch (error) {
    const appError = toAppError(error);
    return NextResponse.json(errorResponseBody(appError), {
      status: appError.status,
    });
  }
}
