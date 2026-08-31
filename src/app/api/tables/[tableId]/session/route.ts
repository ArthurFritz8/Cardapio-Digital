import { NextResponse } from "next/server";
import { TABLE_SESSION_HOURS } from "@/lib/constants";
import {
  AppError,
  ERROR_CODES,
  errorResponseBody,
  fromDbError,
  toAppError,
} from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { uuidSchema } from "@/schemas/common";

export const dynamic = "force-dynamic";

interface TableSessionRow {
  session_token: string;
  session_expires_at: string;
  establishment_id: string;
}

/**
 * POST /api/tables/[tableId]/session
 * Inicia (ou reusa, se ainda válida) a sessão da mesa após o scan do QR.
 */
export async function POST(
  _request: Request,
  { params }: { params: { tableId: string } },
) {
  try {
    const parsed = uuidSchema.safeParse(params.tableId);
    if (!parsed.success) {
      throw new AppError(ERROR_CODES.VALIDATION, "Identificador de mesa inválido.");
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("start_table_session", {
      p_table_id: parsed.data,
      p_session_hours: TABLE_SESSION_HOURS,
    });

    if (error) throw fromDbError(error.message);

    const session = (Array.isArray(data) ? data[0] : data) as
      | TableSessionRow
      | undefined;
    if (!session) {
      throw new AppError(ERROR_CODES.NOT_FOUND, "Mesa não encontrada ou inativa.");
    }

    return NextResponse.json({ session });
  } catch (error) {
    const appError = toAppError(error);
    return NextResponse.json(errorResponseBody(appError), {
      status: appError.status,
    });
  }
}
