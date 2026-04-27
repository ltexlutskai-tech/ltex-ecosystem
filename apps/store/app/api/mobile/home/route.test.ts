import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@ltex/db", () => ({
  prisma: {
    banner: { findMany: vi.fn() },
    featuredProduct: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
  },
}));

import { GET } from "./route";
import { prisma } from "@ltex/db";

const mockPrisma = prisma as unknown as {
  banner: { findMany: ReturnType<typeof vi.fn> };
  featuredProduct: { findMany: ReturnType<typeof vi.fn> };
  product: { findMany: ReturnType<typeof vi.fn> };
};

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    slug: "test-product",
    name: "Test product",
    quality: "Extra",
    season: "all",
    priceUnit: "kg",
    country: "PL",
    videoUrl: null,
    createdAt: new Date("2026-04-01T00:00:00Z"),
    images: [{ url: "https://x/y.jpg", alt: "alt" }],
    prices: [
      { amount: 10, currency: "EUR", priceType: "wholesale" },
      { amount: 8, currency: "EUR", priceType: "akciya" },
    ],
    _count: { lots: 3 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/mobile/home", () => {
  it("returns banners + featured + onSale + newArrivals keys", async () => {
    mockPrisma.banner.findMany.mockResolvedValue([
      {
        id: "b1",
        title: "Spring sale",
        subtitle: null,
        imageUrl: "https://x/banner.jpg",
        ctaLabel: "Shop",
        ctaHref: "/catalog",
      },
    ]);
    mockPrisma.featuredProduct.findMany.mockResolvedValue([
      { product: makeProduct({ id: "f1" }) },
    ]);
    mockPrisma.product.findMany
      .mockResolvedValueOnce([makeProduct({ id: "s1" })])
      .mockResolvedValueOnce([makeProduct({ id: "n1" })]);

    const res = await GET();
    const body = await res.json();

    expect(Object.keys(body).sort()).toEqual([
      "banners",
      "featured",
      "newArrivals",
      "onSale",
    ]);
    expect(body.banners).toHaveLength(1);
    expect(body.featured[0].id).toBe("f1");
    expect(body.onSale[0].id).toBe("s1");
    expect(body.newArrivals[0].id).toBe("n1");
  });

  it("returns empty arrays when DB has no rows", async () => {
    mockPrisma.banner.findMany.mockResolvedValue([]);
    mockPrisma.featuredProduct.findMany.mockResolvedValue([]);
    mockPrisma.product.findMany.mockResolvedValue([]);

    const res = await GET();
    const body = await res.json();

    expect(body).toEqual({
      banners: [],
      featured: [],
      onSale: [],
      newArrivals: [],
    });
  });

  it("normalises product shape (createdAt → ISO, prices passthrough)", async () => {
    mockPrisma.banner.findMany.mockResolvedValue([]);
    mockPrisma.featuredProduct.findMany.mockResolvedValue([
      { product: makeProduct() },
    ]);
    mockPrisma.product.findMany.mockResolvedValue([]);

    const res = await GET();
    const body = await res.json();
    const product = body.featured[0];

    expect(product.createdAt).toBe("2026-04-01T00:00:00.000Z");
    expect(product.prices).toEqual([
      { amount: 10, currency: "EUR", priceType: "wholesale" },
      { amount: 8, currency: "EUR", priceType: "akciya" },
    ]);
    expect(product._count).toEqual({ lots: 3 });
  });
});
