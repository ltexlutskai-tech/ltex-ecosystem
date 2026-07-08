import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, rateLimitMock } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    userRefreshToken: {
      create: vi.fn(),
    },
  },
  rateLimitMock: vi.fn().mockReturnValue({ allowed: true }),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const { hashPasswordMock, isLockedMock, recordFailedMock, clearFailedMock } =
  vi.hoisted(() => ({
    hashPasswordMock: vi.fn(),
    isLockedMock: vi.fn().mockResolvedValue(false),
    recordFailedMock: vi.fn().mockResolvedValue(undefined),
    clearFailedMock: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: (plain: string, hash: string) =>
    Promise.resolve(plain === hash),
  hashPassword: (...args: unknown[]) => hashPasswordMock(...args),
  generateRandomPassword: vi.fn(),
  validatePasswordStrength: vi.fn(),
}));

vi.mock("@/lib/auth/lockout", () => ({
  isLocked: (...args: unknown[]) => isLockedMock(...args),
  recordFailedLogin: (...args: unknown[]) => recordFailedMock(...args),
  clearFailedLogins: (...args: unknown[]) => clearFailedMock(...args),
}));

import { POST } from "./route";

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", "user-agent": "test" },
  });
}

const ACTIVE_USER = {
  id: "u1",
  email: "alice@example.com",
  passwordHash: "alice-pw-1234",
  fullName: "Alice",
  role: "admin" as const,
  isActive: true,
  telegramChatId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockReturnValue({ allowed: true });
  isLockedMock.mockResolvedValue(false);
  mockPrisma.user.update.mockResolvedValue({});
  mockPrisma.userRefreshToken.create.mockResolvedValue({});
});

describe("POST /api/v1/manager/auth/login", () => {
  it("returns 200 + tokens on happy login", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(ACTIVE_USER);
    const res = await POST(
      makeReq({ email: "alice@example.com", password: "alice-pw-1234" }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      accessToken: string;
      user: { role: string };
    };
    expect(json.accessToken.split(".")).toHaveLength(3);
    expect(json.user.role).toBe("admin");
    expect(clearFailedMock).toHaveBeenCalledWith("u1");
    expect(recordFailedMock).not.toHaveBeenCalled();
  });

  it("нормалізує «мобільний» email (пробіл + велика літера) → 200", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(ACTIVE_USER);
    const res = await POST(
      makeReq({ email: "  Alice@Example.com ", password: "alice-pw-1234" }),
    );
    expect(res.status).toBe(200);
    // Пошук користувача — за нормалізованим email (без пробілів, нижній регістр).
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "alice@example.com" },
    });
  });

  it("returns 401 + records failed login on wrong password", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(ACTIVE_USER);
    const res = await POST(
      makeReq({ email: "alice@example.com", password: "wrong-password-1" }),
    );
    expect(res.status).toBe(401);
    expect(recordFailedMock).toHaveBeenCalledWith("u1");
  });

  it("returns 401 on non-existent email (anti-enumeration)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await POST(
      makeReq({ email: "ghost@example.com", password: "anything-here-1" }),
    );
    expect(res.status).toBe(401);
    expect(recordFailedMock).not.toHaveBeenCalled();
  });

  it("returns 423 when user is locked", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(ACTIVE_USER);
    isLockedMock.mockResolvedValue(true);
    const res = await POST(
      makeReq({ email: "alice@example.com", password: "alice-pw-1234" }),
    );
    expect(res.status).toBe(423);
  });

  it("returns 403 when user is inactive", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...ACTIVE_USER,
      isActive: false,
    });
    const res = await POST(
      makeReq({ email: "alice@example.com", password: "alice-pw-1234" }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate-limited", async () => {
    rateLimitMock.mockReturnValue({ allowed: false });
    const res = await POST(
      makeReq({ email: "alice@example.com", password: "alice-pw-1234" }),
    );
    expect(res.status).toBe(429);
  });

  it("returns 400 on missing fields", async () => {
    const res = await POST(makeReq({ email: "not-email" }));
    expect(res.status).toBe(400);
  });
});
