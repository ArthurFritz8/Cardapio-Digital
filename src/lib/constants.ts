/**
 * Constantes de domínio — não são segredos nem variam por ambiente,
 * portanto NÃO pertencem a env vars (veto ao config sprawl).
 */

/** Duração da sessão de mesa iniciada pelo scan do QR Code. */
export const TABLE_SESSION_HOURS = 2;

/** Máximo de pedidos ativos (pending/preparing) simultâneos por mesa. */
export const MAX_ACTIVE_ORDERS_PER_TABLE = 5;

/** Timeout para o navegador responder a geolocalização. */
export const GEOLOCATION_TIMEOUT_MS = 5_000;

/**
 * Cap da compensação pela imprecisão do GPS no cálculo de raio.
 * Sem cap, uma accuracy spoofada gigante auto-aprovaria qualquer pedido.
 */
export const MAX_GPS_ACCURACY_COMPENSATION_METERS = 100;

/** TTL do carrinho no localStorage (a sessão de mesa renova sozinha no envio). */
export const CART_TTL_HOURS = 4;

/** Intervalo de polling do status do pedido (cliente anônimo — RLS veda Realtime). */
export const ORDER_POLL_INTERVAL_MS = 5_000;

/** Polling de segurança do painel do dono (Realtime é acelerador, não fonte única). */
export const OWNER_ORDERS_POLL_INTERVAL_MS = 30_000;

export const ORDER_REQUEST_TIMEOUT_MS = 15_000;
export const OWNER_ORDERS_PAGE_SIZE = 100;
export const ORDER_READY_VIBRATION_MS = 200;
export const CART_FEEDBACK_DURATION_MS = 300;
export const ADMIN_TOAST_DURATION_MS = 5_000;

/** Limites espelhados pelas constraints SQL; alterações exigem migration. */
export const MAX_ORDER_ITEMS = 50;
export const MAX_ITEM_QUANTITY = 50;
export const MAX_ITEM_NOTE_LENGTH = 200;
export const MAX_ORDER_NOTE_LENGTH = 300;
export const MAX_CUSTOMER_NAME_LENGTH = 60;
export const MAX_PRICE_CENTS = 10_000_000;
export const MAX_ORDER_BODY_BYTES = 64 * 1024;
export const IP_RATE_WINDOW_SECONDS = 60;
/** Orçamento compartilhado por NAT: 60 pedidos e 120 sessões por minuto. */
export const IP_RATE_LIMITS = { orders: 60, sessions: 120 } as const;
export const PUBLIC_TABLE_COLUMNS = "id,establishment_id,label,is_active,created_at";
export const STORAGE_BUCKET = "menu-images";
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION_PX = 1200;
export const JPEG_QUALITY = 0.82;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
