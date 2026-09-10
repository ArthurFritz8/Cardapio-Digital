import { NextResponse } from "next/server";
import { IP_RATE_WINDOW_SECONDS, MAX_ORDER_BODY_BYTES } from "./constants";
import { AppError, ERROR_CODES, errorResponseBody, toAppError } from "./errors";

export const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export function apiErrorResponse(error: unknown) {
  const appError = toAppError(error);
  // Log auditável, sem payload, tokens, nomes de cliente ou erro bruto do banco.
  if (appError.status >= 500) console.error("api_error", { code: appError.code });
  return NextResponse.json(errorResponseBody(appError), {
    status: appError.status,
    headers: {
      ...PRIVATE_RESPONSE_HEADERS,
      ...(appError.code === ERROR_CODES.IP_RATE_LIMIT
        ? { "Retry-After": String(IP_RATE_WINDOW_SECONDS) }
        : {}),
    },
  });
}

/** Limita bytes realmente recebidos, mesmo sem Content-Length ou com header falso. */
export async function readOrderBody(request: Request): Promise<unknown> {
  const invalid = () => new AppError(ERROR_CODES.VALIDATION, "Corpo JSON inválido ou acima do limite.");
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw invalid();
  if (!request.body) throw invalid();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ORDER_BODY_BYTES) {
        await reader.cancel();
        throw invalid();
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw invalid();
  } finally {
    reader.releaseLock();
  }
}
