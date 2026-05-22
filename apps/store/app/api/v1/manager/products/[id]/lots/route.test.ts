import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    lot: { findMany: vi.fn() },
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

function req(id: string, q?: string): NextRequest {
  const url = new URL(`http://localhost/api/v1/manager/products/${id}/lots`);
  if (q !== undefined) url.searchParams.set("q", q);
  return new NextRequest(url);
}

describe("GET /api/v1/manager/products/[id]/lots", () => {
  it("returns 401 коли not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(req("p1"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(401);
  });

  it("filters by productId + status='free' + take=50", async () => {
    mockPrisma.lot.findMany.mockResolvedValueOnce([]);
    await GET(req("prod-1"), {
      params: Promise.resolve({ id: "prod-1" }),
    });
    const args = mockPrisma.lot.findMany.mock.calls[0]?.[0] as {
      where: { productId: string; status: string };
      take: number;
    };
    expect(args.where.productId).toBe("prod-1");
    expect(args.where.status).toBe("free");
    expect(args.take).toBe(50);
  });

  it("без q — без OR (поведінка незмінна, спільний з замовленнями)", async () => {
    mockPrisma.lot.findMany.mockResolvedValueOnce([]);
    await GET(req("prod-1"), { params: Promise.resolve({ id: "prod-1" }) });
    const args = mockPrisma.lot.findMany.mock.calls[0]?.[0] as {
      where: { OR?: unknown };
    };
    expect(args.where.OR).toBeUndefined();
  });

  it("q=текст — фільтрує за частковим штрихкодом (contains)", async () => {
    mockPrisma.lot.findMany.mockResolvedValueOnce([]);
    await GET(req("prod-1", "AB"), {
      params: Promise.resolve({ id: "prod-1" }),
    });
    const args = mockPrisma.lot.findMany.mock.calls[0]?.[0] as {
      where: { OR: Array<{ barcode?: { contains: string } }> };
    };
    expect(args.where.OR[0]?.barcode?.contains).toBe("AB");
    // «AB» не число → лише фільтр за штрихкодом.
    expect(args.where.OR).toHaveLength(1);
  });

  it("q=число — додає збіг за вагою у діапазоні ±0.5 кг", async () => {
    mockPrisma.lot.findMany.mockResolvedValueOnce([]);
    await GET(req("prod-1", "20"), {
      params: Promise.resolve({ id: "prod-1" }),
    });
    const args = mockPrisma.lot.findMany.mock.calls[0]?.[0] as {
      where: { OR: Array<{ weight?: { gte: number; lt: number } }> };
    };
    const weightClause = args.where.OR.find((c) => c.weight);
    expect(weightClause?.weight?.gte).toBe(19.5);
    expect(weightClause?.weight?.lt).toBe(20.5);
  });

  it("повертає mapped lots", async () => {
    mockPrisma.lot.findMany.mockResolvedValueOnce([
      {
        id: "l1",
        barcode: "B1",
        weight: 25,
        quantity: 1,
        priceEur: 100,
        status: "free",
      },
    ]);
    const res = await GET(req("p1"), {
      params: Promise.resolve({ id: "p1" }),
    });
    const json = (await res.json()) as {
      items: Array<{ id: string; barcode: string }>;
    };
    expect(json.items).toHaveLength(1);
    expect(json.items[0]?.barcode).toBe("B1");
  });
});
