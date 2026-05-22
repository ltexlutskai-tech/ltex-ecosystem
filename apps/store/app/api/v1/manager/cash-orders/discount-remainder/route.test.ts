import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock, getMyClientCodes1CMock } = vi.hoisted(
  () => {
    const tx = {
      saleItem: { update: vi.fn(), findMany: vi.fn() },
      sale: { update: vi.fn() },
    };
    return {
      mockPrisma: {
        sale: { findUnique: vi.fn() },
        saleItem: tx.saleItem,
        $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
        __tx: tx,
      },
      getCurrentUserMock: vi.fn(),
      getMyClientCodes1CMock: vi.fn(),
    };
  },
);

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUserMock(...a),
}));
vi.mock("@/lib/manager/sale-ownership", () => ({
  getMyClientCodes1C: (...a: unknown[]) => getMyClientCodes1CMock(...a),
}));

import { POST } from "./route";

const MANAGER = { id: "u1", role: "manager" as const };

function postReq(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/cash-orders/discount-remainder",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function fakeSale(code1C: string | null = "000001", items?: unknown[]) {
  return {
    id: "sale1",
    exchangeRateEur: 43,
    customer: { code1C },
    items: items ?? [
      { id: "it1", priceEur: 100, pricePerKg: 10, weight: 10 },
      { id: "it2", priceEur: 40, pricePerKg: 8, weight: 5 },
    ],
  };
}

const validBody = {
  saleId: "sale1",
  remainderEur: 4,
  rateEur: 43,
  rateUsd: 40,
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
  getMyClientCodes1CMock.mockResolvedValue(["000001"]);
});

describe("POST discount-remainder", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 when remainder exceeds threshold (>5€)", async () => {
    const res = await POST(postReq({ ...validBody, remainderEur: 6 }));
    expect(res.status).toBe(400);
    expect(mockPrisma.sale.findUnique).not.toHaveBeenCalled();
  });

  it("returns 400 when no saleId (standalone deferred)", async () => {
    const res = await POST(
      postReq({ remainderEur: 2, rateEur: 43, rateUsd: 40 }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when sale not found", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(null);
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(404);
  });

  it("returns 403 when manager does not own the sale", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(fakeSale("FOREIGN"));
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 404 when sale has no items", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(fakeSale("000001", []));
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(404);
  });

  it("reduces the top item and recomputes totals", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(fakeSale("000001"));
    // After update: it1 = 100 - 4 = 96, it2 = 40 → totalEur = 136
    mockPrisma.__tx.saleItem.findMany.mockResolvedValueOnce([
      { priceEur: 96 },
      { priceEur: 40 },
    ]);
    mockPrisma.__tx.sale.update.mockResolvedValueOnce({
      id: "sale1",
      totalEur: 136,
      totalUah: 5848,
    });
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      totalEur: number;
      totalUah: number;
      discountedItemId: string;
    };
    expect(json.discountedItemId).toBe("it1");
    expect(json.totalEur).toBe(136);
    expect(json.totalUah).toBe(5848);

    // top item it1 reduced: priceEur 96, pricePerKg 10*96/100 = 9.6
    const upd = mockPrisma.__tx.saleItem.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { priceEur: number; pricePerKg: number };
    };
    expect(upd.where.id).toBe("it1");
    expect(upd.data.priceEur).toBe(96);
    expect(upd.data.pricePerKg).toBe(9.6);
  });
});
