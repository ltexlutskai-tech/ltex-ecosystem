import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, rateLimitMock, notifyMock, sendEmailMock } = vi.hoisted(
  () => ({
    mockPrisma: {
      lot: { findUnique: vi.fn(), update: vi.fn() },
      customer: { findFirst: vi.fn(), create: vi.fn() },
      exchangeRate: { findFirst: vi.fn() },
      product: { findUnique: vi.fn() },
      order: { create: vi.fn() },
      $transaction: vi.fn(),
    },
    rateLimitMock: vi
      .fn()
      .mockReturnValue({ allowed: true, remaining: 3, resetAt: Date.now() }),
    notifyMock: vi.fn().mockResolvedValue(undefined),
    sendEmailMock: vi.fn().mockResolvedValue(undefined),
  }),
);

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/notifications", () => ({
  notifyNewOrder: (...args: unknown[]) => notifyMock(...args),
}));

vi.mock("@/lib/email", () => ({
  sendOrderConfirmationEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

import { POST } from "./route";

const validBody = {
  customer: { name: "Тест", phone: "+380676710515" },
  lotId: "lot-1",
  productId: "prod-1",
  priceEur: 50,
  weight: 12,
  quantity: 1,
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/quick-order", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/quick-order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockReturnValue({
      allowed: true,
      remaining: 3,
      resetAt: Date.now(),
    });
    mockPrisma.lot.findUnique.mockResolvedValue({
      id: "lot-1",
      status: "free",
      barcode: "BC-1",
    });
    mockPrisma.customer.findFirst.mockResolvedValue(null);
    mockPrisma.customer.create.mockResolvedValue({
      id: "cust-1",
      name: "Тест",
      phone: "+380676710515",
      email: null,
    });
    mockPrisma.exchangeRate.findFirst.mockResolvedValue({ rate: 43 });
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );
    mockPrisma.order.create.mockResolvedValue({ id: "order-1" });
    mockPrisma.lot.update.mockResolvedValue({
      id: "lot-1",
      status: "reserved",
    });
  });

  it("creates order + reserves lot for valid request", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.orderId).toBe("order-1");
    expect(mockPrisma.order.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.lot.update).toHaveBeenCalledWith({
      where: { id: "lot-1" },
      data: { status: "reserved" },
    });
    expect(mockPrisma.customer.create).toHaveBeenCalledWith({
      data: { name: "Тест", phone: "+380676710515" },
    });
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it("reuses existing customer by phone (findFirst, not upsert)", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: "cust-existing",
      name: "Стара",
      phone: "+380676710515",
      email: null,
    });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    expect(mockPrisma.customer.create).not.toHaveBeenCalled();
  });

  it("rejects when rate-limited", async () => {
    rateLimitMock.mockReturnValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(429);
  });

  it("rejects invalid payload (missing phone)", async () => {
    const { customer: _customer, ...rest } = validBody;
    const res = await POST(
      makeRequest({ ...rest, customer: { name: "Тест" } }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when lot does not exist", async () => {
    mockPrisma.lot.findUnique.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(404);
  });

  it("returns 409 when lot already reserved", async () => {
    mockPrisma.lot.findUnique.mockResolvedValue({
      id: "lot-1",
      status: "reserved",
      barcode: "BC-1",
    });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
  });

  it("skips email when customer has no email", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
