import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, requireRoleMock } = vi.hoisted(() => ({
  mockPrisma: {
    exchangeRate: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  requireRoleMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/auth/manager-auth", () => ({
  requireRole: (...args: unknown[]) => requireRoleMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

import { POST } from "./route";

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/admin/rates", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const ADMIN_USER = {
  id: "admin1",
  email: "admin@example.com",
  fullName: "Admin",
  role: "admin" as const,
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(ADMIN_USER);
  mockPrisma.$transaction.mockResolvedValue([
    { currencyFrom: "EUR", currencyTo: "UAH", rate: 52, date: new Date() },
    { currencyFrom: "USD", currencyTo: "UAH", rate: 44, date: new Date() },
  ]);
});

describe("POST /api/v1/manager/admin/rates", () => {
  it("returns 200 and upserts EUR + USD when admin", async () => {
    const res = await POST(makeReq({ EUR: 52, USD: 44 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      rates: { EUR: number; USD: number };
    };
    expect(json.rates.EUR).toBe(52);
    expect(json.rates.USD).toBe(44);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("returns 403 when caller is not admin", async () => {
    requireRoleMock.mockResolvedValueOnce(null);
    const res = await POST(makeReq({ EUR: 52, USD: 44 }));
    expect(res.status).toBe(403);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 400 on negative rate", async () => {
    const res = await POST(makeReq({ EUR: -1, USD: 44 }));
    expect(res.status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 400 on missing field", async () => {
    const res = await POST(makeReq({ EUR: 52 }));
    expect(res.status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 400 on rate above max", async () => {
    const res = await POST(makeReq({ EUR: 999999, USD: 44 }));
    expect(res.status).toBe(400);
  });
});
