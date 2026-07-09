import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const {
  mockPrisma,
  getCurrentUserMock,
  getMyClientCodes1CMock,
  createPaymentOrdersMock,
  resolveCustomerMock,
  ResolveCustomerErrorClass,
} = vi.hoisted(() => {
  class ResolveCustomerError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.name = "ResolveCustomerError";
      this.status = status;
    }
  }
  return {
    mockPrisma: {
      sale: { findUnique: vi.fn() },
      mgrBankAccount: { findUnique: vi.fn() },
      routeSheet: { findUnique: vi.fn() },
      mgrCashOrder: { findUnique: vi.fn() },
    },
    getCurrentUserMock: vi.fn(),
    getMyClientCodes1CMock: vi.fn(),
    createPaymentOrdersMock: vi.fn(),
    resolveCustomerMock: vi.fn(),
    ResolveCustomerErrorClass: ResolveCustomerError,
  };
});

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
  createPaymentOrders: (...a: unknown[]) => createPaymentOrdersMock(...a),
}));
vi.mock("@/lib/manager/resolve-customer", () => ({
  resolveCustomerForOrder: (...a: unknown[]) => resolveCustomerMock(...a),
  ResolveCustomerError: ResolveCustomerErrorClass,
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

const validBody = {
  saleId: "sale1",
  amountUah: 4300,
  rateEur: 43,
  rateUsd: 40,
  sumToPayEur: 100,
  cashFlowArticleId: "art1", // стаття тепер обов'язкова (Прихід і Розхід)
};

function fakeSale(code1C: string | null = "000001") {
  return { id: "sale1", customer: { id: "cust1", code1C } };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
  getMyClientCodes1CMock.mockResolvedValue(["000001"]);
  createPaymentOrdersMock.mockResolvedValue({
    income: { id: "co1" },
    change: null,
  });
});

describe("POST /api/v1/manager/cash-orders (Етап 2)", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid body (no saleId/clientId)", async () => {
    const res = await POST(
      postReq({ amountUah: 100, rateEur: 43, rateUsd: 40, sumToPayEur: 100 }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when sale missing", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(null);
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(404);
  });

  it("returns 403 when manager is not the sale client's owner", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(fakeSale("FOREIGN"));
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(403);
    expect(createPaymentOrdersMock).not.toHaveBeenCalled();
  });

  it("creates income via saleId (201) and passes rates + customerId", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(fakeSale("000001"));
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(201);
    const call = createPaymentOrdersMock.mock.calls[0]?.[0] as {
      saleId: string;
      customerId: string;
      rates: { eur: number; usd: number };
      sumToPayEur: number;
    };
    expect(call.saleId).toBe("sale1");
    expect(call.customerId).toBe("cust1");
    expect(call.rates.eur).toBe(43);
    expect(call.sumToPayEur).toBe(100);
  });

  it("creates income via clientId (resolves customer)", async () => {
    resolveCustomerMock.mockResolvedValueOnce({
      id: "cust9",
      code1C: "000001",
      name: "Клієнт",
    });
    const res = await POST(
      postReq({
        clientId: "mgr9",
        amountUah: 4300,
        rateEur: 43,
        rateUsd: 40,
        sumToPayEur: 100,
        cashFlowArticleId: "art1",
      }),
    );
    expect(res.status).toBe(201);
    const call = createPaymentOrdersMock.mock.calls[0]?.[0] as {
      customerId: string;
      saleId: string | null;
    };
    expect(call.customerId).toBe("cust9");
    expect(call.saleId).toBeNull();
  });

  it("returns 403 when manager does not own resolved client", async () => {
    resolveCustomerMock.mockResolvedValueOnce({
      id: "cust9",
      code1C: "FOREIGN",
      name: "Клієнт",
    });
    const res = await POST(
      postReq({
        clientId: "mgr9",
        amountUah: 4300,
        rateEur: 43,
        rateUsd: 40,
        sumToPayEur: 100,
        cashFlowArticleId: "art1",
      }),
    );
    expect(res.status).toBe(403);
    expect(createPaymentOrdersMock).not.toHaveBeenCalled();
  });

  it("returns 400 expense without article (schema refine)", async () => {
    const res = await POST(
      postReq({
        saleId: "sale1",
        type: "expense",
        rateEur: 43,
        rateUsd: 40,
        sumToPayEur: 100,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when income uses a hidden bank account", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(fakeSale("000001"));
    mockPrisma.mgrBankAccount.findUnique.mockResolvedValueOnce({
      hiddenInApp: true,
    });
    const res = await POST(postReq({ ...validBody, bankAccountId: "ba1" }));
    expect(res.status).toBe(400);
    expect(createPaymentOrdersMock).not.toHaveBeenCalled();
  });

  it("returns change order on manual change", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(fakeSale("000001"));
    createPaymentOrdersMock.mockResolvedValueOnce({
      income: { id: "co1" },
      change: { id: "co2", type: "expense" },
    });
    const res = await POST(postReq({ ...validBody, changeUah: 200 }));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { change: { id: string } | null };
    expect(json.change?.id).toBe("co2");
  });

  it("admin can pay for any sale (no ownership check)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    getMyClientCodes1CMock.mockResolvedValueOnce(null);
    mockPrisma.sale.findUnique.mockResolvedValueOnce(fakeSale("FOREIGN"));
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(201);
  });

  it("оплата з routeSheetId передає його у createPaymentOrders", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(fakeSale("000001"));
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce({ id: "rs1" });
    const res = await POST(postReq({ ...validBody, routeSheetId: "rs1" }));
    expect(res.status).toBe(201);
    expect(mockPrisma.routeSheet.findUnique).toHaveBeenCalledWith({
      where: { id: "rs1" },
      select: { id: true },
    });
    const call = createPaymentOrdersMock.mock.calls[0]?.[0] as {
      routeSheetId: string | null;
    };
    expect(call.routeSheetId).toBe("rs1");
  });

  it("returns 404 коли routeSheetId не існує", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(fakeSale("000001"));
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce(null);
    const res = await POST(postReq({ ...validBody, routeSheetId: "missing" }));
    expect(res.status).toBe(404);
    expect(createPaymentOrdersMock).not.toHaveBeenCalled();
  });
});
