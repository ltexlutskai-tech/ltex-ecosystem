import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock, getConversationForUserMock } =
  vi.hoisted(() => ({
    mockPrisma: {
      chatConversation: { findUnique: vi.fn() },
      chatInboxMessage: { findMany: vi.fn() },
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

import { GET } from "./route";

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

function req(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/chat/conversations/c1${qs}`,
  );
}

function fakeConvFull() {
  return {
    id: "c1",
    platform: "telegram",
    externalUserId: "tg-1",
    externalUserName: "Іван",
    phone: null,
    clientId: null,
    agentUserId: "u1",
    status: "active",
    unreadForManager: 0,
    lastMessageAt: new Date("2026-05-31T10:00:00Z"),
    createdAt: new Date("2026-05-30T10:00:00Z"),
    client: null,
    agent: { id: "u1", fullName: "Alice" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
});

describe("GET /api/v1/manager/chat/conversations/[id]", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when conversation missing", async () => {
    getConversationForUserMock.mockResolvedValueOnce({ status: 404 });
    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when foreign", async () => {
    getConversationForUserMock.mockResolvedValueOnce({ status: 403 });
    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(403);
  });

  it("returns conversation + messages in chronological order", async () => {
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
    mockPrisma.chatConversation.findUnique.mockResolvedValueOnce(
      fakeConvFull(),
    );
    // Prisma desc order — newest first; route reverses for response.
    mockPrisma.chatInboxMessage.findMany.mockResolvedValueOnce([
      {
        id: "m2",
        conversationId: "c1",
        direction: "out",
        sender: "manager",
        text: "Доброго дня",
        mediaUrl: null,
        externalMessageId: null,
        authorUserId: "u1",
        isRead: true,
        createdAt: new Date("2026-05-31T10:05:00Z"),
      },
      {
        id: "m1",
        conversationId: "c1",
        direction: "in",
        sender: "client",
        text: "Привіт",
        mediaUrl: null,
        externalMessageId: "tg-msg-1",
        authorUserId: null,
        isRead: false,
        createdAt: new Date("2026-05-31T10:00:00Z"),
      },
    ]);

    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      messages: Array<{ id: string }>;
    };
    expect(json.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});
