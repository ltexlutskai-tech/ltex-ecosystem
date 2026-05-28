import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock, getConversationForUserMock } =
  vi.hoisted(() => ({
    mockPrisma: {
      chatInboxMessage: { updateMany: vi.fn() },
      chatConversation: { update: vi.fn() },
      $transaction: vi.fn(),
    },
    getCurrentUserMock: vi.fn(),
    getConversationForUserMock: vi.fn(),
  }));

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: {},
}));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));
vi.mock("@/lib/chat/conversation-access", () => ({
  getConversationForUser: (...args: unknown[]) =>
    getConversationForUserMock(...args),
}));

import { POST } from "./route";

const MANAGER = {
  id: "u1",
  email: "a@b.c",
  fullName: "Alice",
  role: "manager" as const,
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};

function req(): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/chat/conversations/c1/read",
    { method: "POST" },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
  mockPrisma.$transaction.mockResolvedValue([]);
});

describe("POST /api/v1/manager/chat/conversations/[id]/read", () => {
  it("401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(401);
  });

  it("404 when conversation missing", async () => {
    getConversationForUserMock.mockResolvedValueOnce({ status: 404 });
    const res = await POST(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(404);
  });

  it("403 when foreign", async () => {
    getConversationForUserMock.mockResolvedValueOnce({ status: 403 });
    const res = await POST(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(403);
  });

  it("marks messages read + resets unread counter", async () => {
    getConversationForUserMock.mockResolvedValueOnce({
      status: 200,
      conversation: {
        conversationId: "c1",
        platform: "telegram",
        externalUserId: "tg-1",
        agentUserId: "u1",
        clientId: null,
      },
    });
    const res = await POST(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
