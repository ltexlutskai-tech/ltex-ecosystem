import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    chatConversation: { findMany: vi.fn(), count: vi.fn() },
  },
  getCurrentUserMock: vi.fn(),
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
const ADMIN = { ...MANAGER, id: "admin1", role: "admin" as const };

function req(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/chat/conversations${qs}`,
  );
}

function fakeConv(id: string) {
  return {
    id,
    platform: "telegram",
    externalUserId: "12345",
    externalUserName: "Іван",
    phone: "+380501234567",
    clientId: null,
    agentUserId: null,
    status: "active",
    unreadForManager: 1,
    lastMessageAt: new Date("2026-05-31T10:00:00Z"),
    createdAt: new Date("2026-05-30T10:00:00Z"),
    client: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
});

describe("GET /api/v1/manager/chat/conversations", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("manager → scope: own OR unassigned (agentUserId null)", async () => {
    mockPrisma.chatConversation.findMany.mockResolvedValueOnce([
      fakeConv("c1"),
    ]);
    mockPrisma.chatConversation.count.mockResolvedValueOnce(1);

    const res = await GET(req());
    expect(res.status).toBe(200);

    const args = mockPrisma.chatConversation.findMany.mock.calls[0]?.[0] as {
      where: { OR?: Array<{ agentUserId: string | null }> };
    };
    expect(args.where.OR).toBeDefined();
    expect(args.where.OR).toEqual([
      { agentUserId: "u1" },
      { agentUserId: null },
    ]);
  });

  it("admin → no scope (sees all)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.chatConversation.findMany.mockResolvedValueOnce([]);
    mockPrisma.chatConversation.count.mockResolvedValueOnce(0);

    await GET(req());
    const args = mockPrisma.chatConversation.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(args.where).toEqual({});
  });

  it("includes client and serializes dates", async () => {
    const conv = {
      ...fakeConv("c2"),
      client: { id: "cl1", name: "ТОВ Ромашка" },
      clientId: "cl1",
    };
    mockPrisma.chatConversation.findMany.mockResolvedValueOnce([conv]);
    mockPrisma.chatConversation.count.mockResolvedValueOnce(1);
    const res = await GET(req());
    const json = (await res.json()) as {
      conversations: Array<{
        client: { id: string; name: string } | null;
        lastMessageAt: string;
      }>;
      total: number;
    };
    expect(json.total).toBe(1);
    expect(json.conversations[0]?.client?.name).toBe("ТОВ Ромашка");
    expect(typeof json.conversations[0]?.lastMessageAt).toBe("string");
  });

  it("clamps pageSize to [1..100]", async () => {
    mockPrisma.chatConversation.findMany.mockResolvedValueOnce([]);
    mockPrisma.chatConversation.count.mockResolvedValueOnce(0);
    await GET(req("?pageSize=9999"));
    const args = mockPrisma.chatConversation.findMany.mock.calls[0]?.[0] as {
      take: number;
    };
    expect(args.take).toBe(100);
  });
});
