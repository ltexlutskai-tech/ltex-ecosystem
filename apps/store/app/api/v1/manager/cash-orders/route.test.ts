import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const {
  mockPrisma,
  getCurrentUserMock,
  getMyClientCodes1CMock,
  createCashOrderWithChangeMock,
} = vi.hoisted(() => ({
  mockPrisma: {
    sale: { findUnique: vi.fn() },
  },
  getCurrentUserMock: vi.fn(),
  getMyClientCodes1CMock: vi.fn(),
  createCashOrderWithChangeMock: vi.fn(),
}));

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
vi.mock("@/lib/manager/cash-order", () => ({
  createCashOrderWithChange: (...a: unknown[]) =>
    createCashOrderWithChangeMock(...a),
}));

import { POST } from "./route";

const MANAGER = { id: "u1", role: "manager" as const };
const ADMIN = { id: "admin1", role: "admin" as const };

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/cash-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = { saleId: "sale1", amountUah: 1200 };

function fakeSale(code1C: string | null = "000001") {
  return {
    id: "sale1",
    totalEur: 100,
    exchangeRateEur: 43,
    exchangeRateUsd: 40,
    cashOnDelivery: false,
    customer: { code1C },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
  getMyClientCodes1CMock.mockResolvedValue(["000001"]);
});

describe("POST /api/v1/manager/cash-orders", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid body (no amounts)", async () => {
    const res = await POST(postReq({ saleId: "sale1" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when sale missing", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(null);
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(404);
  });

  it("returns 403 when manager is not the client's owner", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(fakeSale("FOREIGN"));
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(403);
    expect(createCashOrderWithChangeMock).not.toHaveBeenCalled();
  });

  it("creates an income cash order (201) and passes dueUah", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(fakeSale("000001"));
    createCashOrderWithChangeMock.mockResolvedValueOnce({
      income: { id: "co1" },
      change: null,
    });
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(201);
    const call = createCashOrderWithChangeMock.mock.calls[0]?.[0] as {
      dueUah: number;
      rates: { eur: number; usd: number };
    };
    expect(call.dueUah).toBe(4300); // 100 * 43
    expect(call.rates.eur).toBe(43);
  });

  it("returns change order on overpay", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(fakeSale("000001"));
    createCashOrderWithChangeMock.mockResolvedValueOnce({
      income: { id: "co1" },
      change: { id: "co2", type: "expense", amountUah: 200 },
    });
    const res = await POST(
      postReq({ saleId: "sale1", amountUah: 4500, changeCurrency: "UAH" }),
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { change: { id: string } | null };
    expect(json.change?.id).toBe("co2");
  });

  it("admin can pay for any sale (no ownership check)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    getMyClientCodes1CMock.mockResolvedValueOnce(null);
    mockPrisma.sale.findUnique.mockResolvedValueOnce(fakeSale("FOREIGN"));
    createCashOrderWithChangeMock.mockResolvedValueOnce({
      income: { id: "co1" },
      change: null,
    });
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(201);
  });
});
