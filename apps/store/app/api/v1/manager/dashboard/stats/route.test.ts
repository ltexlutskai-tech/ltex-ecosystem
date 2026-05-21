import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    clientAssignment: {
      count: vi.fn(),
    },
    mgrClient: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    exchangeRate: {
      findMany: vi.fn(),
    },
    order: {
      count: vi.fn(),
    },
    sale: {
      count: vi.fn(),
    },
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

function makeReq(): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/dashboard/stats", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

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
const ADMIN_USER = {
  ...MANAGER_USER,
  id: "admin1",
  role: "admin" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER_USER);
  mockPrisma.clientAssignment.count.mockResolvedValue(47);
  mockPrisma.mgrClient.aggregate.mockResolvedValue({ _sum: { debt: null } });
  mockPrisma.mgrClient.findMany.mockResolvedValue([
    { code1C: "000001" },
    { code1C: "000002" },
  ]);
  mockPrisma.exchangeRate.findMany.mockResolvedValue([
    { currencyFrom: "EUR", currencyTo: "UAH", rate: 52, date: new Date() },
    { currencyFrom: "USD", currencyTo: "UAH", rate: 44, date: new Date() },
  ]);
  mockPrisma.order.count.mockResolvedValue(0);
  mockPrisma.sale.count.mockResolvedValue(0);
});

describe("GET /api/v1/manager/dashboard/stats", () => {
  it("returns expected shape with rates + client count", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      clientCount: number;
      eur: number | null;
      usd: number | null;
      sessionCounts: { orders: number };
      syncStatus: { lastSyncAt: string };
    };
    expect(json.clientCount).toBe(47);
    expect(json.eur).toBe(52);
    expect(json.usd).toBe(44);
    expect(json.sessionCounts.orders).toBe(0);
    expect(typeof json.syncStatus.lastSyncAt).toBe("string");
  });

  it("returns 401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(mockPrisma.clientAssignment.count).not.toHaveBeenCalled();
  });

  it("returns null rates when no exchange records", async () => {
    mockPrisma.exchangeRate.findMany.mockResolvedValueOnce([]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      eur: number | null;
      usd: number | null;
    };
    expect(json.eur).toBeNull();
    expect(json.usd).toBeNull();
  });

  it("returns real ordersToday count scoped to manager's clients", async () => {
    mockPrisma.order.count.mockResolvedValueOnce(7);
    const res = await GET(makeReq());
    const json = (await res.json()) as { sessionCounts: { orders: number } };
    expect(json.sessionCounts.orders).toBe(7);

    const args = mockPrisma.order.count.mock.calls[0]?.[0] as {
      where: { customer?: { code1C?: { in?: string[] } } };
    };
    expect(args.where.customer?.code1C?.in).toEqual(["000001", "000002"]);
  });

  it("admin sees total ordersToday without scope", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN_USER);
    mockPrisma.order.count.mockResolvedValueOnce(42);
    const res = await GET(makeReq());
    const json = (await res.json()) as { sessionCounts: { orders: number } };
    expect(json.sessionCounts.orders).toBe(42);

    const args = mockPrisma.order.count.mock.calls[0]?.[0] as {
      where: { customer?: unknown };
    };
    expect(args.where.customer).toBeUndefined();
  });

  it("skips order/sale count when manager has 0 assigned clients", async () => {
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([]);
    const res = await GET(makeReq());
    const json = (await res.json()) as {
      sessionCounts: { orders: number; sales: number };
    };
    expect(json.sessionCounts.orders).toBe(0);
    expect(json.sessionCounts.sales).toBe(0);
    expect(mockPrisma.order.count).not.toHaveBeenCalled();
    expect(mockPrisma.sale.count).not.toHaveBeenCalled();
  });

  it("returns real active (non-archived) sales count scoped to manager", async () => {
    mockPrisma.sale.count.mockResolvedValueOnce(9);
    const res = await GET(makeReq());
    const json = (await res.json()) as { sessionCounts: { sales: number } };
    expect(json.sessionCounts.sales).toBe(9);

    const args = mockPrisma.sale.count.mock.calls[0]?.[0] as {
      where: { archived?: boolean; customer?: { code1C?: { in?: string[] } } };
    };
    expect(args.where.archived).toBe(false);
    expect(args.where.customer?.code1C?.in).toEqual(["000001", "000002"]);
  });
});
