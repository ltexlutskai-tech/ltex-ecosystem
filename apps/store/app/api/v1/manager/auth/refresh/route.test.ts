import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, rateLimitMock } = vi.hoisted(() => ({
  mockPrisma: {
    userRefreshToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  rateLimitMock: vi.fn().mockReturnValue({ allowed: true }),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

import { POST } from "./route";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function makeReq(body: unknown, cookie?: string): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/auth/refresh", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie: `ltex_mgr_refresh=${cookie}` } : {}),
    },
  });
}

const ACTIVE_USER = {
  id: "u1",
  email: "alice@example.com",
  fullName: "Alice",
  role: "admin",
  isActive: true,
  telegramChatId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockReturnValue({ allowed: true });
  mockPrisma.userRefreshToken.create.mockResolvedValue({});
  mockPrisma.userRefreshToken.update.mockResolvedValue({});
});

describe("POST /api/v1/manager/auth/refresh", () => {
  it("rotates tokens on happy path", async () => {
    const plain = "valid-refresh-token-1234567890";
    mockPrisma.userRefreshToken.findUnique.mockResolvedValue({
      id: "rt1",
      userId: "u1",
      tokenHash: sha256(plain),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      revokedAt: null,
      user: ACTIVE_USER,
    });
    const res = await POST(makeReq({ refreshToken: plain }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { accessToken: string };
    expect(json.accessToken.split(".")).toHaveLength(3);
    expect(mockPrisma.userRefreshToken.update).toHaveBeenCalledWith({
      where: { id: "rt1" },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mockPrisma.userRefreshToken.create).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when token already revoked", async () => {
    const plain = "revoked-refresh-token-12345";
    mockPrisma.userRefreshToken.findUnique.mockResolvedValue({
      id: "rt2",
      userId: "u1",
      tokenHash: sha256(plain),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      user: ACTIVE_USER,
    });
    const res = await POST(makeReq({ refreshToken: plain }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when token is expired", async () => {
    const plain = "expired-refresh-token-12345";
    mockPrisma.userRefreshToken.findUnique.mockResolvedValue({
      id: "rt3",
      userId: "u1",
      tokenHash: sha256(plain),
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
      user: ACTIVE_USER,
    });
    const res = await POST(makeReq({ refreshToken: plain }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when refresh token is unknown", async () => {
    mockPrisma.userRefreshToken.findUnique.mockResolvedValue(null);
    const res = await POST(
      makeReq({ refreshToken: "unknown-not-in-db-token-aaaa" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when no token provided", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
  });
});
