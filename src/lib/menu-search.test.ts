import { describe, expect, it } from "vitest";
import { searchMenu } from "./menu-search";

const categories = [{ id: "pratos", name: "Refeições" }, { id: "bebidas", name: "Bebidas" }];
const items = [
  { name: "Porção de camarão", description: "Com limão e alho", category_id: "pratos" },
  { name: "Água", description: null, category_id: "bebidas" },
  { name: "Café", description: "Sem açúcar", category_id: "bebidas" },
];

describe("busca local do cardápio", () => {
  it("busca sem acento/caixa e combina termos da descrição e do nome", () => {
    expect(searchMenu(items, categories, "  CAMARAO   limao ")).toEqual([items[0]]);
    expect(searchMenu(items, categories, "cafe ACUCAR")).toEqual([items[2]]);
  });
  it("busca por categoria preservando ordenação", () => {
    expect(searchMenu(items, categories, "bebidas")).toEqual(items.slice(1));
    expect(searchMenu(items, categories, "refeicoes")).toEqual([items[0]]);
  });
  it("limpar restaura os mesmos itens sem alterar o carrinho ou os dados", () => {
    expect(searchMenu(items, categories, "  ")).toBe(items);
    searchMenu(items, categories, "água");
    expect(items).toHaveLength(3);
  });
  it("não interpreta regex e aceita descrições/categorias ausentes", () => {
    expect(searchMenu(items, [], "agua")).toEqual([items[1]]);
    expect(searchMenu(items, categories, ".*")).toEqual([]);
    expect(searchMenu([], categories, "prato")).toEqual([]);
  });
});
