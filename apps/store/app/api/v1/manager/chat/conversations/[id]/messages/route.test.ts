import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const {
  mockPrisma,
  getCurrentUserMock,
  getConversationForUserMock,
  platformSendMock,
  getPlatformSenderMock,
} = vi.hoisted(() => ({
  mockPrisma: {
    chatInboxMessage: { create: vi.fn() },
    chatConversation: { update: vi.fn() },
  },
  getCurrentUserMock: vi.fn(),
  getConversationForUserMock: vi.fn(),
  platformSendMock: vi.fn(),
  getPlatformSenderMock: vi.fn(),
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
vi.mock("@/lib/chat/platform-send", () => ({
  getPlatformSender: (...args: unknown[]) => getPlatformSenderMock(...args),
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

function postReq(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/chat/conversations/c1/messages",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
  getPlatformSenderMock.mockReturnValue({ send: platformSendMock });
  platformSendMock.mockResolvedValue({ externalMessageId: "ext-1" });
});

describe("POST /api/v1/manager/chat/conversations/[id]/messages", () => {
  it("401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ text: "Hi" }), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(401);
  });

  it("404 when conversation missing", async () => {
    getConversationForUserMock.mockResolvedValueOnce({ status: 404 });
    const res = await POST(postReq({ text: "Hi" }), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(404);
  });

  it("403 when foreign", async () => {
    getConversationForUserMock.mockResolvedValueOnce({ status: 403 });
    const res = await POST(postReq({ text: "Hi" }), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(403);
  });

  it("400 on empty text", async () => {
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
    const res = await POST(postReq({ text: "" }), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(400);
    expect(mockPrisma.chatInboxMessage.create).not.toHaveBeenCalled();
  });

  it("sends via platform + persists outbound message", async () => {
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
    mockPrisma.chatInboxMessage.create.mockResolvedValueOnce({
      id: "m-out-1",
      conversationId: "c1",
      direction: "out",
      sender: "manager",
      text: "Доброго дня",
      mediaUrl: null,
      externalMessageId: "ext-1",
      authorUserId: "u1",
      isRead: true,
      createdAt: new Date("2026-05-31T10:10:00Z"),
    });

    const res = await POST(postReq({ text: "Доброго дня" }), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(201);

    expect(getPlatformSenderMock).toHaveBeenCalledWith("telegram");
    expect(platformSendMock).toHaveBeenCalledWith("tg-1", "Доброго дня");
    const args = mockPrisma.chatInboxMessage.create.mock.calls[0]?.[0] as {
      data: {
        direction: string;
        sender: string;
        authorUserId: string;
        externalMessageId: string | null;
      };
    };
    expect(args.data.direction).toBe("out");
    expect(args.data.sender).toBe("manager");
    expect(args.data.authorUserId).toBe("u1");
    expect(args.data.externalMessageId).toBe("ext-1");
    expect(mockPrisma.chatConversation.update).toHaveBeenCalled();
  });

  it("persists outbound message even when platform-send returns no externalMessageId", async () => {
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
    platformSendMock.mockResolvedValueOnce({});
    mockPrisma.chatInboxMessage.create.mockResolvedValueOnce({
      id: "m-out-2",
      conversationId: "c1",
      direction: "out",
      sender: "manager",
      text: "Hi",
      mediaUrl: null,
      externalMessageId: null,
      authorUserId: "u1",
      isRead: true,
      createdAt: new Date("2026-05-31T10:10:00Z"),
    });
    const res = await POST(postReq({ text: "Hi" }), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(201);
    const args = mockPrisma.chatInboxMessage.create.mock.calls[0]?.[0] as {
      data: { externalMessageId: string | null };
    };
    expect(args.data.externalMessageId).toBeNull();
  });
});
