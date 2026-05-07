import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, rateLimitMock, setCookieMock } = vi.hoisted(() => ({
  mockPrisma: {
    customer: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    cart: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    cartItem: {
      create: vi.fn(),
    },
  },
  rateLimitMock: vi
    .fn()
    .mockReturnValue({ allowed: true, remaining: 5, resetAt: Date.now() }),
  setCookieMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/customer-auth", () => ({
  setCustomerCookie: (...args: unknown[]) => setCookieMock(...args),
}));

import { POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/customer/login", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/auth/customer/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockReturnValue({
      allowed: true,
      remaining: 5,
      resetAt: Date.now(),
    });
    mockPrisma.customer.findFirst.mockResolvedValue(null);
    mockPrisma.customer.create.mockResolvedValue({
      id: "customer-1",
      name: "Іван",
    });
    mockPrisma.customer.update.mockResolvedValue({
      id: "customer-1",
      name: "Іван",
    });
    mockPrisma.cart.findUnique.mockResolvedValue(null);
    mockPrisma.cart.update.mockResolvedValue(null);
  });

  it("rejects an invalid payload with 400", async () => {
    const res = await POST(makeRequest({ phone: "x" }));
    expect(res.status).toBe(400);
  });

  it("creates a new customer when none exists by phone", async () => {
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Іван" }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.customer.create).toHaveBeenCalledWith({
      data: { phone: "+380671234567", name: "Іван" },
      select: { id: true, name: true },
    });
    expect(setCookieMock).toHaveBeenCalledWith("customer-1");
  });

  it("reuses an existing customer by phone (findFirst, not upsert)", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: "customer-existing",
      name: "Олена",
    });
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Олена" }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.customer.create).not.toHaveBeenCalled();
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
    expect(setCookieMock).toHaveBeenCalledWith("customer-existing");
  });

  it("updates the customer name when it changed", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: "customer-existing",
      name: "Стара",
    });
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Нова" }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({
      where: { id: "customer-existing" },
      data: { name: "Нова" },
    });
  });

  it("rejects when rate-limited", async () => {
    rateLimitMock.mockReturnValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });
    const res = await POST(makeRequest({ phone: "+380", name: "x" }));
    expect(res.status).toBe(429);
  });

  it("normalises a 0XX local phone to +380", async () => {
    await POST(makeRequest({ phone: "0671234567", name: "Іван" }));
    expect(mockPrisma.customer.findFirst).toHaveBeenCalledWith({
      where: { phone: "+380671234567" },
      select: { id: true, name: true },
    });
  });

  it("merges a guest cart into a new customer cart on login", async () => {
    mockPrisma.cart.findUnique
      // First call: findUnique by sessionId — guest cart exists with one item
      .mockResolvedValueOnce({
        id: "guest-cart",
        items: [
          {
            id: "ci-1",
            cartId: "guest-cart",
            lotId: "lot-1",
            productId: "p-1",
            priceEur: 50,
            weight: 10,
            quantity: 1,
          },
        ],
      })
      // Second call: findUnique by customerId — none yet
      .mockResolvedValueOnce(null);

    const res = await POST(
      makeRequest({
        phone: "+380671234567",
        name: "Іван",
        sessionId: "session-abc",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.cart.update).toHaveBeenCalledWith({
      where: { id: "guest-cart" },
      data: { customerId: "customer-1", sessionId: null },
    });
  });
});
