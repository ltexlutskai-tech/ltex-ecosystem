import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@ltex/db", () => ({ prisma: { category: { findMany: h.findMany } } }));
// React `cache` is a no-op passthrough in this unit context.
vi.mock("react", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, cache: (fn: unknown) => fn };
});

import { getHiddenCategoryIds } from "./catalog-visibility";

describe("getHiddenCategoryIds", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns hidden categories AND their descendants", async () => {
    // tree: A(hidden) → B → D ;  C(visible) → E
    h.findMany.mockResolvedValue([
      { id: "A", parentId: null, hiddenFromCatalog: true },
      { id: "B", parentId: "A", hiddenFromCatalog: false },
      { id: "D", parentId: "B", hiddenFromCatalog: false },
      { id: "C", parentId: null, hiddenFromCatalog: false },
      { id: "E", parentId: "C", hiddenFromCatalog: false },
    ]);
    const ids = (await getHiddenCategoryIds()).sort();
    expect(ids).toEqual(["A", "B", "D"]);
  });

  it("empty when nothing hidden", async () => {
    h.findMany.mockResolvedValue([
      { id: "A", parentId: null, hiddenFromCatalog: false },
    ]);
    expect(await getHiddenCategoryIds()).toEqual([]);
  });
});
