import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    chatConversation: { findUnique: vi.fn() },
  },
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

import { getConversationForUser } from "./conversation-access";

const MANAGER = { id: "u1", role: "manager" as const };
const ADMIN = { id: "admin1", role: "admin" as const };

function conv(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    platform: "telegram",
    externalUserId: "123",
    agentUserId: null,
    clientId: null,
    client: null,
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("getConversationForUser", () => {
  it("404 when conversation missing", async () => {
    mockPrisma.chatConversation.findUnique.mockResolvedValueOnce(null);
    const r = await getConversationForUser(MANAGER, "c1");
    expect(r.status).toBe(404);
  });

  it("admin sees any conversation (scope: all)", async () => {
    mockPrisma.chatConversation.findUnique.mockResolvedValueOnce(
      conv({ agentUserId: "other", client: { agentUserId: "other" } }),
    );
    const r = await getConversationForUser(ADMIN, "c1");
    expect(r.status).toBe(200);
  });

  it("manager sees a conversation assigned to them", async () => {
    mockPrisma.chatConversation.findUnique.mockResolvedValueOnce(
      conv({ agentUserId: "u1" }),
    );
    const r = await getConversationForUser(MANAGER, "c1");
    expect(r.status).toBe(200);
  });

  it("manager sees a conversation of their own client", async () => {
    mockPrisma.chatConversation.findUnique.mockResolvedValueOnce(
      conv({
        agentUserId: null,
        clientId: "cl1",
        client: { agentUserId: "u1" },
      }),
    );
    const r = await getConversationForUser(MANAGER, "c1");
    expect(r.status).toBe(200);
  });

  it("manager is 403'd from a foreign client's conversation", async () => {
    mockPrisma.chatConversation.findUnique.mockResolvedValueOnce(
      conv({
        agentUserId: "other",
        clientId: "cl2",
        client: { agentUserId: "other" },
      }),
    );
    const r = await getConversationForUser(MANAGER, "c1");
    expect(r.status).toBe(403);
  });

  it("manager is 403'd from an unassigned unknown conversation (no shared pool)", async () => {
    mockPrisma.chatConversation.findUnique.mockResolvedValueOnce(
      conv({ agentUserId: null, client: null }),
    );
    const r = await getConversationForUser(MANAGER, "c1");
    expect(r.status).toBe(403);
  });
});
