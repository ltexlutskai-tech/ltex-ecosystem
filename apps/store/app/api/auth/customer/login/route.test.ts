import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  mockPrisma,
  rateLimitMock,
  setCookieMock,
  notifyNewLeadMock,
  createSiteLeadMock,
} = vi.hoisted(() => ({
  mockPrisma: {
    customer: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  rateLimitMock: vi
    .fn()
    .mockReturnValue({ allowed: true, remaining: 5, resetAt: Date.now() }),
  setCookieMock: vi.fn().mockResolvedValue(undefined),
  notifyNewLeadMock: vi.fn().mockResolvedValue(undefined),
  createSiteLeadMock: vi.fn().mockResolvedValue(undefined),
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

vi.mock("@/lib/notifications", () => ({
  notifyNewLead: (...args: unknown[]) => notifyNewLeadMock(...args),
}));

vi.mock("@/lib/manager/site-lead", () => ({
  createSiteLead: (...args: unknown[]) => createSiteLeadMock(...args),
}));

import { POST } from "./route";

// Валідна область (slug) — обовʼязкова у кожному запиті.
const REGION = "volynska"; // → "Волинська"

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
      region: null,
    });
    mockPrisma.customer.update.mockResolvedValue({
      id: "customer-1",
      name: "Іван",
      region: null,
    });
  });

  it("rejects an invalid payload with 400", async () => {
    const res = await POST(makeRequest({ phone: "x" }));
    expect(res.status).toBe(400);
  });

  it("rejects when region is missing", async () => {
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Іван" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an unknown region slug", async () => {
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Іван", region: "narnia" }),
    );
    expect(res.status).toBe(400);
  });

  it("creates a new customer (phone + region label) when none exists", async () => {
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Іван", region: REGION }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.customer.create).toHaveBeenCalledWith({
      data: { phone: "+380671234567", name: "Іван", region: "Волинська" },
      select: { id: true, name: true, region: true },
    });
    expect(setCookieMock).toHaveBeenCalledWith("customer-1");
  });

  it("looks up an existing customer by phoneKey (last 9 digits)", async () => {
    await POST(
      makeRequest({ phone: "0671234567", name: "Іван", region: REGION }),
    );
    expect(mockPrisma.customer.findFirst).toHaveBeenCalledWith({
      where: { phoneKey: "671234567" },
      select: { id: true, name: true, region: true },
    });
  });

  it("reuses an existing customer by phone (findFirst, not upsert)", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: "customer-existing",
      name: "Олена",
      region: "Волинська",
    });
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Олена", region: REGION }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.customer.create).not.toHaveBeenCalled();
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
    expect(setCookieMock).toHaveBeenCalledWith("customer-existing");
  });

  it("backfills the customer name when it is empty", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: "customer-existing",
      name: "   ",
      region: "Волинська",
    });
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Іван", region: REGION }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({
      where: { id: "customer-existing" },
      data: { name: "Іван" },
    });
  });

  it("also backfills region when the existing name is non-empty but region empty", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: "customer-existing",
      name: "Олена",
      region: null,
    });
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Стара", region: REGION }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({
      where: { id: "customer-existing" },
      data: { region: "Волинська" },
    });
  });

  it("does NOT overwrite an existing non-null region on login", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: "customer-existing",
      name: "Олена",
      region: "Львівська",
    });
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Олена", region: REGION }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
  });

  it("rejects when rate-limited", async () => {
    rateLimitMock.mockReturnValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });
    const res = await POST(
      makeRequest({ phone: "+380", name: "x", region: REGION }),
    );
    expect(res.status).toBe(429);
  });

  it("normalises a 0XX local phone to +380 on create", async () => {
    await POST(
      makeRequest({ phone: "0671234567", name: "Іван", region: REGION }),
    );
    expect(mockPrisma.customer.create).toHaveBeenCalledWith({
      data: { phone: "+380671234567", name: "Іван", region: "Волинська" },
      select: { id: true, name: true, region: true },
    });
  });

  it("rejects a phone that is too short to normalise", async () => {
    const res = await POST(
      makeRequest({ phone: "12345", name: "Іван", region: REGION }),
    );
    expect(res.status).toBe(400);
  });

  it("fires notifyNewLead once (region as city) when a customer is created", async () => {
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Іван", region: REGION }),
    );
    expect(res.status).toBe(200);
    expect(notifyNewLeadMock).toHaveBeenCalledTimes(1);
    expect(notifyNewLeadMock).toHaveBeenCalledWith({
      customerId: "customer-1",
      phone: "+380671234567",
      name: "Іван",
      city: "Волинська",
      source: "web",
    });
  });

  it("passes the region slug to createSiteLead on creation", async () => {
    await POST(
      makeRequest({ phone: "+380671234567", name: "Іван", region: REGION }),
    );
    expect(createSiteLeadMock).toHaveBeenCalledWith({
      name: "Іван",
      phone: "+380671234567",
      regionSlug: REGION,
    });
  });

  it("does NOT fire notifyNewLead for an existing customer (login, no create)", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: "customer-existing",
      name: "Олена",
      region: "Волинська",
    });
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Олена", region: REGION }),
    );
    expect(res.status).toBe(200);
    expect(notifyNewLeadMock).not.toHaveBeenCalled();
    expect(createSiteLeadMock).not.toHaveBeenCalled();
  });

  it("does not fail the response when notifyNewLead rejects", async () => {
    notifyNewLeadMock.mockRejectedValueOnce(new Error("TG down"));
    const res = await POST(
      makeRequest({ phone: "+380671234567", name: "Іван", region: REGION }),
    );
    expect(res.status).toBe(200);
  });

  it("ignores sessionId from the request body (no cart merge)", async () => {
    const res = await POST(
      makeRequest({
        phone: "+380671234567",
        name: "Іван",
        region: REGION,
        sessionId: "victim-session-id",
      }),
    );
    expect(res.status).toBe(200);
  });
});
