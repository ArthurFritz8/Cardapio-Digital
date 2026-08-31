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
