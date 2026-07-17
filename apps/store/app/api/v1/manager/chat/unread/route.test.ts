import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    chatConversation: { aggregate: vi.fn() },
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

function req(): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/chat/unread");
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
});

describe("GET /api/v1/manager/chat/unread", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("manager → scope: assigned to me OR my client, returns aggregated total", async () => {
    mockPrisma.chatConversation.aggregate.mockResolvedValueOnce({
      _sum: { unreadForManager: 7 },
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { total: number };
    expect(json.total).toBe(7);

    const args = mockPrisma.chatConversation.aggregate.mock.calls[0]?.[0] as {
      where: { OR?: Array<Record<string, unknown>> };
    };
    expect(args.where.OR).toEqual([
      { agentUserId: "u1" },
      { client: { agentUserId: "u1" } },
    ]);
  });

  it("admin → no scope (sees all), null sum coerced to 0", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.chatConversation.aggregate.mockResolvedValueOnce({
      _sum: { unreadForManager: null },
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { total: number };
    expect(json.total).toBe(0);

    const args = mockPrisma.chatConversation.aggregate.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(args.where).toEqual({});
  });
});
