import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@ltex/db", () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $queryRawUnsafe: vi.fn(),
  },
}));

const mockGetCurrentCustomer = vi.fn();
vi.mock("./customer-auth", () => ({
  getCurrentCustomer: () => mockGetCurrentCustomer(),
}));

import { getCatalogProducts, autocompleteSearch } from "./catalog";
import { prisma } from "@ltex/db";

const mockFindMany = prisma.product.findMany as ReturnType<typeof vi.fn>;
const mockCount = prisma.product.count as ReturnType<typeof vi.fn>;
const mockQueryRaw = prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>;

const makeProduct = (id: string, price = 10) => ({
  id,
  name: `Product ${id}`,
  slug: `product-${id}`,
  images: [],
  prices: [{ amount: price, currency: "EUR", priceType: "wholesale" }],
  _count: { lots: 3 },
});

describe("getCatalogProducts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: simulate an authenticated visitor so prices come through.
    mockGetCurrentCustomer.mockResolvedValue({
      id: "customer-1",
      phone: "+380",
      name: "Test",
    });
  });

  it("strips wholesale prices for unauthenticated visitors (price gate, S73)", async () => {
    mockGetCurrentCustomer.mockResolvedValueOnce(null);
    const products = [makeProduct("1", 25), makeProduct("2", 30)];
    mockFindMany.mockResolvedValue(products);
    mockCount.mockResolvedValue(2);

    const result = await getCatalogProducts({});
    expect(result.products).toHaveLength(2);
    for (const p of result.products) {
      expect(p.prices).toEqual([]);
    }
    // Original input must not be mutated — guards against unstable_cache leaks.
    const firstOriginal = products[0]!;
    expect(firstOriginal.prices).toHaveLength(1);
  });

  it("preserves prices for authenticated visitors", async () => {
    const products = [makeProduct("1", 25)];
    mockFindMany.mockResolvedValue(products);
    mockCount.mockResolvedValue(1);

    const result = await getCatalogProducts({});
    const first = result.products[0]!;
    expect(first.prices).toHaveLength(1);
    expect(first.prices[0]!.amount).toBe(25);
  });

  it("returns paginated products with default settings", async () => {
    const products = [makeProduct("1"), makeProduct("2")];
    mockFindMany.mockResolvedValue(products);
    mockCount.mockResolvedValue(2);

    const result = await getCatalogProducts({});

    expect(result.products).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.totalPages).toBe(1);
  });

  it("applies category filter", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ categoryId: "cat-1" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          categoryId: "cat-1",
        }),
      }),
    );
  });

  it("applies multiple category IDs filter", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ categoryIds: ["cat-1", "cat-2"] });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          categoryId: { in: ["cat-1", "cat-2"] },
        }),
      }),
    );
  });

  it("applies quality filter", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ quality: "first" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ quality: "first" }),
      }),
    );
  });

  it("parses comma-separated quality into IN filter", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ quality: "extra,cream" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          quality: { in: ["extra", "cream"] },
        }),
      }),
    );
  });

  it("accepts quality as array directly", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ quality: ["extra", "first"] });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          quality: { in: ["extra", "first"] },
        }),
      }),
    );
  });

  it("parses comma-separated country into IN filter", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ country: "england,germany" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          country: { in: ["england", "germany"] },
        }),
      }),
    );
  });

  it("collapses single-element comma list back to scalar (backward compat)", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ quality: "extra," });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ quality: "extra" }),
      }),
    );
  });

  it("applies season filter", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ season: "winter" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ season: "winter" }),
      }),
    );
  });

  it("applies single gender filter", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ gender: "Жіноча" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ gender: "Жіноча" }),
      }),
    );
  });

  it("parses comma-separated gender into IN filter", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ gender: "Жіноча,Чоловіча" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          gender: { in: ["Жіноча", "Чоловіча"] },
        }),
      }),
    );
  });

  it("applies sizes filter as case-insensitive substring", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ sizes: "XXL" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sizes: { contains: "XXL", mode: "insensitive" },
        }),
      }),
    );
  });

  it("ignores empty sizes filter", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ sizes: "   " });

    const calledWhere = mockFindMany.mock.calls[0]![0]!.where;
    expect(calledWhere.sizes).toBeUndefined();
  });

  it("applies unitsPerKg range as overlap (Max>=min, Min<=max)", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ unitsPerKgMin: 2, unitsPerKgMax: 5 });

    const calledWhere = mockFindMany.mock.calls[0]![0]!.where;
    expect(calledWhere.unitsPerKgMax).toEqual({ gte: 2 });
    expect(calledWhere.unitsPerKgMin).toEqual({ lte: 5 });
  });

  it("applies only unitsPerKgMin when unitsPerKgMax omitted", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ unitsPerKgMin: 3 });

    const calledWhere = mockFindMany.mock.calls[0]![0]!.where;
    expect(calledWhere.unitsPerKgMax).toEqual({ gte: 3 });
    expect(calledWhere.unitsPerKgMin).toBeUndefined();
  });

  it("applies unitWeight range as overlap on min/max columns", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ unitWeightMin: 0.3, unitWeightMax: 0.6 });

    const calledWhere = mockFindMany.mock.calls[0]![0]!.where;
    expect(calledWhere.unitWeightMax).toEqual({ gte: 0.3 });
    expect(calledWhere.unitWeightMin).toEqual({ lte: 0.6 });
  });

  it("applies priceMin filter", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ priceMin: 5 });

    const calledWhere = mockFindMany.mock.calls[0]![0]!.where;
    expect(calledWhere.prices.some.priceType).toBe("wholesale");
    expect(calledWhere.prices.some.amount.gte).toBe(5);
  });

  it("applies priceMax filter", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ priceMax: 50 });

    const calledWhere = mockFindMany.mock.calls[0]![0]!.where;
    expect(calledWhere.prices.some.priceType).toBe("wholesale");
    expect(calledWhere.prices.some.amount.lte).toBe(50);
  });

  it("applies both priceMin and priceMax filters together", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ priceMin: 5, priceMax: 50 });

    const calledWhere = mockFindMany.mock.calls[0]![0]!.where;
    expect(calledWhere.prices.some.priceType).toBe("wholesale");
    expect(calledWhere.prices.some.amount).toEqual({ gte: 5, lte: 50 });
  });

  it("sorts by name ascending", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ sort: "name_asc" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { name: "asc" },
      }),
    );
  });

  it("sorts by newest first", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ sort: "newest" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("sorts by price ascending post-fetch", async () => {
    const products = [
      makeProduct("a", 30),
      makeProduct("b", 10),
      makeProduct("c", 20),
    ];
    mockFindMany.mockResolvedValue(products);
    mockCount.mockResolvedValue(3);

    const result = await getCatalogProducts({ sort: "price_asc" });

    expect(result.products[0]!.prices[0]!.amount).toBe(10);
    expect(result.products[1]!.prices[0]!.amount).toBe(20);
    expect(result.products[2]!.prices[0]!.amount).toBe(30);
  });

  it("sorts by price descending post-fetch", async () => {
    const products = [
      makeProduct("a", 10),
      makeProduct("b", 30),
      makeProduct("c", 20),
    ];
    mockFindMany.mockResolvedValue(products);
    mockCount.mockResolvedValue(3);

    const result = await getCatalogProducts({ sort: "price_desc" });

    expect(result.products[0]!.prices[0]!.amount).toBe(30);
    expect(result.products[1]!.prices[0]!.amount).toBe(20);
    expect(result.products[2]!.prices[0]!.amount).toBe(10);
  });

  it("calculates totalPages correctly", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(50);

    const result = await getCatalogProducts({ perPage: 24 });
    expect(result.totalPages).toBe(3); // ceil(50/24) = 3
  });

  it("applies pagination offset", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ page: 3, perPage: 10 });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
      }),
    );
  });

  it("applies subcategorySlug filter via category relation", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({
      categoryIds: ["cat-1", "cat-2"],
      subcategorySlug: "dytyachyj-odyah",
    });

    const calledWhere = mockFindMany.mock.calls[0]![0]!.where;
    // subcategorySlug takes precedence over categoryIds
    expect(calledWhere.category).toEqual({ slug: "dytyachyj-odyah" });
    expect(calledWhere.categoryId).toBeUndefined();
  });

  it("applies inStockOnly filter via lots relation", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ inStockOnly: true });

    const calledWhere = mockFindMany.mock.calls[0]![0]!.where;
    expect(calledWhere.lots).toEqual({
      some: { status: { in: ["free", "on_sale"] } },
    });
  });

  it("does not add lots filter when inStockOnly is false", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getCatalogProducts({ inStockOnly: false });

    const calledWhere = mockFindMany.mock.calls[0]![0]!.where;
    expect(calledWhere.lots).toBeUndefined();
  });

  it("delegates to fullTextSearch when query is provided", async () => {
    // When q is provided, it uses $queryRawUnsafe for full-text search
    mockQueryRaw
      .mockResolvedValueOnce([{ count: BigInt(1) }]) // count query
      .mockResolvedValueOnce([{ id: "p1" }]); // search query
    mockFindMany.mockResolvedValue([makeProduct("p1")]);

    const result = await getCatalogProducts({ q: "куртка" });

    expect(mockQueryRaw).toHaveBeenCalled();
    expect(result.products).toHaveLength(1);
  });
});

