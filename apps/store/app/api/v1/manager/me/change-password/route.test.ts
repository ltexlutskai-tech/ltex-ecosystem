import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock, verifyPasswordMock, hashPasswordMock } =
  vi.hoisted(() => ({
    mockPrisma: {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      userRefreshToken: {
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(),
    },
    getCurrentUserMock: vi.fn(),
    verifyPasswordMock: vi.fn(),
    hashPasswordMock: vi.fn().mockResolvedValue("new-hashed-pw"),
  }));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: (...args: unknown[]) => verifyPasswordMock(...args),
  hashPassword: (...args: unknown[]) => hashPasswordMock(...args),
}));

import { POST } from "./route";

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/me/change-password", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const MANAGER_USER = {
  id: "u1",
  email: "alice@example.com",
  fullName: "Alice",
  role: "manager" as const,
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER_USER);
  mockPrisma.user.findUnique.mockResolvedValue({
    id: "u1",
    passwordHash: "current-hash",
  });
  verifyPasswordMock.mockResolvedValue(true);
  mockPrisma.$transaction.mockResolvedValue([{}, {}]);
});

describe("POST /api/v1/manager/me/change-password", () => {
  it("returns 204 + revokes refresh tokens on happy path", async () => {
    const res = await POST(
      makeReq({
        currentPassword: "current-pw",
        newPassword: "BrandNewPw1234",
      }),
    );
    expect(res.status).toBe(204);
    expect(hashPasswordMock).toHaveBeenCalledWith("BrandNewPw1234");
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(
      makeReq({
        currentPassword: "current-pw",
        newPassword: "BrandNewPw1234",
      }),
    );
    expect(res.status).toBe(401);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 401 when current password is wrong", async () => {
    verifyPasswordMock.mockResolvedValueOnce(false);
    const res = await POST(
      makeReq({
        currentPassword: "wrong-pw",
        newPassword: "BrandNewPw1234",
      }),
    );
    expect(res.status).toBe(401);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 400 when new password is too weak", async () => {
    const res = await POST(
      makeReq({
        currentPassword: "current-pw",
        newPassword: "short",
      }),
    );
    expect(res.status).toBe(400);
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  it("returns 400 when new password has no digits", async () => {
    const res = await POST(
      makeReq({
        currentPassword: "current-pw",
        newPassword: "OnlyLettersHere",
      }),
    );
    expect(res.status).toBe(400);
  });
});
