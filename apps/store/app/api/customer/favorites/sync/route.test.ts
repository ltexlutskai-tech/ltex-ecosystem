import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, getCurrentCustomerMock } = vi.hoisted(() => ({
  mockPrisma: {
    favorite: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
    },
  },
  getCurrentCustomerMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/customer-auth", () => ({
  getCurrentCustomer: (...args: unknown[]) => getCurrentCustomerMock(...args),
}));

import { POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/customer/favorites/sync", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/customer/favorites/sync rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentCustomerMock.mockResolvedValue({
      id: "rate-limit-customer",
      name: "Rate Limit Customer",
    });
    mockPrisma.favorite.findMany.mockResolvedValue([]);
    mockPrisma.favorite.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.product.findMany.mockResolvedValue([]);
  });

  it("returns 429 after 10 requests in the same minute (per-customer cap)", async () => {
    // First 10 requests succeed.
    for (let i = 0; i < 10; i++) {
      const ok = await POST(makeRequest({ items: [] }));
      expect(ok.status).toBe(200);
    }
    // 11th request must be rate-limited.
    const limited = await POST(makeRequest({ items: [] }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
  });
});
