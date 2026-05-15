import { beforeEach, describe, expect, it, vi } from "vitest";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    mgrClient: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma, Prisma: {} }));

import {
  getOwnedClientIds,
  getViewerOwnership,
  maskClientForForeign,
  ownershipWhere,
} from "./client-visibility";

const ADMIN = { id: "admin1", role: "admin" as const };
const MANAGER = { id: "u1", role: "manager" as const };
const OTHER_MANAGER = { id: "u2", role: "manager" as const };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getViewerOwnership", () => {
  it("returns 'admin' for admin user без DB-запиту", async () => {
    expect(await getViewerOwnership(ADMIN, "c1")).toBe("admin");
    expect(mockPrisma.mgrClient.findUnique).not.toHaveBeenCalled();
  });

  it("returns 'mine' коли agentUserId === user.id", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      agentUserId: "u1",
      assignments: [],
    });
    expect(await getViewerOwnership(MANAGER, "c1")).toBe("mine");
  });

  it("returns 'mine' коли є ClientAssignment", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      agentUserId: "someoneelse",
      assignments: [{ id: "a1" }],
    });
    expect(await getViewerOwnership(MANAGER, "c1")).toBe("mine");
  });

  it("returns 'foreign' коли ні agentUserId ні assignment не співпадає", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      agentUserId: "u9",
      assignments: [],
    });
    expect(await getViewerOwnership(OTHER_MANAGER, "c1")).toBe("foreign");
  });

  it("returns 'foreign' (conservative) коли client не існує", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce(null);
    expect(await getViewerOwnership(MANAGER, "missing")).toBe("foreign");
  });
});

describe("getOwnedClientIds", () => {
  it("returns null для admin (no restriction)", async () => {
    expect(await getOwnedClientIds(ADMIN)).toBeNull();
    expect(mockPrisma.mgrClient.findMany).not.toHaveBeenCalled();
  });

  it("returns пустий Set коли manager не має клієнтів", async () => {
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([]);
    const result = await getOwnedClientIds(MANAGER);
    expect(result).toBeInstanceOf(Set);
    expect(result?.size).toBe(0);
  });

  it("returns Set з id-ами клієнтів manager-а", async () => {
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([
      { id: "c1" },
      { id: "c2" },
      { id: "c3" },
    ]);
    const result = await getOwnedClientIds(MANAGER);
    expect(result).toBeInstanceOf(Set);
    expect(result?.has("c1")).toBe(true);
    expect(result?.has("c2")).toBe(true);
    expect(result?.has("c3")).toBe(true);
    expect(result?.has("c4")).toBe(false);
  });

  it("manager query використовує OR на agentUserId + assignment", async () => {
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([]);
    await getOwnedClientIds(MANAGER);
    const call = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0] as {
      where: {
        OR: Array<{
          agentUserId?: string;
          assignments?: { some: { userId: string } };
        }>;
      };
    };
    expect(call.where.OR).toEqual([
      { agentUserId: "u1" },
      { assignments: { some: { userId: "u1" } } },
    ]);
  });
});

describe("ownershipWhere", () => {
  it("returns {} для admin", () => {
    expect(ownershipWhere(ADMIN)).toEqual({});
  });

  it("returns OR clause для manager", () => {
    expect(ownershipWhere(MANAGER)).toEqual({
      OR: [{ agentUserId: "u1" }, { assignments: { some: { userId: "u1" } } }],
    });
  });
});

describe("maskClientForForeign", () => {
  const fullClient = {
    id: "c1",
    name: "Test",
    phonePrimary: "+380501234567",
    phones: [
      {
        id: "p1",
        phone: "+380501234567",
        label: "основний",
        messenger: "viber",
      },
      { id: "p2", phone: "0671112233", label: null, messenger: null },
    ],
    viberContact: "+380501234567",
    websiteUrl: "https://example.com",
    geolocation: "50.45,30.52",
    messengers: [{ id: "m1", network: "telegram", handle: "@x" }],
    bankAccounts: [{ id: "b1", accountNumber: "UA12..." }],
    reminders: [{ id: "r1", body: "Дзвонити" }],
    presentations: [{ id: "pr1", productCode: "X" }],
    timeline: [{ id: "t1", body: "Коментар" }],
  };

  it("masks phonePrimary з last 3 digits", () => {
    const masked = maskClientForForeign(fullClient);
    expect(masked.phonePrimary).toBe("*** *** *** 567");
  });

  it("masks phones[].phone і нулифікує messenger", () => {
    const masked = maskClientForForeign(fullClient);
    expect(masked.phones).toHaveLength(2);
    expect(masked.phones[0]?.phone).toBe("*** *** *** 567");
    expect(masked.phones[0]?.messenger).toBeNull();
    expect(masked.phones[1]?.phone).toBe("*** *** *** 233");
  });

  it("hides viberContact, websiteUrl, geolocation as null", () => {
    const masked = maskClientForForeign(fullClient);
    expect(masked.viberContact).toBeNull();
    expect(masked.websiteUrl).toBeNull();
    expect(masked.geolocation).toBeNull();
  });

  it("empties messengers / bankAccounts / reminders / presentations / timeline", () => {
    const masked = maskClientForForeign(fullClient);
    expect(masked.messengers).toEqual([]);
    expect(masked.bankAccounts).toEqual([]);
    expect(masked.reminders).toEqual([]);
    expect(masked.presentations).toEqual([]);
    expect(masked.timeline).toEqual([]);
  });

  it("preserves non-sensitive fields (id, name)", () => {
    const masked = maskClientForForeign(fullClient);
    expect(masked.id).toBe("c1");
    expect(masked.name).toBe("Test");
  });

  it("handles null phonePrimary", () => {
    const masked = maskClientForForeign({
      ...fullClient,
      phonePrimary: null,
    });
    expect(masked.phonePrimary).toBeNull();
  });
});
