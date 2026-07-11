import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findMany: vi.fn() },
    messengerConversation: { create: vi.fn() },
  },
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma, Prisma: {} }));

import { canManageGroup, createGroup } from "./group";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("canManageGroup", () => {
  it("group admin can manage", () => {
    expect(canManageGroup("admin", "manager")).toBe(true);
  });
  it("global admin can manage even as plain member", () => {
    expect(canManageGroup("member", "admin")).toBe(true);
  });
  it("owner can manage", () => {
    expect(canManageGroup(null, "owner")).toBe(true);
  });
  it("plain member cannot manage", () => {
    expect(canManageGroup("member", "manager")).toBe(false);
  });
});

describe("createGroup", () => {
  it("makes creator admin, others members, drops invalid ids and self", async () => {
    // u2, u3 are valid; u9 invalid (not returned); creator u1 filtered out.
    mockPrisma.user.findMany.mockResolvedValueOnce([
      { id: "u2" },
      { id: "u3" },
    ]);
    mockPrisma.messengerConversation.create.mockResolvedValueOnce({
      id: "g1",
    });

    const id = await createGroup({ id: "u1", fullName: "Тарас" }, "  Склад  ", [
      "u2",
      "u3",
      "u9",
      "u1",
    ]);
    expect(id).toBe("g1");

    const arg = mockPrisma.messengerConversation.create.mock.calls[0]?.[0] as {
      data: {
        type: string;
        title: string;
        createdById: string;
        members: { create: Array<{ userId: string; role: string }> };
        messages: { create: Array<{ kind: string; text: string }> };
      };
    };
    expect(arg.data.type).toBe("group");
    expect(arg.data.title).toBe("Склад"); // trimmed
    const creator = arg.data.members.create.find((m) => m.userId === "u1");
    expect(creator?.role).toBe("admin");
    expect(arg.data.members.create.map((m) => m.userId).sort()).toEqual([
      "u1",
      "u2",
      "u3",
    ]);
    expect(arg.data.messages.create[0]?.kind).toBe("system");
    expect(arg.data.messages.create[0]?.text).toContain("Склад");
  });
});
