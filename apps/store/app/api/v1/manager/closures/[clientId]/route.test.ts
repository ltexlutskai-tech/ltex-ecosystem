import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock, getMyClientCodes1CMock } = vi.hoisted(
  () => ({
    mockPrisma: {
      mgrClient: { findUnique: vi.fn() },
      order: { findMany: vi.fn() },
      sale: { findMany: vi.fn() },
    },
    getCurrentUserMock: vi.fn(),
    getMyClientCodes1CMock: vi.fn(),
  }),
);

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: {},
}));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));
vi.mock("@/lib/manager/order-ownership", () => ({
  getMyClientCodes1C: (...args: unknown[]) => getMyClientCodes1CMock(...args),
}));

import { GET, POST } from "./route";

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
const ADMIN = { ...MANAGER, id: "admin1", role: "admin" as const };

function getReq(clientId: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/closures/${clientId}`,
  );
}

function postReq(clientId: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/closures/${clientId}`,
    { method: "POST" },
  );
}

function ctx(clientId: string): { params: Promise<{ clientId: string }> } {
  return { params: Promise.resolve({ clientId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
  mockPrisma.order.findMany.mockResolvedValue([]);
  mockPrisma.sale.findMany.mockResolvedValue([]);
});

describe("GET /api/v1/manager/closures/[clientId]", () => {
  it("returns 401 коли не authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(getReq("c1"), ctx("c1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 коли клієнт не знайдений", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce(null);
    const res = await GET(getReq("c1"), ctx("c1"));
    expect(res.status).toBe(404);
  });

  it("returns 403 коли клієнт чужий (manager)", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c1",
      code1C: "000999",
    });
    getMyClientCodes1CMock.mockResolvedValueOnce(["000001", "000002"]);
    const res = await GET(getReq("c1"), ctx("c1"));
    expect(res.status).toBe(403);
  });

  it("returns 200 з items + локальним sold per (order, product)", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c1",
      code1C: "000001",
    });
    getMyClientCodes1CMock.mockResolvedValueOnce(["000001"]);
    mockPrisma.order.findMany.mockResolvedValueOnce([
      {
        id: "ord1",
        code1C: "L-1",
        docNumber: 1,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        items: [
          {
            productId: "p1",
            quantity: 10,
            priceEur: 100,
            product: { id: "p1", name: "Test Mix", code1C: "P1" },
          },
        ],
      },
    ]);
    mockPrisma.sale.findMany.mockResolvedValueOnce([
      {
        orderId: "ord1",
        items: [{ productId: "p1", quantity: 5 }],
      },
    ]);
    const res = await GET(getReq("c1"), ctx("c1"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      items: Array<{ sold: number; status: string; orderUid: string }>;
    };
    expect(json.ok).toBe(true);
    expect(json.items).toHaveLength(1);
    expect(json.items[0]?.sold).toBe(5);
    expect(json.items[0]?.status).toBe("open");
    expect(json.items[0]?.orderUid).toBe("ord1");
  });

  it("status='sold' коли sold >= quantity", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c1",
      code1C: "000001",
    });
    getMyClientCodes1CMock.mockResolvedValueOnce(["000001"]);
    mockPrisma.order.findMany.mockResolvedValueOnce([
      {
        id: "ord1",
        code1C: "L-1",
        docNumber: 1,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        items: [
          {
            productId: "p1",
            quantity: 5,
            priceEur: 100,
            product: { id: "p1", name: "Test Mix", code1C: "P1" },
          },
        ],
      },
    ]);
    mockPrisma.sale.findMany.mockResolvedValueOnce([
      {
        orderId: "ord1",
        items: [{ productId: "p1", quantity: 5 }],
      },
    ]);
    const res = await GET(getReq("c1"), ctx("c1"));
    const json = (await res.json()) as {
      items: Array<{ status: string }>;
    };
    expect(json.items[0]?.status).toBe("sold");
  });

  it("admin отримує доступ до будь-якого клієнта (порожній список)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "any",
      code1C: "000999",
    });
    getMyClientCodes1CMock.mockResolvedValueOnce(null); // admin → null
    const res = await GET(getReq("any"), ctx("any"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: unknown[] };
    expect(json.items).toHaveLength(0);
  });
});

describe("POST /api/v1/manager/closures/[clientId]", () => {
  it("returns 501 — закриття виконується на сторінці замовлення", async () => {
    const res = await POST(postReq("c1"), ctx("c1"));
    expect(res.status).toBe(501);
    const json = (await res.json()) as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toContain("сторінці замовлення");
  });
});
