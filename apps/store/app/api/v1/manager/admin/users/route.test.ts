import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const {
  mockPrisma,
  enqueueEmailMock,
  hashPasswordMock,
  genRandomPasswordMock,
  requireRoleMock,
} = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    passwordResetToken: {
      create: vi.fn(),
    },
  },
  enqueueEmailMock: vi.fn().mockResolvedValue(undefined),
  hashPasswordMock: vi.fn().mockResolvedValue("hashed-pw"),
  genRandomPasswordMock: vi.fn().mockReturnValue("RandomTempPw1234567"),
  requireRoleMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/auth/manager-auth", () => ({
  requireRole: (...args: unknown[]) => requireRoleMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

vi.mock("@/lib/email", () => ({
  enqueueEmail: (...args: unknown[]) => enqueueEmailMock(...args),
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: (...args: unknown[]) => hashPasswordMock(...args),
  generateRandomPassword: (...args: unknown[]) =>
    genRandomPasswordMock(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue({ allowed: true }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

import { POST, GET } from "./route";

function makeReq(body: unknown, method: "POST" | "GET" = "POST"): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/admin/users", {
    method,
    body: method === "POST" ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json" },
  });
}

const ADMIN_USER = {
  id: "admin1",
  email: "admin@example.com",
  fullName: "Admin",
  role: "admin" as const,
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(ADMIN_USER);
});

describe("POST /api/v1/manager/admin/users", () => {
  it("creates user + enqueues invite email on happy path", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: "new1",
      email: "newmgr@example.com",
      fullName: "New Manager",
      role: "manager",
    });
    mockPrisma.passwordResetToken.create.mockResolvedValue({});

    const res = await POST(
      makeReq({
        email: "newmgr@example.com",
        fullName: "New Manager",
        role: "manager",
      }),
    );
    expect(res.status).toBe(201);
    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    expect(enqueueEmailMock).toHaveBeenCalledTimes(1);
    const call = enqueueEmailMock.mock.calls[0]?.[0] as {
      source: string;
      to: string;
    };
    expect(call.source).toBe("manager-auth");
    expect(call.to).toBe("newmgr@example.com");
    expect(
      mockPrisma.passwordResetToken.create.mock.calls[0]?.[0]?.data.isInvite,
    ).toBe(true);
  });

  it("returns 403 when caller is not admin", async () => {
    requireRoleMock.mockResolvedValueOnce(null);
    const res = await POST(
      makeReq({
        email: "newmgr@example.com",
        fullName: "New Manager",
        role: "manager",
      }),
    );
    expect(res.status).toBe(403);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it("returns 409 on duplicate email", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "existing1",
      email: "newmgr@example.com",
    });
    const res = await POST(
      makeReq({
        email: "newmgr@example.com",
        fullName: "New Manager",
        role: "manager",
      }),
    );
    expect(res.status).toBe(409);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid payload", async () => {
    const res = await POST(
      makeReq({ email: "not-an-email", fullName: "x", role: "manager" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/manager/admin/users", () => {
  it("returns list when admin", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: "u1",
        email: "alice@example.com",
        fullName: "Alice",
        role: "admin",
        isActive: true,
        code1C: null,
        telegramChatId: null,
        lastSeenAt: null,
        createdAt: new Date(),
      },
    ]);
    const res = await GET(makeReq({}, "GET"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { users: { email: string }[] };
    expect(json.users).toHaveLength(1);
    expect(json.users[0]?.email).toBe("alice@example.com");
  });

  it("returns 403 when caller is not admin", async () => {
    requireRoleMock.mockResolvedValueOnce(null);
    const res = await GET(makeReq({}, "GET"));
    expect(res.status).toBe(403);
  });
});
