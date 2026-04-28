import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@ltex/db", () => ({
  prisma: {
    viewLog: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/mobile-auth", () => ({
  tryMobileSession: vi.fn(),
}));

import { GET } from "./route";
import { prisma } from "@ltex/db";
import { tryMobileSession } from "@/lib/mobile-auth";

const mockPrisma = prisma as unknown as {
  viewLog: { findMany: ReturnType<typeof vi.fn> };
  product: { findMany: ReturnType<typeof vi.fn> };
};
const mockTrySession = tryMobileSession as unknown as ReturnType<typeof vi.fn>;

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

function buildRequest(authHeader?: string): Request {
  return new Request("http://localhost/api/mobile/recommendations", {
    method: "GET",
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/mobile/recommendations", () => {
  it("returns newest in-stock products when the request is anonymous", async () => {
    mockTrySession.mockReturnValue(null);
    mockPrisma.product.findMany.mockResolvedValue([
      makeProduct("a"),
      makeProduct("b"),
    ]);

    const res = await GET(buildRequest() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.products).toHaveLength(2);
    expect(body.products[0].id).toBe("a");

    expect(mockPrisma.viewLog.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.product.findMany).toHaveBeenCalledTimes(1);
    const call = mockPrisma.product.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      take: number;
    };
    expect(call.where).toEqual({ inStock: true });
    expect(call.take).toBe(12);
  });

  it("returns category-matched products excluding seen items when authed with recent views", async () => {
    mockTrySession.mockReturnValue({ customerId: "cust-1" });
    mockPrisma.viewLog.findMany.mockResolvedValue([
      { productId: "seen-1", product: { categoryId: "cat-A" } },
      { productId: "seen-2", product: { categoryId: "cat-A" } },
      { productId: "seen-3", product: { categoryId: "cat-B" } },
    ]);
    mockPrisma.product.findMany.mockResolvedValue([
      makeProduct("rec-1"),
      makeProduct("rec-2"),
    ]);

    const res = await GET(
      buildRequest("Bearer fake-token-not-checked") as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.products.map((p: { id: string }) => p.id)).toEqual([
      "rec-1",
      "rec-2",
    ]);

    expect(mockPrisma.product.findMany).toHaveBeenCalledTimes(1);
    const call = mockPrisma.product.findMany.mock.calls[0]?.[0] as {
      where: {
        inStock: boolean;
        categoryId: { in: string[] };
        id: { notIn: string[] };
      };
    };
    expect(call.where.inStock).toBe(true);
    expect(call.where.categoryId.in.sort()).toEqual(["cat-A", "cat-B"]);
    expect(call.where.id.notIn.sort()).toEqual(["seen-1", "seen-2", "seen-3"]);
  });

  it("falls back to newest in-stock when an authed user has no recent views", async () => {
    mockTrySession.mockReturnValue({ customerId: "cust-2" });
    mockPrisma.viewLog.findMany.mockResolvedValue([]);
    mockPrisma.product.findMany.mockResolvedValue([makeProduct("n-1")]);

    const res = await GET(buildRequest("Bearer x") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.products[0].id).toBe("n-1");

    expect(mockPrisma.product.findMany).toHaveBeenCalledTimes(1);
    const call = mockPrisma.product.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(call.where).toEqual({ inStock: true });
  });

  it("falls back to newest in-stock when category-matched query returns empty", async () => {
    mockTrySession.mockReturnValue({ customerId: "cust-3" });
    mockPrisma.viewLog.findMany.mockResolvedValue([
      { productId: "seen-1", product: { categoryId: "cat-X" } },
    ]);
    mockPrisma.product.findMany
      .mockResolvedValueOnce([]) // category-matched empty
      .mockResolvedValueOnce([makeProduct("fallback-1")]);

    const res = await GET(buildRequest("Bearer x") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.products[0].id).toBe("fallback-1");
    expect(mockPrisma.product.findMany).toHaveBeenCalledTimes(2);
  });

  it("emits a 60s edge cache header", async () => {
    mockTrySession.mockReturnValue(null);
    mockPrisma.product.findMany.mockResolvedValue([]);

    const res = await GET(buildRequest() as never);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=120",
    );
  });
});
