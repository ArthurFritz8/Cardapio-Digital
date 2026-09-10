import { describe, expect, it } from "vitest";
import { createOrderSchema } from "./order";

const id = "11111111-1111-4111-8111-111111111111";
const valid = { table_id: id, session_token: id, request_id: id, items: [{ menu_item_id: id, quantity: 1 }] };

describe("contrato público de pedido", () => {
  it("aceita IDs, quantidade e observação, sem preço nem nome do prato", () => {
    expect(createOrderSchema.safeParse({ ...valid, items: [{ ...valid.items[0], note: "sem gelo" }] }).success).toBe(true);
  });
  it.each(["price_cents", "unit_price_cents", "item_name", "name"])("rejeita %s enviado no item", (field) => {
    expect(createOrderSchema.safeParse({ ...valid, items: [{ ...valid.items[0], [field]: 1 }] }).success).toBe(false);
  });
  it.each([0, -1, 1.5, 51, Infinity, NaN])("rejeita quantidade %s", (quantity) => {
    expect(createOrderSchema.safeParse({ ...valid, items: [{ menu_item_id: id, quantity }] }).success).toBe(false);
  });
  it("rejeita total adulterado, UUID ausente, nome longo e itens duplicados", () => {
    expect(createOrderSchema.safeParse({ ...valid, total_cents: 0 }).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...valid, request_id: undefined }).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...valid, customer_name: "a".repeat(61) }).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...valid, items: [valid.items[0], valid.items[0]] }).success).toBe(false);
  });
});
