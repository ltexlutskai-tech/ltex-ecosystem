import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    mgrClientStatus: { findMany: vi.fn() },
    mgrSearchChannel: { findMany: vi.fn() },
    mgrCategoryTT: { findMany: vi.fn() },
    mgrDeliveryMethod: { findMany: vi.fn() },
    mgrAssortmentCode: { findMany: vi.fn() },
    mgrRoute: { findMany: vi.fn() },
    mgrPriceType: { findMany: vi.fn() },
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

function makeReq(): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/dictionaries", {
    method: "GET",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER_USER);
  mockPrisma.mgrClientStatus.findMany.mockResolvedValue([
    { code: "active", label: "Активний", colorHex: "#16a34a" },
  ]);
  mockPrisma.mgrSearchChannel.findMany.mockResolvedValue([
    { code: "google", label: "Google" },
  ]);
  mockPrisma.mgrCategoryTT.findMany.mockResolvedValue([
    { code: "shop", label: "Магазин" },
  ]);
  mockPrisma.mgrDeliveryMethod.findMany.mockResolvedValue([
    { code: "nova_poshta", label: "Нова Пошта" },
  ]);
  mockPrisma.mgrAssortmentCode.findMany.mockResolvedValue([
    { code: "second", label: "Секонд" },
  ]);
  mockPrisma.mgrRoute.findMany.mockResolvedValue([
    { id: "r1", name: "Маршрут #1" },
  ]);
  mockPrisma.mgrPriceType.findMany.mockResolvedValue([
    { id: "pt1", code: "wholesale", label: "Оптові" },
  ]);
});

describe("GET /api/v1/manager/dictionaries", () => {
  it("returns 401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns all 7 dictionary arrays + cache header", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("max-age=60");
    const json = (await res.json()) as Record<string, unknown[]>;
    expect(json.statuses).toHaveLength(1);
    expect(json.channels).toHaveLength(1);
    expect(json.categories).toHaveLength(1);
    expect(json.deliveries).toHaveLength(1);
    expect(json.assortmentCodes).toHaveLength(1);
    expect(json.routes).toHaveLength(1);
    expect(json.priceTypes).toHaveLength(1);
  });
});
