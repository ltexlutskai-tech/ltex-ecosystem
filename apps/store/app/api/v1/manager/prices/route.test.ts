import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    product: { findMany: vi.fn(), count: vi.fn() },
  },
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma, Prisma: {} }));
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

function req(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/v1/manager/prices${qs}`);
}

function whereOf(): { AND?: Array<Record<string, unknown>> } {
  const args = mockPrisma.product.findMany.mock.calls[0]?.[0] as {
    where: { AND?: Array<Record<string, unknown>> };
  };
  return args.where;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(USER);
  mockPrisma.product.findMany.mockResolvedValue([]);
  mockPrisma.product.count.mockResolvedValue(0);
});

describe("GET /api/v1/manager/prices", () => {
  it("returns 401 коли not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(req("?q=test"));
    expect(res.status).toBe(401);
    expect(mockPrisma.product.findMany).not.toHaveBeenCalled();
  });

  it("повертає список + пагінацію", async () => {
    mockPrisma.product.findMany.mockResolvedValueOnce([
      {
        id: "p1",
        articleCode: "A1",
        name: "Test",
        description: "",
        priceUnit: "kg",
        videoUrl: null,
        inStock: true,
        createdAt: new Date("2026-05-19"),
        category: { name: "Кат" },
        prices: [{ priceType: "wholesale", amount: 9, currency: "EUR" }],
        lots: [],
      },
    ]);
    mockPrisma.product.count.mockResolvedValueOnce(1);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{ id: string; basePrice: number }>;
      total: number;
      totalPages: number;
    };
    expect(json.items).toHaveLength(1);
    expect(json.items[0]?.basePrice).toBe(9);
    expect(json.total).toBe(1);
    expect(json.totalPages).toBe(1);
  });

  it("returns 400 на невірний параметр (priceFrom negative)", async () => {
    const res = await GET(req("?priceFrom=-5"));
    expect(res.status).toBe(400);
  });

  it("фільтр пошуку → OR у where", async () => {
    await GET(req("?q=куртка"));
    const w = whereOf();
    const orClause = w.AND?.find((c) => "OR" in c);
    expect(orClause).toBeDefined();
  });

  it("categoryId впливає на where", async () => {
    await GET(req("?categoryId=cat1"));
    expect(whereOf().AND).toContainEqual({ categoryId: "cat1" });
  });

  it("target впливає на where", async () => {
    await GET(req("?target=true"));
    expect(whereOf().AND).toContainEqual({
      lots: { some: { isTarget: true } },
    });
  });

  it("noVideo впливає на where", async () => {
    await GET(req("?noVideo=true"));
    expect(whereOf().AND).toContainEqual({ videoUrl: null });
  });

  it("priceFrom/priceTo → wholesale price filter", async () => {
    await GET(req("?priceFrom=5&priceTo=15"));
    const w = whereOf();
    const priceClause = w.AND?.find((c) => "prices" in c) as {
      prices: {
        some: { priceType: string; amount: { gte: number; lte: number } };
      };
    };
    expect(priceClause.prices.some.priceType).toBe("wholesale");
    expect(priceClause.prices.some.amount.gte).toBe(5);
    expect(priceClause.prices.some.amount.lte).toBe(15);
  });

  it("arrivalFrom/arrivalTo → lots OR (arrivalDate, fallback createdAt)", async () => {
    await GET(req("?arrivalFrom=2026-05-01&arrivalTo=2026-05-31"));
    const w = whereOf();
    const lotsClause = w.AND?.find((c) => "lots" in c) as {
      lots: { some: { OR: unknown[] } };
    };
    expect(lotsClause.lots.some.OR).toHaveLength(2);
  });

  it("sort=arrival → orderBy createdAt", async () => {
    await GET(req("?sort=arrival&dir=desc"));
    const args = mockPrisma.product.findMany.mock.calls[0]?.[0] as {
      orderBy: { createdAt?: string; name?: string };
    };
    expect(args.orderBy.createdAt).toBe("desc");
  });

  it("default sort=name asc", async () => {
    await GET(req());
    const args = mockPrisma.product.findMany.mock.calls[0]?.[0] as {
      orderBy: { name?: string };
    };
    expect(args.orderBy.name).toBe("asc");
  });

  it("пагінація: page=2, pageSize=20 → skip/take", async () => {
    await GET(req("?page=2&pageSize=20"));
    const args = mockPrisma.product.findMany.mock.calls[0]?.[0] as {
      skip: number;
      take: number;
    };
    expect(args.skip).toBe(20);
    expect(args.take).toBe(20);
  });

  it("clamp pageSize > 100 до 100", async () => {
    await GET(req("?pageSize=999"));
    const args = mockPrisma.product.findMany.mock.calls[0]?.[0] as {
      take: number;
    };
    expect(args.take).toBe(100);
  });

  it("onSale post-filter: відсіює товари без зниженої акції", async () => {
    mockPrisma.product.findMany.mockResolvedValueOnce([
      {
        id: "p1",
        articleCode: null,
        name: "no-sale",
        description: "",
        priceUnit: "kg",
        videoUrl: null,
        inStock: true,
        createdAt: new Date(),
        category: null,
        prices: [
          { priceType: "wholesale", amount: 10, currency: "EUR" },
          { priceType: "akciya", amount: 12, currency: "EUR" },
        ],
        lots: [],
      },
    ]);
    mockPrisma.product.count.mockResolvedValueOnce(1);
    const res = await GET(req("?onSale=true"));
    const json = (await res.json()) as { items: unknown[] };
    expect(json.items).toHaveLength(0);
  });
});
