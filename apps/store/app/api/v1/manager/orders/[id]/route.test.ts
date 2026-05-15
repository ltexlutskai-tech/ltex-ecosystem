import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock, canViewOrderMock } = vi.hoisted(() => ({
  mockPrisma: {
    order: { findUnique: vi.fn() },
  },
  getCurrentUserMock: vi.fn(),
  canViewOrderMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));
vi.mock("@/lib/manager/order-ownership", () => ({
  canViewOrder: (...args: unknown[]) => canViewOrderMock(...args),
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

function req(): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/orders/ord1");
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
  canViewOrderMock.mockResolvedValue(true);
});

describe("GET /api/v1/manager/orders/[id]", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(req(), { params: Promise.resolve({ id: "ord1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when manager has no permission", async () => {
    canViewOrderMock.mockResolvedValueOnce(false);
    const res = await GET(req(), { params: Promise.resolve({ id: "ord1" }) });
    expect(res.status).toBe(404);
    expect(mockPrisma.order.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when order missing", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce(null);
    const res = await GET(req(), { params: Promise.resolve({ id: "ord1" }) });
    expect(res.status).toBe(404);
  });

  it("returns full order on success", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      code1C: "000000123",
      status: "approved",
      totalEur: 100,
      totalUah: 4300,
      exchangeRate: 43,
      notes: null,
      createdAt: new Date("2026-05-10T10:00:00Z"),
      updatedAt: new Date("2026-05-10T10:00:00Z"),
      customer: {
        id: "c1",
        name: "X",
        code1C: "000001",
        phone: null,
        city: null,
      },
      items: [
        {
          id: "i1",
          weight: 10,
          quantity: 1,
          priceEur: 5,
          product: { id: "p1", name: "Prod", slug: "prod" },
          lot: { id: "l1", barcode: "L0001" },
        },
      ],
      shipments: [],
      payments: [],
    });

    const res = await GET(req(), { params: Promise.resolve({ id: "ord1" }) });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      order: { id: string; items: Array<{ id: string }> };
    };
    expect(json.order.id).toBe("ord1");
    expect(json.order.items).toHaveLength(1);
  });
});
