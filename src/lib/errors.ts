/**
 * Erros centralizados do domínio.
 * Cada erro carrega um código estável (auditável em logs) e um
 * status HTTP sugerido para as API Routes.
 */

export const ERROR_CODES = {
  VALIDATION: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  INVALID_TRANSITION: "INVALID_ORDER_TRANSITION",
  ESTABLISHMENT_CLOSED: "ESTABLISHMENT_CLOSED",
  ITEM_UNAVAILABLE: "ITEM_UNAVAILABLE",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  TABLE_ORDER_LIMIT: "TABLE_ORDER_LIMIT",
  INTERNAL: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const HTTP_STATUS: Record<ErrorCode, number> = {
  [ERROR_CODES.VALIDATION]: 400,
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.UNAUTHORIZED]: 401,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.CONFLICT]: 409,
  [ERROR_CODES.INVALID_TRANSITION]: 422,
  [ERROR_CODES.ESTABLISHMENT_CLOSED]: 422,
  [ERROR_CODES.ITEM_UNAVAILABLE]: 422,
  [ERROR_CODES.SESSION_EXPIRED]: 410,
  [ERROR_CODES.TABLE_ORDER_LIMIT]: 429,
  [ERROR_CODES.INTERNAL]: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = HTTP_STATUS[code];
    this.details = details;
  }
}

/** Converte unknown (catch) em AppError sem vazar internals ao cliente. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError(
    ERROR_CODES.INTERNAL,
    "Erro interno. Tente novamente em instantes.",
    error instanceof Error ? { originalMessage: error.message } : undefined,
  );
}

/** Payload padronizado de erro para as API Routes. */
export function errorResponseBody(error: AppError) {
  return { error: { code: error.code, message: error.message } };
}

/** Exceções sinalizadas pelas funções Postgres → erro de domínio + mensagem pt-BR. */
const DB_ERROR_MAP: Record<string, { code: ErrorCode; message: string }> = {
  TABLE_NOT_FOUND: {
    code: ERROR_CODES.NOT_FOUND,
    message: "Mesa não encontrada ou inativa.",
  },
  SESSION_EXPIRED: {
    code: ERROR_CODES.SESSION_EXPIRED,
    message: "Sessão expirada. Escaneie o QR Code da mesa novamente.",
  },
  ESTABLISHMENT_CLOSED: {
    code: ERROR_CODES.ESTABLISHMENT_CLOSED,
    message: "O estabelecimento está fechado no momento.",
  },
  ITEM_UNAVAILABLE: {
    code: ERROR_CODES.ITEM_UNAVAILABLE,
    message: "Um ou mais itens do pedido não estão mais disponíveis.",
  },
  TABLE_ORDER_LIMIT: {
    code: ERROR_CODES.TABLE_ORDER_LIMIT,
    message:
      "Limite de pedidos em andamento nesta mesa atingido. Aguarde os pedidos atuais.",
  },
  VALIDATION: {
    code: ERROR_CODES.VALIDATION,
    message: "Dados do pedido inválidos.",
  },
};

export function fromDbError(rawMessage: string): AppError {
  for (const [key, mapped] of Object.entries(DB_ERROR_MAP)) {
    if (rawMessage.includes(key)) {
      return new AppError(mapped.code, mapped.message);
    }
  }
  return new AppError(
    ERROR_CODES.INTERNAL,
    "Erro interno. Tente novamente em instantes.",
    { rawMessage },
  );
}
