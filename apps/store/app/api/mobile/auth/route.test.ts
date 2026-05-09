import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, rateLimitMock, signTokenMock, notifyNewLeadMock } =
  vi.hoisted(() => ({
    mockPrisma: {
      customer: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    },
    rateLimitMock: vi
      .fn()
      .mockReturnValue({ allowed: true, remaining: 10, resetAt: Date.now() }),
    signTokenMock: vi.fn().mockReturnValue("mock-jwt-token"),
    notifyNewLeadMock: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/mobile-auth", () => ({
  signMobileToken: (...args: unknown[]) => signTokenMock(...args),
  MOBILE_TOKEN_TTL_SECONDS: 60 * 60 * 24 * 30,
}));

vi.mock("@/lib/notifications", () => ({
  notifyNewLead: (...args: unknown[]) => notifyNewLeadMock(...args),
}));

import { POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/mobile/auth", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const FRESH_CUSTOMER = {
  id: "customer-1",
  name: "Іван",
  phone: "+380671234567",
  email: null,
  telegram: null,
  city: null,
};

describe("POST /api/mobile/auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockReturnValue({
      allowed: true,
      remaining: 10,
      resetAt: Date.now(),
    });
    signTokenMock.mockReturnValue("mock-jwt-token");
    mockPrisma.customer.findFirst.mockResolvedValue(null);
    mockPrisma.customer.create.mockResolvedValue(FRESH_CUSTOMER);
    mockPrisma.customer.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...FRESH_CUSTOMER, ...data }),
    );
  });

  it("rejects an invalid payload with 400", async () => {
    const res = await POST(makeRequest({ phone: "x" }));
    expect(res.status).toBe(400);
  });

  it("rejects when rate-limited", async () => {
    rateLimitMock.mockReturnValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });
    const res = await POST(makeRequest({ phone: "+380671234567", name: "x" }));
    expect(res.status).toBe(429);
  });

  it("rejects new customer registration without name", async () => {
    const res = await POST(makeRequest({ phone: "+380671234567" }));
    expect(res.status).toBe(400);
  });

  it("creates a new customer when none exists by phone", async () => {
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Іван" }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.customer.create).toHaveBeenCalledWith({
      data: {
        phone: "+380671234567",
        name: "Іван",
        telegram: null,
        city: null,
      },
    });
    const json = await res.json();
    expect(json.token).toBe("mock-jwt-token");
    expect(json.isNew).toBe(true);
  });

  it("creates a customer with city when provided", async () => {
    mockPrisma.customer.create.mockResolvedValueOnce({
      ...FRESH_CUSTOMER,
      city: "Волинська",
    });
    const res = await POST(
      makeRequest({
        phone: "+380671234567",
        name: "Іван",
        city: "Волинська",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.customer.create).toHaveBeenCalledWith({
      data: {
        phone: "+380671234567",
        name: "Іван",
        telegram: null,
        city: "Волинська",
      },
    });
  });

  it("reuses an existing customer by phone (no create, no update)", async () => {
    mockPrisma.customer.findFirst.mockResolvedValueOnce({
      ...FRESH_CUSTOMER,
      id: "customer-existing",
      name: "Олена",
      city: null,
    });
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Олена" }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.customer.create).not.toHaveBeenCalled();
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.isNew).toBe(false);
  });

  it("backfills the customer name when it is empty", async () => {
    mockPrisma.customer.findFirst.mockResolvedValueOnce({
      ...FRESH_CUSTOMER,
      id: "customer-existing",
      name: "   ",
      city: null,
    });
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Іван" }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({
      where: { id: "customer-existing" },
      data: { name: "Іван" },
    });
  });

  it("does NOT overwrite an existing non-empty name on login", async () => {
    mockPrisma.customer.findFirst.mockResolvedValueOnce({
      ...FRESH_CUSTOMER,
      id: "customer-existing",
      name: "Олена",
      city: null,
    });
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Стара" }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
  });

  it("does NOT overwrite an existing non-null city on login", async () => {
    mockPrisma.customer.findFirst.mockResolvedValueOnce({
      ...FRESH_CUSTOMER,
      id: "customer-existing",
      name: "Олена",
      city: "Львівська",
    });
    const res = await POST(
      makeRequest({
        phone: "+380671234567",
        name: "Олена",
        city: "Київська",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
  });

  it("updates city when an existing customer logs in with a region", async () => {
    mockPrisma.customer.findFirst.mockResolvedValueOnce({
      ...FRESH_CUSTOMER,
      id: "customer-existing",
      name: "Олена",
      city: null,
    });
    const res = await POST(
      makeRequest({
        phone: "+380671234567",
        name: "Олена",
        city: "Львівська",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({
      where: { id: "customer-existing" },
      data: { city: "Львівська" },
    });
  });

  it("does not update city when not provided in payload (preserves existing)", async () => {
    mockPrisma.customer.findFirst.mockResolvedValueOnce({
      ...FRESH_CUSTOMER,
      id: "customer-existing",
      name: "Олена",
      city: "Волинська",
    });
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Олена" }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
  });

  it("fires notifyNewLead exactly once when a new customer is created", async () => {
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Іван" }),
    );
    expect(res.status).toBe(200);
    expect(notifyNewLeadMock).toHaveBeenCalledTimes(1);
    expect(notifyNewLeadMock).toHaveBeenCalledWith({
      customerId: "customer-1",
      phone: "+380671234567",
      name: "Іван",
      city: null,
      source: "mobile",
    });
  });

  it("forwards city to notifyNewLead when provided on creation", async () => {
    mockPrisma.customer.create.mockResolvedValueOnce({
      ...FRESH_CUSTOMER,
      city: "Волинська",
    });
    const res = await POST(
      makeRequest({
        phone: "+380671234567",
        name: "Іван",
        city: "Волинська",
      }),
    );
    expect(res.status).toBe(200);
    expect(notifyNewLeadMock).toHaveBeenCalledWith({
      customerId: "customer-1",
      phone: "+380671234567",
      name: "Іван",
      city: "Волинська",
      source: "mobile",
    });
  });

  it("does NOT fire notifyNewLead for an existing customer (login, no create)", async () => {
    mockPrisma.customer.findFirst.mockResolvedValueOnce({
      ...FRESH_CUSTOMER,
      id: "customer-existing",
      name: "Олена",
      city: null,
    });
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Олена" }),
    );
    expect(res.status).toBe(200);
    expect(notifyNewLeadMock).not.toHaveBeenCalled();
  });

  it("does not fail the response when notifyNewLead rejects", async () => {
    notifyNewLeadMock.mockRejectedValueOnce(new Error("TG down"));
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Іван" }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 503 when token signing is unavailable", async () => {
    signTokenMock.mockReturnValueOnce(null);
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Іван" }),
    );
    expect(res.status).toBe(503);
  });
});
