import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    mgrClient: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

import { canEditClient } from "./mgr-client-edit";

beforeEach(() => {
  vi.clearAllMocks();
});

const ADMIN = { id: "admin1", role: "admin" as const };
const MANAGER = { id: "u1", role: "manager" as const };
const OTHER_MANAGER = { id: "u2", role: "manager" as const };

describe("canEditClient", () => {
  it("returns true for admin regardless of client", async () => {
    const allowed = await canEditClient(ADMIN, "c1");
    expect(allowed).toBe(true);
    expect(mockPrisma.mgrClient.findUnique).not.toHaveBeenCalled();
  });

  it("returns true for manager who is the agent", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      agentUserId: "u1",
      assignments: [],
    });
    const allowed = await canEditClient(MANAGER, "c1");
    expect(allowed).toBe(true);
  });

  it("returns true for manager who is assigned via ClientAssignment", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      agentUserId: null,
      assignments: [{ id: "a1" }],
    });
    const allowed = await canEditClient(MANAGER, "c1");
    expect(allowed).toBe(true);
  });

  it("returns false for unrelated manager", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      agentUserId: "u1",
      assignments: [],
    });
    const allowed = await canEditClient(OTHER_MANAGER, "c1");
    expect(allowed).toBe(false);
  });

  it("returns false when client not found", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce(null);
    const allowed = await canEditClient(MANAGER, "missing");
    expect(allowed).toBe(false);
  });
});
