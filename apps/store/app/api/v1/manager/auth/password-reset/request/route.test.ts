import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, rateLimitMock, enqueueEmailMock } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
    },
    passwordResetToken: {
      create: vi.fn(),
    },
  },
  rateLimitMock: vi.fn().mockReturnValue({ allowed: true }),
  enqueueEmailMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/email", () => ({
  enqueueEmail: (...args: unknown[]) => enqueueEmailMock(...args),
}));

import { POST } from "./route";

function makeReq(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/auth/password-reset/request",
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockReturnValue({ allowed: true });
  mockPrisma.passwordResetToken.create.mockResolvedValue({});
});

describe("POST /api/v1/manager/auth/password-reset/request", () => {
  it("returns 202 and enqueues email on happy path", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "alice@example.com",
      fullName: "Alice",
      isActive: true,
    });
    const res = await POST(makeReq({ email: "alice@example.com" }));
    expect(res.status).toBe(202);
    expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    expect(enqueueEmailMock).toHaveBeenCalledTimes(1);
    expect(enqueueEmailMock.mock.calls[0]?.[0]?.source).toBe("manager-auth");
  });

  it("returns 202 but does NOT enqueue email when user does not exist", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await POST(makeReq({ email: "ghost@example.com" }));
    expect(res.status).toBe(202);
    expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(enqueueEmailMock).not.toHaveBeenCalled();
  });

  it("returns 202 but does NOT enqueue when user is inactive", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u2",
      email: "bob@example.com",
      fullName: "Bob",
      isActive: false,
    });
    const res = await POST(makeReq({ email: "bob@example.com" }));
    expect(res.status).toBe(202);
    expect(enqueueEmailMock).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    rateLimitMock.mockReturnValue({ allowed: false });
    const res = await POST(makeReq({ email: "anything@example.com" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 on invalid email", async () => {
    const res = await POST(makeReq({ email: "not-an-email" }));
    expect(res.status).toBe(400);
  });
});
