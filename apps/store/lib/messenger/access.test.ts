import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    messengerConversation: { findUnique: vi.fn() },
    messengerMessage: { count: vi.fn() },
  },
}));

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: {},
}));

import { countUnread, getMessengerConversationForUser } from "./access";

beforeEach(() => {
  vi.clearAllMocks();
});

const CONV = {
  id: "c1",
  type: "direct" as const,
  title: null,
  members: [
    { id: "m1", userId: "u1", role: "member" as const, lastReadAt: null },
    { id: "m2", userId: "u2", role: "member" as const, lastReadAt: null },
  ],
};

describe("getMessengerConversationForUser", () => {
  it("returns 404 when conversation missing", async () => {
    mockPrisma.messengerConversation.findUnique.mockResolvedValueOnce(null);
    const r = await getMessengerConversationForUser(
      { id: "u1", role: "manager" },
      "c1",
    );
    expect(r.status).toBe(404);
  });

  it("returns 403 for a non-member non-owner", async () => {
    mockPrisma.messengerConversation.findUnique.mockResolvedValueOnce(CONV);
    const r = await getMessengerConversationForUser(
      { id: "stranger", role: "manager" },
      "c1",
    );
    expect(r.status).toBe(403);
  });

  it("grants a member access with their membership", async () => {
    mockPrisma.messengerConversation.findUnique.mockResolvedValueOnce(CONV);
    const r = await getMessengerConversationForUser(
      { id: "u1", role: "manager" },
      "c1",
    );
    expect(r.status).toBe(200);
    if (r.status === 200) {
      expect(r.membership?.id).toBe("m1");
    }
  });

  it("lets owner observe without membership", async () => {
    mockPrisma.messengerConversation.findUnique.mockResolvedValueOnce(CONV);
    const r = await getMessengerConversationForUser(
      { id: "boss", role: "owner" },
      "c1",
    );
    expect(r.status).toBe(200);
    if (r.status === 200) {
      expect(r.membership).toBeNull();
    }
  });
});

describe("countUnread", () => {
  it("counts other-authored, non-deleted messages after lastReadAt", async () => {
    mockPrisma.messengerMessage.count.mockResolvedValueOnce(3);
    const since = new Date("2026-07-11T10:00:00Z");
    const n = await countUnread("c1", "u1", since);
    expect(n).toBe(3);
    const where = mockPrisma.messengerMessage.count.mock.calls[0]?.[0] as {
      where: {
        conversationId: string;
        authorId: { not: string };
        deletedAt: null;
        createdAt?: { gt: Date };
      };
    };
    expect(where.where.conversationId).toBe("c1");
    expect(where.where.authorId).toEqual({ not: "u1" });
    expect(where.where.deletedAt).toBeNull();
    expect(where.where.createdAt).toEqual({ gt: since });
  });

  it("omits the createdAt filter when lastReadAt is null (all unread)", async () => {
    mockPrisma.messengerMessage.count.mockResolvedValueOnce(5);
    const n = await countUnread("c1", "u1", null);
    expect(n).toBe(5);
    const where = mockPrisma.messengerMessage.count.mock.calls[0]?.[0] as {
      where: { createdAt?: unknown };
    };
    expect(where.where.createdAt).toBeUndefined();
  });
});
