/**
 * Tipos de domínio espelhando o schema do banco
 * (supabase/migrations/0001_initial_schema.sql).
 *
 * Quando o projeto Supabase estiver criado, gerar tipos oficiais com:
 * npx supabase gen types typescript --project-id <id> > src/types/supabase.ts
 */

export const ORDER_STATUSES = [
  "pending",
  "preparing",
  "ready",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Máquina de estados do pedido — espelho do trigger no banco. */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["delivered"],
  delivered: [],
  cancelled: [],
};

export interface Establishment {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  is_open: boolean;
  created_at: string;
  updated_at: string;
}

export interface Table {
  id: string;
  establishment_id: string;
  label: string;
  is_active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  establishment_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface MenuItem {
  id: string;
  establishment_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  establishment_id: string;
  table_id: string;
  status: OrderStatus;
  customer_name: string | null;
  note: string | null;
  total_cents: number;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  /** Snapshot do nome no momento do pedido (imune a renomeações). */
  item_name: string;
  /** Snapshot do preço no momento do pedido (imune a reprecificação). */
  unit_price_cents: number;
  quantity: number;
  note: string | null;
}
