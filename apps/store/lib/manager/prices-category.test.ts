import { describe, it, expect } from "vitest";
import { buildPricesWhere } from "./prices";

// Тести категорійних гілок buildPricesWhere (сесія 5.7).

describe("buildPricesWhere — категорії (5.7)", () => {
  it("піддерево має пріоритет над точним categoryId", () => {
    const w = buildPricesWhere({
      categoryId: "a",
      categorySubtreeIds: ["a", "b", "c"],
    }) as { AND: Array<Record<string, unknown>> };
    expect(w.AND).toContainEqual({ categoryId: { in: ["a", "b", "c"] } });
    // Не дублюємо точний categoryId, коли є піддерево.
    expect(w.AND).not.toContainEqual({ categoryId: "a" });
  });

  it("без піддерева — точний categoryId", () => {
    const w = buildPricesWhere({ categoryId: "a" }) as {
      AND: Array<Record<string, unknown>>;
    };
    expect(w.AND).toContainEqual({ categoryId: "a" });
  });

  it("порожнє піддерево ігнорується (fallback на categoryId)", () => {
    const w = buildPricesWhere({
      categoryId: "a",
      categorySubtreeIds: [],
    }) as { AND: Array<Record<string, unknown>> };
    expect(w.AND).toContainEqual({ categoryId: "a" });
  });

  it("приховані категорії додають notIn", () => {
    const w = buildPricesWhere({
      hiddenCategoryIds: ["x", "y"],
    }) as { AND: Array<Record<string, unknown>> };
    expect(w.AND).toContainEqual({ categoryId: { notIn: ["x", "y"] } });
  });

  it("порожній hiddenCategoryIds — без notIn", () => {
    expect(buildPricesWhere({ hiddenCategoryIds: [] })).toEqual({});
  });

  it("піддерево + приховані разом", () => {
    const w = buildPricesWhere({
      categorySubtreeIds: ["a", "b"],
      hiddenCategoryIds: ["b"],
    }) as { AND: Array<Record<string, unknown>> };
    expect(w.AND).toContainEqual({ categoryId: { in: ["a", "b"] } });
    expect(w.AND).toContainEqual({ categoryId: { notIn: ["b"] } });
  });
});
