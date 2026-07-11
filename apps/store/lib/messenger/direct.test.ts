import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, FakeKnownError } = vi.hoisted(() => {
  class FakeKnownError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    mockPrisma: {
      user: { findUnique: vi.fn() },
      messengerConversation: { findUnique: vi.fn(), create: vi.fn() },
    },
    FakeKnownError,
  };
});

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: { PrismaClientKnownRequestError: FakeKnownError },
}));

import { directKeyFor, getOrCreateDirectConversation } from "./direct";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("directKeyFor", () => {
  it("is symmetric (order-independent)", () => {
    expect(directKeyFor("a", "b")).toBe(directKeyFor("b", "a"));
  });

  it("sorts ids deterministically", () => {
    expect(directKeyFor("zed", "abc")).toBe("abc:zed");
  });
});

describe("getOrCreateDirectConversation", () => {
  it("throws 'self' for same user", async () => {
    await expect(getOrCreateDirectConversation("u1", "u1")).rejects.toThrow(
      "self",
    );
  });

  it("throws 'not_found' when other user missing", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(getOrCreateDirectConversation("u1", "u2")).rejects.toThrow(
      "not_found",
    );
  });

  it("throws 'not_found' when other user inactive", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "u2",
      isActive: false,
    });
    await expect(getOrCreateDirectConversation("u1", "u2")).rejects.toThrow(
      "not_found",
    );
  });

  it("returns existing conversation id without creating", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "u2",
      isActive: true,
    });
    mockPrisma.messengerConversation.findUnique.mockResolvedValueOnce({
      id: "conv-existing",
    });
    const id = await getOrCreateDirectConversation("u1", "u2");
    expect(id).toBe("conv-existing");
    expect(mockPrisma.messengerConversation.create).not.toHaveBeenCalled();
  });

  it("creates a new direct conversation with both members", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "u2",
      isActive: true,
    });
    mockPrisma.messengerConversation.findUnique.mockResolvedValueOnce(null);
    mockPrisma.messengerConversation.create.mockResolvedValueOnce({
      id: "conv-new",
    });
    const id = await getOrCreateDirectConversation("u1", "u2");
    expect(id).toBe("conv-new");

    const arg = mockPrisma.messengerConversation.create.mock.calls[0]?.[0] as {
      data: {
        type: string;
        directKey: string;
        members: { create: Array<{ userId: string }> };
      };
    };
    expect(arg.data.type).toBe("direct");
    expect(arg.data.directKey).toBe(directKeyFor("u1", "u2"));
    expect(arg.data.members.create).toHaveLength(2);
    expect(arg.data.members.create.map((m) => m.userId).sort()).toEqual([
      "u1",
      "u2",
    ]);
  });

  it("recovers from a unique-violation race by re-reading", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "u2",
      isActive: true,
    });
    // First lookup: none. Create: race → P2002. Second lookup: found.
    mockPrisma.messengerConversation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "conv-raced" });
    mockPrisma.messengerConversation.create.mockRejectedValueOnce(
      new FakeKnownError("P2002"),
    );
    const id = await getOrCreateDirectConversation("u1", "u2");
    expect(id).toBe("conv-raced");
  });
});
