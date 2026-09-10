import { describe, expect, it } from "vitest";
import { parseMenuCache } from "./menu-cache";

const tableId = "11111111-1111-4111-8111-111111111111";
const menu = {
  table: { id: tableId, label: "Mesa 1" },
  establishment: { id: tableId, name: "Bar", description: null, logo_url: null, is_open: true },
  categories: [],
  items: [],
};

describe("cache público do cardápio", () => {
  it("aceita o menu salvo da mesma mesa", () => {
    expect(parseMenuCache(JSON.stringify(menu), tableId)).toEqual(menu);
  });
  it("descarta JSON corrompido, estrutura inválida e outra mesa", () => {
    for (const raw of [null, "{", "null", "[]", "{}", JSON.stringify({ ...menu, items: null })]) {
      expect(parseMenuCache(raw, tableId)).toBeNull();
    }
    expect(parseMenuCache(JSON.stringify(menu), "22222222-2222-4222-8222-222222222222")).toBeNull();
  });
});
