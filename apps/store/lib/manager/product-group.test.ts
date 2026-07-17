import { describe, it, expect } from "vitest";
import {
  classifyByRootName,
  buildProductGroupResolver,
  type CategoryNode,
} from "./product-group";

describe("classifyByRootName", () => {
  it("Сток за назвою кореня", () => {
    expect(classifyByRootName("СТОК")).toBe("stock");
    expect(classifyByRootName(" сток ")).toBe("stock");
  });

  it("Секонд хенд за назвою кореня", () => {
    expect(classifyByRootName("СЕКОНД ХЕНД")).toBe("second");
    expect(classifyByRootName("Секонд")).toBe("second");
  });

  it("службові/невідомі → other", () => {
    expect(classifyByRootName("Роздріб")).toBe("other");
    expect(classifyByRootName("Перепаковка")).toBe("other");
    expect(classifyByRootName(null)).toBe("other");
    expect(classifyByRootName(undefined)).toBe("other");
    expect(classifyByRootName("")).toBe("other");
  });
});

describe("buildProductGroupResolver", () => {
  const cats: CategoryNode[] = [
    { id: "stok", name: "СТОК", parentId: null },
    { id: "second", name: "СЕКОНД ХЕНД", parentId: null },
    { id: "rozdrib", name: "Роздріб", parentId: null },
    // піддерева
    { id: "stok-winter", name: "Зима", parentId: "stok" },
    { id: "stok-winter-jackets", name: "Куртки", parentId: "stok-winter" },
    { id: "second-summer", name: "Літо", parentId: "second" },
    {
      id: "second-summer-tshirts",
      name: "Футболки",
      parentId: "second-summer",
    },
    { id: "rozdrib-x", name: "Дрібниця", parentId: "rozdrib" },
  ];
  const resolve = buildProductGroupResolver(cats);

  it("глибокий вузол резолвиться по кореню", () => {
    expect(resolve("stok-winter-jackets")).toBe("stock");
    expect(resolve("second-summer-tshirts")).toBe("second");
    expect(resolve("rozdrib-x")).toBe("other");
  });

  it("сам корінь класифікується", () => {
    expect(resolve("stok")).toBe("stock");
    expect(resolve("second")).toBe("second");
  });

  it("невідомий / порожній categoryId → other", () => {
    expect(resolve("no-such-id")).toBe("other");
    expect(resolve(null)).toBe("other");
    expect(resolve(undefined)).toBe("other");
  });

  it("захищає від циклу в дереві (не зависає)", () => {
    const cyclic: CategoryNode[] = [
      { id: "a", name: "A", parentId: "b" },
      { id: "b", name: "B", parentId: "a" },
    ];
    const r = buildProductGroupResolver(cyclic);
    expect(r("a")).toBe("other"); // не кидає, не зациклюється
  });
});
