import { NextResponse } from "next/server";
import { MAX_ACTIVE_ORDERS_PER_TABLE } from "@/lib/constants";
import {
  AppError,
  ERROR_CODES,
  errorResponseBody,
  fromDbError,
  toAppError,
} from "@/lib/errors";
import { shouldRequireManualConfirmation } from "@/lib/geo";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createOrderSchema } from "@/schemas/order";

export const dynamic = "force-dynamic";

interface EstablishmentGeoRow {
  latitude: number | null;
  longitude: number | null;
  order_radius_meters: number;
}

/**
 * POST /api/orders
 * Cria um pedido do cliente anônimo. Preços/nomes resolvidos no banco;
 * a inserção é atômica via RPC create_order (order + items em 1 transação).
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        ERROR_CODES.VALIDATION,
        "Dados do pedido inválidos.",
        parsed.error.flatten(),
      );
    }
    const input = parsed.data;

    const admin = createSupabaseAdminClient();

    // Coordenadas do estabelecimento p/ triagem geo (heurística, não segurança)
    const { data: tableRow, error: tableError } = await admin
      .from("tables")
      .select(
        "id, is_active, establishments ( latitude, longitude, order_radius_meters )",
      )
      .eq("id", input.table_id)
      .maybeSingle();

    if (tableError) throw fromDbError(tableError.message);
    if (!tableRow || !tableRow.is_active) {
      throw new AppError(ERROR_CODES.NOT_FOUND, "Mesa não encontrada ou inativa.");
    }

    const establishment = (
      Array.isArray(tableRow.establishments)
        ? tableRow.establishments[0]
        : tableRow.establishments
    ) as EstablishmentGeoRow | undefined;
    if (!establishment) {
      throw new AppError(ERROR_CODES.NOT_FOUND, "Estabelecimento não encontrado.");
    }

    const needsConfirmation = shouldRequireManualConfirmation(
      establishment,
      input.location,
    );

    const { data: order, error: rpcError } = await admin.rpc("create_order", {
      p_table_id: input.table_id,
      p_session_token: input.session_token,
      p_items: input.items,
      p_customer_name: input.customer_name ?? null,
      p_note: input.note ?? null,
      p_needs_confirmation: needsConfirmation,
      p_max_active_orders: MAX_ACTIVE_ORDERS_PER_TABLE,
    });

    if (rpcError) throw fromDbError(rpcError.message);

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    return NextResponse.json(errorResponseBody(appError), {
      status: appError.status,
    });
  }
}
