import { describe, expect, it } from "vitest";
import { formatCents, parseCents } from "./money";

describe("formatCents", () => {
  it("formata centavos em BRL", () => {
    expect(formatCents(1990)).toMatch(/19,90/);
    expect(formatCents(0)).toMatch(/0,00/);
    expect(formatCents(123456)).toMatch(/1\.234,56/);
  });
});

describe("parseCents", () => {
  it("aceita formato pt-BR", () => {
    expect(parseCents("19,90")).toBe(1990);
    expect(parseCents("1.234,56")).toBe(123456);
    expect(parseCents("R$ 19,90")).toBe(1990);
  });

  it("aceita ponto como decimal quando não há vírgula", () => {
    // regressão: antes retornava 199000
    expect(parseCents("19.90")).toBe(1990);
    expect(parseCents("5")).toBe(500);
  });

  it("rejeita entradas inválidas", () => {
    expect(parseCents("abc")).toBeNull();
    expect(parseCents("")).toBeNull();
    expect(parseCents("-5")).toBeNull();
  });
});
