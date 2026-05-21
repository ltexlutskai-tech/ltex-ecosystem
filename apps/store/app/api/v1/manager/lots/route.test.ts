import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    lot: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: {},
}));

vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

import { GET } from "./route";

const MANAGER_USER = {
  id: "u1",
  email: "alice@example.com",
  fullName: "Alice",
  role: "manager" as const,
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};

function makeReq(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/v1/manager/lots${query}`, {
    method: "GET",
  });
}

const fakeRow = {
  id: "lot1",
  barcode: "1234567890123",
  weight: 25,
  quantity: 1,
  status: "free",
  sector: "A-1",
  videoUrl: null,
  videoDate: null,
  isTarget: false,
  isOpen: false,
  product: {
    id: "p1",
    articleCode: "A1",
    name: "Куртки зимові",
    slug: "kurtky-zymovi",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER_USER);
  mockPrisma.lot.count.mockResolvedValue(1);
  mockPrisma.lot.findMany.mockResolvedValue([fakeRow]);
});

describe("GET /api/v1/manager/lots", () => {
  it("returns 401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(mockPrisma.lot.findMany).not.toHaveBeenCalled();
  });

  it("returns grouped lots + paging meta", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: unknown[];
      groups: { productId: string; lots: unknown[] }[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
    expect(json.total).toBe(1);
    expect(json.items).toHaveLength(1);
    expect(json.groups).toHaveLength(1);
    expect(json.groups[0]?.productId).toBe("p1");
    expect(json.page).toBe(1);
    expect(json.totalPages).toBe(1);
  });

  it("applies base weight>0 filter by default", async () => {
    await GET(makeReq());
    const where = mockPrisma.lot.findMany.mock.calls[0]?.[0]?.where as {
      AND: unknown[];
    };
    expect(where.AND).toContainEqual({ weight: { gt: 0 } });
  });

  it("target=true filters to target lots", async () => {
    await GET(makeReq("?target=true"));
    const where = mockPrisma.lot.findMany.mock.calls[0]?.[0]?.where as {
      AND: unknown[];
    };
    expect(where.AND).toContainEqual({ isTarget: true });
  });

  it("hasVideo=true filters to lots with video", async () => {
    await GET(makeReq("?hasVideo=true"));
    const where = mockPrisma.lot.findMany.mock.calls[0]?.[0]?.where as {
      AND: unknown[];
    };
    expect(where.AND).toContainEqual({ videoUrl: { not: null } });
  });

  it("status=reserved filters to reserved lots", async () => {
    await GET(makeReq("?status=reserved"));
    const where = mockPrisma.lot.findMany.mock.calls[0]?.[0]?.where as {
      AND: unknown[];
    };
    expect(where.AND).toContainEqual({ status: "reserved" });
  });

  it("productId pre-filters to a single product", async () => {
    await GET(makeReq("?productId=p1"));
    const where = mockPrisma.lot.findMany.mock.calls[0]?.[0]?.where as {
      AND: unknown[];
    };
    expect(where.AND).toContainEqual({ productId: "p1" });
  });

  it("search q feeds into where", async () => {
    await GET(makeReq("?q=куртк"));
    const where = mockPrisma.lot.findMany.mock.calls[0]?.[0]?.where as {
      AND: Array<{ OR?: unknown[] }>;
    };
    const orClause = where.AND.find((c) => c.OR);
    // barcode + product.name + product.articleCode + reservedByName
    expect(orClause?.OR).toHaveLength(4);
  });

  it("clamps out-of-range page/pageSize instead of 400", async () => {
    const res = await GET(makeReq("?page=99999999&pageSize=9999"));
    expect(res.status).toBe(200);
    const findManyArgs = mockPrisma.lot.findMany.mock.calls[0]?.[0] as {
      take: number;
    };
    expect(findManyArgs.take).toBe(100); // clamped to max pageSize
    const json = (await res.json()) as { pageSize: number };
    expect(json.pageSize).toBe(100);
  });

  it("returns 400 on invalid status enum", async () => {
    const res = await GET(makeReq("?status=bogus"));
    expect(res.status).toBe(400);
    expect(mockPrisma.lot.findMany).not.toHaveBeenCalled();
  });

  it("default sort is by product (articleCode → name → weight)", async () => {
    await GET(makeReq());
    const orderBy = mockPrisma.lot.findMany.mock.calls[0]?.[0]
      ?.orderBy as unknown[];
    expect(orderBy[0]).toEqual({ product: { articleCode: "asc" } });
  });
});
