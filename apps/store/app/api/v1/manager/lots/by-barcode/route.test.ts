import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => {
  return {
    mockPrisma: {
      lot: { findUnique: vi.fn() },
    },
    getCurrentUserMock: vi.fn(),
  };
});

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

import { GET } from "./route";

const MANAGER = {
  id: "u1",
  email: "a@b.c",
  fullName: "Alice",
  role: "manager" as const,
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};

function req(qs: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/lots/by-barcode${qs}`,
  );
}

function fakeLot() {
  return {
    id: "lot1",
    barcode: "B0001",
    weight: 22.5,
    quantity: 1,
    status: "free",
    priceEur: 90,
    reservedForClientId: null,
    reservedForName: null,
    reservedByUserId: null,
    reservedByName: null,
    reservedUntil: null,
    product: {
      id: "p1",
      code1C: "C1",
      articleCode: "ART1",
      name: "Куртки зимові",
      slug: "kurtky",
      priceUnit: "kg",
      averageWeight: 22,
      prices: [
        { priceType: "wholesale", amount: 4, currency: "EUR" },
        { priceType: "retail", amount: 6, currency: "EUR" },
      ],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
});

describe("GET /api/v1/manager/lots/by-barcode", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(req("?code=B0001"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when code missing", async () => {
    const res = await GET(req(""));
    expect(res.status).toBe(400);
    expect(mockPrisma.lot.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when barcode not found", async () => {
    mockPrisma.lot.findUnique.mockResolvedValueOnce(null);
    const res = await GET(req("?code=NOPE"));
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Не знайдено товар за ШК");
  });

  it("returns lot + product + prices on success", async () => {
    mockPrisma.lot.findUnique.mockResolvedValueOnce(fakeLot());
    const res = await GET(req("?code=B0001"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      lot: { id: string; weight: number };
      product: { id: string; name: string };
      prices: Array<{ priceType: string; amount: number }>;
    };
    expect(json.lot.id).toBe("lot1");
    expect(json.lot.weight).toBe(22.5);
    expect(json.product.name).toBe("Куртки зимові");
    expect(json.prices).toHaveLength(2);
  });

  it("trims whitespace from code before lookup", async () => {
    mockPrisma.lot.findUnique.mockResolvedValueOnce(fakeLot());
    await GET(req("?code=%20%20B0001%20%20"));
    const args = mockPrisma.lot.findUnique.mock.calls[0]?.[0] as {
      where: { barcode: string };
    };
    expect(args.where.barcode).toBe("B0001");
  });
});
