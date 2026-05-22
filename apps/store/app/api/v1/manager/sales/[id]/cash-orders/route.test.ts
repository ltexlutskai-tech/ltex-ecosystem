import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock, canViewSaleMock } = vi.hoisted(() => ({
  mockPrisma: {
    sale: { findUnique: vi.fn() },
    mgrCashOrder: { findMany: vi.fn() },
  },
  getCurrentUserMock: vi.fn(),
  canViewSaleMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUserMock(...a),
}));
vi.mock("@/lib/manager/sale-ownership", () => ({
  canViewSale: (...a: unknown[]) => canViewSaleMock(...a),
}));

import { GET } from "./route";

const MANAGER = { id: "u1", role: "manager" as const };

function req(): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/sales/sale1/cash-orders",
  );
}
const params = Promise.resolve({ id: "sale1" });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
  canViewSaleMock.mockResolvedValue(true);
});

describe("GET /api/v1/manager/sales/[id]/cash-orders", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(req(), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when cannot view sale", async () => {
    canViewSaleMock.mockResolvedValueOnce(false);
    const res = await GET(req(), { params });
    expect(res.status).toBe(404);
  });

  it("returns 404 when sale missing", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(null);
    const res = await GET(req(), { params });
    expect(res.status).toBe(404);
  });

  it("returns orders + summary with due/balance", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce({
      id: "sale1",
      totalEur: 100,
      exchangeRateEur: 43,
      exchangeRateUsd: 40,
      cashOnDelivery: false,
      codAmountUah: null,
    });
    mockPrisma.mgrCashOrder.findMany.mockResolvedValueOnce([
      {
        id: "co1",
        type: "income",
        amountUah: 4300,
        amountEur: 0,
        amountUsd: 0,
        amountUahCashless: 0,
        changeCurrency: null,
        changeForId: null,
        bankAccount: null,
        cashFlowArticle: null,
        comment: null,
        paidAt: new Date("2026-05-21T10:00:00Z"),
        createdAt: new Date("2026-05-21T10:00:00Z"),
      },
    ]);
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      dueUah: number;
      summary: { receivedUah: number; balanceUah: number };
      orders: Array<{ id: string }>;
    };
    expect(json.dueUah).toBe(4300);
    expect(json.summary.receivedUah).toBe(4300);
    expect(json.summary.balanceUah).toBe(0);
    expect(json.orders[0]?.id).toBe("co1");
  });
});
