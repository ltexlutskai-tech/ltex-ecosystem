import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";

const { mockPrisma, rateLimitMock, hashPasswordMock } = vi.hoisted(() => ({
  mockPrisma: {
    passwordResetToken: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
    userRefreshToken: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  rateLimitMock: vi.fn().mockReturnValue({ allowed: true }),
  hashPasswordMock: vi.fn().mockResolvedValue("hashed-pw"),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: (...args: unknown[]) => hashPasswordMock(...args),
}));

import { POST } from "./route";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/auth/password-reset/confirm",
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    },
  );
}

const VALID_TOKEN = "valid-reset-token-1234567890";

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockReturnValue({ allowed: true });
  mockPrisma.$transaction.mockResolvedValue([{}, {}, {}]);
});

describe("POST /api/v1/manager/auth/password-reset/confirm", () => {
  it("returns 200, hashes password, revokes refresh tokens", async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "prt1",
      userId: "u1",
      tokenHash: sha256(VALID_TOKEN),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      usedAt: null,
    });
    const res = await POST(
      makeReq({ token: VALID_TOKEN, newPassword: "BrandNewPass-1" }),
    );
    expect(res.status).toBe(200);
    expect(hashPasswordMock).toHaveBeenCalledWith("BrandNewPass-1");
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when token is unknown", async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue(null);
    const res = await POST(
      makeReq({ token: VALID_TOKEN, newPassword: "BrandNewPass-1" }),
    );
    expect(res.status).toBe(401);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 401 when token already used", async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "prt2",
      userId: "u1",
      tokenHash: sha256(VALID_TOKEN),
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
    });
    const res = await POST(
      makeReq({ token: VALID_TOKEN, newPassword: "BrandNewPass-1" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when token is expired", async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "prt3",
      userId: "u1",
      tokenHash: sha256(VALID_TOKEN),
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
    });
    const res = await POST(
      makeReq({ token: VALID_TOKEN, newPassword: "BrandNewPass-1" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on weak password", async () => {
    const res = await POST(
      makeReq({ token: VALID_TOKEN, newPassword: "weak" }),
    );
    expect(res.status).toBe(400);
  });
});
