import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: { order: { findMany: vi.fn() } },
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma, Prisma: {} }));
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

function req(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/orders/available-for-route${qs}`,
  );
}

function fakeOrder(id: string, routeSheetId: string | null): unknown {
  return {
    id,
    code1C: `ORD-${id}`,
    totalEur: 100,
    totalUah: 4300,
    routeSheetId,
    customer: { id: "c1", name: "Клієнт", city: "Луцьк" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
});

describe("GET /api/v1/manager/orders/available-for-route", () => {
  it("401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("without routeSheetId → only routeSheetId IS NULL", async () => {
    mockPrisma.order.findMany.mockResolvedValueOnce([fakeOrder("o1", null)]);
    await GET(req());
    const args = mockPrisma.order.findMany.mock.calls[0]?.[0] as {
      where: { routeSheetId?: null };
    };
    expect(args.where.routeSheetId).toBeNull();
  });

  it("with routeSheetId → OR(null, thisSheet)", async () => {
    mockPrisma.order.findMany.mockResolvedValueOnce([
      fakeOrder("o1", null),
      fakeOrder("o2", "rs1"),
    ]);
    const res = await GET(req("?routeSheetId=rs1"));
    expect(res.status).toBe(200);
    const args = mockPrisma.order.findMany.mock.calls[0]?.[0] as {
      where: { OR?: Array<Record<string, unknown>> };
    };
    expect(args.where.OR).toEqual([
      { routeSheetId: null },
      { routeSheetId: "rs1" },
    ]);
    const json = (await res.json()) as {
      items: Array<{ alreadyOnThisSheet: boolean }>;
    };
    expect(json.items[0]?.alreadyOnThisSheet).toBe(false);
    expect(json.items[1]?.alreadyOnThisSheet).toBe(true);
  });

  it("returns minimal picker shape (id/orderNumber/customer/total)", async () => {
    mockPrisma.order.findMany.mockResolvedValueOnce([fakeOrder("o1", null)]);
    const res = await GET(req());
    const json = (await res.json()) as {
      items: Array<{
        id: string;
        orderNumber: string | null;
        totalUah: number;
        customer: { name: string; city: string | null };
      }>;
    };
    const row = json.items[0];
    expect(row?.id).toBe("o1");
    expect(row?.orderNumber).toBe("ORD-o1");
    expect(row?.totalUah).toBe(4300);
    expect(row?.customer.name).toBe("Клієнт");
    expect(row?.customer.city).toBe("Луцьк");
  });

  it("applies search filter (AND with OR over code1C/customer)", async () => {
    mockPrisma.order.findMany.mockResolvedValueOnce([]);
    await GET(req("?search=Луцьк"));
    const args = mockPrisma.order.findMany.mock.calls[0]?.[0] as {
      where: { AND?: Array<{ OR: unknown[] }> };
    };
    expect(args.where.AND?.[0]?.OR).toHaveLength(3);
  });

  it("excludes archived orders", async () => {
    mockPrisma.order.findMany.mockResolvedValueOnce([]);
    await GET(req());
    const args = mockPrisma.order.findMany.mock.calls[0]?.[0] as {
      where: { archived?: boolean };
    };
    expect(args.where.archived).toBe(false);
  });
});
