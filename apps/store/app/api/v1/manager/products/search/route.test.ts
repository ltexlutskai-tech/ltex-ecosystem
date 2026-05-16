import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    product: { findMany: vi.fn() },
  },
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

import { GET } from "./route";

const USER = {
  id: "u1",
  email: "a@b",
  fullName: "A",
  role: "manager" as const,
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(USER);
});

function req(qs: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/products/search${qs}`,
  );
}

describe("GET /api/v1/manager/products/search", () => {
  it("returns 401 коли not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(req("?q=test"));
    expect(res.status).toBe(401);
  });

  it("returns empty list коли q < 2 chars", async () => {
    const res = await GET(req("?q=a"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: unknown[] };
    expect(json.items).toEqual([]);
    expect(mockPrisma.product.findMany).not.toHaveBeenCalled();
  });

  it("шукає by name/slug/articleCode/code1C — OR", async () => {
    mockPrisma.product.findMany.mockResolvedValueOnce([]);
    await GET(req("?q=футб"));
    const args = mockPrisma.product.findMany.mock.calls[0]?.[0] as {
      where: { OR: Array<Record<string, unknown>> };
      take: number;
    };
    expect(args.where.OR).toHaveLength(4);
    expect(args.take).toBe(20);
  });

  it("повертає mapped shape з усіма потрібними полями", async () => {
    mockPrisma.product.findMany.mockResolvedValueOnce([
      {
        id: "p1",
        code1C: "C1",
        articleCode: "A1",
        name: "Test product",
        slug: "test-product",
        priceUnit: "kg",
        averageWeight: 25,
        inStock: true,
      },
    ]);
    const res = await GET(req("?q=test"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{ id: string; name: string; priceUnit: string }>;
    };
    expect(json.items).toHaveLength(1);
    expect(json.items[0]?.id).toBe("p1");
    expect(json.items[0]?.priceUnit).toBe("kg");
  });
});