describe("autocompleteSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array for empty query", async () => {
    const result = await autocompleteSearch("");
    expect(result).toEqual([]);
  });

  it("returns empty array for query shorter than 2 chars", async () => {
    const result = await autocompleteSearch("к");
    expect(result).toEqual([]);
  });

  it("returns empty array for query with only special characters", async () => {
    const result = await autocompleteSearch("!@#$%");
    expect(result).toEqual([]);
  });

  it("returns search results for valid query", async () => {
    mockQueryRaw.mockResolvedValue([
      {
        id: "p1",
        name: "Куртка зимова",
        slug: "kurtka-zymova",
        quality: "first",
        rank: BigInt(2),
      },
      {
        id: "p2",
        name: "Куртка літня",
        slug: "kurtka-litnya",
        quality: "extra",
        rank: BigInt(1),
      },
    ]);

    const result = await autocompleteSearch("куртка");

    expect(result).toHaveLength(2);
    expect(mockQueryRaw).toHaveBeenCalled();
    // Should be sorted by rank descending
    expect(Number(result[0]!.rank)).toBeGreaterThanOrEqual(
      Number(result[1]!.rank),
    );
  });

  it("sanitizes special characters in query", async () => {
    mockQueryRaw.mockResolvedValue([]);

    await autocompleteSearch("куртка's");

    // The query should be sanitized (special chars removed except ' and -)
    const callArgs = mockQueryRaw.mock.calls[0]!;
    // $2 parameter should be sanitized
    expect(callArgs[2]).toBe("куртка's");
  });

  it("limits results to 5", async () => {
    const results = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      name: `Product ${i}`,
      slug: `product-${i}`,
      quality: "first",
      rank: BigInt(10 - i),
    }));
    mockQueryRaw.mockResolvedValue(results);

    const result = await autocompleteSearch("product");

    expect(result.length).toBeLessThanOrEqual(5);
  });
});
