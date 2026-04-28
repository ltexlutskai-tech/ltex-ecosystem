import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@ltex/db", () => ({
  prisma: {
    product: { findMany: vi.fn() },
  },
}));

import { GET } from "./route";
import { prisma } from "@ltex/db";

const mockPrisma = prisma as unknown as {
  product: { findMany: ReturnType<typeof vi.fn> };
};

function makeProduct(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    slug: `slug-${id}`,
    name: `Product ${id}`,
    quality: "Extra",
    season: "all",
    priceUnit: "kg",
    country: "PL",
    videoUrl: null,
    createdAt: new Date("2026-04-01T00:00:00Z"),
    images: [{ url: "https://x/y.jpg", alt: "alt" }],
    prices: [{ amount: 10, currency: "EUR", priceType: "wholesale" }],
    _count: { lots: 3 },
    ...overrides,
  };
}

function buildRequest(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/recommendations${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/recommendations", () => {
  it("falls back to newest in-stock when seen is empty", async () => {
    mockPrisma.product.findMany.mockResolvedValue([
      makeProduct("a"),
      makeProduct("b"),
    ]);

    const res = await GET(buildRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.products).toHaveLength(2);
    expect(body.products[0].id).toBe("a");

    expect(mockPrisma.product.findMany).toHaveBeenCalledTimes(1);
    const call = mockPrisma.product.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      take: number;
    };
    expect(call.where).toEqual({ inStock: true });
    expect(call.take).toBe(12);
  });

  it("returns category-matched products excluding seen items when seen is non-empty", async () => {
    mockPrisma.product.findMany
      .mockResolvedValueOnce([
        { categoryId: "cat-A" },
        { categoryId: "cat-A" },
        { categoryId: "cat-B" },
      ])
      .mockResolvedValueOnce([makeProduct("rec-1"), makeProduct("rec-2")]);

    const res = await GET(buildRequest("?seen=seen-1,seen-2,seen-3"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.products.map((p: { id: string }) => p.id)).toEqual([
      "rec-1",
      "rec-2",
    ]);

    expect(mockPrisma.product.findMany).toHaveBeenCalledTimes(2);
    const lookupCall = mockPrisma.product.findMany.mock.calls[0]?.[0] as {
      where: { id: { in: string[] } };
      select: Record<string, unknown>;
    };
    expect(lookupCall.where.id.in.sort()).toEqual([
      "seen-1",
      "seen-2",
      "seen-3",
    ]);

    const matchCall = mockPrisma.product.findMany.mock.calls[1]?.[0] as {
      where: {
        inStock: boolean;
        categoryId: { in: string[] };
        id: { notIn: string[] };
      };
    };
    expect(matchCall.where.inStock).toBe(true);
    expect(matchCall.where.categoryId.in.sort()).toEqual(["cat-A", "cat-B"]);
    expect(matchCall.where.id.notIn.sort()).toEqual([
      "seen-1",
      "seen-2",
      "seen-3",
    ]);
  });

  it("falls back to newest in-stock when seen IDs match no products", async () => {
    mockPrisma.product.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeProduct("fallback-1")]);

    const res = await GET(buildRequest("?seen=ghost-1,ghost-2"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.products[0].id).toBe("fallback-1");

    expect(mockPrisma.product.findMany).toHaveBeenCalledTimes(2);
    const fallbackCall = mockPrisma.product.findMany.mock.calls[1]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(fallbackCall.where).toEqual({ inStock: true });
  });

  it("falls back to newest in-stock when category-matched query returns empty", async () => {
    mockPrisma.product.findMany
      .mockResolvedValueOnce([{ categoryId: "cat-X" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeProduct("fallback-2")]);

    const res = await GET(buildRequest("?seen=seen-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.products[0].id).toBe("fallback-2");
    expect(mockPrisma.product.findMany).toHaveBeenCalledTimes(3);
  });

  it("emits a 60s edge cache header", async () => {
    mockPrisma.product.findMany.mockResolvedValue([]);

    const res = await GET(buildRequest());
    expect(res.headers.get("Cache-Control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=120",
    );
  });
});
