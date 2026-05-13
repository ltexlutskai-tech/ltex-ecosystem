import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      update: vi.fn(),
    },
  },
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

import { PATCH } from "./route";

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/me", {
    method: "PATCH",
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
  mockPrisma.user.update.mockResolvedValue({
    id: "u1",
    email: "alice@example.com",
    fullName: "Alice Updated",
    role: "manager",
    notifyChannels: [],
    telegramChatId: null,
  });
});

describe("PATCH /api/v1/manager/me", () => {
  it("returns 200 and updates fullName on happy path", async () => {
    const res = await PATCH(makeReq({ fullName: "Alice Updated" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { user: { fullName: string } };
    expect(json.user.fullName).toBe("Alice Updated");
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { fullName: "Alice Updated" },
      select: expect.any(Object),
    });
  });

  it("returns 401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await PATCH(makeReq({ fullName: "Alice Updated" }));
    expect(res.status).toBe(401);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("returns 400 when fullName is too short", async () => {
    const res = await PATCH(makeReq({ fullName: "A" }));
    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("returns 400 when notifyChannels contains invalid value", async () => {
    const res = await PATCH(makeReq({ notifyChannels: ["sms"] }));
    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("returns 400 when body is empty", async () => {
    const res = await PATCH(makeReq({}));
    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("accepts notifyChannels update", async () => {
    mockPrisma.user.update.mockResolvedValueOnce({
      id: "u1",
      email: "alice@example.com",
      fullName: "Alice",
      role: "manager",
      notifyChannels: ["push"],
      telegramChatId: null,
    });
    const res = await PATCH(makeReq({ notifyChannels: ["push"] }));
    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { notifyChannels: ["push"] },
      select: expect.any(Object),
    });
  });
});
