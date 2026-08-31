import { describe, expect, it } from "vitest";
import {
  ageLevel,
  appendCancelReason,
  boardColumn,
  elapsedMinutes,
  isAwaitingConfirmation,
  sortActiveOrders,
  upsertActiveOrder,
  type OwnerOrder,
} from "./order-board";

function makeOrder(overrides: Partial<OwnerOrder> = {}): OwnerOrder {
  return {
    id: "o1",
    establishment_id: "e1",
    table_id: "t1",
    status: "pending",
    customer_name: null,
    note: null,
    total_cents: 1000,
    needs_confirmation: false,
    confirmed_at: null,
    created_at: "2026-08-31T12:00:00Z",
    updated_at: "2026-08-31T12:00:00Z",
    table_label: "Mesa 1",
    items: [],
    ...overrides,
  };
}

describe("boardColumn / isAwaitingConfirmation", () => {
  it("pending com needs_confirmation sem confirmed_at vai para awaiting", () => {
    const order = makeOrder({ needs_confirmation: true });
    expect(isAwaitingConfirmation(order)).toBe(true);
    expect(boardColumn(order)).toBe("awaiting");
  });

  it("pending confirmado volta para a fila (confirmed_at seta, status não muda)", () => {
    const order = makeOrder({
      needs_confirmation: true,
      confirmed_at: "2026-08-31T12:05:00Z",
    });
    expect(boardColumn(order)).toBe("queue");
  });

  it("estados terminais não têm coluna", () => {
    expect(boardColumn(makeOrder({ status: "delivered" }))).toBeNull();
    expect(boardColumn(makeOrder({ status: "cancelled" }))).toBeNull();
  });
});

describe("upsertActiveOrder", () => {
  it("insere novo e atualiza existente", () => {
    let list = upsertActiveOrder([], makeOrder());
    list = upsertActiveOrder(list, makeOrder({ status: "preparing" }));
    expect(list).toHaveLength(1);
    expect(list[0]?.status).toBe("preparing");
  });

  it("remove pedido que virou terminal", () => {
    const list = upsertActiveOrder(
      [makeOrder()],
      makeOrder({ status: "cancelled" }),
    );
    expect(list).toHaveLength(0);
  });

  it("mantém ordenação por created_at", () => {
    const older = makeOrder({ id: "a", created_at: "2026-08-31T11:00:00Z" });
    const list = upsertActiveOrder([makeOrder()], older);
    expect(list[0]?.id).toBe("a");
  });
});

describe("sortActiveOrders", () => {
  it("ordena do mais antigo para o mais novo", () => {
    const list = sortActiveOrders([
      makeOrder({ id: "b", created_at: "2026-08-31T12:30:00Z" }),
      makeOrder({ id: "a", created_at: "2026-08-31T12:00:00Z" }),
    ]);
    expect(list.map((o) => o.id)).toEqual(["a", "b"]);
  });
});

describe("elapsedMinutes / ageLevel", () => {
  const now = new Date("2026-08-31T12:15:00Z").getTime();

  it("calcula minutos decorridos", () => {
    expect(elapsedMinutes("2026-08-31T12:00:00Z", now)).toBe(15);
  });

  it("timestamp inválido retorna 0", () => {
    expect(elapsedMinutes("lixo", now)).toBe(0);
  });

  it("classifica urgência em 10/20 min", () => {
    expect(ageLevel(5)).toBe("ok");
    expect(ageLevel(10)).toBe("warn");
    expect(ageLevel(20)).toBe("late");
  });
});

describe("appendCancelReason", () => {
  it("anexa sem sobrescrever nota do cliente", () => {
    expect(appendCancelReason("sem cebola", "Cliente desistiu")).toBe(
      "sem cebola | Cancelado: Cliente desistiu",
    );
  });

  it("cria nota quando não havia", () => {
    expect(appendCancelReason(null, "Erro do sistema")).toBe(
      "Cancelado: Erro do sistema",
    );
  });

  it("motivo vazio mantém nota original", () => {
    expect(appendCancelReason("obs", "  ")).toBe("obs");
    expect(appendCancelReason(null, "")).toBeNull();
  });

  it("nunca estoura o check de 300 chars do banco, preservando o motivo", () => {
    const longNote = "x".repeat(300);
    const result = appendCancelReason(longNote, "Cliente desistiu");
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(300);
    expect(result).toContain("Cancelado: Cliente desistiu");
  });
});
