import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@ltex/db", () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    orderItem: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

import { getRecommendations, getFrequentlyBoughtTogether } from "./recommendations";
import { prisma } from "@ltex/db";

const mockProductFindUnique = prisma.product.findUnique as ReturnType<typeof vi.fn>;
const mockProductFindMany = prisma.product.findMany as ReturnType<typeof vi.fn>;
const mockOrderItemFindMany = prisma.orderItem.findMany as ReturnType<typeof vi.fn>;
const mockOrderItemGroupBy = prisma.orderItem.groupBy as ReturnType<typeof vi.fn>;

const makeProduct = (id: string, name: string) => ({
  id,
  slug: name.toLowerCase(),
  name,
  quality: "first",
  season: "demiseason",
  priceUnit: "kg",
  country: "england",
  videoUrl: null,
  images: [],
  prices: [],
  _count: { lots: 5 },
});

describe("getRecommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when product not found", async () => {
    mockProductFindUnique.mockResolvedValue(null);

    const result = await getRecommendations("nonexistent");
    expect(result).toEqual([]);
  });

  it("returns same-quality products first", async () => {
    mockProductFindUnique.mockResolvedValue({
      categoryId: "cat-1",
      quality: "first",
    });

    const sameQualityProducts = Array.from({ length: 6 }, (_, i) =>
      makeProduct(`p${i}`, `Product ${i}`),
    );
    mockProductFindMany.mockResolvedValueOnce(sameQualityProducts);

    const result = await getRecommendations("prod-1", 6);

    expect(result).toHaveLength(6);
    // Should only call findMany once (same quality filled the limit)
    expect(mockProductFindMany).toHaveBeenCalledTimes(1);
    expect(mockProductFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          quality: "first",
          categoryId: "cat-1",
        }),
      }),
    );
  });

  it("fills remaining slots with different-quality products", async () => {
    mockProductFindUnique.mockResolvedValue({
      categoryId: "cat-1",
      quality: "first",
    });

    const sameQuality = [makeProduct("p1", "Same Quality")];
    const diffQuality = [makeProduct("p2", "Diff Quality")];

    mockProductFindMany
      .mockResolvedValueOnce(sameQuality)
      .mockResolvedValueOnce(diffQuality);

    const result = await getRecommendations("prod-1", 6);

    expect(result).toHaveLength(2);
    expect(mockProductFindMany).toHaveBeenCalledTimes(2);
  });

  it("excludes the source product from results", async () => {
    mockProductFindUnique.mockResolvedValue({
      categoryId: "cat-1",
      quality: "first",
    });
    mockProductFindMany.mockResolvedValueOnce([]);
    mockProductFindMany.mockResolvedValueOnce([]);

    await getRecommendations("prod-1", 6);

    // First call: where.id should exclude prod-1
    expect(mockProductFindMany.mock.calls[0]![0]!.where.id).toEqual({ not: "prod-1" });
  });

  it("respects custom limit parameter", async () => {
    mockProductFindUnique.mockResolvedValue({
      categoryId: "cat-1",
      quality: "first",
    });
    mockProductFindMany.mockResolvedValueOnce([]);
    mockProductFindMany.mockResolvedValueOnce([]);

    await getRecommendations("prod-1", 3);

    expect(mockProductFindMany.mock.calls[0]![0]!.take).toBe(3);
  });

  it("only returns in-stock products", async () => {
    mockProductFindUnique.mockResolvedValue({
      categoryId: "cat-1",
      quality: "first",
    });
    mockProductFindMany.mockResolvedValueOnce([]);
    mockProductFindMany.mockResolvedValueOnce([]);

    await getRecommendations("prod-1");

    expect(mockProductFindMany.mock.calls[0]![0]!.where.inStock).toBe(true);
  });
});

describe("getFrequentlyBoughtTogether", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when product has no orders", async () => {
    mockOrderItemFindMany.mockResolvedValue([]);

    const result = await getFrequentlyBoughtTogether("prod-1");
    expect(result).toEqual([]);
  });

  it("returns empty array when no co-products found", async () => {
    mockOrderItemFindMany.mockResolvedValue([
      { orderId: "ord-1" },
      { orderId: "ord-2" },
    ]);
    mockOrderItemGroupBy.mockResolvedValue([]);

    const result = await getFrequentlyBoughtTogether("prod-1");
    expect(result).toEqual([]);
  });

  it("returns co-purchased products sorted by frequency", async () => {
    mockOrderItemFindMany.mockResolvedValue([
      { orderId: "ord-1" },
      { orderId: "ord-2" },
    ]);
    mockOrderItemGroupBy.mockResolvedValue([
      { productId: "p2", _count: { productId: 5 } },
      { productId: "p3", _count: { productId: 2 } },
    ]);
    mockProductFindMany.mockResolvedValue([
      makeProduct("p3", "Product 3"),
      makeProduct("p2", "Product 2"),
    ]);

    const result = await getFrequentlyBoughtTogether("prod-1");

    // Should be sorted by frequency: p2 first (5 times), then p3 (2 times)
    expect(result[0]!.id).toBe("p2");
    expect(result[1]!.id).toBe("p3");
  });

  it("respects the limit parameter", async () => {
    mockOrderItemFindMany.mockResolvedValue([{ orderId: "ord-1" }]);
    mockOrderItemGroupBy.mockResolvedValue([]);

    await getFrequentlyBoughtTogether("prod-1", 2);

    expect(mockOrderItemGroupBy.mock.calls[0]![0]!.take).toBe(2);
  });

  it("excludes the source product from co-products", async () => {
    mockOrderItemFindMany.mockResolvedValue([{ orderId: "ord-1" }]);
    mockOrderItemGroupBy.mockResolvedValue([]);

    await getFrequentlyBoughtTogether("prod-1");

    expect(mockOrderItemGroupBy.mock.calls[0]![0]!.where.productId).toEqual({ not: "prod-1" });
  });
});
