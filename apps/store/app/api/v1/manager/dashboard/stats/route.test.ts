import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    clientAssignment: {
      count: vi.fn(),
    },
    exchangeRate: {
      findMany: vi.fn(),
    },
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

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER_USER);
  mockPrisma.clientAssignment.count.mockResolvedValue(47);
  mockPrisma.exchangeRate.findMany.mockResolvedValue([
    { currencyFrom: "EUR", currencyTo: "UAH", rate: 52, date: new Date() },
    { currencyFrom: "USD", currencyTo: "UAH", rate: 44, date: new Date() },
  ]);
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
});
