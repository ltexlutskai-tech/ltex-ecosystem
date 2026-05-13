import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@ltex/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
  })),
}));

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

import { prisma } from "@ltex/db";
import { getCurrentUser, requireRole } from "./manager-auth";
import { signAccessToken } from "./jwt";

const mockUser = prisma.user as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
};

function makeReq(headers: Record<string, string> = {}): {
  headers: { get: (key: string) => string | null };
} {
  return {
    headers: {
      get(key: string) {
        return headers[key.toLowerCase()] ?? null;
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("manager-auth", () => {
  it("getCurrentUser returns null when no token", async () => {
    expect(await getCurrentUser()).toBeNull();
  });

  it("getCurrentUser returns null for invalid Bearer token", async () => {
    const req = makeReq({ authorization: "Bearer not-a-real-token" });
    expect(
      await getCurrentUser(
        req as unknown as Parameters<typeof getCurrentUser>[0],
      ),
    ).toBeNull();
  });

  it("getCurrentUser returns user shape for valid Bearer token", async () => {
    const token = signAccessToken("user_123", "admin");
    mockUser.findUnique.mockResolvedValue({
      id: "user_123",
      email: "alice@example.com",
      fullName: "Alice",
      role: "admin",
      isActive: true,
      code1C: null,
      telegramChatId: null,
      notifyChannels: [],
      lastSeenAt: null,
    });
    const req = makeReq({ authorization: `Bearer ${token}` });
    const u = await getCurrentUser(
      req as unknown as Parameters<typeof getCurrentUser>[0],
    );
    expect(u?.id).toBe("user_123");
    expect(u?.role).toBe("admin");
    expect(u?.telegramLinked).toBe(false);
  });

  it("getCurrentUser returns null when user is inactive", async () => {
    const token = signAccessToken("user_456", "manager");
    mockUser.findUnique.mockResolvedValue({
      id: "user_456",
      email: "bob@example.com",
      fullName: "Bob",
      role: "manager",
      isActive: false,
      code1C: null,
      telegramChatId: null,
      notifyChannels: [],
      lastSeenAt: null,
    });
    const req = makeReq({ authorization: `Bearer ${token}` });
    expect(
      await getCurrentUser(
        req as unknown as Parameters<typeof getCurrentUser>[0],
      ),
    ).toBeNull();
  });

  it("getCurrentUser sets telegramLinked=true when telegramChatId present", async () => {
    const token = signAccessToken("user_789", "manager");
    mockUser.findUnique.mockResolvedValue({
      id: "user_789",
      email: "c@example.com",
      fullName: "Carol",
      role: "manager",
      isActive: true,
      code1C: "M001",
      telegramChatId: "12345",
      notifyChannels: ["push", "telegram"],
      lastSeenAt: null,
    });
    const req = makeReq({ authorization: `Bearer ${token}` });
    const u = await getCurrentUser(
      req as unknown as Parameters<typeof getCurrentUser>[0],
    );
    expect(u?.telegramLinked).toBe(true);
    expect(u?.code1C).toBe("M001");
  });

  it("requireRole returns null when user role not allowed", async () => {
    const token = signAccessToken("user_x", "manager");
    mockUser.findUnique.mockResolvedValue({
      id: "user_x",
      email: "x@example.com",
      fullName: "X",
      role: "manager",
      isActive: true,
      code1C: null,
      telegramChatId: null,
      notifyChannels: [],
      lastSeenAt: null,
    });
    const req = makeReq({ authorization: `Bearer ${token}` });
    expect(
      await requireRole(
        ["admin"],
        req as unknown as Parameters<typeof requireRole>[1],
      ),
    ).toBeNull();
  });

  it("requireRole returns user when role is allowed", async () => {
    const token = signAccessToken("user_y", "admin");
    mockUser.findUnique.mockResolvedValue({
      id: "user_y",
      email: "y@example.com",
      fullName: "Y",
      role: "admin",
      isActive: true,
      code1C: null,
      telegramChatId: null,
      notifyChannels: [],
      lastSeenAt: null,
    });
    const req = makeReq({ authorization: `Bearer ${token}` });
    const u = await requireRole(
      ["admin"],
      req as unknown as Parameters<typeof requireRole>[1],
    );
    expect(u?.id).toBe("user_y");
  });
});
